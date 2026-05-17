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
    captureRegionBtn: document.getElementById('captureRegionBtn'),
    captureFullBtn: document.getElementById('captureFullBtn'),
    fileInput: document.getElementById('fileInput'),
    textInput: document.getElementById('textInput'),
    peerSelect: document.getElementById('peerSelect'),
    noPeers: document.getElementById('noPeers'),
    openOptionsLink: document.getElementById('openOptionsLink'),
    tray: document.getElementById('tray'),
    trayList: document.getElementById('trayList'),
    trayCount: document.getElementById('trayCount'),
    clearTrayBtn: document.getElementById('clearTrayBtn'),
    sendBtn: document.getElementById('sendBtn'),
    inboxList: document.getElementById('inboxList'),
    inboxRequests: document.getElementById('inboxRequests'),
    lightbox: document.getElementById('lightbox'),
    lightboxImg: document.getElementById('lightboxImg'),
    lightboxClose: document.getElementById('lightboxClose')
  };

  function openLightbox(url) {
    if (!url) return;
    el.lightboxImg.src = url;
    el.lightbox.style.display = 'flex';
  }

  function closeLightbox() {
    el.lightbox.style.display = 'none';
    el.lightboxImg.removeAttribute('src'); // don't revoke; shared with thumb
  }

  el.lightboxClose.addEventListener('click', closeLightbox);
  el.lightbox.addEventListener('click', function (e) {
    if (e.target === el.lightbox) closeLightbox();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && el.lightbox.style.display !== 'none') {
      closeLightbox();
    }
  });

  // Staged attachments: { kind:'image'|'file', blob, fileName, mimeType }.
  // Typed text in #textInput is a separate (optional) item at send time.
  var tray = [];
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
      var req = indexedDB.open('peer-share-media', 2);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs');
        }
        if (!db.objectStoreNames.contains('draft')) {
          db.createObjectStore('draft');
        }
      };
      req.onsuccess = function (e) {
        mediaDb = e.target.result;
        mediaDb.onversionchange = function () {
          mediaDb.close();
          mediaDb = null;
        };
        resolve(mediaDb);
      };
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

  // ---- draft persistence (survives popup close, not browser restart) -------
  // Light fields go in chrome.storage.session (auto-cleared on browser
  // close). Attachment blobs go in the IDB 'draft' store (cleared by the
  // service worker on chrome.runtime.onStartup).

  function sessionGet(keys) {
    return new Promise(function (resolve) {
      chrome.storage.session.get(keys, resolve);
    });
  }

  function sessionSet(obj) {
    return new Promise(function (resolve) {
      chrome.storage.session.set(obj, resolve);
    });
  }

  function saveDraftTray() {
    return openMediaDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('draft', 'readwrite');
        tx.objectStore('draft').put(tray.map(function (t) {
          return {
            kind: t.kind, blob: t.blob,
            fileName: t.fileName, mimeType: t.mimeType
          };
        }), 'tray');
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      });
    }).catch(function () {});
  }

  function loadDraftTray() {
    return openMediaDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('draft', 'readonly');
        var r = tx.objectStore('draft').get('tray');
        r.onsuccess = function (e) { resolve(e.target.result || []); };
        r.onerror = function () { resolve([]); };
      });
    }).catch(function () { return []; });
  }

  function saveDraftLight() {
    return sessionSet({
      ps_draft: {
        text: el.textInput.value,
        peerCode: el.peerSelect.value || '',
        tab: el.inboxView.style.display !== 'none' ? 'inbox' : 'send'
      }
    });
  }

  function clearDraft() {
    chrome.storage.session.remove('ps_draft');
    return openMediaDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('draft', 'readwrite');
        tx.objectStore('draft').delete('tray');
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      });
    }).catch(function () {});
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
    if (!send) { renderInbox(); renderRequests(); }
    saveDraftLight();
  }

  // ---- staging tray ---------------------------------------------------------

  function kindOf(mimeType) {
    return mimeType && mimeType.indexOf('image/') === 0 ? 'image' : 'file';
  }

  function addToTray(blob, fileName, mimeType) {
    tray.push({
      kind: kindOf(mimeType),
      blob: blob,
      fileName: fileName,
      mimeType: mimeType || 'application/octet-stream'
    });
    renderTray();
    saveDraftTray();
  }

  function removeTrayItem(i) {
    tray.splice(i, 1);
    renderTray();
    saveDraftTray();
  }

  function clearTray() {
    tray = [];
    renderTray();
    saveDraftTray();
  }

  function updateSendLabel() {
    var hasText = el.textInput.value.trim().length > 0;
    var n = tray.length + (hasText ? 1 : 0);
    el.sendBtn.textContent = n > 0 ? 'Send (' + n + ')' : 'Send';
    el.sendBtn.disabled = n === 0;
  }

  var trayUrls = [];

  function revokeTrayUrls() {
    trayUrls.forEach(function (u) { URL.revokeObjectURL(u); });
    trayUrls = [];
  }

  function renderTray() {
    revokeTrayUrls();
    if (!tray.length) {
      el.tray.style.display = 'none';
      el.trayList.innerHTML = '';
      updateSendLabel();
      return;
    }
    el.tray.style.display = 'block';
    el.trayCount.textContent = tray.length +
      (tray.length === 1 ? ' attachment' : ' attachments');
    el.trayList.innerHTML = '';
    tray.forEach(function (item, idx) {
      var row = document.createElement('div');
      row.className = 'tray-item';

      var thumb = document.createElement('div');
      thumb.className = 'tray-thumb';
      if (item.kind === 'image') {
        var url = URL.createObjectURL(item.blob);
        trayUrls.push(url);
        var img = document.createElement('img');
        img.alt = '';
        img.src = url;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '4px';
        img.className = 'clickable-img';
        (function (u) {
          img.addEventListener('click', function () { openLightbox(u); });
        })(url);
        thumb.appendChild(img);
      } else {
        thumb.textContent = '📄';
      }

      var name = document.createElement('div');
      name.className = 'tray-name';
      name.textContent = item.fileName;

      var size = document.createElement('span');
      size.className = 'tray-size';
      size.textContent = Math.max(1, Math.round(item.blob.size / 1024)) + ' KB';

      var x = document.createElement('span');
      x.className = 'tray-x';
      x.textContent = '✕';
      x.title = 'Remove';
      x.addEventListener('click', function () { removeTrayItem(idx); });

      row.appendChild(thumb);
      row.appendChild(name);
      row.appendChild(size);
      row.appendChild(x);
      el.trayList.appendChild(row);
    });
    updateSendLabel();
  }

  // ---- screenshot capture ---------------------------------------------------

  // Region: the popup closes the moment you interact with the page, so
  // selection happens on the page (overlay injected by the SW). The cropped
  // image lands in the persisted draft and shows in the tray on reopen.
  function startRegionCapture() {
    sendBg({ type: 'ps-region-capture' });
    window.close();
  }

  // Full tab: capture the whole visible tab right now, no popup close.
  async function captureFullTab() {
    try {
      el.captureFullBtn.disabled = true;
      var dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
        format: 'png'
      });
      var pngBlob = await (await fetch(dataUrl)).blob();
      var bitmap = await createImageBitmap(pngBlob);
      var canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      var ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      var jpeg = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: 0.7
      });
      addToTray(jpeg, 'screenshot-' + Date.now() + '.jpg', 'image/jpeg');
      showStatus('Screenshot added (' +
        Math.round(jpeg.size / 1024) + ' KB)', 'info');
    } catch (e) {
      showStatus('Could not capture tab: ' + e.message, 'error');
    } finally {
      el.captureFullBtn.disabled = false;
    }
  }

  el.fileInput.addEventListener('change', function () {
    var files = el.fileInput.files;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      addToTray(f, f.name, f.type || 'application/octet-stream');
    }
    el.fileInput.value = '';
  });

  // Paste an image/file straight into the composer → goes to the tray.
  // Plain-text paste falls through to the textarea as normal.
  el.textInput.addEventListener('paste', function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    var added = false;
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        var f = items[i].getAsFile();
        if (f) {
          var ext = (f.type.split('/')[1] || 'bin').split('+')[0];
          var nm = f.name || ('pasted-' + Date.now() + '.' + ext);
          addToTray(f, nm, f.type || 'application/octet-stream');
          added = true;
        }
      }
    }
    if (added) e.preventDefault();
  });

  el.textInput.addEventListener('input', function () {
    updateSendLabel();
    saveDraftLight();
  });
  el.peerSelect.addEventListener('change', saveDraftLight);
  el.clearTrayBtn.addEventListener('click', clearTray);
  window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      saveDraftLight();
      saveDraftTray();
    }
  });
  window.addEventListener('pagehide', function () {
    saveDraftLight();
    saveDraftTray();
  });

  // Restore a draft (text/peer/tab from session, attachments from IDB).
  // Called after loadPeers() has populated the peer <select>.
  async function restoreDraft() {
    var d = (await sessionGet(['ps_draft'])).ps_draft;
    if (d) {
      if (d.text) el.textInput.value = d.text;
      if (d.peerCode) {
        var opts = el.peerSelect.options;
        for (var i = 0; i < opts.length; i++) {
          if (opts[i].value === d.peerCode) { el.peerSelect.value = d.peerCode; break; }
        }
      }
      if (d.tab === 'inbox') switchTab('inbox');
    }
    var saved = await loadDraftTray();
    if (saved && saved.length) {
      tray = saved.map(function (t) {
        return {
          kind: t.kind, blob: t.blob,
          fileName: t.fileName, mimeType: t.mimeType
        };
      });
      renderTray();
    }
    updateSendLabel();
  }

  // ---- peers ----------------------------------------------------------------

  async function loadPeers() {
    var prev = el.peerSelect.value;
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
    // Keep the user's current pick across refreshes (e.g. after accepting
    // a request) so the dropdown updates without losing selection.
    if (prev) {
      var opts = el.peerSelect.options;
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].value === prev) { el.peerSelect.value = prev; break; }
      }
    }
  }

  // ---- sending --------------------------------------------------------------

  // Send one staged item as its own message. Returns the created doc id.
  async function sendOne(toCode, item) {
    var fromUid = await FB.getUid();
    var doc = {
      to: toCode,
      from: fromUid,
      type: item.kind === 'text' ? 'text' : item.kind,
      caption: '',
      ts: Date.now(),
      delivered: false
    };
    if (item.kind === 'text') {
      doc.text = item.text;
    } else {
      var path = 'messages/' + toCode + '/' + Date.now() + '_' +
        item.fileName.replace(/[^\w.\-]/g, '_');
      await FB.storageUpload(path, item.blob, item.mimeType);
      doc.storagePath = path;
      doc.fileName = item.fileName;
      doc.mimeType = item.mimeType;
    }
    var created = await FB.firestoreCreate('messages', doc);
    return created && created.id ? created.id : '';
  }

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

    // Build the queue: typed text (if any) first, then staged attachments.
    var items = [];
    var text = el.textInput.value.trim();
    if (text) items.push({ kind: 'text', text: text });
    tray.forEach(function (t) { items.push(t); });

    if (!items.length) {
      showStatus('Nothing to send — type a message or attach a file.',
        'error');
      return;
    }

    el.sendBtn.disabled = true;
    var total = items.length;
    var lastId = '';
    var failed = [];
    for (var i = 0; i < items.length; i++) {
      showStatus('Sending ' + (i + 1) + '/' + total + '…', 'info');
      try {
        lastId = await sendOne(toCode, items[i]);
      } catch (e) {
        failed.push(items[i]);
      }
    }

    // One doorbell ring covers the whole batch — reconcile pulls every
    // undelivered message addressed to the recipient.
    if (lastId && FB.rtdbEnabled()) {
      FB.rtdbPut('signals/' + toCode, {
        id: lastId,
        ts: Date.now()
      }).catch(function () {});
    }

    var sentCount = total - failed.length;
    if (!failed.length) {
      showStatus('Sent ' + sentCount +
        (sentCount === 1 ? ' item!' : ' items!'), 'success');
      el.textInput.value = '';
      tray = [];
      renderTray();
      clearDraft();
    } else {
      // Keep only what failed so the user can retry it.
      tray = failed.filter(function (f) { return f.kind !== 'text'; });
      var textFailed = failed.some(function (f) { return f.kind === 'text'; });
      if (!textFailed) el.textInput.value = '';
      renderTray();
      saveDraftTray();
      saveDraftLight();
      showStatus(sentCount + ' sent, ' + failed.length +
        ' failed — still staged, try again.', 'error');
    }
    updateSendLabel();
    el.sendBtn.disabled = false;
  }

  // ---- inbox ----------------------------------------------------------------

  var renderToken = 0;

  function peerName(peers, code) {
    var hit = null;
    peers.forEach(function (p) { if (p.code === code) hit = p; });
    if (hit) return hit.nickname;
    return 'Unknown (' + String(code || '').slice(0, 8) + '…)';
  }

  function genPeerId() {
    return 'peer_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  // Incoming friend requests (RTDB contacts/<myUid>), shown atop the Inbox
  // with inline naming (window.prompt would dismiss the popup).
  async function renderRequests() {
    if (!FB.isConfigured() || !FB.rtdbEnabled()) {
      el.inboxRequests.innerHTML = '';
      return;
    }
    var myUid, obj, peers;
    try {
      myUid = await FB.getUid();
      obj = (await FB.rtdbGet('contacts/' + myUid)) || {};
      peers = (await storageGet([PEERS_KEY]))[PEERS_KEY] || [];
    } catch (e) {
      // Transient error (e.g. token not ready yet): leave any shown
      // requests in place and try again shortly rather than no-opping
      // until the next poll tick.
      if (!renderRequests._retry) {
        renderRequests._retry = true;
        setTimeout(function () {
          renderRequests._retry = false;
          renderRequests();
        }, 2000);
      }
      return;
    }
    var codes = Object.keys(obj).filter(function (c) {
      return !peers.some(function (p) { return p.code === c; });
    });
    if (!codes.length) { el.inboxRequests.innerHTML = ''; return; }
    el.inboxRequests.innerHTML = '';
    codes.forEach(function (code) {
      var card = document.createElement('div');
      card.className = 'inbox-item req-card';
      card.innerHTML =
        '<div class="req-title">Connection request</div>' +
        '<div class="req-code">' + escapeHtml(code) + '</div>' +
        '<input class="req-input" type="text" placeholder="Name this contact">' +
        '<div class="inbox-actions">' +
        '<button data-act="accept">Accept</button>' +
        '<button class="danger" data-act="ignore">Ignore</button></div>';
      var input = card.querySelector('.req-input');
      card.querySelector('.inbox-actions').addEventListener('click',
        function (ev) {
          var act = ev.target.dataset.act;
          if (act === 'accept') acceptRequest(code, input.value, myUid);
          else if (act === 'ignore') ignoreRequest(code, myUid);
        });
      el.inboxRequests.appendChild(card);
    });
  }

  async function acceptRequest(code, name, myUid) {
    name = (name || '').trim() || (String(code).slice(0, 8) + '…');
    var peers = (await storageGet([PEERS_KEY]))[PEERS_KEY] || [];
    if (!peers.some(function (p) { return p.code === code; })) {
      peers.push({ id: genPeerId(), nickname: name, code: code });
      await storageSet({ ps_peers: peers });
    }
    try { await FB.rtdbDelete('contacts/' + myUid + '/' + code); }
    catch (e) { /* noop */ }
    sendBg({ type: 'ps-poll-now' }); // refresh ps_pending / badge
    showStatus('Request accepted.', 'success');
    renderRequests();
    renderInbox();
    loadPeers(); // refresh the Send-to-peer list with the new connection
  }

  async function ignoreRequest(code, myUid) {
    try { await FB.rtdbDelete('contacts/' + myUid + '/' + code); }
    catch (e) { /* noop */ }
    sendBg({ type: 'ps-poll-now' }); // refresh ps_pending / badge
    showStatus('Request ignored.', 'success');
    renderRequests();
  }

  async function renderInbox() {
    var myToken = ++renderToken;
    revokeObjectUrls();
    var store = await storageGet([INBOX_KEY, PEERS_KEY]);
    var inbox = store[INBOX_KEY] || [];
    var peers = store[PEERS_KEY] || [];
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
        escapeHtml(peerName(peers, m.from)) + '</span><span>' +
        escapeHtml(when) + '</span></div>';
      var cap = m.caption
        ? '<div class="inbox-caption">' + escapeHtml(m.caption) + '</div>'
        : '';

      var bodyHtml = '';
      if (m.type === 'text') {
        bodyHtml = '<div class="inbox-text" dir="auto">' +
          escapeHtml(m.text) + '</div>';
      } else if (m.type === 'image') {
        bodyHtml = '<div class="inbox-media" data-media="1">' +
          '<div class="img-skel"></div></div>';
      } else {
        bodyHtml = '<div class="inbox-caption">📎 ' +
          escapeHtml(m.fileName || 'file') + '</div>';
      }

      // A card whose delete is pending shows only an Undo affordance.
      if (pendingDeletes[m.id]) {
        card.classList.add('pending-del');
        card.innerHTML = head +
          '<div class="inbox-pending">Message deleted · ' +
          '<span class="link" data-act="undo">Undo</span></div>';
        card.querySelector('[data-act="undo"]')
          .addEventListener('click', function () { undoDelete(m.id); });
        el.inboxList.appendChild(card);
        return;
      }

      var actBtns;
      if (m.type === 'text') {
        actBtns = '<button data-act="copy">Copy</button>';
      } else if (m.type === 'image') {
        actBtns = '<button data-act="copyimg">Copy</button>' +
          '<button data-act="save">Save</button>';
      } else {
        actBtns = '<button data-act="save">Save</button>';
      }
      if (m.read) {
        actBtns += '<button data-act="unread">Mark unread</button>';
      }
      card.innerHTML = head + cap + bodyHtml +
        '<div class="inbox-actions">' + actBtns +
        '<button class="danger" data-act="delete">Delete</button></div>';

      var actions = card.querySelector('.inbox-actions');
      actions.addEventListener('click', function (ev) {
        var act = ev.target.dataset.act;
        if (act === 'copy') copyText(m.text);
        else if (act === 'copyimg') copyImage(m);
        else if (act === 'save') saveItem(m);
        else if (act === 'unread') markUnread(m.id);
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
            img.className = 'clickable-img';
            img.addEventListener('click', function () {
              openLightbox(url);
            });
            slot.appendChild(img);
          } else {
            slot.innerHTML =
              '<button class="btn-retry" data-act="retry">Retry</button>';
            slot.querySelector('[data-act="retry"]')
              .addEventListener('click', function () {
                slot.innerHTML = '<div class="img-skel"></div>';
                renderInbox();
              });
          }
        }, function () {});
      }
    });

    markAllRead(inbox);
  }

  // Ids the user explicitly marked unread this popup session — auto
  // mark-all-read must not re-read them (cleared on popup reopen).
  var manualUnread = {};

  function markAllRead(inbox) {
    var except = Object.keys(manualUnread);
    // Only the items we'd actually flip (ignore ones the user kept unread)
    // — and tell the SW to skip them, so this converges instead of
    // oscillating against storage.onChanged re-renders.
    var anyUnread = inbox.some(function (m) {
      return !m.read && except.indexOf(m.id) === -1;
    });
    if (anyUnread) {
      sendBg({ type: 'ps-inbox-mark-read', except: except });
    }
    updateInboxBadge();
  }

  function markUnread(id) {
    manualUnread[id] = true;
    sendBg({ type: 'ps-inbox-mark-unread', id: id });
  }

  function copyText(text) {
    navigator.clipboard.writeText(text || '').then(function () {
      showStatus('Copied to clipboard.', 'success');
    }, function () {
      showStatus('Could not copy.', 'error');
    });
  }

  // The Clipboard API only reliably accepts image/png, so transcode
  // JPEG/etc. screenshots before writing.
  async function toPngBlob(blob) {
    if (blob.type === 'image/png') return blob;
    var bmp = await createImageBitmap(blob);
    var c = new OffscreenCanvas(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0);
    return c.convertToBlob({ type: 'image/png' });
  }

  async function copyImage(m) {
    showStatus('Copying image…', 'info');
    try {
      var blob = await loadMediaBlob(m.id).catch(function () { return null; });
      if (!blob && !m.dataUrl) {
        await sendBg({ type: 'ps-inbox-fetch-media', id: m.id });
        blob = await loadMediaBlob(m.id).catch(function () { return null; });
      }
      if (!blob && m.dataUrl) {
        blob = await (await fetch(m.dataUrl)).blob();
      }
      if (!blob) {
        showStatus('Image not ready — try again in a moment.', 'error');
        return;
      }
      var png = await toPngBlob(blob);
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': png })
      ]);
      showStatus('Image copied to clipboard.', 'success');
    } catch (e) {
      showStatus('Could not copy image: ' + e.message, 'error');
    }
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

  // Deferred delete: show Undo for 5s, only then commit. Popup closing
  // before the timer fires simply cancels it (nothing is lost).
  var pendingDeletes = {};

  function deleteItem(id) {
    if (pendingDeletes[id]) return;
    pendingDeletes[id] = setTimeout(function () {
      delete pendingDeletes[id];
      sendBg({ type: 'ps-inbox-delete', id: id }).then(function () {
        renderInbox();
      });
    }, 5000);
    renderInbox(); // re-render: this card flips to the Undo state
  }

  function undoDelete(id) {
    if (pendingDeletes[id]) {
      clearTimeout(pendingDeletes[id]);
      delete pendingDeletes[id];
    }
    renderInbox();
  }

  async function updateInboxBadge() {
    var inbox = (await storageGet([INBOX_KEY]))[INBOX_KEY] || [];
    var unread = inbox.filter(function (m) { return !m.read; }).length;
    el.inboxBadge.textContent = unread ? '(' + unread + ')' : '';
  }

  // ---- wire up --------------------------------------------------------------

  el.tabSend.addEventListener('click', function () { switchTab('send'); });
  el.tabInbox.addEventListener('click', function () { switchTab('inbox'); });
  el.captureRegionBtn.addEventListener('click', startRegionCapture);
  el.captureFullBtn.addEventListener('click', captureFullTab);
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
    if (el.inboxView.style.display !== 'none') {
      renderInbox();
      renderRequests();
    }
  });

  // Fast-delivery while this popup is open. With RTDB configured we stream
  // the doorbell (~0.1–0.4s) and only keep a slow safety poll; otherwise we
  // fall back to the original ~2s poll. ps-poll-now runs reconcile() in the
  // single-writer SW, so delivery stays race-free either way.
  // Clear any transient region-capture badge on open.
  sendBg({ type: 'ps-popup-open' });

  // Show a one-shot message stashed by the SW (e.g. region capture failed
  // on a restricted page) as the red status banner.
  sessionGet(['ps_flash']).then(function (s) {
    var f = s.ps_flash;
    if (f && f.message && Date.now() - (f.ts || 0) < 15000) {
      chrome.storage.session.remove('ps_flash');
      showStatus(f.message, 'error');
    } else if (f) {
      chrome.storage.session.remove('ps_flash');
    }
  });

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
      if (el.inboxView.style.display !== 'none') renderRequests();
    }, pollMs);
    window.addEventListener('unload', function () {
      clearInterval(pollTimer);
      if (stopDoorbell) stopDoorbell();
      revokeObjectUrls();
      revokeTrayUrls();
    });
  }

  renderTray();
  loadPeers().then(restoreDraft);
  updateInboxBadge();
  // Prefetch friend requests on open so they're already in the Inbox the
  // moment you switch to it (independent of tab / first-call timing).
  renderRequests();
})();
