/*
 * firebase.js — the ONLY networking module.
 *
 * Thin Firebase REST helpers (no Firebase SDK, no build step). Works in both
 * the MV3 service worker (importScripts) and extension pages (<script>).
 * Exposes a single global: `PeerShareFirebase`.
 */
(function (root) {
  'use strict';

  var AUTH_KEY = 'ps_auth'; // { idToken, refreshToken, uid, expiresAt }

  function cfg() {
    return root.FIREBASE_CONFIG;
  }

  function assertConfigured() {
    if (!root.FIREBASE_CONFIG_IS_SET || !root.FIREBASE_CONFIG_IS_SET()) {
      throw new Error('Firebase is not configured. Edit firebase-config.js.');
    }
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

  // ---- Auth -----------------------------------------------------------------

  async function signInAnonymously() {
    assertConfigured();
    var url = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' +
      encodeURIComponent(cfg().apiKey);
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true })
    });
    if (!res.ok) {
      throw new Error('Anonymous sign-in failed (' + res.status + ')');
    }
    var data = await res.json();
    var auth = {
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      uid: data.localId,
      expiresAt: Date.now() + (parseInt(data.expiresIn, 10) - 60) * 1000
    };
    await storageSet({ ps_auth: auth });
    return auth;
  }

  async function refreshIdToken(refreshToken) {
    assertConfigured();
    var url = 'https://securetoken.googleapis.com/v1/token?key=' +
      encodeURIComponent(cfg().apiKey);
    var body = 'grant_type=refresh_token&refresh_token=' +
      encodeURIComponent(refreshToken);
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    });
    if (!res.ok) {
      throw new Error('Token refresh failed (' + res.status + ')');
    }
    var data = await res.json();
    var auth = {
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      uid: data.user_id,
      expiresAt: Date.now() + (parseInt(data.expires_in, 10) - 60) * 1000
    };
    await storageSet({ ps_auth: auth });
    return auth;
  }

  // Serialize auth work within this JS realm so concurrent callers (e.g.
  // onInstalled + the service-worker module init) don't each create a
  // separate anonymous account.
  var authInFlight = null;

  async function resolveAuth() {
    var stored = (await storageGet([AUTH_KEY]))[AUTH_KEY];
    if (!stored || !stored.refreshToken) {
      return signInAnonymously();
    }
    if (Date.now() >= stored.expiresAt) {
      try {
        return await refreshIdToken(stored.refreshToken);
      } catch (e) {
        return signInAnonymously();
      }
    }
    return stored;
  }

  // Returns a valid auth object, signing in / refreshing as needed.
  function getAuth() {
    if (authInFlight) return authInFlight;
    authInFlight = resolveAuth().then(
      function (a) { authInFlight = null; return a; },
      function (e) { authInFlight = null; throw e; }
    );
    return authInFlight;
  }

  async function getValidToken() {
    return (await getAuth()).idToken;
  }

  async function getUid() {
    return (await getAuth()).uid;
  }

  // ---- Firestore value (de)serialization -----------------------------------

  function toValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') {
      return Number.isInteger(v)
        ? { integerValue: String(v) }
        : { doubleValue: v };
    }
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) {
      return { arrayValue: { values: v.map(toValue) } };
    }
    if (typeof v === 'object') {
      return { mapValue: { fields: toFields(v) } };
    }
    return { stringValue: String(v) };
  }

  function toFields(obj) {
    var f = {};
    Object.keys(obj).forEach(function (k) {
      if (obj[k] !== undefined) f[k] = toValue(obj[k]);
    });
    return f;
  }

  function fromValue(val) {
    if ('nullValue' in val) return null;
    if ('booleanValue' in val) return val.booleanValue;
    if ('integerValue' in val) return parseInt(val.integerValue, 10);
    if ('doubleValue' in val) return val.doubleValue;
    if ('stringValue' in val) return val.stringValue;
    if ('timestampValue' in val) return val.timestampValue;
    if ('arrayValue' in val) {
      return (val.arrayValue.values || []).map(fromValue);
    }
    if ('mapValue' in val) {
      return fromFields(val.mapValue.fields || {});
    }
    return null;
  }

  function fromFields(fields) {
    var o = {};
    Object.keys(fields || {}).forEach(function (k) {
      o[k] = fromValue(fields[k]);
    });
    return o;
  }

  function docBase() {
    return 'https://firestore.googleapis.com/v1/projects/' +
      encodeURIComponent(cfg().projectId) +
      '/databases/(default)/documents';
  }

  async function authHeaders(extra) {
    var token = await getValidToken();
    var h = { Authorization: 'Bearer ' + token };
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }

  // Create a document with an auto-generated id. Returns { id, fields }.
  async function firestoreCreate(collection, data) {
    var res = await fetch(docBase() + '/' + collection, {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ fields: toFields(data) })
    });
    if (!res.ok) {
      throw new Error('Firestore create failed (' + res.status + ')');
    }
    var doc = await res.json();
    var parts = (doc.name || '').split('/');
    return { id: parts[parts.length - 1], data: fromFields(doc.fields || {}) };
  }

  // Get a document by path (e.g. "messages/abc"). Returns null if missing.
  async function firestoreGet(path) {
    var res = await fetch(docBase() + '/' + path, {
      method: 'GET',
      headers: await authHeaders()
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error('Firestore get failed (' + res.status + ')');
    }
    var doc = await res.json();
    return fromFields(doc.fields || {});
  }

  // Upsert (create-or-overwrite) a document at an explicit path.
  async function firestoreSet(path, data) {
    var fieldPaths = Object.keys(data)
      .map(function (k) {
        return 'updateMask.fieldPaths=' + encodeURIComponent(k);
      })
      .join('&');
    var res = await fetch(docBase() + '/' + path + '?' + fieldPaths, {
      method: 'PATCH',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ fields: toFields(data) })
    });
    if (!res.ok) {
      throw new Error('Firestore set failed (' + res.status + ')');
    }
    return true;
  }

  // Run a single-field equality query. Returns [{ id, data }].
  async function firestoreQueryEqual(collection, field, value, limit) {
    var body = {
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: 'EQUAL',
            value: toValue(value)
          }
        },
        limit: limit || 50
      }
    };
    var res = await fetch(docBase() + ':runQuery', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      throw new Error('Firestore query failed (' + res.status + ')');
    }
    var rows = await res.json();
    var out = [];
    (rows || []).forEach(function (row) {
      if (!row.document) return;
      var parts = row.document.name.split('/');
      out.push({
        id: parts[parts.length - 1],
        data: fromFields(row.document.fields || {})
      });
    });
    return out;
  }

  // ---- Storage --------------------------------------------------------------

  function storageObjectUrl() {
    return 'https://firebasestorage.googleapis.com/v0/b/' +
      encodeURIComponent(cfg().storageBucket) + '/o';
  }

  // Upload bytes. `path` is the object path, e.g. "messages/<uid>/<file>".
  async function storageUpload(path, blob, contentType) {
    var url = storageObjectUrl() + '?name=' + encodeURIComponent(path);
    var res = await fetch(url, {
      method: 'POST',
      headers: await authHeaders({
        'Content-Type': contentType || 'application/octet-stream'
      }),
      body: blob
    });
    if (!res.ok) {
      throw new Error('Storage upload failed (' + res.status + ')');
    }
    return path;
  }

  // Download bytes as a Blob.
  async function storageDownload(path) {
    var url = storageObjectUrl() + '/' + encodeURIComponent(path) +
      '?alt=media';
    var res = await fetch(url, {
      method: 'GET',
      headers: await authHeaders()
    });
    if (!res.ok) {
      throw new Error('Storage download failed (' + res.status + ')');
    }
    return res.blob();
  }

  // ---- Realtime Database (optional real-time "doorbell") --------------------

  function rtdbBase() {
    return root.FIREBASE_RTDB_URL ? root.FIREBASE_RTDB_URL() : null;
  }

  // Write a small signal node. `path` is e.g. "signals/<uid>". Best-effort:
  // a failure here only costs the recipient a slightly later poll.
  async function rtdbPut(path, data) {
    var base = rtdbBase();
    if (!base) return false;
    var token = await getValidToken();
    var url = base + '/' + path + '.json?auth=' + encodeURIComponent(token);
    var res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      throw new Error('RTDB write failed (' + res.status + ')');
    }
    return true;
  }

  // Full streaming URL for a signal node, with a fresh auth token. The
  // recipient opens this as an EventSource (RTDB returns text/event-stream).
  async function rtdbSignalUrl(uid) {
    var base = rtdbBase();
    if (!base) return null;
    var token = await getValidToken();
    return base + '/signals/' + encodeURIComponent(uid) +
      '.json?auth=' + encodeURIComponent(token);
  }

  // Open a resilient stream on signals/<myUid>. Calls onRing() whenever the
  // node changes to a non-null value (a peer rang the doorbell). Auto
  // reconnects with backoff and refreshes the auth token (RTDB sends
  // auth_revoked when the ~1h ID token expires). Returns a stop() function.
  // Only usable where EventSource exists (extension pages, not the SW).
  function subscribeDoorbell(onRing) {
    if (!rtdbBase() || typeof EventSource === 'undefined') return null;
    var es = null;
    var stopped = false;
    var backoff = 1000;

    function handle(ev) {
      try {
        var payload = JSON.parse(ev.data);
        if (payload && payload.data !== null &&
            payload.data !== undefined) {
          backoff = 1000;
          onRing();
        }
      } catch (e) { /* keep-alive / non-JSON: ignore */ }
    }

    async function connect() {
      if (stopped) return;
      try {
        var uid = await getUid();
        var url = await rtdbSignalUrl(uid);
        if (!url || stopped) return;
        es = new EventSource(url);
        es.addEventListener('put', handle);
        es.addEventListener('patch', handle);
        es.addEventListener('cancel', reconnect);
        es.addEventListener('auth_revoked', reconnect);
        es.onerror = reconnect;
      } catch (e) {
        reconnect();
      }
    }

    function reconnect() {
      if (stopped) return;
      if (es) { es.close(); es = null; }
      var wait = backoff;
      backoff = Math.min(backoff * 2, 30000);
      setTimeout(connect, wait);
    }

    connect();
    return function stop() {
      stopped = true;
      if (es) { es.close(); es = null; }
    };
  }

  root.PeerShareFirebase = {
    isConfigured: function () {
      return !!root.FIREBASE_CONFIG_IS_SET && root.FIREBASE_CONFIG_IS_SET();
    },
    rtdbEnabled: function () {
      return !!rtdbBase();
    },
    subscribeDoorbell: subscribeDoorbell,
    signInAnonymously: signInAnonymously,
    getValidToken: getValidToken,
    getUid: getUid,
    firestoreCreate: firestoreCreate,
    firestoreGet: firestoreGet,
    firestoreSet: firestoreSet,
    firestoreQueryEqual: firestoreQueryEqual,
    storageUpload: storageUpload,
    storageDownload: storageDownload,
    rtdbPut: rtdbPut,
    rtdbSignalUrl: rtdbSignalUrl
  };
})(typeof self !== 'undefined' ? self : this);
