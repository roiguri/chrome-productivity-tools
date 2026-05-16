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
      await FB.firestoreCreate('messages', doc);
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

  async function renderInbox() {
    var inbox = (await storageGet([INBOX_KEY]))[INBOX_KEY] || [];
    if (!inbox.length) {
      el.inboxList.innerHTML =
        '<div class="empty-state">' +
        '<div class="empty-state-icon">📭</div>' +
        '<div class="empty-state-text">No messages yet.<br>' +
        'Items peers send you will appear here.</div></div>';
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
        bodyHtml = '<img alt="shared image" src="' + m.dataUrl + '">';
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
    });

    markAllRead(inbox);
  }

  async function markAllRead(inbox) {
    var changed = false;
    inbox.forEach(function (m) {
      if (!m.read) { m.read = true; changed = true; }
    });
    if (changed) await storageSet({ ps_inbox: inbox });
    updateInboxBadge();
  }

  function copyText(text) {
    navigator.clipboard.writeText(text || '').then(function () {
      showStatus('Copied to clipboard.', 'success');
    }, function () {
      showStatus('Could not copy.', 'error');
    });
  }

  function saveItem(m) {
    var a = document.createElement('a');
    a.href = m.dataUrl;
    a.download = m.fileName || 'shared-file';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function deleteItem(id) {
    var inbox = (await storageGet([INBOX_KEY]))[INBOX_KEY] || [];
    inbox = inbox.filter(function (m) { return m.id !== id; });
    await storageSet({ ps_inbox: inbox });
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

  loadPeers();
  updateInboxBadge();
})();
