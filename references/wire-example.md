# Wire example — HTTP + JSON over localhost

This is **one concrete wire** for `poke`: an HTTP server bound to loopback, JSON
on the submission path, multipart for file uploads, and a single-line stdout
event for each submission. It is **illustrative, not normative**. Other wires
(Slack interactive messages, Telegram inline keyboards, Cloudflare Worker + KV,
raw sockets, anything else with a "render surface / collect submissions" shape)
are equally valid as long as the pattern in `pattern.md` is preserved.
Conformance is to the pattern, not to this wire.

The reference server at `examples/server.go` implements exactly this wire in
the Go standard library, in ~80 lines. Read it for orientation; reimplement in
whatever substrate fits your environment.

## Routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Serves the agent-rendered HTML for the current poke session. |
| `POST` | `/submit` | Accepts a submission. Body is either `application/json` or `multipart/form-data`. See "Submission semantics" below. |
| `GET` | `/static/<path>` | Optional. Serves any static assets the agent's HTML references (images, CSS, client JS). Implementations that don't need static assets can omit this route. |

The HTML at `/` is whatever the agent generated for this session. The agent
authors the page, including which affordance IDs map to which form fields and
buttons; the server just hands the bytes back.

## State shape

The server persists session state to a JSON file (path supplied at startup).
The schema is locked:

```json
{
  "session_id": "<opaque string>",
  "affordances": {
    "<id>": { "label": "<string>", "intent": <any JSON> }
  },
  "submissions": [
    { "id": "<affordance id>", "payload": <any JSON or null>, "at": "<RFC3339Nano timestamp>" }
  ]
}
```

Field roles:

- **`session_id`** — opaque identifier scoping this poke's affordances from any
  other concurrent poke. Generated when the session starts; meaningful only to
  the agent that minted it.
- **`affordances`** — a map from affordance ID to its `{label, intent}`. The
  *label* is human-readable (handy for logs and debugging); the *intent* is
  whatever the agent wants to remember about what should happen if that
  affordance is submitted (a string tag, a structured plan, a tool call, any
  JSON). Opaque to the wire.
- **`submissions`** — append-only log of what has arrived. Each entry pins the
  submitting affordance ID, the payload the user sent, and an RFC3339Nano
  timestamp.

The agent owns this file. The server's job on a submission is to append the
new entry and write atomically; everything else (rotating, deleting, archiving,
recovering after crash) is an agent responsibility — see "Beyond the pattern"
in `pattern.md`.

## Submission semantics

Two content types on `POST /submit`:

### `application/json` — typed submissions

Body:

```json
{ "id": "<affordance-id>", "payload": <json-or-null> }
```

The server:

1. Decodes the body.
2. Appends `{ id, payload, at: <RFC3339Nano now> }` to `submissions` in the
   state file (atomic write under a mutex).
3. Emits exactly one line to stdout in the locked format:

```
SUBMIT <id> <payload-json>
```

`<payload-json>` is the payload re-serialized to a single line of JSON. The
emission contract is "split the line on the first two spaces; JSON-parse the
remainder" — anything draining stdout (`Monitor`, a tail loop, a stream
consumer) parses it that way.

Multi-line user input (a textarea, pasted code) must be JSON-escaped so the
SUBMIT line stays on one line. Standard JSON serialization handles this — the
constraint is named here to make it explicit for implementers.

4. Responds `200 OK` with an empty body. Errors return a terse `4xx` with a
   short text message; the agent's drain loop reacts to the stdout SUBMIT
   line, not to the HTTP response.

### `multipart/form-data` — file uploads

Body carries:

- An `id` form field naming the submitting affordance.
- One or more file fields (the field name is the agent's choice; the HTML
  authored by the agent decides).
- Optionally, other form fields with text values.

The server:

1. Parses the multipart body.
2. For each uploaded file, writes it to a path the server chooses and collects
   the absolute path. The pattern leaves storage location to the implementer;
   the reference Go server uses an OS-temp-dir-scoped path. Alternative
   implementations may choose any location they can read back and reference by
   absolute path.
3. Constructs the payload:

```json
{ "files": ["/absolute/path/one", "/absolute/path/two"], "<other-field>": "<value>", ... }
```

