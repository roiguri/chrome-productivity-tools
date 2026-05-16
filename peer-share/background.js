/*
 * background.js — MV3 service worker.
 *
 * Responsibilities:
 *   - anonymous Firebase sign-in on install/startup
 *   - register with chrome.gcm and publish the token to users/{uid}
 *   - receive pushes (chrome.gcm.onMessage) -> fetch + store into the inbox
 *   - a low-frequency alarm that reconciles anything a push missed
 *   - keep the toolbar badge in sync with the unread count
 */
importScripts('firebase-config.js', 'firebase.js');

(function () {
  'use strict';

  var FB = self.PeerShareFirebase;

  var INBOX_KEY = 'ps_inbox';
  var SETTINGS_KEY = 'ps_settings';
  var GCM_TOKEN_KEY = 'ps_gcm_token';
  var RECONCILE_ALARM = 'ps-reconcile';
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

  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, i + chunk)
      );
    }
    return btoa(binary);
  }

  async function blobToDataUrl(blob) {
    var buf = await blob.arrayBuffer();
    var type = blob.type || 'application/octet-stream';
    return 'data:' + type + ';base64,' + arrayBufferToBase64(buf);
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

  // ---- gcm registration -----------------------------------------------------

  function gcmRegister(senderId) {
    return new Promise(function (resolve, reject) {
      chrome.gcm.register([senderId], function (registrationId) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(registrationId);
      });
    });
  }

  async function ensureRegistered() {
    if (!FB.isConfigured()) return;
    try {
      var senderId = self.FIREBASE_CONFIG.messagingSenderId;
      var token = await gcmRegister(senderId);
      var prev = (await storageGet([GCM_TOKEN_KEY]))[GCM_TOKEN_KEY];
      var uid = await FB.getUid();
      if (token && token !== prev) {
        await FB.firestoreSet('users/' + uid, {
          gcmToken: token,
          updatedAt: Date.now()
        });
        await storageSet({ ps_gcm_token: token });
      } else if (token) {
        // Token unchanged but make sure the user doc exists.
        await FB.firestoreSet('users/' + uid, {
          gcmToken: token,
          updatedAt: Date.now()
        });
      }
    } catch (e) {
      console.warn('[Peer Share] gcm registration failed:', e.message);
    }
  }

  // ---- message ingestion ----------------------------------------------------

  // Fetch a message doc, download its payload, and push it into the inbox.
  // Idempotent: a message already in the inbox is skipped.
  async function ingestMessage(messageId) {
    var uid = await FB.getUid();
    var msg = await FB.firestoreGet('messages/' + messageId);
    if (!msg || msg.to !== uid) return;

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
      var blob = await FB.storageDownload(msg.storagePath);
      item.fileName = msg.fileName || 'shared-file';
      item.mimeType = msg.mimeType || blob.type || 'application/octet-stream';
      item.dataUrl = await blobToDataUrl(blob);
    }

    var retention = await getRetention();
    inbox.unshift(item);
    if (inbox.length > retention) inbox = inbox.slice(0, retention);
    await storageSet({ ps_inbox: inbox });

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
  }

  // Safety net: pull anything addressed to us that a push didn't deliver.
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
    await ensureRegistered();
    chrome.alarms.create(RECONCILE_ALARM, { periodInMinutes: 30 });
    await reconcile();
    await updateBadge();
  }

  chrome.runtime.onInstalled.addListener(function (details) {
    init(details.reason === 'install');
  });

  chrome.runtime.onStartup.addListener(function () {
    init(false);
  });

  chrome.gcm.onMessage.addListener(function (message) {
    var data = message && message.data ? message.data : {};
    if (data.messageId) {
      ingestMessage(data.messageId).catch(function (e) {
        console.warn('[Peer Share] ingest failed:', e.message);
      });
    }
  });

  chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === RECONCILE_ALARM) reconcile();
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes[INBOX_KEY]) updateBadge();
  });

  // Service worker (re)start.
  init(false);
})();
