# Peer Share

Send a **screenshot of the current tab**, a **file from disk**, or **pasted
text** straight to a paired peer's browser. The peer gets a desktop
notification and the item lands in their extension's **Inbox** — no copy/paste,
no chat app in the middle.

- **Status:** ✅ Ready (requires one-time Firebase setup — see below)
- **Version:** 1.0.0
- **Manifest:** V3, vanilla JS, no build step

> ⚠️ Unlike the other extensions in this repo, Peer Share is **not 100%
> no-backend**. It needs a relay to move bytes between two browsers. There is
> no bundled server — instead you point it at a **Firebase project you own**.
> Nothing is sent anywhere else.

## How it works (short version)

1. On first run the extension signs in **anonymously** to your Firebase
   project. Your **pairing code** is that anonymous account id.
2. You add a peer by their pairing code (and they add yours). Peers are stored
   locally.
3. Sending uploads the payload to **Firebase Storage** (text goes inline) and
   creates a **Firestore** `messages` document.
4. A **Cloud Function** sees the new document and sends a tiny push via
   **Firebase Cloud Messaging** to the recipient's browser.
5. `chrome.gcm` wakes the recipient's service worker, which downloads the
   payload, drops it in the Inbox, and shows a notification. **True push** —
   no constant polling. A 30-minute reconcile alarm is only a safety net for
   pushes that get dropped.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full design,
data model, security rules, and future plans.

## Firebase setup (required, one time)

You need the **Blaze (pay-as-you-go) plan** because Cloud Functions require
it. At this volume it is effectively free, but a billing account must exist.

1. **Create a project** at <https://console.firebase.google.com> and upgrade
   it to the **Blaze** plan.
2. **Enable services:**
   - Authentication → Sign-in method → **Anonymous** → enable
   - **Firestore Database** → create (production mode)
   - **Storage** → get started
   - Cloud Messaging is enabled by default.
3. **Add a Web app** (Project settings → General → *Your apps* → Web) and copy
   its config. Paste the values into
   [`firebase-config.js`](./firebase-config.js):
   - `apiKey`, `projectId`, `storageBucket`, `messagingSenderId`
     (`messagingSenderId` is the project number — used by `chrome.gcm`).
4. **Install the Firebase CLI** and deploy the relay + rules. From the
   `peer-share/` directory:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add          # pick the project you created
   firebase deploy --only functions,firestore:rules,storage
   ```
   `firebase.json`, `functions/`, `firestore.rules`, and `storage.rules` are
   all included in this folder.

The security rules that get deployed:

- **Firestore `messages`** — a sender can only create a message stamped with
  their own uid; only the addressed recipient can read it or mark it
  delivered.
- **Firestore `users/{uid}`** — owner-only write; readable by any
  authenticated user (the registration token is a routing id, not a secret).
- **Storage `messages/{uid}/...`** — any authenticated user can upload; only
  the addressed recipient (`uid` in the path) can read.

## Install the extension

1. `chrome://extensions/` → enable **Developer mode**
2. **Load unpacked** → select the `peer-share/` directory
3. Open **Options** — confirm "Firebase connection: Configured" and that a
   **pairing code** is shown.

## Pairing & usage

1. Open **Options** on both browsers and copy each other's **pairing code**.
2. On each side, **Add peer** (nickname + the other's pairing code).
3. Click the toolbar icon → **Send**:
   - **Screenshot** — capture the visible tab (auto-compressed to JPEG)
   - **File** — pick any file
   - **Text** — type/paste
   Choose the peer, add an optional caption, **Send**.
4. The peer gets a notification; the item appears under **Inbox** (copy text,
   or save files/images). The toolbar badge shows the unread count.

## Permissions

| Permission | Why |
|---|---|
| `storage`, `unlimitedStorage` | Peers, settings, auth tokens, and the local inbox (received images can be sizable). |
| `activeTab` | Capture a screenshot of the current tab when you click *Capture*. |
| `notifications` | Tell you when a peer sends something. |
| `alarms` | 30-minute reconcile fallback for missed pushes. |
| `gcm` | Receive the push that wakes the service worker (true push). |
| `host_permissions` (googleapis.com) | Talk to your Firebase project (auth, Firestore, Storage). |

## Caveats

- Requires the user-provisioned Firebase project described above; without it
  the popup/options show a clear "not configured" state and make no network
  calls.
- GCM delivery is best-effort; the reconcile alarm (every 30 min) backstops
  any push that doesn't arrive.
- Payloads pass through your Firebase project in plaintext (end-to-end
  encryption is a future enhancement — see the architecture doc).
