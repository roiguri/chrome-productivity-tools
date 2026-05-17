(function () {
  'use strict';

  var FB = self.PeerShareFirebase;
  var PEERS_KEY = 'ps_peers';
  var SETTINGS_KEY = 'ps_settings';
  var INBOX_KEY = 'ps_inbox';

  var el = {
    status: document.getElementById('status'),
    fbStatus: document.getElementById('fbStatus'),
    myCode: document.getElementById('myCode'),
    copyCodeBtn: document.getElementById('copyCodeBtn'),
    addPeerBtn: document.getElementById('addPeerBtn'),
    peerForm: document.getElementById('peerForm'),
    peerFormTitle: document.getElementById('peerFormTitle'),
    editPeerId: document.getElementById('editPeerId'),
    peerNickname: document.getElementById('peerNickname'),
    peerCode: document.getElementById('peerCode'),
    savePeerBtn: document.getElementById('savePeerBtn'),
    cancelPeerBtn: document.getElementById('cancelPeerBtn'),
    peersList: document.getElementById('peersList'),
    pendingList: document.getElementById('pendingList'),
    retentionInput: document.getElementById('retentionInput'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    clearInboxBtn: document.getElementById('clearInboxBtn')
  };

  var peers = [];
  var statusTimer = null;

  function showStatus(message, type) {
    el.status.textContent = message;
    el.status.className = 'status ' + (type || 'success');
    el.status.classList.remove('hidden');
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      el.status.classList.add('hidden');
    }, 3000);
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  function generateId() {
    return 'peer_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
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

  // ---- Firebase status + pairing code --------------------------------------

  async function refreshFirebaseStatus() {
    if (!FB.isConfigured()) {
      el.fbStatus.textContent = 'Not configured';
      el.fbStatus.className = 'config-status bad';
      el.myCode.textContent = '(unavailable until Firebase is configured)';
      return;
    }
    el.fbStatus.textContent = 'Configured';
    el.fbStatus.className = 'config-status ok';
    try {
      var uid = await FB.getUid();
      el.myCode.textContent = uid;
    } catch (e) {
      el.fbStatus.textContent = 'Error';
      el.fbStatus.className = 'config-status bad';
      el.myCode.textContent = '(sign-in failed: ' + e.message + ')';
    }
  }

  el.copyCodeBtn.addEventListener('click', function () {
    var code = el.myCode.textContent || '';
    navigator.clipboard.writeText(code).then(function () {
      showStatus('Pairing code copied.', 'success');
    }, function () {
      showStatus('Could not copy.', 'error');
    });
  });

  // ---- peers ----------------------------------------------------------------

  function togglePeerForm(show, peer) {
    el.peerForm.classList.toggle('hidden', !show);
    if (show) {
      el.peerFormTitle.textContent = peer ? 'Edit peer' : 'Add peer';
      el.editPeerId.value = peer ? peer.id : '';
      el.peerNickname.value = peer ? peer.nickname : '';
      el.peerCode.value = peer ? peer.code : '';
      el.peerNickname.focus();
    } else {
      el.editPeerId.value = '';
      el.peerNickname.value = '';
      el.peerCode.value = '';
    }
  }

  async function loadPeers() {
    peers = (await storageGet([PEERS_KEY]))[PEERS_KEY] || [];
    renderPeers();
  }

  function renderPeers() {
    if (!peers.length) {
      el.peersList.innerHTML =
        '<p class="empty-state">No peers yet. Add one to start sharing.</p>';
      return;
    }
    el.peersList.innerHTML = '';
    peers.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'peer-item';
      row.innerHTML =
        '<div class="peer-info">' +
        '<div class="peer-name">' + escapeHtml(p.nickname) + '</div>' +
        '<div class="peer-code">' + escapeHtml(p.code) + '</div>' +
        '</div>' +
        '<div class="peer-actions">' +
        '<button class="btn btn-secondary btn-small" data-act="edit">Edit</button>' +
        '<button class="btn btn-danger btn-small" data-act="delete">Delete</button>' +
        '</div>';
      row.querySelector('.peer-actions').addEventListener('click', function (e) {
        var act = e.target.dataset.act;
        if (act === 'edit') togglePeerForm(true, p);
        else if (act === 'delete') deletePeer(p.id);
      });
      el.peersList.appendChild(row);
    });
  }

  async function savePeer() {
    var nickname = el.peerNickname.value.trim();
    var code = el.peerCode.value.trim();
    if (!nickname || !code) {
      showStatus('Nickname and pairing code are both required.', 'error');
      return;
    }
    var id = el.editPeerId.value;
    if (id) {
      peers = peers.map(function (p) {
        return p.id === id ? { id: id, nickname: nickname, code: code } : p;
      });
    } else {
      peers.push({ id: generateId(), nickname: nickname, code: code });
    }
    await storageSet({ ps_peers: peers });
    togglePeerForm(false);
    renderPeers();
    showStatus('Peer saved.', 'success');

    // New peer: send them a friend request so they can add you back
    // (best-effort; messaging still works one-way without it).
    if (!id && FB.rtdbEnabled()) {
      try {
        var myUid = await FB.getUid();
        if (myUid && code !== myUid) {
          await FB.rtdbPut('contacts/' + code + '/' + myUid,
            { ts: Date.now() });
        }
      } catch (e) { /* noop */ }
    }
  }

  async function deletePeer(id) {
    peers = peers.filter(function (p) { return p.id !== id; });
    await storageSet({ ps_peers: peers });
    renderPeers();
    showStatus('Peer removed.', 'success');
  }

  // ---- pending friend requests ----------------------------------------------

  async function loadPending() {
    if (!FB.rtdbEnabled()) {
      el.pendingList.innerHTML =
        '<p class="empty-state">Realtime Database not configured.</p>';
      return;
    }
    var obj;
    try {
      var myUid = await FB.getUid();
      obj = (await FB.rtdbGet('contacts/' + myUid)) || {};
    } catch (e) {
      // Transient: keep whatever is shown rather than flashing an error.
      return;
    }
    var codes = Object.keys(obj).filter(function (c) {
      return !peers.some(function (p) { return p.code === c; });
    });
    if (!codes.length) {
      el.pendingList.innerHTML =
        '<p class="empty-state">No pending requests.</p>';
      return;
    }
    el.pendingList.innerHTML = '';
    codes.forEach(function (code) {
      var row = document.createElement('div');
      row.className = 'peer-item';
      row.innerHTML =
        '<div class="peer-info">' +
        '<div class="peer-name">Wants to connect</div>' +
        '<div class="peer-code">' + escapeHtml(code) + '</div>' +
        '</div>' +
        '<div class="peer-actions">' +
        '<button class="btn btn-primary btn-small" data-act="accept">Accept</button>' +
        '<button class="btn btn-secondary btn-small" data-act="ignore">Ignore</button>' +
        '</div>';
      row.querySelector('.peer-actions').addEventListener('click', function (e) {
        var act = e.target.dataset.act;
        if (act === 'accept') acceptRequest(code);
        else if (act === 'ignore') ignoreRequest(code);
      });
      el.pendingList.appendChild(row);
    });
  }

  async function acceptRequest(fromCode) {
    var name = window.prompt('Name this contact:', '');
    if (name === null) return; // cancelled
    name = name.trim() || (String(fromCode).slice(0, 8) + '…');
    if (!peers.some(function (p) { return p.code === fromCode; })) {
      peers.push({ id: generateId(), nickname: name, code: fromCode });
      await storageSet({ ps_peers: peers });
      renderPeers();
    }
    try {
      var myUid = await FB.getUid();
      await FB.rtdbDelete('contacts/' + myUid + '/' + fromCode);
    } catch (e) { /* noop */ }
    chrome.runtime.sendMessage({ type: 'ps-poll-now' });
    loadPending();
    showStatus('Request accepted.', 'success');
  }

  async function ignoreRequest(fromCode) {
    try {
      var myUid = await FB.getUid();
      await FB.rtdbDelete('contacts/' + myUid + '/' + fromCode);
    } catch (e) { /* noop */ }
    chrome.runtime.sendMessage({ type: 'ps-poll-now' });
    loadPending();
    showStatus('Request ignored.', 'success');
  }

  // ---- settings -------------------------------------------------------------

  async function loadSettings() {
    var s = (await storageGet([SETTINGS_KEY]))[SETTINGS_KEY] || {};
    el.retentionInput.value = s.retention > 0 ? s.retention : 50;
  }

  async function saveSettings() {
    var n = parseInt(el.retentionInput.value, 10);
    if (!(n > 0)) {
      showStatus('Enter a positive number.', 'error');
      return;
    }
    await storageSet({ ps_settings: { retention: n } });
    showStatus('Settings saved.', 'success');
  }

  function clearInbox() {
    chrome.runtime.sendMessage({ type: 'ps-inbox-clear' }, function (resp) {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        showStatus('Could not clear inbox.', 'error');
        return;
      }
      showStatus('Inbox cleared.', 'success');
    });
  }

  // ---- wire up --------------------------------------------------------------

  el.addPeerBtn.addEventListener('click', function () {
    togglePeerForm(true);
  });
  el.savePeerBtn.addEventListener('click', savePeer);
  el.cancelPeerBtn.addEventListener('click', function () {
    togglePeerForm(false);
  });
  el.saveSettingsBtn.addEventListener('click', saveSettings);
  el.clearInboxBtn.addEventListener('click', clearInbox);

  refreshFirebaseStatus();
  loadPeers().then(loadPending);
  loadSettings();

  // Deliver instantly while the options page is open too (same doorbell
  // stream as the popup; falls back to a slow poll). Also refresh pending
  // friend requests on the same cadence.
  if (FB.isConfigured()) {
    var poke = function () {
      chrome.runtime.sendMessage({ type: 'ps-poll-now' });
      loadPending();
    };
    poke();
    var stopDoorbell = FB.rtdbEnabled()
      ? FB.subscribeDoorbell(poke)
      : null;
    var pollTimer = setInterval(poke, stopDoorbell ? 15000 : 2000);
    window.addEventListener('unload', function () {
      clearInterval(pollTimer);
      if (stopDoorbell) stopDoorbell();
    });
  }
})();
