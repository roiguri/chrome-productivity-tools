# Peer Share — Architecture

A living design doc for the Peer Share extension. It explains the identity
model, the send/receive data flow, the push path, the data model + security
rules, and what is intentionally left for later.

## Goals & constraints

- Quickly send a **screenshot of the current tab**, a **file**, or **text**
  to a specific peer, and have it arrive **automatically** in their browser.
- No bundled/self-hosted server. The relay is a **Firebase project the user
  provisions**; nothing touches any other backend.
- Manifest V3, vanilla JS, no build step — consistent with the rest of this
  repo. Mirrors `autofill/`'s UI/storage conventions.

## Identity / pairing

- No accounts, no passwords. On first run `background.js` performs a Firebase
  **anonymous sign-in** over REST
  (`identitytoolkit.googleapis.com/v1/accounts:signUp`), yielding
  `idToken` + `refreshToken` + `localId` (the **uid**).
- Auth is cached in `chrome.storage.local` under `ps_auth` and refreshed via
  `securetoken.googleapis.com` (ID tokens last ~1h).
- The user's **pairing code is their uid**. Pairing = exchanging codes and
  saving each other as a peer (`ps_peers` in local storage:
  `{ id, nickname, code }`). Opaque, but only people you hand the code to can
  message you (enforced by security rules).

## Components

| File | Role |
|---|---|
| `firebase-config.js` | User-edited project config + an `IS_SET` guard. Loads in both the SW and pages via a `self`/`globalThis` IIFE. |
| `firebase.js` | The **only** networking module. REST helpers for anon auth/refresh, Firestore CRUD + single-field query, and Storage upload/download. Exposes `PeerShareFirebase`. |
| `background.js` | Service worker: sign-in, `chrome.gcm` register + token publish, push ingestion, reconcile alarm, badge. |
| `popup.html/js` | Send view (screenshot/file/text → peer + caption) and Inbox view. |
| `options.html/js/css` | Firebase status, **my pairing code** (+copy), peer CRUD, inbox retention, clear inbox. |
| `functions/` | The push Cloud Function (`onDocumentCreated('messages/{id}')`). |
| `firebase.json`, `firestore.rules`, `storage.rules` | Deployed via the Firebase CLI. |

## Send flow (popup)

1. Pick input:
   - **Screenshot** — `chrome.tabs.captureVisibleTab` (PNG) → `OffscreenCanvas`
     re-encode to **JPEG q0.7** to shrink the upload.
   - **File** — `<input type=file>` → the `File` blob.
   - **Text** — textarea (stored inline, no Storage object).
2. Pick a saved peer + optional caption.
3. Non-text payloads upload to **Storage** at
   `messages/{recipientUid}/{ts}_{safeName}` via the REST media-upload
   endpoint.
4. A **Firestore** doc is created at `messages/{autoId}`:
   `{ to, from, type, caption, ts, delivered:false,
   (storagePath|text), fileName?, mimeType? }`.

## Receive flow (true push + safety net)

```
sender popup ──create──▶ Firestore messages/{id}
                               │ onDocumentCreated
                               ▼
                       Cloud Function
                  reads users/{to}.gcmToken
                               │ FCM data msg { messageId }
                               ▼
recipient: chrome.gcm.onMessage  (wakes the dormant SW)
                               │
        firestoreGet messages/{id}  ──▶ storageDownload(storagePath)
                               │
     push into chrome.storage.local `ps_inbox`  +  mark delivered:true
                               │
            chrome.notifications + toolbar badge update
```

- `background.js` registers with `chrome.gcm.register([messagingSenderId])`
  and upserts `users/{uid} = { gcmToken, updatedAt }`. Token changes are
  re-published.
- The Cloud Function sends a **data-only** FCM message containing just the
  Firestore document id — the payload itself is fetched by the recipient.
- **Reconcile fallback:** a 30-minute `chrome.alarms` job queries
  `messages where to == myUid` (single-field, no composite index), filters
  `!delivered` client-side, and ingests anything a push missed. Ingestion is
  idempotent (skips ids already in the inbox).

## Data model

- `messages/{autoId}`: `to`, `from`, `type` (`text|image|file`), `caption`,
  `ts`, `delivered`, plus `text` **or** (`storagePath`, `fileName`,
  `mimeType`).
- `users/{uid}`: `gcmToken`, `updatedAt`.
- Storage objects: `messages/{recipientUid}/{ts}_{safeName}`.
- Local (`chrome.storage.local`): `ps_auth`, `ps_peers`, `ps_inbox`,
  `ps_settings` (`{ retention }`), `ps_gcm_token`.

## Security rules

- **`messages`** — `create` only if `request.resource.data.from ==
  request.auth.uid`; `read/update/delete` only if `resource.data.to ==
  request.auth.uid`. So you can't forge a sender, and only the recipient sees
  or acknowledges a message.
- **`users/{uid}`** — owner-only write; readable by any authed user (a
  registration token is a routing id, not a credential — needed so the push
  function/sender path can resolve it).
- **Storage `messages/{uid}/**`** — authed write; read restricted to the
  recipient whose uid is in the path.

## Trade-offs

- Diverges from the repo's strict no-backend norm; needs a user Firebase
  project on **Blaze** + a one-time `firebase deploy`.
- GCM is best-effort, hence the reconcile alarm.
- Screenshots are lossy-recompressed to keep uploads small.
- Inbox payloads are stored as data URLs in `chrome.storage.local`
  (`unlimitedStorage`), capped by the retention setting.

## Future plans (out of scope for this iteration)

- **Email share path (deferred):** a secondary "Share via email" action —
  auto-download the screenshot/file via `chrome.downloads`, then open a
  `mailto:` compose with the peer's stored email prefilled (caption as
  subject/body) for manual attach. Would re-add the `downloads` permission and
  an optional per-peer email field.
- **Friendly pairing codes:** map the long uid to a short human-readable code
  (a `codes/{shortCode}` → uid lookup doc) so pairing doesn't require pasting
  a uid.
- **Read receipts / delivery status** surfaced back to the sender.
- **Inbox auto-purge by age** and Storage cleanup of consumed payloads.
- **Multi-recipient / group send** and message expiry (TTL).
- **End-to-end encryption** so the relay never sees plaintext.
