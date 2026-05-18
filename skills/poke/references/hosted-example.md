# Hosted example — Cloudflare Worker + KV

This is **another substrate**, sibling to `wire-example.md`. Same pattern;
different mechanics. Where the local wire binds an HTTP server to `127.0.0.1`
and the agent reads `SUBMIT` lines off the server's stdout, the hosted wire
lives at a `*.workers.dev` URL, persists per-session state in Cloudflare
Workers KV, and exposes a `GET /<id>/poll?since=<cursor>` endpoint the agent
polls on whatever cadence makes sense.

A worked deployment ships at `examples/worker/`. This document describes the
contract.

## Why hosted is different

The five invariants from `pattern.md` carry over unchanged: the agent owns the
intent map, the surface exposes affordances by ID, the agent autonomously
drains, submissions are typed by construction, surfaces are ephemeral.

What changes is everything around them:

- The agent and the surface are not co-located. The surface lives at the
  edge; the agent lives wherever it lives.
- Stdout isn't available as a drain channel — Workers don't have a "stdout"
  the agent can tail. Drain becomes a pull: the agent polls a `/<id>/poll`
  endpoint and advances a cursor. Push (a webhook from the worker back to
  the agent) is also valid; polling is simpler and what this implementation
  ships.
- Localhost bind is no longer the access control. Anyone on the internet who
  guesses (or learns) the URL can reach the surface. The session ID in the
  path becomes the access boundary, with CSRF on the submit path as a
  second layer (see `security.md`).
- State persistence lives in KV, not a local JSON file. Atomic writes,
  per-session locking, and OS-level mtime semantics don't apply — KV is
  last-write-wins, eventually consistent, with a per-value cap.

The pattern doesn't care which substrate the agent picks. This file describes
one concrete shape.

## Routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Empty-body 404. The hosted worker has no landing page by design — bare root reveals nothing about the deployment. |
| `POST` | `/_provision` | Agent-only. Creates a new session and returns `{session_id, url, csrf_token}`. Bearer-token gated. |
| `GET` | `/<session_id>` | 308 redirect to `/<session_id>/`. The canonical session URL has a trailing slash so relative-path fetches in the served HTML (`fetch('./submit')`) resolve to `/<session_id>/submit`. |
| `GET` | `/<session_id>/` | Renders the agent-provisioned HTML for the session. CSRF token injected as `window.POKE_CSRF_TOKEN`. |
| `POST` | `/<session_id>/submit` | Accepts a submission. JSON only in v0. CSRF-protected. |
| `GET` | `/<session_id>/poll?since=<unix-ms>` | Drain endpoint. Returns submissions newer than `since`. |
| `POST` | `/<session_id>/upload` | Stub. Multipart file uploads are out of scope for v0; returns 501. |

### URL shape

The canonical session URL ends in a trailing slash (`/<session_id>/`). This
matters because relative-path fetches in the served HTML (`fetch('./submit')`,
`fetch('./poll?since=0')`) resolve against the page URL — and from a
no-trailing-slash `/<session_id>`, the browser resolves `./submit` to
`/submit` at the root, which 404s. The worker emits a 308 redirect from
`/<session_id>` to `/<session_id>/` to neutralise the footgun, and
`POST /_provision` returns the trailing-slash form so agents shipping the URL
get the canonical shape directly. HTML authors can also use absolute paths
constructed from the injected `window.POKE_SESSION_ID` shim
(`fetch(\`/${window.POKE_SESSION_ID}/submit\`, ...)`) — slightly more
explicit, immune to relative-path quirks if the surface is ever served from
a different mount point.

### Bare root

`GET /` returns an empty-body 404. There's no legitimate visitor for the
bare hostname: real visits go to `/<session_id>/`, and provisioning is the
agent's job over `POST /_provision` (Bearer-gated). Treating the worker as
invisible infrastructure — no landing page, no friendly message, no
endpoint list — keeps the deployment from advertising itself to anyone who
guesses the hostname.

`/poll` is hosted-substrate-specific. The local wire (`wire-example.md`) has
no equivalent — it uses stdout `SUBMIT` lines instead. Implementations of
the hosted substrate on other platforms (a Vercel function over Postgres,
a Fly app over SQLite, Deno Deploy + KV) follow the same shape.

## State shape

Per-session state lives in KV under `session:<id>:state`. The value is a
JSON object whose shape mirrors the local wire's `.poke-state.json` with
hosted-only additions:

