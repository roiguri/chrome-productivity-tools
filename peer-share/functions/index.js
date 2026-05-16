/*
 * Peer Share push function.
 *
 * Trigger: a new document in `messages/{id}`.
 * Action : look up the recipient's chrome.gcm registration token
 *          (users/{to}.gcmToken) and send a tiny data-only FCM message so
 *          the recipient's extension service worker wakes up and pulls the
 *          message. The payload is just the Firestore document id.
 */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

exports.notifyRecipient = onDocumentCreated('messages/{id}', async (event) => {
  const snap = event.data;
  if (!snap) return;

  const msg = snap.data() || {};
  const to = msg.to;
  if (!to) return;

  const userSnap = await getFirestore().doc(`users/${to}`).get();
  const token = userSnap.exists ? userSnap.get('gcmToken') : null;
  if (!token) {
    console.log(`No gcmToken for recipient ${to}; skipping push.`);
    return;
  }

  try {
    await getMessaging().send({
      token,
      data: { messageId: event.params.id }
    });
  } catch (err) {
    // A stale token just means the reconcile fallback will deliver it later.
    console.warn(`Push to ${to} failed: ${err.message}`);
  }
});