The `files` array is always present (possibly empty if no files were uploaded;
multipart submissions without files are unusual but legal). Other form fields
are copied through as additional keys; the shape of "other fields" is the
implementer's call as long as `files` is present.

4. Appends the submission to the state file and emits the same
   `SUBMIT <id> <payload-json>` line to stdout, with the file-bearing payload
   as `<payload-json>`. From the drain loop's point of view, JSON and multipart
   submissions are indistinguishable — both arrive as one SUBMIT line carrying
   the affordance ID and a JSON payload.

5. Responds `200 OK` on success.

## ID format

Affordance IDs are **opaque, scoped per session**. Nothing in the wire
inspects them; they're matched only by equality against the agent's intent
map.

The reference Go server uses `crypto/rand` hex (stdlib-only, no external
dependencies). Other implementations may use ULIDs, UUIDs, content hashes,
short random tokens, or anything else as long as IDs are unguessable enough
for the deployment posture (see `security.md`) and unique within the session.
The wire doesn't care.

## Session walkthrough

A concrete one-affordance round-trip, mirroring `docs/brief.md`
§"What a session looks like" but at the wire layer.

### 1. Agent designs the surface

The task: ask the user to confirm a destructive operation before running it.
One affordance: a "Confirm" button. The agent mints an opaque ID for it
(`a1b2c3`), records the intent (`"confirm_destructive_op_42"`), and writes
state to `/tmp/poke-state.json`:

```json
{
  "session_id": "s_7f3a9c",
  "affordances": {
    "a1b2c3": { "label": "Confirm", "intent": "confirm_destructive_op_42" }
  },
  "submissions": []
}
```

### 2. Agent renders HTML for the surface

`/tmp/poke-page.html`:

```html
<!doctype html>
<html><body>
  <p>Confirm destructive op 42?</p>
  <form action="/submit" method="post" enctype="application/json">
    <button type="button" onclick="
      fetch('/submit', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: 'a1b2c3', payload: null})
      }).then(() => document.body.innerText = 'Thanks.')
    ">Confirm</button>
  </form>
</body></html>
```

(JSON-shaped POST chosen here for clarity; the agent could just as well use a
plain form post and have the server translate form fields to a JSON payload.
Implementation choice.)

### 3. Agent starts the server

```
server --state /tmp/poke-state.json --html /tmp/poke-page.html --port 5173
```

Server listens on `127.0.0.1:5173`. Agent delivers the URL
(`http://127.0.0.1:5173/`) to the user through whatever channel makes sense
(chat reply, push notification, copy to clipboard, etc.).

### 4. Agent autonomously drains

The agent monitors the server's stdout for `SUBMIT` lines. See
`lifecycle.md` for mechanism options.

### 5. User opens the URL and clicks Confirm

The browser POSTs to `/submit`:

```http
POST /submit HTTP/1.1
Content-Type: application/json

{"id":"a1b2c3","payload":null}
```

### 6. Server processes the submission

State file becomes:

```json
{
  "session_id": "s_7f3a9c",
  "affordances": {
    "a1b2c3": { "label": "Confirm", "intent": "confirm_destructive_op_42" }
  },
  "submissions": [
    { "id": "a1b2c3", "payload": null, "at": "2026-05-16T19:45:12.341827Z" }
  ]
}
```

Server emits to stdout:

```
SUBMIT a1b2c3 null
```

Server responds `200 OK` to the browser.

### 7. Agent reacts

The drain loop sees the line, splits on the first two spaces
(`["SUBMIT", "a1b2c3", "null"]`), JSON-parses `null` as the payload, looks up
`a1b2c3` in the intent map, finds `"confirm_destructive_op_42"`, and proceeds
with the destructive operation. Then it tears down the server and removes the
state file.

## Beyond the wire

What this document does not specify is intentional: port choice, server
teardown, concurrent pokes, browser caching, state file lifecycle, retry
semantics, idempotency, user-never-clicks timeouts. Those are agent
responsibilities — see `pattern.md` §"Beyond the pattern".

For mechanism choices on the drain side (Monitor, ScheduleWakeup, fs watch,
push webhook), see `lifecycle.md`. For deployment-posture concerns when
stepping beyond loopback, see `security.md`.