```json
{
  "session_id": "<hex>",
  "affordances": {
    "<affordance-id>": { "label": "<string>", "intent": <any JSON> }
  },
  "submissions": [
    {
      "id": "<affordance-id>",
      "payload": <any JSON or null>,
      "at": "<RFC3339 timestamp>",
      "at_ms": <unix-ms integer>
    }
  ],
  "html": "<the agent-rendered surface HTML>",
  "csrf_token": "<hex>",
  "created_at": "<RFC3339 timestamp>"
}
```

Field roles that differ from the local wire:

- **`html`** — the agent provisions the surface HTML inline. KV per-value
  caps (currently 25 MiB) bound the page size; anything heavier is the
  agent's signal to reach for R2 instead.
- **`csrf_token`** — random hex generated at provision time. Validated on
  `POST /submit` against either the `x-poke-csrf` header or a
  `csrf_token` field in the JSON body.
- **`created_at`** — provisioning timestamp. The pattern doesn't fix a
  TTL; agents (or a sweeper Worker) decide when sessions expire.
- **`at_ms`** — duplicate of `at` as integer milliseconds, present on
  submissions only. Lets `/poll?since=<ms>` filter cheaply without parsing
  RFC3339 strings on every request.

## Submission semantics

`POST /<session_id>/submit` with `application/json`:

```json
{ "id": "<affordance-id>", "payload": <json-or-null>, "csrf_token": "<optional>" }
```

The worker:

1. Loads `session:<id>:state` from KV. 404 if missing.
2. Validates the `Origin` header matches the request `Host` (if `Origin`
   is present). 403 on mismatch.
3. Validates the CSRF token from the `x-poke-csrf` header (preferred) or
   the JSON body's `csrf_token` field, constant-time-compared against the
   session's stored token. 403 on mismatch.
4. Appends `{id, payload, at, at_ms}` to `submissions` and writes the
   updated state back to KV.
5. Returns `{"ok":true,"at_ms":<now-ms>}`.

KV's last-write-wins semantics mean concurrent submissions against the
*same* session can in principle stomp each other. For the ephemeral-surface
use case (a human clicking buttons) this is a non-issue; agents anticipating
high concurrency should pick a substrate with proper transactional
semantics.

### Check `response.ok` before showing success

A `fetch()` promise resolves with a `Response` object for *any* HTTP status
— 200, 403, 404, 500 all "succeed" from the promise's point of view. HTML
that does `await fetch(...); show('sent')` will report success even when the
worker rejected (CSRF failure, wrong URL, session expired). The page's
"sent" message diverges from reality and the agent never sees the
submission. Always gate the success UI on `response.ok`:

```js
const r = await fetch('./submit', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-poke-csrf': window.POKE_CSRF_TOKEN,
  },
  body: JSON.stringify({ id: 'approve', payload: null }),
});
if (!r.ok) {
  document.getElementById('err').textContent = `submit failed (${r.status})`;
  document.getElementById('err').classList.add('show');
  return;
}
// only NOW mark success
document.getElementById('done').classList.add('show');
```

This is the UI-layer companion to the "honest confirmation messages" rule
for affordance design: the page's success state must reflect the worker's
actual response, not just the network round-trip completing.

Multipart file uploads are explicitly out of scope for the worker v0. KV
isn't suitable for binary blobs (per-value cap, no streaming, base64
overhead). R2 is the right hosted answer; adding it is tracked as a
follow-up issue.

## Drain — polling against `/poll`

The hosted-substrate drain is a pull. The agent polls:

```
GET /<session_id>/poll?since=<unix-ms>
```

Response:

```json
{
  "now_ms": 1778988130702,
  "submissions": [
    { "id": "approve", "payload": {"ok": true}, "at": "...", "at_ms": 1778988130440 }
  ]
}
```

Cursor discipline: start with `since=0`; after each poll, advance the cursor
to the largest `at_ms` seen. Submissions are returned newest-eligible in
insertion order; the cursor is exclusive (`at_ms > since`).

See `lifecycle.md` for the worked agent-side loop. The agent decides
cadence — sub-second for an interactive session where the user is sitting
at the URL, tens of seconds for an async approval gate, longer still for
"check once an hour" cases. The free-tier KV read budget (currently 100k
reads/day) is roughly "one poll per second for ~28 hours"; agents
running long-lived high-cadence polls should think about back-off and
budget.

