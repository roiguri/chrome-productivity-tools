/*
 * ============================================================================
 *  EDIT ME — paste your own Firebase project's web config below.
 * ============================================================================
 *
 *  Peer Share has NO bundled backend and NO Cloud Function. It relays
 *  messages through a Firebase project that YOU provision; the free Spark
 *  tier is sufficient. See README.md -> "Firebase setup".
 *
 *  Where to find these values:
 *    Firebase console -> Project settings -> General ->
 *      "Your apps" -> Web app -> SDK setup and configuration -> Config
 *
 *    - apiKey            : the "apiKey" string
 *    - projectId         : the "projectId" string
 *    - storageBucket     : the "storageBucket" string (e.g. my-app.appspot.com)
 *    - messagingSenderId : the "messagingSenderId" string (the project
 *                           number; kept for config completeness)
 *
 *  Optional (real-time delivery — the "doorbell"):
 *    - databaseURL : your Realtime Database URL, e.g.
 *        https://<project>-default-rtdb.firebaseio.com
 *        (Firebase console -> Realtime Database -> create, then copy the URL).
 *      If left as the PASTE_ placeholder the extension still works — it just
 *      falls back to ~2s polling instead of instant streaming.
 *
 *  Until the required values are filled in, the extension shows a clear
 *  configuration error instead of attempting any network calls.
 */
(function (root) {
  'use strict';

  root.FIREBASE_CONFIG = {
    apiKey: 'PASTE_API_KEY_HERE',
    projectId: 'PASTE_PROJECT_ID_HERE',
    storageBucket: 'PASTE_STORAGE_BUCKET_HERE',
    messagingSenderId: 'PASTE_MESSAGING_SENDER_ID_HERE',
    databaseURL: 'PASTE_DATABASE_URL_HERE'
  };

  root.FIREBASE_CONFIG_IS_SET = function () {
    var c = root.FIREBASE_CONFIG;
    return !!c &&
      !!c.apiKey && c.apiKey.indexOf('PASTE_') !== 0 &&
      !!c.projectId && c.projectId.indexOf('PASTE_') !== 0 &&
      !!c.storageBucket && c.storageBucket.indexOf('PASTE_') !== 0 &&
      !!c.messagingSenderId && c.messagingSenderId.indexOf('PASTE_') !== 0;
  };

  // Optional real-time doorbell. Returns the trimmed RTDB base URL, or null
  // when unconfigured (extension then falls back to polling).
  root.FIREBASE_RTDB_URL = function () {
    var c = root.FIREBASE_CONFIG;
    if (!c || !c.databaseURL || c.databaseURL.indexOf('PASTE_') === 0) {
      return null;
    }
    return c.databaseURL.replace(/\/+$/, '');
  };
})(typeof self !== 'undefined' ? self : this);
