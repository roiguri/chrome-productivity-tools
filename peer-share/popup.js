(function () {
  'use strict';

  var FB = self.PeerShareFirebase;
  var PEERS_KEY = 'ps_peers';
  var INBOX_KEY = 'ps_inbox';

  var el = {
    status: document.getElementById('status'),
    tabSend: document.getElementById('tabSend'),
    tabInbox: document.getElementById('tabInbox'),
    inboxBadge: document.getElementById('inboxBadge'),
    sendView: document.getElementById('sendView'),
    inboxView: document.getElementById('inboxView'),
    notConfigured: document.getElementById('notConfigured'),
    sendForm: document.getElementById('sendForm'),
    seg: document.querySelector('.seg'),
    modeScreenshot: document.getElementById('modeScreenshot'),
    modeFile: document.getElementById('modeFile'),
    modeText: document.getElementById('modeText'),
    captureBtn: document.getElementById('captureBtn'),
    screenshotPreview: document.getElementById('screenshotPreview'),
    fileInput: document.getElementById('fileInput'),
    filePreview: document.getElementById('filePreview'),
    textInput: document.getElementById('textInput'),
    peerSelect: document.getElementById('peerSelect'),
    noPeers: document.getElementById('noPeers'),
    openOptionsLink: document.getElementById('openOptionsLink'),
    captionInput: document.getElementById('captionInput'),
    sendBtn: document.getElementById('sendBtn'),
    inboxList: document.getElementById('inboxList')
  };

  var mode = 'screenshot';
  var screenshotBlob = null;
  var statusTimer = null;

  function showStatus(message, type) {
    el.status.textContent = message;
    el.status.className = 'status ' + (type || 'success');
    el.status.style.display = 'block';
    if (statusTimer) clearTimeout(statusTimer);
    if (type !== 'error') {
      statusTimer = setTimeout(function () {
        el.status.style.display = 'none';
      }, 3500);
    }
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  function storageGet(keys) {
    return new Promise(function (resolve) {
      chrome.storage.local.get(keys, resolve);
    });
  }

  function storageSet(obj) {
    return new Promise(function (resolve) {
      chrome.storage.local.set(obj, resolve);
    });
  }

  function sendBg(msg) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage(msg, function (resp) {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(resp);
      });
    });
  }

  // Read-only view of the background worker's media blob store.
  var mediaDb = null;

  function openMediaDb() {
    if (mediaDb) return Promise.resolve(mediaDb);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('peer-share-media', 1);
      req.onupgradeneeded = function (e) {
        e.target.result.createObjectStore('blobs');
      };
      req.onsuccess = function (e) { mediaDb = e.target.result; resolve(mediaDb); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function loadMediaBlob(id) {
    return openMediaDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('blobs', 'readonly');
        var r = tx.objectStore('blobs').get(id);
        r.onsuccess = function (e) { resolve(e.target.result || null); };
        r.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  var objectUrls = [];

  function revokeObjectUrls() {
    objectUrls.forEach(function (u) { URL.revokeObjectURL(u); });
    objectUrls = [];
  }

  // Resolve a displayable URL for a non-text item. Legacy items carry an
  // inline dataUrl; new items keep bytes in IndexedDB (fetched lazily — ask
  // the worker to download if it hasn't yet).
  async function getMediaUrl(m) {
    if (m.dataUrl) return m.dataUrl;
    var blob = await loadMediaBlob(m.id).catch(function () { return null; });
    if (!blob && !m.mediaReady) {
      await sendBg({ type: 'ps-inbox-fetch-media', id: m.id });
      blob = await loadMediaBlob(m.id).catch(function () { return null; });
    }
    if (!blob) return null;
    var url = URL.createObjectURL(blob);
    objectUrls.push(url);
    return url;
  }

  // ---- view switching -------------------------------------------------------

  function switchTab(which) {
    var send = which === 'send';
    el.tabSend.classList.toggle('active', send);
    el.tabInbox.classList.toggle('active', !send);
    el.sendView.style.display = send ? 'block' : 'none';
    el.inboxView.style.display = send ? 'none' : 'block';
    if (!send) renderInbox();
  }

  function setMode(m) {
    mode = m;
    Array.prototype.forEach.call(el.seg.children, function (b) {
      b.classList.toggle('active', b.dataset.mode === m);
    });
    el.modeScreenshot.style.display = m === 'screenshot' ? 'block' : 'none';
    el.modeFile.style.display = m === 'file' ? 'block' : 'none';
    el.modeText.style.display = m === 'text' ? 'block' : 'none';
  }

  // ---- screenshot capture ---------------------------------------------------

  async function captureScreenshot() {
    try {
      el.captureBtn.disabled = true;
      var dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
        format: 'png'
      });
      var pngBlob = await (await fetch(dataUrl)).blob();
      var bitmap = await createImageBitmap(pngBlob);
      var canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      var ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      screenshotBlob = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: 0.7
      });
      var url = URL.createObjectURL(screenshotBlob);
      el.screenshotPreview.innerHTML = '<img alt="screenshot">';
      el.screenshotPreview.firstChild.src = url;
      showStatus('Screenshot captured (' +
        Math.round(screenshotBlob.size / 1024) + ' KB)', 'info');
    } catch (e) {
      showStatus('Could not capture tab: ' + e.message, 'error');
    } finally {
      el.captureBtn.disabled = false;
    }
  }

  el.fileInput.addEventListener('change', function () {
    var f = el.fileInput.files[0];
    if (!f) { el.filePreview.innerHTML = ''; return; }
    el.filePreview.innerHTML =
      '<div class="filemeta">' + escapeHtml(f.name) + ' — ' +
      Math.round(f.size / 1024) + ' KB</div>';
  });

  // ---- peers ----------------------------------------------------------------

  async function loadPeers() {
    var peers = (await storageGet([PEERS_KEY]))[PEERS_KEY] || [];
    el.peerSelect.innerHTML = '';
    if (!peers.length) {
      el.noPeers.style.display = 'block';
      el.peerSelect.style.display = 'none';
      return;
    }
    el.noPeers.style.display = 'none';
    el.peerSelect.style.display = 'block';
    peers.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.code;
      o.textContent = p.nickname + ' (' + p.code.slice(0, 8) + '…)';
      el.peerSelect.appendChild(o);
    });
  }

  // ---- sending --------------------------------------------------------------

  async function send() {
    if (!FB.isConfigured()) {
      showStatus('Firebase is not configured.', 'error');
      return;
    }
    var toCode = el.peerSelect.value;
    if (!toCode) {
      showStatus('Select a peer first (add one in Options).', 'error');
      return;
    }
    var caption = el.captionInput.value.trim();

    var payload;
    try {
      if (mode === 'text') {
        var text = el.textInput.value;
        if (!text.trim()) {
          showStatus('Nothing to send — type some text.', 'error');
          return;
        }
        payload = { type: 'text', text: text };
      } else if (mode === 'file') {
        var f = el.fileInput.files[0];
        if (!f) {
          showStatus('Choose a file first.', 'error');
          return;
        }
        payload = {
          type: 'file',
          blob: f,
          fileName: f.name,
          mimeType: f.type || 'application/octet-stream'
        };
      } else {
        if (!screenshotBlob) {
          showStatus('Capture the tab first.', 'error');
          return;
        }
        payload = {
          type: 'image',
          blob: screenshotBlob,
          fileName: 'screenshot-' + Date.now() + '.jpg',
          mimeType: 'image/jpeg'
        };
      }
    } catch (e) {
      showStatus(e.message, 'error');
      return;
    }

    el.sendBtn.disabled = true;
    showStatus('Sending…', 'info');
    try {
      var fromUid = await FB.getUid();
      var doc = {
        to: toCode,
        from: fromUid,
        type: payload.type,
        caption: caption,
        ts: Date.now(),
        delivered: false
      };
      if (payload.type === 'text') {
        doc.text = payload.text;
      } else {
        var path = 'messages/' + toCode + '/' + Date.now() + '_' +
          payload.fileName.replace(/[^\w.\-]/g, '_');
        await FB.storageUpload(path, payload.blob, payload.mimeType);
        doc.storagePath = path;
        doc.fileName = payload.fileName;
        doc.mimeType = payload.mimeType;
      }
      var created = await FB.firestoreCreate('messages', doc);
      // Ring the recipient's doorbell for instant delivery. Best-effort —
      // if RTDB is unconfigured or this fails, their poll still picks it up.
      if (FB.rtdbEnabled()) {
        FB.rtdbPut('signals/' + toCode, {
          id: created && created.id ? created.id : '',
          ts: Date.now()
        }).catch(function () {});
      }
      showStatus('Sent!', 'success');
      el.captionInput.value = '';
      el.textInput.value = '';
      el.fileInput.value = '';
      el.filePreview.innerHTML = '';
      el.screenshotPreview.innerHTML = '';
      screenshotBlob = null;
    } catch (e) {
      showStatus('Send failed: ' + e.message, 'error');
    } finally {
      el.sendBtn.disabled = false;
    }
  }

  // ---- inbox ----------------------------------------------------------------

  var renderToken = 0;

  async function renderInbox() {
    var myToken = ++renderToken;
    revokeObjectUrls();
    var inbox = (await storageGet([INBOX_KEY]))[INBOX_KEY] || [];
    if (myToken !== renderToken) return;
    if (!inbox.length) {
      el.inboxList.innerHTML =
        '<div class="empty-state">' +
        '<div class="empty-state-icon">📭</div>' +
        '<div class="empty-state-text">No messages yet.<br>' +
        'Items peers send you will appear here.</div></div>';
      markAllRead(inbox);
      return;
    }
    el.inboxList.innerHTML = '';
    inbox.forEach(function (m) {
      var card = document.createElement('div');
      card.className = 'inbox-item' + (m.read ? '' : ' unread');

      var when = new Date(m.ts).toLocaleString();
      var head = '<div class="inbox-meta"><span>From ' +
        escapeHtml(String(m.from).slice(0, 8)) + '…</span><span>' +
        escapeHtml(when) + '</span></div>';
      var cap = m.caption
        ? '<div class="inbox-caption">' + escapeHtml(m.caption) + '</div>'
        : '';

      var bodyHtml = '';
      if (m.type === 'text') {
        bodyHtml = '<div class="inbox-text">' + escapeHtml(m.text) + '</div>';
      } else if (m.type === 'image') {
        bodyHtml = '<div class="inbox-media" data-media="1">' +
          '<span class="inbox-loading">Loading image…</span></div>';
      } else {
        bodyHtml = '<div class="inbox-caption">📎 ' +
          escapeHtml(m.fileName || 'file') + '</div>';
      }

      card.innerHTML = head + cap + bodyHtml +
        '<div class="inbox-actions">' +
        (m.type === 'text'
          ? '<button data-act="copy">Copy</button>'
          : '<button data-act="save">Save</button>') +
        '<button class="danger" data-act="delete">Delete</button></div>';

      var actions = card.querySelector('.inbox-actions');
      actions.addEventListener('click', function (ev) {
        var act = ev.target.dataset.act;
        if (act === 'copy') copyText(m.text);
        else if (act === 'save') saveItem(m);
        else if (act === 'delete') deleteItem(m.id);
      });

      el.inboxList.appendChild(card);

      if (m.type === 'image') {
        var slot = card.querySelector('[data-media]');
        getMediaUrl(m).then(function (url) {
          if (myToken !== renderToken || !slot) return;
          if (url) {
            slot.innerHTML = '';
            var img = document.createElement('img');
            img.alt = 'shared image';
            img.src = url;
            slot.appendChild(img);
          } else {
            slot.innerHTML =
              '<span class="inbox-loading">Image not available yet —' +
              ' it will appear once downloaded.</span>';
          }
        }, function () {});
      }
    });

    markAllRead(inbox);
  }

  function markAllRead(inbox) {
    var anyUnread = inbox.some(function (m) { return !m.read; });
    if (anyUnread) sendBg({ type: 'ps-inbox-mark-read' });
    updateInboxBadge();
  }

  function copyText(text) {
    navigator.clipboard.writeText(text || '').then(function () {
      showStatus('Copied to clipboard.', 'success');
    }, function () {
      showStatus('Could not copy.', 'error');
    });
  }

  async function saveItem(m) {
    showStatus('Preparing download…', 'info');
    var url = await getMediaUrl(m).catch(function () { return null; });
    if (!url) {
      showStatus('Still downloading — try Save again in a moment.', 'error');
      return;
    }
    var a = document.createElement('a');
    a.href = url;
    a.download = m.fileName || 'shared-file';
    document.body.appendChild(a);
    a.click();
    a.remove();
    showStatus('Saved.', 'success');
  }

  function deleteItem(id) {
    sendBg({ type: 'ps-inbox-delete', id: id }).then(function () {
      renderInbox();
    });
  }

  async function updateInboxBadge() {
    var inbox = (await storageGet([INBOX_KEY]))[INBOX_KEY] || [];
    var unread = inbox.filter(function (m) { return !m.read; }).length;
    el.inboxBadge.textContent = unread ? '(' + unread + ')' : '';
  }

  // ---- wire up --------------------------------------------------------------

  el.tabSend.addEventListener('click', function () { switchTab('send'); });
  el.tabInbox.addEventListener('click', function () { switchTab('inbox'); });
  el.seg.addEventListener('click', function (e) {
    if (e.target.dataset.mode) setMode(e.target.dataset.mode);
  });
  el.captureBtn.addEventListener('click', captureScreenshot);
  el.sendBtn.addEventListener('click', send);
  el.openOptionsLink.addEventListener('click', function () {
    chrome.runtime.openOptionsPage();
  });

  if (!FB.isConfigured()) {
    el.notConfigured.style.display = 'block';
    el.sendForm.style.display = 'none';
  }

  // Live-refresh: the worker is the only ps_inbox writer; reflect its
  // changes immediately without reopening the popup.
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local' || !changes[INBOX_KEY]) return;
    updateInboxBadge();
    if (el.inboxView.style.display !== 'none') renderInbox();
  });

  // Fast-delivery while this popup is open. With RTDB configured we stream
  // the doorbell (~0.1–0.4s) and only keep a slow safety poll; otherwise we
  // fall back to the original ~2s poll. ps-poll-now runs reconcile() in the
  // single-writer SW, so delivery stays race-free either way.
  if (FB.isConfigured()) {
    sendBg({ type: 'ps-poll-now' });
    var stopDoorbell = null;
    var pollMs = 2000;
    if (FB.rtdbEnabled()) {
      stopDoorbell = FB.subscribeDoorbell(function () {
        sendBg({ type: 'ps-poll-now' });
      });
      if (stopDoorbell) pollMs = 15000; // safety net if the stream stalls
    }
    var pollTimer = setInterval(function () {
      sendBg({ type: 'ps-poll-now' });
    }, pollMs);
    window.addEventListener('unload', function () {
      clearInterval(pollTimer);
      if (stopDoorbell) stopDoorbell();
      revokeObjectUrls();
    });
  }

  loadPeers();
  updateInboxBadge();
})();
