# Peer Share — Architecture

A living design doc for the Peer Share extension. It explains the identity
model, the send/receive data flow, the polling delivery path, the data model +
security rules, and what is intentionally left for later.

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
| `background.js` | Service worker: sign-in, the poll alarm + `reconcile()` delivery, the **single-writer inbox mutex**, lazy media fetch into IndexedDB, badge. |
| `popup.html/js` | Send view (screenshot/file/text → peer + caption) and Inbox view (live-refresh, lazy image render, ~2s active poll while open). |
| `options.html/js/css` | Firebase status, **my pairing code** (+copy), peer CRUD, inbox retention, clear inbox. |
| `firebase.json`, `firestore.rules`, `storage.rules`, `database.rules.json` | Deployed via the Firebase CLI (rules only — no functions). |

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

## Receive flow (polling — no push, no Cloud Function)

```
sender popup ──create──▶ Firestore messages/{id}

sender also ──PUT──▶ RTDB signals/{recipientUid} = {id, ts}   (doorbell)

recipient reconcile()  (driven by, fastest first):
  • RTDB doorbell stream (EventSource on signals/{myUid}) while a
    popup/options page is open → ps-poll-now within ~0.1–0.4s
  • chrome.alarms `ps-poll` every ~1 min                (idle backstop)
  • slow safety poll while a page is open (15s; 2s if RTDB unconfigured)
        │
  query messages where to == myUid  → for each new id:
        │  ingestMessage (serialized via the inbox mutex)
        ├─ write metadata-only item to ps_inbox  (FAST: no download)
        ├─ chrome.notifications + badge
        ├─ mark messages/{id}.delivered = true
        └─ fetchAndStoreMedia(id)  (outside mutex):
              storageDownload → IndexedDB blob → flip mediaReady=true
recipient popup: storage.onChanged → re-render; image <img> src is a
                 URL.createObjectURL of the IndexedDB blob
```

- **No `chrome.gcm`, no FCM, no Cloud Function, no `users` collection.**
  Sending a push needs a server-held secret (service-account / VAPID key)
  that can't safely ship in an extension, so there is no push. Instead the
  sender writes a tiny **RTDB doorbell** and the recipient streams it over a
  plain `EventSource` (RTDB REST `text/event-stream`, authed with the anon ID
  token) — real-time while a page is open, no SDK, no build step. The
  `chrome.alarms` poll remains the backstop for the fully-dormant case (an
  evicted MV3 worker can't hold the stream; waking it instantly would require
  a server push).
- `subscribeDoorbell` (firebase.js) auto-reconnects with backoff and a fresh
  token on `auth_revoked` (the ~1h ID token expiry).
- **Single-writer inbox:** every `ps_inbox` mutation (ingest, mark-read,
  delete, clear) is serialized through one promise-chain mutex in the SW.
  popup/options send intents (`ps-inbox-*`) rather than writing storage, so a
  received message can't be clobbered by a concurrent UI write.
- **Lazy media:** ingest stores only metadata so the inbox entry +
  notification are instant; payload bytes are fetched lazily into IndexedDB
  (keyed by message id) and rendered via object URLs — no giant base64 in
  `chrome.storage.local`.
- The poll query is single-field (`to == myUid`, no composite index);
  `delivered` + already-in-inbox are filtered client-side. Ingestion is
  idempotent.

## Data model

- `messages/{autoId}`: `to`, `from`, `type` (`text|image|file`), `caption`,
  `ts`, `delivered`, plus `text` **or** (`storagePath`, `fileName`,
  `mimeType`).
- RTDB `signals/{recipientUid}`: `{ id, ts }` doorbell only — no payload.
- Storage objects: `messages/{recipientUid}/{ts}_{safeName}`.
- Local (`chrome.storage.local`): `ps_auth`, `ps_peers`, `ps_inbox`
  (metadata only — items carry `storagePath`/`mediaReady`, not bytes),
  `ps_settings` (`{ retention }`).
- IndexedDB `peer-share-media` store `blobs`: received payload bytes keyed by
  message id.

## Security rules

- **`messages`** — `create` only if `request.resource.data.from ==
  request.auth.uid`; `read/update/delete` only if `resource.data.to ==
  request.auth.uid`. So you can't forge a sender, and only the recipient sees
  or acknowledges a message.
- **Storage `messages/{uid}/**`** — authed write; read restricted to the
  recipient whose uid is in the path.
- **RTDB `signals/{uid}`** — authed write (any peer may ring you); read only
  by the owner. Default-deny everywhere else.
- **RTDB `contacts/{uid}/{from}`** — owner-only read; requester (`$from`) or
  owner may write. Holds a friend request (`{ ts }`), no payload.

## Peer / friend-request lifecycle (intentional semantics)

Identity is rules-based, not approval-based: **receiving requires only your
own auth** (`messages.read if to == me`). Consequences, by design:

- **A adds B** → A can send to B immediately; A also writes
  `contacts/{B}/{A}` so B sees a request. B *receives A's messages right
  away* (shown as `Unknown (code…)` until B has a name for A).
- **B Accepts** → A is added to B's `ps_peers` (B-chosen name); the request
  node is deleted. Now B→A works and both render real names.
- **B Ignores** → only the request node is deleted. It is a *dismiss, not a
  block*: A can still send to B (any holder of your code can), B just won't
  have A as a contact and won't reply. A is not notified.
- **Remove peer** (either side) → purely local (`ps_peers` only): stops your
  *outbound* to them and the name mapping (their messages become
  `Unknown`), but inbound from anyone holding your code still arrives. The
  other side is not notified; re-adding by code re-sends a fresh request.

A true block isn't possible without a backend (rules can't consult a
per-recipient blocklist); the only client-side option would be an
ingest-time ignore list (hide, not server-block). Accepted for the
trusted-peers, your-own-project threat model.

## Trade-offs

- Diverges from the repo's strict no-backend norm; needs a user Firebase
  project + a one-time `firebase deploy` of rules. The free **Spark** plan is
  sufficient (no Cloud Function).
- RTDB doorbell stream → ~0.1–0.4s while a page is open; ~1 min when fully
  idle/closed (notification still fires). Sub-second to a fully-closed
  browser is impossible without a server push, by design. RTDB is optional;
  absent it, delivery falls back to a ~2s poll.
- Screenshots are lossy-recompressed to keep uploads small.
- Inbox payload bytes live in IndexedDB; `ps_inbox` holds metadata only.
  Retention trims both (oldest items' blobs are deleted on trim/delete/clear).

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
