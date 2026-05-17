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
> Nothing is sent anywhere else. There is **no Cloud Function** and the free
> **Spark plan is enough** (Firestore + Storage + Anonymous Auth only).

## How it works (short version)

1. On first run the extension signs in **anonymously** to your Firebase
   project. Your **pairing code** is that anonymous account id.
2. You add a peer by their pairing code (and they add yours). Peers are stored
   locally.
3. Sending uploads the payload to **Firebase Storage** (text goes inline) and
   creates a **Firestore** `messages` document.
4. The sender also "rings a doorbell" — a tiny write to **Realtime Database**
   at `signals/{recipientUid}`.
5. The recipient gets the message via, in order of speed:
   - **Doorbell stream** (~0.1–0.4s): while the popup/options page is open it
     holds an open RTDB stream and reacts the instant the doorbell rings.
   - **Idle poll** (~1 min): a `chrome.alarms` job wakes the service worker
     as a backstop when nothing is open / the stream is dead.
   When a new message is found, its metadata lands in the **Inbox** and a
   notification fires immediately; image/file bytes download lazily in the
   background (cached in IndexedDB). The doorbell is optional — if Realtime
   Database isn't configured the extension falls back to a ~2s poll.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full design,
data model, security rules, and future plans.

## Firebase setup (required, one time)

The free **Spark plan is sufficient** — there is no Cloud Function.

1. **Create a project** at <https://console.firebase.google.com>.
2. **Enable services:**
   - Authentication → Sign-in method → **Anonymous** → enable
   - **Firestore Database** → create (production mode)
   - **Storage** → get started
   - **Realtime Database** → **Create Database** (any location, *locked
     mode*) — this powers the instant "doorbell". *Optional but recommended;
     without it delivery falls back to a ~2s poll.*
3. **Add a Web app** (Project settings → General → *Your apps* → Web) and copy
   its config. Paste the values into
   [`firebase-config.js`](./firebase-config.js):
   `apiKey`, `projectId`, `storageBucket`, `messagingSenderId`, and
   `databaseURL` (shown on the Realtime Database page, e.g.
   `https://<project>-default-rtdb.firebaseio.com`).
4. **Install the Firebase CLI** and deploy the security rules. From the
   `peer-share/` directory:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add          # pick the project you created
   firebase deploy --only firestore:rules,storage,database
   ```
   `firebase.json`, `firestore.rules`, `storage.rules`, and
   `database.rules.json` are included here.

The security rules that get deployed:

- **Firestore `messages`** — a sender can only create a message stamped with
  their own uid; only the addressed recipient can read it or mark it
  delivered.
- **Storage `messages/{uid}/...`** — any authenticated user can upload; only
  the addressed recipient (`uid` in the path) can read.
- **RTDB `signals/{uid}`** — any authenticated user can write (ring a peer's
  doorbell); only the owner (`uid`) can read their own. The node holds only a
  message id + timestamp, never payload.

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
| `storage`, `unlimitedStorage` | Peers, settings, auth tokens, and the local inbox metadata. |
| `activeTab` | Capture a screenshot of the current tab when you click *Capture*. |
| `notifications` | Tell you when a peer sends something. |
| `alarms` | ~1-minute poll that delivers messages while the extension is idle. |
| `host_permissions` (googleapis.com) | Talk to your Firebase project (auth, Firestore, Storage). |

## Caveats

- Requires the user-provisioned Firebase project described above; without it
  the popup/options show a clear "not configured" state and make no network
  calls.
- Delivery latency: ~0.1–0.4s while the popup/options page is open (RTDB
  doorbell stream); up to ~1 minute when fully idle/closed (then a
  notification fires). Sub-second delivery to a fully-closed browser is not
  possible without a server push, by design.
- Payloads pass through your Firebase project in plaintext (end-to-end
  encryption is a future enhancement — see the architecture doc).