## Session and affordance IDs

Session IDs are 16 random bytes rendered as 32 hex characters (~128 bits of
entropy). The URL containing the session ID *is* the access control — see
`security.md` for the entropy threshold and the threat model. Affordance
IDs are agent-minted and opaque to the worker; the worker matches them by
equality against the stored map.

## Worked example

A one-affordance "Approve" round-trip against the deployed worker:

### 1. Agent provisions the session

```sh
curl -s -X POST https://poke-example.andrew-cove-cloudflare.workers.dev/_provision \
  -H "authorization: Bearer $PROVISION_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "html": "<!doctype html><html><head><title>Approve?</title></head><body><p>Approve PR 42?</p><button id=ok>Approve</button><script>document.getElementById(\"ok\").onclick=async()=>{const r=await fetch(\"./submit\",{method:\"POST\",headers:{\"content-type\":\"application/json\",\"x-poke-csrf\":window.POKE_CSRF_TOKEN},body:JSON.stringify({id:\"approve\",payload:null})});if(!r.ok){document.body.textContent=\"submit failed (\"+r.status+\")\";return;}document.body.textContent=\"Thanks.\";}</script></body></html>",
    "affordances": {
      "approve": { "label": "Approve", "intent": "approve_pr_42" }
    }
  }'
```

Response:

```json
{
  "session_id": "004210469044a4da7415f6a6e4bb6f88",
  "url": "https://poke-example.andrew-cove-cloudflare.workers.dev/004210469044a4da7415f6a6e4bb6f88/",
  "csrf_token": "e757dd1794c9025653fe50ada3cc269c"
}
```

### 2. Agent ships the URL to the user

Through whatever channel applies — chat reply, email, push notification.
The URL is self-contained: clicking it opens the surface, no auth dance.

### 3. User opens the page, clicks Approve

The browser POSTs (relative `./submit` resolves against the page URL
`/004210469044a4da7415f6a6e4bb6f88/`, so the actual request is to
`/004210469044a4da7415f6a6e4bb6f88/submit`):

```http
POST /004210469044a4da7415f6a6e4bb6f88/submit HTTP/1.1
Host: poke-example.andrew-cove-cloudflare.workers.dev
Origin: https://poke-example.andrew-cove-cloudflare.workers.dev
Content-Type: application/json
x-poke-csrf: e757dd1794c9025653fe50ada3cc269c

{"id":"approve","payload":null}
```

Worker validates origin + CSRF, appends to KV, responds `200`:

```json
{ "ok": true, "at_ms": 1778988130440 }
```

### 4. Agent drains

```sh
curl -s "https://poke-example.andrew-cove-cloudflare.workers.dev/004210469044a4da7415f6a6e4bb6f88/poll?since=0"
```

Response:

```json
{
  "now_ms": 1778988130702,
  "submissions": [
    { "id": "approve", "payload": null, "at": "2026-05-17T03:22:10.440Z", "at_ms": 1778988130440 }
  ]
}
```

Agent looks up `approve` in the affordance map, finds
`"approve_pr_42"`, runs the merge, and is done. See `lifecycle.md` for the
poll-loop pseudocode.

## Security notes

The hosted substrate is where the loopback-bind safety net falls away.
`security.md` is the authoritative reference; the short version:

- The session ID in the URL is ~128 bits of entropy; treat URL exposure as
  authorization leak.
- `POST /submit` requires a same-origin `Origin` header (when present) and a
  matching CSRF token in `x-poke-csrf` or the body. Both checks must pass.
- The provisioning endpoint is gated by a Bearer token. Without it, anyone
  could create sessions on the agent's namespace.
- Free-field content (text, future image/file uploads) remains
  user-controlled — the typed envelope only guarantees the shape, not the
  trustworthiness of the strings inside it.

## Out of scope (worker v0)

- **Multipart file uploads.** R2-backed; tracked separately.
- **Magic-link or per-user auth.** The URL is the access control. If a
  deployment needs more, that's a different substrate.
- **Session expiry / GC.** Sessions live until manually deleted via
  `wrangler kv key delete`. Adding a TTL or sweeper Worker is straightforward
  but not v0.
- **Cross-region consistency.** KV is eventually consistent. The polling
  drain absorbs this naturally (cursor advances when the new submission
  becomes visible); other shapes might not.
