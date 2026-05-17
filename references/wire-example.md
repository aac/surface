# Wire example — HTTP + JSON over localhost

This is **one concrete wire** for `poke`: an HTTP server bound to loopback, JSON
on the submission path, multipart for file uploads, and a single-line stdout
event for each submission. It is **illustrative, not normative**. Other wires
(Slack interactive messages, Telegram inline keyboards, Cloudflare Worker + KV,
raw sockets, anything else with a "render surface / collect submissions" shape)
are equally valid as long as the pattern in `pattern.md` is preserved.
Conformance is to the pattern, not to this wire.

The reference server at `examples/server.go` implements exactly this wire in
the Go standard library, no external dependencies. Read it for orientation;
reimplement in whatever substrate fits your environment.

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
    { "id": "<affordance id>", "payload": <any JSON or null>, "at": "<RFC3339 timestamp, precision implementation-defined (microseconds OK; nanoseconds preferred for Go)>" }
  ]
}
```

JSON field ordering within objects is implementation-defined and not part of the contract. Consumers should parse by key, not position.

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
  submitting affordance ID, the payload the user sent, and an RFC3339
  timestamp (precision implementation-defined — microseconds OK; nanoseconds
  preferred for Go).

The agent owns this file. The server's job on a submission is to append the
new entry and write atomically; everything else (rotating, deleting, archiving,
recovering after crash) is an agent responsibility — see "Beyond the pattern"
in `pattern.md`.

"Atomic write" here means **rename-atomicity** — write to a temp file, then
rename over the live path so concurrent readers never see a half-written
state file. **Crash durability (fsync before rename) is explicitly not part
of the contract**, given the ephemeral-state premise: surfaces are
task-shaped and state is throwaway, so losing the last submission to a
power-cut is acceptable. Implementations may add fsync at their discretion
if the deployment context wants stronger guarantees (the Node reference
fsyncs before rename; the Go and Rust references don't). Both shapes are
valid.

## Submission semantics

Two content types on `POST /submit`: `application/json` and
`multipart/form-data`. Plain HTML form POSTs
(`application/x-www-form-urlencoded`) are intentionally not accepted — HTML
surfaces should use `fetch` with a JSON body for typed submissions, or
`FormData` for multipart uploads.

Unsupported content types (including `application/x-www-form-urlencoded`)
return `415 Unsupported Media Type` with a terse text body. This is pinned —
agents tailing client errors and cross-implementation tooling benefit from
the same status arriving regardless of which reference server is running.

### `application/json` — typed submissions

Body:

```json
{ "id": "<affordance-id>", "payload": <json-or-null> }
```

A missing or `undefined` `payload` field normalizes to JSON `null` — both on
the appended state entry and on the emitted SUBMIT line. The wire's SUBMIT
contract demands a JSON-parseable `<payload-json>` token; a literal `null`
keeps that invariant when the client didn't send a payload.

The server:

1. Decodes the body.
2. Appends `{ id, payload, at: <RFC3339 now, precision implementation-defined> }`
   to `submissions` in the state file (atomic write under a mutex).
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

HTML that submits to `/submit` should gate its success UI on `response.ok` —
a `fetch()` promise resolves on *any* HTTP status (200, 400, 404, 500), so a
4xx returned by the server will still flow into the success branch unless
the page explicitly checks. The local wire is permissive (only `400` on
malformed JSON), so this matters less here than in the hosted substrate, but
the principle applies: the page's "sent" state must reflect the server's
actual response.

### `multipart/form-data` — file uploads

**Body-size cap.** Implementations should bound multipart upload size to
protect against runaway memory use or accidental huge uploads. The Node
reference enforces a hard 32 MiB body cap and returns `413 Payload Too
Large` on over-cap; the Go reference uses 32 MiB as the in-memory ceiling
before spilling to disk (no hard total-size cap). Both shapes protect
memory; the choice between "reject large uploads outright" and "stream
large uploads to disk" is implementer's call given the task. Ephemeral
poke surfaces rarely need to accept more than tens of MiB. Whatever the
mechanism, returning `413` on a hard-cap rejection is the expected
status.

Body carries:

- An `id` form field naming the submitting affordance.
- One or more file fields (the field name is the agent's choice; the HTML
  authored by the agent decides).
- Optionally, other form fields with text values.

The server:

1. Parses the multipart body.
2. For each uploaded file, writes it to a path the server chooses and collects
   the absolute path. **Storage path shape is implementer's call** — same
   class of decision as state file lifecycle (see `pattern.md` §"Beyond the
   pattern"). Any location the agent can read back by absolute path works.
   For orientation, the Go and Node references converge on
   `<tmpdir>/poke-uploads/<random-hex>-<sanitized-basename>` (random prefix
   to avoid collisions, shared `poke-uploads` subdirectory under
   `os.TempDir()` / `os.tmpdir()`); the Rust reference uses a per-process
   subdirectory variant. Either shape — or any other the agent prefers — is
   fine; this is not normative.
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
  <button onclick="
    fetch('/submit', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id: 'a1b2c3', payload: null})
    }).then(() => document.body.innerText = 'Thanks.')
  ">Confirm</button>
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

## Lifecycle of the reference server

A practical note when spawning the reference server via `go run`: the PID the
shell sees is the `go run` wrapper, not the compiled child binary. Killing the
wrapper does not always reap the child, which can leave the server holding the
port between sessions. Two ways to avoid this:

- Build first, then run, so the agent owns the real PID:
  `go build -o /tmp/poke-serve ./examples/ && /tmp/poke-serve --state … --html … --port …`.
- Or tear down by port rather than PID:
  `lsof -t -i :<port> | xargs kill`.

As a belt-and-suspenders measure, the reference server installs a
parent-death watchdog: if its original parent process exits (the kernel
reparents it to PID 1), it shuts itself down. This catches the common
`go run` orphan case automatically; agents implementing alternative wires
should consider equivalent self-teardown if their substrate has the same
hazard.

## Beyond the wire

What this document does not specify is intentional: port choice, server
teardown, concurrent pokes, browser caching, state file lifecycle, retry
semantics, idempotency, user-never-clicks timeouts. Those are agent
responsibilities — see `pattern.md` §"Beyond the pattern".

For mechanism choices on the drain side (Monitor, ScheduleWakeup, fs watch,
push webhook), see `lifecycle.md`. For deployment-posture concerns when
stepping beyond loopback, see `security.md`.
