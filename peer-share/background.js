/*
 * background.js — MV3 service worker.
 *
 * Delivery is poll-based (no Cloud Function, no FCM, no chrome.gcm):
 *   - anonymous Firebase sign-in on install/startup
 *   - a chrome.alarms poll (~1 min) wakes the worker to reconcile() — pulls
 *     anything addressed to us that isn't already in the inbox
 *   - while a popup/options page is open it pings ps-poll-now every ~2s for
 *     near-instant delivery (and to keep this worker warm)
 *   - ingest stores message metadata immediately; media bytes are fetched
 *     lazily into IndexedDB (fast inbox, no giant base64 in storage)
 *   - ALL ps_inbox writes are serialized here (single-writer) so a received
 *     message can never be clobbered by a concurrent popup mutation
 *   - keep the toolbar badge in sync with the unread count
 */
importScripts('firebase-config.js', 'firebase.js');

(function () {
  'use strict';

  var FB = self.PeerShareFirebase;

  var INBOX_KEY = 'ps_inbox';
  var SETTINGS_KEY = 'ps_settings';
  var POLL_ALARM = 'ps-poll';
  var DEFAULT_RETENTION = 50;

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

  async function getRetention() {
    var s = (await storageGet([SETTINGS_KEY]))[SETTINGS_KEY] || {};
    var n = parseInt(s.retention, 10);
    return n > 0 ? n : DEFAULT_RETENTION;
  }

  async function updateBadge() {
    var inbox = (await storageGet([INBOX_KEY]))[INBOX_KEY] || [];
    var unread = inbox.filter(function (m) { return !m.read; }).length;
    if (unread > 0) {
      chrome.action.setBadgeText({ text: String(unread) });
      chrome.action.setBadgeBackgroundColor({ color: '#009efd' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  }

  // ---- media blob store (IndexedDB) -----------------------------------------
  // chrome.storage.local can't hold Blobs and base64 there is huge/slow.
  // Received payload bytes live in IndexedDB keyed by message id.

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

  // Drafts must not survive a browser restart: clear the draft store when
  // the browser starts a new session.
  function clearDraftStore() {
    return openMediaDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('draft', 'readwrite');
        tx.objectStore('draft').clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      });
    }).catch(function () {});
  }

  function storeMediaBlob(id, blob) {
    return openMediaDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').put(blob, id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  function deleteMediaBlob(id) {
    return openMediaDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function (e) { reject(e.target.error); };
      });
    });
  }

  // ---- single-writer inbox mutex --------------------------------------------
  // Every ps_inbox mutation runs through here so concurrent writers (poll
  // ingest, popup mark-read/delete, options clear) can't lose each other's
  // updates. Same promise-chain idiom that used to guard gcm registration.

  var inboxWriteChain = Promise.resolve();

  function serialInboxWrite(fn) {
    var run = inboxWriteChain.then(fn, fn);
    inboxWriteChain = run.then(function () {}, function () {});
    return run;
  }

  // ---- message ingestion ----------------------------------------------------

  // Fast path: store metadata immediately so the inbox entry + notification
  // appear instantly. Media bytes are fetched lazily afterwards.
  // Idempotent: a message already in the inbox is skipped.
  async function ingestMessage(messageId) {
    var uid = await FB.getUid();
    var msg = await FB.firestoreGet('messages/' + messageId);
    if (!msg || msg.to !== uid) return;

    await serialInboxWrite(async function () {
      var inbox = (await storageGet([INBOX_KEY]))[INBOX_KEY] || [];
      if (inbox.some(function (m) { return m.id === messageId; })) return;

      var item = {
        id: messageId,
        from: msg.from || '',
        type: msg.type || 'text',
        caption: msg.caption || '',
        ts: msg.ts || Date.now(),
        read: false
      };

      if (msg.type === 'text') {
        item.text = msg.text || '';
      } else {
        item.storagePath = msg.storagePath;
        item.fileName = msg.fileName || 'shared-file';
        item.mimeType = msg.mimeType || 'application/octet-stream';
        item.mediaReady = false;
      }

      var retention = await getRetention();
      inbox.unshift(item);
      var dropped = [];
      if (inbox.length > retention) {
        dropped = inbox.slice(retention);
        inbox = inbox.slice(0, retention);
      }
      await storageSet({ ps_inbox: inbox });
      dropped.forEach(function (d) {
        if (d.storagePath) deleteMediaBlob(d.id).catch(function () {});
      });

      try {
        await FB.firestoreSet('messages/' + messageId, { delivered: true });
      } catch (e) {
        console.warn('[Peer Share] could not mark delivered:', e.message);
      }

      var label = item.type === 'text'
        ? 'New text message'
        : (item.type === 'image' ? 'New screenshot' : 'New file');
      chrome.notifications.create('ps-' + messageId, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Peer Share',
        message: item.caption ? label + ': ' + item.caption : label
      });

      await updateBadge();
    });

    if (msg.type !== 'text') {
      fetchAndStoreMedia(messageId).catch(function (e) {
        console.warn('[Peer Share] media prefetch failed:', e.message);
      });
    }
  }

  // Download a message's payload into IndexedDB and flip mediaReady. The
  // (slow) network download happens OUTSIDE the inbox mutex; only the short
  // flag flip is serialized. Deduped per id so a popup request and the
  // background prefetch don't double-download.
  var mediaFetchInFlight = {};

  function fetchAndStoreMedia(messageId) {
    if (mediaFetchInFlight[messageId]) return mediaFetchInFlight[messageId];
    var p = (async function () {
      var inbox = (await storageGet([INBOX_KEY]))[INBOX_KEY] || [];
      var item = null;
      inbox.forEach(function (m) { if (m.id === messageId) item = m; });
      if (!item || !item.storagePath || item.mediaReady) return;
      var blob = await FB.storageDownload(item.storagePath);
      await storeMediaBlob(messageId, blob);
      await serialInboxWrite(async function () {
        var inb = (await storageGet([INBOX_KEY]))[INBOX_KEY] || [];
        var changed = false;
        inb.forEach(function (m) {
          if (m.id === messageId) {
            m.mediaReady = true;
            if (!m.mimeType && blob.type) m.mimeType = blob.type;
            changed = true;
          }
        });
        if (changed) await storageSet({ ps_inbox: inb });
      });
    })();
    mediaFetchInFlight[messageId] = p;
    p.then(
      function () { delete mediaFetchInFlight[messageId]; },
      function () { delete mediaFetchInFlight[messageId]; }
    );
    return p;
  }

  // Pull anything addressed to us that isn't already in the inbox. This is
  // the delivery mechanism (driven by the poll alarm + popup ps-poll-now).
  async function reconcile() {
    if (!FB.isConfigured()) return;
    try {
      var uid = await FB.getUid();
      var rows = await FB.firestoreQueryEqual('messages', 'to', uid, 50);
      var inbox = (await storageGet([INBOX_KEY]))[INBOX_KEY] || [];
      var have = {};
      inbox.forEach(function (m) { have[m.id] = true; });
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (have[r.id] || r.data.delivered) continue;
        await ingestMessage(r.id);
      }
    } catch (e) {
      console.warn('[Peer Share] reconcile failed:', e.message);
    }
  }

  // ---- lifecycle ------------------------------------------------------------

  async function init(openOptions) {
    if (!FB.isConfigured()) {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF5722' });
      chrome.action.setTitle({
        title: 'Peer Share - edit firebase-config.js to finish setup'
      });
      if (openOptions) {
        chrome.runtime.openOptionsPage().catch(function () {});
      }
      return;
    }
    chrome.action.setTitle({ title: 'Peer Share' });
    try {
      // getUid() reuses cached auth and only signs in if there is none —
      // it must never unconditionally create a fresh anonymous account, or
      // the pairing code would change on every service-worker restart.
      await FB.getUid();
    } catch (e) {
      console.warn('[Peer Share] sign-in failed:', e.message);
    }
    chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 });
    await reconcile();
    await updateBadge();
  }

  chrome.runtime.onInstalled.addListener(function (details) {
    init(details.reason === 'install');
  });

  chrome.runtime.onStartup.addListener(function () {
    clearDraftStore();
    init(false);
  });

  chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === POLL_ALARM) reconcile();
  });

  // ---- region screenshot ----------------------------------------------------
  // Injected into the page (runs in the tab, not here). Lets the user
  // rubber-band a rectangle; Esc / empty selection cancels. Reports the
  // rect back in CSS px plus devicePixelRatio.
  function psRegionOverlay() {
    if (window.__psRegionActive) return;
    window.__psRegionActive = true;
    var dpr = window.devicePixelRatio || 1;
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;' +
      'cursor:crosshair;background:rgba(0,0,0,0.12);';
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;border:2px solid #009efd;' +
      'background:rgba(0,158,253,0.15);display:none;z-index:2147483647;' +
      'pointer-events:none;';
    document.documentElement.appendChild(ov);
    document.documentElement.appendChild(box);
    var sx = 0, sy = 0, drawing = false;
    function cleanup() {
      ov.remove(); box.remove();
      window.__psRegionActive = false;
      document.removeEventListener('keydown', onKey, true);
    }
    function cancel() {
      cleanup();
      chrome.runtime.sendMessage({ type: 'ps-region-rect', cancelled: true });
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    }
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('mousedown', function (e) {
      drawing = true; sx = e.clientX; sy = e.clientY;
      box.style.left = sx + 'px'; box.style.top = sy + 'px';
      box.style.width = '0px'; box.style.height = '0px';
      box.style.display = 'block';
    });
    ov.addEventListener('mousemove', function (e) {
      if (!drawing) return;
      box.style.left = Math.min(e.clientX, sx) + 'px';
      box.style.top = Math.min(e.clientY, sy) + 'px';
      box.style.width = Math.abs(e.clientX - sx) + 'px';
      box.style.height = Math.abs(e.clientY - sy) + 'px';
    });
    ov.addEventListener('mouseup', function (e) {
      if (!drawing) { cancel(); return; }
      drawing = false;
      var x = Math.min(e.clientX, sx), y = Math.min(e.clientY, sy);
      var w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
      cleanup();
      if (w < 5 || h < 5) {
        chrome.runtime.sendMessage({ type: 'ps-region-rect', cancelled: true });
        return;
      }
      // Let the overlay paint-out before the tab is captured.
      setTimeout(function () {
        chrome.runtime.sendMessage({
          type: 'ps-region-rect',
          rect: { x: x, y: y, w: w, h: h },
          dpr: dpr
        });
      }, 60);
    });
  }

  function notify(id, message) {
    chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Peer Share',
      message: message
    });
  }

  // Stash a one-shot message the popup shows as its red status banner on
  // next open (OS notifications are unreliable; the popup banner is not).
  function flash(message) {
    return new Promise(function (resolve) {
      chrome.storage.session.set({
        ps_flash: { message: message, ts: Date.now() }
      }, resolve);
    });
  }

  async function regionCaptureFailed() {
    var msg = "Can't take a screenshot on this page — try a different web page.";
    await flash(msg);
    notify('ps-region-err', msg);
    // Bring the popup back so the user isn't stranded with it closed.
    try { await chrome.action.openPopup(); } catch (e) { /* noop */ }
  }

  async function startRegionCapture() {
    try {
      var tabs = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true
      });
      var tab = tabs && tabs[0];
      if (!tab || !tab.id) { await regionCaptureFailed(); return; }
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: psRegionOverlay
      });
    } catch (e) {
      await regionCaptureFailed();
    }
  }

  // Append a freshly cropped region to the persisted draft tray (the popup
  // is closed during selection, so it rehydrates from the draft on reopen).
  function appendDraftTray(item) {
    return openMediaDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('draft', 'readwrite');
        var st = tx.objectStore('draft');
        var g = st.get('tray');
        g.onsuccess = function (e) {
          var arr = e.target.result || [];
          arr.push(item);
          st.put(arr, 'tray');
        };
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      });
    }).catch(function () {});
  }

  async function handleRegionRect(req, sender) {
    if (req.cancelled) return;
    try {
      var winId = sender && sender.tab ? sender.tab.windowId : undefined;
      var dataUrl = await chrome.tabs.captureVisibleTab(winId, {
        format: 'png'
      });
      var blob = await (await fetch(dataUrl)).blob();
      var bmp = await createImageBitmap(blob);
      var dpr = req.dpr || 1, r = req.rect;
      var sw = Math.max(1, Math.round(r.w * dpr));
      var sh = Math.max(1, Math.round(r.h * dpr));
      var canvas = new OffscreenCanvas(sw, sh);
      var ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, Math.round(r.x * dpr), Math.round(r.y * dpr),
        sw, sh, 0, 0, sw, sh);
      var jpeg = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: 0.85
      });
      await appendDraftTray({
        kind: 'image',
        blob: jpeg,
        fileName: 'screenshot-' + Date.now() + '.jpg',
        mimeType: 'image/jpeg'
      });
      // Best path: pop the UI back up with the capture already staged.
      // Fallback (older Chrome / no focused window): badge + notification,
      // and the badge is cleared the next time the popup opens.
      try {
        await chrome.action.openPopup();
      } catch (e) {
        chrome.action.setBadgeText({ text: '＋' });
        chrome.action.setBadgeBackgroundColor({ color: '#009efd' });
        notify('ps-region', 'Region captured — open Peer Share to send');
      }
    } catch (e) {
      await flash('Could not capture region: ' + e.message);
      notify('ps-region-err', 'Could not capture region: ' + e.message);
      try { await chrome.action.openPopup(); } catch (e2) { /* noop */ }
    }
  }

  // Inbox is single-writer: popup/options send intents; only this worker
  // mutates ps_inbox. ps-poll-now drives the fast active-delivery path.
  chrome.runtime.onMessage.addListener(function (req, sender, sendResponse) {
    if (!req || !req.type) return;

    if (req.type === 'ps-region-capture') {
      startRegionCapture();
      return false;
    }

    if (req.type === 'ps-region-rect') {
      handleRegionRect(req, sender);
      return false;
    }

    if (req.type === 'ps-popup-open') {
      // Clear any transient capture badge; restore the real unread count.
      updateBadge();
      return false;
    }

    if (req.type === 'ps-poll-now') {
      reconcile().then(
        function () { sendResponse({ ok: true }); },
        function (e) { sendResponse({ ok: false, error: e.message }); }
      );
      return true;
    }

    if (req.type === 'ps-inbox-mark-read') {
      serialInboxWrite(async function () {
        var inbox = (await storageGet([INBOX_KEY]))[INBOX_KEY] || [];
        var changed = false;
        inbox.forEach(function (m) {
          if (!m.read) { m.read = true; changed = true; }
        });
        if (changed) await storageSet({ ps_inbox: inbox });
        await updateBadge();
      }).then(
        function () { sendResponse({ ok: true }); },
        function (e) { sendResponse({ ok: false, error: e.message }); }
      );
      return true;
    }

    if (req.type === 'ps-inbox-delete') {
      serialInboxWrite(async function () {
        var inbox = (await storageGet([INBOX_KEY]))[INBOX_KEY] || [];
        inbox = inbox.filter(function (m) { return m.id !== req.id; });
        await storageSet({ ps_inbox: inbox });
        deleteMediaBlob(req.id).catch(function () {});
        await updateBadge();
      }).then(
        function () { sendResponse({ ok: true }); },
        function (e) { sendResponse({ ok: false, error: e.message }); }
      );
      return true;
    }

    if (req.type === 'ps-inbox-clear') {
      serialInboxWrite(async function () {
        var inbox = (await storageGet([INBOX_KEY]))[INBOX_KEY] || [];
        inbox.forEach(function (m) {
          if (m.storagePath) deleteMediaBlob(m.id).catch(function () {});
        });
        await storageSet({ ps_inbox: [] });
        await updateBadge();
      }).then(
        function () { sendResponse({ ok: true }); },
        function (e) { sendResponse({ ok: false, error: e.message }); }
      );
      return true;
    }

    if (req.type === 'ps-inbox-fetch-media') {
      fetchAndStoreMedia(req.id).then(
        function () { sendResponse({ ok: true }); },
        function (e) { sendResponse({ ok: false, error: e.message }); }
      );
      return true;
    }
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes[INBOX_KEY]) updateBadge();
  });

  // Service worker (re)start.
  init(false);
})();
