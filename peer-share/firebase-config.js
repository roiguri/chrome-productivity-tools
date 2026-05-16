/*
 * ============================================================================
 *  EDIT ME — paste your own Firebase project's web config below.
 * ============================================================================
 *
 *  Peer Share has NO bundled backend. It relays messages through a Firebase
 *  project that YOU provision (free Spark tier works for everything except
 *  the push Cloud Function, which needs the pay-as-you-go Blaze plan — still
 *  effectively free at this volume). See README.md -> "Firebase setup".
 *
 *  Where to find these values:
 *    Firebase console -> Project settings -> General ->
 *      "Your apps" -> Web app -> SDK setup and configuration -> Config
 *
 *    - apiKey            : the "apiKey" string
 *    - projectId         : the "projectId" string
 *    - storageBucket     : the "storageBucket" string (e.g. my-app.appspot.com)
 *    - messagingSenderId : the "messagingSenderId" string (a.k.a. the project
 *                           number / GCM sender id — used by chrome.gcm)
 *
 *  Until these are filled in, the extension will show a clear configuration
 *  error instead of attempting any network calls.
 */
(function (root) {
  'use strict';

  root.FIREBASE_CONFIG = {
    apiKey: 'AIzaSyAQ0oXvUCE3Uf7jnxsV6nYACIah7UnqfrU',
    projectId: 'peer-share-1f592',
    storageBucket: 'peer-share-1f592.firebasestorage.app',
    messagingSenderId: '483281090336'
  };

  root.FIREBASE_CONFIG_IS_SET = function () {
    var c = root.FIREBASE_CONFIG;
    return !!c &&
      !!c.apiKey && c.apiKey.indexOf('PASTE_') !== 0 &&
      !!c.projectId && c.projectId.indexOf('PASTE_') !== 0 &&
      !!c.storageBucket && c.storageBucket.indexOf('PASTE_') !== 0 &&
      !!c.messagingSenderId && c.messagingSenderId.indexOf('PASTE_') !== 0;
  };
})(typeof self !== 'undefined' ? self : this);
