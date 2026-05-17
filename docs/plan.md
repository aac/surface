# poke v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Before starting, read `CLAUDE.md`** — its "Trust the agent" and "Non-prescriptive skill content" principles are load-bearing and override surface-level completeness instincts. The plan below is directive on mechanics, acceptance criteria, and shared contracts; for prose and implementation choices within those constraints, trust your judgment.

**Goal:** Ship v0 of poke — a self-contained skill bundle (`SKILL.md` + `references/*.md` + Go reference server) distributable as a git repo and activated via symlink into `~/.claude/skills/poke`.

**Architecture:** Skill-first. The pattern lives in docs and reference markdown; one canonical HTTP+JSON wire is illustrated in `references/wire-example.md` and implemented in `examples/server.go` (Go, stdlib-only). No bundled binary, no installable tool, no MCP server.

**Tech Stack:** Go 1.25+ stdlib only (matches sibling repos `ask`/`act`); Markdown for docs and skill content; bash for verification.

---

## File Structure

| File | Purpose | Status |
|---|---|---|
| `.gitignore` | Standard Go + IDE ignores | to create |
| `LICENSE` | MIT, matching sibling repos | to create |
| `go.mod` | Module declaration | created in pre-flight |
| `README.md` | Human-facing intro: what poke is, install, repo map | to create |
| `SKILL.md` | Skill entry point with frontmatter, 8 sections | to create |
| `references/pattern.md` | Substrate-agnostic pattern definition | to create |
| `references/wire-example.md` | HTTP+JSON wire walkthrough (canonical illustration) | to create |
| `references/lifecycle.md` | Autonomous-drain mechanism space + Monitor worked example | to create |
| `references/security.md` | Deployment-specific concerns | to create |
| `examples/server.go` | Runnable Go reference server (stdlib-only) | to create |
| `examples/server_test.go` | Tests for the reference server | to create |
| `docs/brief.md` | Converged v0 design | exists |
| `docs/plan.md` | This document | exists |
| `CLAUDE.md` | Repo conventions + load-bearing principles | exists |

---

## Pre-flight (orchestrator — do once before dispatching subagents)

One-time setup the orchestrator runs in the main checkout. Not numbered tasks because they're not subagent-claimable.

1. **Initialize Go module:** `cd ~/Workspace/poke && go mod init github.com/aac/poke` (matches sibling repo org).
2. **Initialize act for poke:** `act init`. Creates `.act/`.
3. **Create act issues mirroring Tasks 1–10 below.** Use `act new "<task title>"` and **paste the entire task section verbatim** (from the `### Task N` heading through the final commit step, inclusive of code blocks, file paths, and step checklists) into each issue body. Subagents claiming an issue must be able to execute it from the issue body alone.
4. **Per-issue required-reading note:** include in each issue body (or as a per-issue ask) that the subagent reads `docs/brief.md` and `CLAUDE.md` before starting. Both files exist in the worktree.
5. **Install `.act/hooks/close`** for pre-close gates. Required to pass: `gofmt -l .` (empty), `go vet ./...`, `go test ./...`. Mirror `~/Workspace/ask/.act/hooks/close`.
6. **Install `.githooks/commit-msg`** for the direct-commit-to-main guard. Mirror `~/Workspace/ask/.githooks/commit-msg`. Then `git config --local core.hooksPath .githooks` in the poke repo.
7. **Commit-marker convention:** the *closing* commit (the one before `act close <id>`) carries the `(act-XXXX)` marker. Matches `ask` precedent; earlier commits in the task need not include it.

---

## Dispatch groups

Subagents can run in parallel within a group; groups serialize.

- **Group A (parallel after pre-flight):** Tasks 1, 2, 3, 4, 5, 6. All write distinct files; no shared imports; no cross-dependencies given the shared contracts below.
- **Group B (serial after Group A):** Task 7 (coherence pass). Single agent reads all five reference artifacts plus the server, fixes drift.
- **Group C (parallel after Group B):** Tasks 8, 9. Both consume the references; neither depends on the other.
- **Group D (orchestrator-only after Group C):** Task 10 (smoke test verification). Not subagent-claimable — requires the symlink + a Claude session.

---

## Shared contracts (locked here; tasks below conform)

These are normative for v0 — Task 6's tests assert them, Task 3 describes them in prose, the Monitor example in Task 4 parses them. Locked in the plan so parallel authors don't diverge.

**State file schema:**

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

**Stdout submission format:** one line per submission, exactly:

```
SUBMIT <id> <payload-json>
```

Where `<payload-json>` is the JSON-serialized payload on a single line (newlines in user content must be JSON-escaped). The line is parseable by splitting on the first two spaces and JSON-parsing the remainder.

**Submission endpoint:**
- `POST /submit` with `Content-Type: application/json` and body `{ "id": "<affordance-id>", "payload": <json-or-null> }`
- `POST /submit` with `Content-Type: multipart/form-data` carries an `id` form field plus one or more file fields; the server stores each uploaded file under a path it chooses and the payload emitted to stdout (and stored) contains `{"files": ["/absolute/path", ...]}` (plus any other form fields).

These three together (state schema + stdout format + submission endpoint) are the wire contract that Task 6 implements and Tasks 3-5 describe.

---

### Task 1: Repo hygiene (`.gitignore`, `LICENSE`)

**Scope:** Standard Go + OS ignores; MIT license matching `ask`/`act`. Pure mechanical task.

**Files:**
- Create: `.gitignore`
- Create: `LICENSE`

- [ ] **Step 1: Write `.gitignore`**

```
# Go build artifacts
*.exe
*.dll
*.so
*.dylib
*.test
*.out

# Coverage
coverage.*

# OS / editor
.DS_Store
.idea/
.vscode/
```

- [ ] **Step 2: Write `LICENSE`** — copy verbatim from `~/Workspace/ask/LICENSE`; update copyright year/holder if needed.

- [ ] **Step 3: Commit**

```bash
git add .gitignore LICENSE
git commit -m "chore: gitignore and license (act-XXXX)"
```

---

### Task 2: `references/pattern.md`

**Scope:** Substrate-agnostic pattern definition. The canonical source of truth for "what any implementation must preserve." SKILL.md will reference this.

**Files:**
- Create: `references/pattern.md`

**Required reading first:** `docs/brief.md` (especially §"The pattern" and §"Beyond the pattern"), `CLAUDE.md`.

**Content requirements (cover all; prose is yours):**

1. Pattern statement (one paragraph): poke is a way to collect ad-hoc input from a user via a flexible, easily distributable interface.
2. **The five invariants** (per `docs/brief.md` §"The pattern"):
   - Agent owns the intent map (opaque ID → meaningful intent, stable across draining).
   - Surface exposes affordances by ID.
   - Agent autonomously drains.
   - Submissions are typed by construction.
   - Surfaces are ephemeral.
3. **Terms** — define affordance, intent, submission, drain channel, session, in one sentence each.
4. **Normative vs illustrative.** Only the five invariants are normative. State shape, wire format, server choice, lifecycle mechanism, styling, ID format are all implementation.
5. **Examples of substrates** — HTTP + JSON (illustrated in `wire-example.md`), Slack interactive messages, Telegram inline keyboards, Cloudflare Worker + KV, raw sockets. One line each; not exhaustive.
6. **Beyond the pattern (agent responsibilities).** Operational concerns (concurrent pokes, port choice, server teardown, idempotency, user-never-clicks timeouts, browser caching, state file lifecycle) are agent responsibilities; the pattern doesn't prescribe.

**Acceptance:** An agent reading only this file should understand the pattern well enough to implement it on any substrate. No prescription beyond the five invariants. No mention of `Monitor` or any Claude Code primitive — those belong in `lifecycle.md`.

- [ ] **Step 1: Write `references/pattern.md`** per content requirements.
- [ ] **Step 2: Self-check** — anything prescriptive that should be left to the agent? Cut it.
- [ ] **Step 3: Commit**

```bash
git add references/pattern.md
git commit -m "docs: references/pattern.md (act-XXXX)"
```

---

### Task 3: `references/wire-example.md`

**Scope:** The canonical HTTP+JSON wire walkthrough. Explicitly illustrative, not normative — alternative wires are valid as long as the pattern is preserved. **The state schema, stdout format, and submission endpoint are locked in the plan's "Shared contracts" section; describe them faithfully.**

**Files:**
- Create: `references/wire-example.md`

**Required reading first:** `docs/brief.md`, `CLAUDE.md`, the "Shared contracts" section of this plan.

**Content requirements (cover all):**

1. Framing: this is *one* concrete wire (HTTP + JSON, localhost-shaped). The `examples/server.go` reference implements exactly this wire. Other wires are valid; conformance is to the pattern, not the wire.
2. **Routes:**
   - `GET /` → serves the agent-rendered HTML
   - `POST /submit` → see "Shared contracts" for the contract (both `application/json` and `multipart/form-data` are supported)
   - `GET /static/<path>` → optional, for assets the agent's HTML references
3. **State shape** — reproduce the JSON from "Shared contracts" with a brief annotation explaining each field's role.
4. **Submission semantics** — JSON body for typed submissions; multipart for file uploads. Stdout emission per "Shared contracts." Note that multi-line user input must be JSON-escaped so the stdout line stays one line.
5. **Multipart upload semantics** — server stores files under a path it chooses (the brief leaves this to the implementer; for the reference Go server, expect tmp-dir-scoped storage). Payload posted to stdout includes the `files` array of absolute paths.
6. **ID format** — opaque, scoped per session. Reference Go server uses `crypto/rand` hex. Alternatives (ULID, UUID, hash) are equally valid for other implementations.
7. **Session walkthrough** — concrete worked example: a one-affordance confirmation page rendered as ~10 lines of HTML; sample JSON submission; resulting state and stdout line. Mirrors `docs/brief.md` §"What a session looks like" but at the wire layer.

**Acceptance:** A developer in any language could implement this wire from this document plus the plan's shared contracts. The walkthrough demonstrates one full round-trip.

- [ ] **Step 1: Write `references/wire-example.md`** per content requirements.
- [ ] **Step 2: Self-check** — does the worked example demonstrate the wire end-to-end? Does the multipart section align with the locked contract?
- [ ] **Step 3: Commit**

```bash
git add references/wire-example.md
git commit -m "docs: references/wire-example.md (act-XXXX)"
```

---

### Task 4: `references/lifecycle.md`

**Scope:** The autonomous-drain mechanism space + a worked Monitor example for Claude Code.

**Files:**
- Create: `references/lifecycle.md`

**Required reading first:** `docs/brief.md` (§"Lifecycle mechanisms"), `CLAUDE.md`, the "Shared contracts" section of this plan (for the stdout SUBMIT format).

**Content requirements (cover all):**

1. **Framing** — autonomous draining is foundational (per pattern); the mechanism is the agent's choice. Non-prescriptive.
2. **Mechanism space** (per `docs/brief.md` §"Lifecycle mechanisms"):
   - Monitor on background process stdout (Claude Code primitive). Preferred for local CC use.
   - ScheduleWakeup / /loop polling (Claude Code primitives). Timer-based fallback when streams aren't viable.
   - Filesystem watch (OS-level: fswatch / inotify). Push-driven via OS.
   - Push webhook into the agent (depends on environment). For remote/channel-driven setups.
3. **For each mechanism:** when it fits (one sentence), what's needed (one sentence), tradeoffs (one sentence).
4. **Worked Monitor example** — concrete pseudocode for Claude Code: spawn the reference server in background via Bash run_in_background; Monitor its stdout; parse `SUBMIT <id> <payload-json>` lines per the shared contract; look up intent in agent-owned state; act.
5. **Cadence guidance** — push-driven (Monitor, fs watch, webhook) is event-time; polling cadence depends on task latency tolerance.
6. **Pointer back to pattern.md's "Beyond the pattern"** — timeout, idempotency, retry, recovery are agent responsibilities.

**Acceptance:** Agent in CC reading this can write the autonomous-drain glue for the canonical wire. Agent elsewhere can pick from the mechanism space and adapt.

- [ ] **Step 1: Write `references/lifecycle.md`** per content requirements.
- [ ] **Step 2: Self-check** — does the worked Monitor example compile (in the agent's head) into a working loop? Does the SUBMIT parsing match the shared contract exactly?
- [ ] **Step 3: Commit**

```bash
git add references/lifecycle.md
git commit -m "docs: references/lifecycle.md (act-XXXX)"
```

---

### Task 5: `references/security.md`

**Scope:** Deployment-specific security concerns. v0 trusts agents to think about security in their context; this reference reminds, doesn't dictate.

**Files:**
- Create: `references/security.md`

**Required reading first:** `docs/brief.md` (§"Security considerations"), `CLAUDE.md`.

**Content requirements (cover all):**

1. **Stance** — v0 ships low-risk by construction (structured envelopes, private/local use is the default). This reference names concerns to think through when stepping outside the default. Brevity over completeness.
2. **Free-field content as injection vector** — submission envelopes are typed; free-text, image, and file payloads are user-controlled. Agents must treat that content as untrusted before passing back to an LLM.
3. **Deployment posture:**
   - **Localhost (v0 default).** Reference server binds to `127.0.0.1`; reachable only from the same machine.
   - **LAN / tunneled / hosted.** Needs CSRF on `POST /submit`, unguessable URLs (long random session IDs in the URL), auth or equivalent if the surface gates anything that matters.
4. **Cross-tool replay** — per-session ID scope (assuming fresh state per session) mitigates intra-machine replay. Hosted contexts need more.
5. **Out of scope for v0** — sanitization patterns, magic-link auth, formal link expiration, replay protection. Named so agents know these are future work, not v0 omissions to invent ad-hoc.

**Acceptance:** Agent moving from localhost to a different deployment posture reads this and knows what to think about. No prescriptive checklists; guidance not recipes.

- [ ] **Step 1: Write `references/security.md`** per content requirements.
- [ ] **Step 2: Self-check** — brief enough not to dilute the skill? Reminds rather than dictates?
- [ ] **Step 3: Commit**

```bash
git add references/security.md
git commit -m "docs: references/security.md (act-XXXX)"
```

---

### Task 6: `examples/server.go` (with tests)

**Scope:** Runnable Go reference server implementing the locked wire contract. Stdlib-only. TDD-driven. **Must conform to the "Shared contracts" section of this plan exactly** — Task 7 (coherence pass) and Task 10 (smoke test) verify alignment.

**Files:**
- Create: `examples/server.go`
- Create: `examples/server_test.go`

**Required reading first:** `docs/brief.md` (§"The wire example"), `CLAUDE.md`, the "Shared contracts" section of this plan.

**Constraints:**
- Go stdlib only (no external imports).
- Loopback bind by default (`127.0.0.1`); `--bind` flag may override.
- Required flags: `--state <path>`, `--html <path>`. Other flags (port default, message format) are the agent's call.
- Emits one line per submission to stdout in exactly the format `SUBMIT <id> <payload-json>`.
- State writes use atomic write (tmp + rename) under a `sync.Mutex`.

---

#### Subtask 6A: JSON path (HTML serve + JSON submit)

- [ ] **Step 1: Write failing test for HTML serving**

```go
// examples/server_test.go
package main

import (
    "io"
    "net/http"
    "net/http/httptest"
    "os"
    "strings"
    "testing"
)

func TestServerServesHTML(t *testing.T) {
    htmlFile, err := os.CreateTemp("", "poke-html-*.html")
    if err != nil { t.Fatal(err) }
    defer os.Remove(htmlFile.Name())
    htmlFile.WriteString("<html><body>hello poke</body></html>")
    htmlFile.Close()

    stateFile, err := os.CreateTemp("", "poke-state-*.json")
    if err != nil { t.Fatal(err) }
    defer os.Remove(stateFile.Name())
    stateFile.WriteString(`{"session_id":"test","affordances":{},"submissions":[]}`)
    stateFile.Close()

    handler := newHandler(stateFile.Name(), htmlFile.Name())
    req := httptest.NewRequest(http.MethodGet, "/", nil)
    rec := httptest.NewRecorder()
    handler.ServeHTTP(rec, req)

    if rec.Code != http.StatusOK { t.Fatalf("status = %d", rec.Code) }
    body, _ := io.ReadAll(rec.Result().Body)
    if !strings.Contains(string(body), "hello poke") {
        t.Fatalf("body did not contain expected HTML: %s", string(body))
    }
}
```

- [ ] **Step 2: Run, verify it fails (no `newHandler` defined)**

```bash
cd ~/Workspace/poke && go test ./examples/...
```

Expected: build error or test failure citing undefined `newHandler`.

- [ ] **Step 3: Implement minimum to pass — `newHandler` + HTML serving**

Interface contract (fill in implementation details):

```go
// examples/server.go
package main

import (
    "flag"
    "fmt"
    "net/http"
    "os"
    "sync"
)

type Handler struct {
    statePath string
    htmlPath  string
    mu        sync.Mutex
}

func newHandler(statePath, htmlPath string) *Handler {
    return &Handler{statePath: statePath, htmlPath: htmlPath}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    switch {
    case r.Method == http.MethodGet && r.URL.Path == "/":
        http.ServeFile(w, r, h.htmlPath)
    case r.Method == http.MethodPost && r.URL.Path == "/submit":
        h.submit(w, r)
    default:
        http.NotFound(w, r)
    }
}

func (h *Handler) submit(w http.ResponseWriter, r *http.Request) {
    // implemented in Step 7
    http.Error(w, "not yet", http.StatusNotImplemented)
}

func main() {
    // flag handling, bind, listen-and-serve — your call on defaults
    state := flag.String("state", "", "path to state JSON file")
    html := flag.String("html", "", "path to HTML to serve at /")
    // port and bind flags: pick reasonable defaults
    flag.Parse()
    if *state == "" || *html == "" {
        fmt.Fprintln(os.Stderr, "usage: server --state <path> --html <path> [--port N] [--bind addr]")
        os.Exit(2)
    }
    // listen on loopback by default
}
```

Add `encoding/json` and `time` imports only when Step 7 needs them — Go won't compile with unused imports.

- [ ] **Step 4: Run, verify HTML test passes**

```bash
go test ./examples/... -run TestServerServesHTML -v
```

Expected: PASS.

- [ ] **Step 5: Write failing test for JSON submission**

```go
func TestSubmitAppendsStateAndEmitsStdout(t *testing.T) {
    stateFile, _ := os.CreateTemp("", "poke-state-*.json")
    defer os.Remove(stateFile.Name())
    stateFile.WriteString(`{"session_id":"test","affordances":{"abc":{"label":"Yes","intent":"yes"}},"submissions":[]}`)
    stateFile.Close()

    htmlFile, _ := os.CreateTemp("", "poke-html-*.html")
    defer os.Remove(htmlFile.Name())
    htmlFile.Close()

    // capture stdout
    oldStdout := os.Stdout
    r, w, _ := os.Pipe()
    os.Stdout = w
    t.Cleanup(func() { os.Stdout = oldStdout })

    handler := newHandler(stateFile.Name(), htmlFile.Name())
    req := httptest.NewRequest(http.MethodPost, "/submit",
        strings.NewReader(`{"id":"abc","payload":null}`))
    req.Header.Set("Content-Type", "application/json")
    rec := httptest.NewRecorder()
    handler.ServeHTTP(rec, req)

    if rec.Code != http.StatusOK { t.Fatalf("status = %d", rec.Code) }

    w.Close()
    out, _ := io.ReadAll(r)
    if !strings.HasPrefix(string(out), "SUBMIT abc ") {
        t.Fatalf("stdout did not emit SUBMIT line: %q", string(out))
    }
    // verify the rest of the line is valid JSON (per shared contract)
    parts := strings.SplitN(strings.TrimSpace(string(out)), " ", 3)
    if len(parts) != 3 { t.Fatalf("SUBMIT line malformed: %q", out) }
    var payload any
    if err := json.Unmarshal([]byte(parts[2]), &payload); err != nil {
        t.Fatalf("payload not valid JSON: %q (%v)", parts[2], err)
    }

    // verify state file appended
    data, _ := os.ReadFile(stateFile.Name())
    if !strings.Contains(string(data), `"id":"abc"`) {
        t.Fatalf("state file did not record submission: %s", string(data))
    }
}
```

(Add `"encoding/json"` to the test imports.)

- [ ] **Step 6: Run, watch it fail (501)**

```bash
go test ./examples/... -run TestSubmit -v
```

Expected: FAIL.

- [ ] **Step 7: Implement `submit` for JSON**

Required behavior (per "Shared contracts"):
- Detect `Content-Type: application/json`. (Multipart in Subtask 6B.)
- Decode JSON body into `{ id, payload }`.
- Acquire `h.mu`. Read state file. Append `{ id, payload, at: time.Now().UTC().Format(time.RFC3339Nano) }` to `submissions`. Write back atomically (tmp + rename).
- Emit `SUBMIT <id> <payload-json>` to stdout (single line; payload re-serialized to JSON).
- Return 200 with empty body. On any error: 400 with terse message.

Add `encoding/json`, `time` imports to `server.go` now.

- [ ] **Step 8: Run, verify all tests pass so far**

```bash
go test ./examples/... -v
```

Expected: both tests PASS.

- [ ] **Step 9: Commit JSON path**

```bash
git add examples/server.go examples/server_test.go
git commit -m "feat(server): HTML serve + JSON submit path"
```

---

#### Subtask 6B: Multipart upload path

- [ ] **Step 10: Write failing test for multipart upload**

Test requirements (write directly; ~40-50 lines using `mime/multipart`):
- Build a multipart request with an `id` form field set to a known affordance ID, plus one file field named `upload` containing known bytes (e.g., "hello bytes").
- POST to `/submit`; expect 200.
- Capture stdout; expect a `SUBMIT <id> <payload-json>` line where the payload-json parses to a JSON object containing a `files` array of at least one absolute path.
- Read the file at the path; assert its contents equal the bytes you sent.
- Read the state file; assert the same submission appears with the same payload structure.

Acceptance assertions in the test must include all of: 200 status, SUBMIT line shape, files array present, file-on-disk content matches, state file updated. Don't accept partial coverage.

- [ ] **Step 11: Run, verify it fails**

```bash
go test ./examples/... -run TestMultipart -v
```

Expected: FAIL (handler doesn't yet branch on multipart, returns 501 or similar).

- [ ] **Step 12: Extend `submit` to handle multipart**

Required behavior:
- Detect `Content-Type: multipart/form-data`.
- Parse via `r.ParseMultipartForm` with reasonable max-memory.
- Read the `id` form field.
- For each file field, save to a path the server chooses (e.g., under `os.TempDir()`); collect absolute paths.
- Construct payload `{"files": [...]}` (plus any other form fields if present, your call on shape).
- Proceed through the same state-append + stdout-emit path as JSON submissions.

- [ ] **Step 13: Run, verify all tests pass**

```bash
go test ./examples/... -v
```

Expected: all three tests PASS.

- [ ] **Step 14: `go vet` + `gofmt`**

```bash
go vet ./...
gofmt -l .
```

Both report nothing.

- [ ] **Step 15: Commit multipart path**

```bash
git add examples/server.go examples/server_test.go
git commit -m "feat(server): multipart upload path (act-XXXX)"
```

---

### Task 7: Coherence pass (NEW)

**Scope:** Single agent reads every Group A artifact and reconciles drift. Catches cross-file inconsistencies that parallel sibling agents couldn't avoid.

**Files:**
- Read: `references/pattern.md`, `references/wire-example.md`, `references/lifecycle.md`, `references/security.md`, `examples/server.go`, `examples/server_test.go`
- Modify: any of the above where drift exists

**Required reading first:** `docs/brief.md`, `CLAUDE.md`, the "Shared contracts" section of this plan.

- [ ] **Step 1: Read all six files** in one pass; take notes on inconsistencies (terminology, schema, cross-references, contradictions with `docs/brief.md` or the shared contracts).

- [ ] **Step 2: Validate the wire contract end-to-end** — does `examples/server.go` match what `references/wire-example.md` describes, which matches the plan's "Shared contracts"? Resolve any divergence in favor of the locked plan contracts.

- [ ] **Step 3: Cross-reference check** — every "see `references/X.md`" pointer in the references must resolve. No orphan pointers; no dead links.

- [ ] **Step 4: Terminology check** — affordance, intent, submission, drain channel, session used consistently across files? If one file uses "session" and another uses "session_id" without context, fix it.

- [ ] **Step 5: De-duplicate** — if two references restate the same content verbatim, fold to one and link from the other.

- [ ] **Step 6: Re-run tests to confirm nothing broke**

```bash
go test ./examples/... -v
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add references/ examples/
git commit -m "docs: coherence pass on references and server (act-XXXX)"
```

**Acceptance:** A reader picking up any reference file finds consistent terminology, correct cross-references, and no contradictions with the others, the server, or the plan's locked contracts.

---

### Task 8: `README.md`

**Scope:** Human-facing project intro. Tells someone browsing the repo what poke is, how to install it, what's in each file. NOT loaded by Claude. **Sequenced after Task 7 so the file-purpose map reflects what's actually been built.**

**Files:**
- Create: `README.md`

**Required reading first:** `docs/brief.md`, `CLAUDE.md`. Walk the directory tree to confirm what exists.

**Content requirements (prose is yours):**

1. One-paragraph "what poke is" — pattern + skill for ad-hoc structured user input via distributable UI surfaces; v0 ships docs + reference, no bundled binary.
2. **Install** — `git clone <url> ~/Workspace/poke` then `ln -s ~/Workspace/poke ~/.claude/skills/poke`.
3. **What's in this repo** — table mapping each top-level file/dir to its purpose. Distinguish "shipped as skill" (SKILL.md, references/, examples/) from "for humans" (README, LICENSE, docs/, CLAUDE.md).
4. **Where the design lives** — pointers to `docs/brief.md` and `CLAUDE.md`.
5. **License** — MIT.

**Acceptance:** A first-time visitor can clone, install, and know where to look for more depth in under a minute. No contradictions with `docs/brief.md` or `CLAUDE.md`.

- [ ] **Step 1: Write `README.md`** per content requirements.
- [ ] **Step 2: Stranger test** — read it back as someone with no context. Could they install? Could they find the brief? Fix what fails.
- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: human-facing README (act-XXXX)"
```

---

### Task 9: `SKILL.md`

**Scope:** Skill entry point. YAML frontmatter + 8 sections. Loads when Claude detects relevant intent or context. Other reference files are lazy-loaded by name from here.

**Files:**
- Create: `SKILL.md`

**Required reading first:** `docs/brief.md` (especially §"Skill structure" and §"Working with the user"), `CLAUDE.md`, all four `references/*.md` (so cross-references are accurate).

**Frontmatter draft (refine if you can sharpen the trigger):**

```yaml
---
name: poke
description: Use when an agent needs to collect ad-hoc structured input from a user via a flexible, distributable interface — multi-choice decisions too big for chat, file or photo uploads, visual disambiguation, comparative ranking, structured forms, async approval gates. Generates an ephemeral page with opaque-ID affordances; the agent autonomously drains submissions and reacts. The URL is shareable through any channel the agent has (chat, email, push, paging). Not for: simple in-chat questions, durable apps, or interactions the agent can self-resolve.
---
```

**Sections** (in order, per `docs/brief.md` §"Skill structure"):

1. **What poke is** — pattern statement; defining property (ad-hoc input via flexible distributable interface); required mechanism (autonomous draining); useful consequences (one-way channels, schema by construction).
2. **When to use / when not to use** — situational guidance; situation/tool table mirroring `docs/brief.md`. Cross-references section 8 for security.
3. **The pattern** → `references/pattern.md`. Two-line summary + lazy-load pointer.
4. **The wire example** → `references/wire-example.md`. Two-line summary + lazy-load pointer.
5. **Lifecycle mechanisms** → `references/lifecycle.md`. Two-line summary + lazy-load pointer.
6. **Working with the user** (inline; no reference file) — interactive vs autonomous invocation; setup vs interaction distinction.
7. **Reference example** → `examples/server.go`. Two-line note: runnable Go reference, read for orientation, re-implement in any substrate.
8. **Security considerations** → `references/security.md`. One-line summary + lazy-load pointer.

**Acceptance:** SKILL.md is short — pattern + pointers, not a wall of guidance. Trust-the-agent throughout; surfaces choices, doesn't prescribe.

- [ ] **Step 1: Write `SKILL.md` per the structure above.**
- [ ] **Step 2: Self-check:**
  - Does the `description` trigger reliably for the section-2 use cases without over-triggering on simple chat questions?
  - Are inline sections short? Does the skill read as "pattern + pointers" or "wall of guidance"?
  - Any overlap or contradiction with referenced files?
  - Trust-the-agent: cut sentences that prescribe when guidance would suffice.
- [ ] **Step 3: Commit**

```bash
git add SKILL.md
git commit -m "feat: SKILL.md entry point with 8 sections (act-XXXX)"
```

---

### Task 10: Smoke test verification (orchestrator-only)

**Scope:** End-to-end verification that the bundle works as a v0 deliverable. **This is not subagent-claimable** — Step 2 requires a Claude session, and the orchestrator runs the end-to-end test in the main checkout. This is the "v0 complete" gate per CLAUDE.md.

**Files:** none created; pure verification.

- [ ] **Step 1: Symlink the repo as a skill**

```bash
ln -s ~/Workspace/poke ~/.claude/skills/poke
ls -la ~/.claude/skills/poke
```

Expected: symlink resolves to `~/Workspace/poke`.

- [ ] **Step 2: Structural validation of SKILL.md (automatable)**

```bash
cd ~/Workspace/poke
# YAML frontmatter parses and has name + description fields
python3 - <<'EOF'
import re, sys, yaml, pathlib
text = pathlib.Path("SKILL.md").read_text()
m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
assert m, "no YAML frontmatter"
fm = yaml.safe_load(m.group(1))
assert fm.get("name") == "poke", f"name = {fm.get('name')}"
assert isinstance(fm.get("description"), str) and len(fm["description"]) > 20, "description missing or too short"
print("frontmatter OK")
EOF

# every references/*.md mentioned in SKILL.md exists
for ref in $(grep -oE 'references/[a-z-]+\.md' SKILL.md | sort -u); do
  test -f "$ref" || { echo "MISSING: $ref"; exit 1; }
done
echo "all referenced files exist"

# examples/server.go exists and is mentioned in SKILL.md
grep -q 'examples/server\.go' SKILL.md || { echo "SKILL.md does not mention examples/server.go"; exit 1; }
test -f examples/server.go || { echo "examples/server.go missing"; exit 1; }
echo "reference example wired up"
```

Expected: all three echo lines fire; no missing-file errors.

- [ ] **Step 3: Open a Claude Code session and confirm activation (human eyeball)**

Open a Claude Code session in any throwaway directory; confirm the `poke` skill appears in the session's available-skills list. If it doesn't, frontmatter or symlink is wrong — debug before continuing.

- [ ] **Step 4: End-to-end reference server test (with stdout capture)**

```bash
cd ~/Workspace/poke

# write a tiny HTML page
# Uses fetch+JSON to match the wire contract; plain form POSTs would send
# application/x-www-form-urlencoded, which the reference server doesn't
# accept (only application/json and multipart/form-data are wired up).
cat > /tmp/poke-test.html <<'EOF'
<html><body>
  <button onclick="fetch('/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'abc',payload:null})}).then(()=>document.body.textContent='ok')">click me</button>
</body></html>
EOF

# initial state
echo '{"session_id":"test","affordances":{"abc":{"label":"Click","intent":"clicked"}},"submissions":[]}' > /tmp/poke-test.json

# run server with stdout captured to a file
go run ./examples/server.go --state /tmp/poke-test.json --html /tmp/poke-test.html --port 5173 > /tmp/poke-server.out 2>&1 &
SERVER_PID=$!
sleep 1

# submit
curl -sf -X POST -H 'Content-Type: application/json' \
  -d '{"id":"abc","payload":null}' \
  http://127.0.0.1:5173/submit

# kill server, then grep stdout
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

# verify SUBMIT line emitted
grep -E '^SUBMIT abc (null|\{\})' /tmp/poke-server.out || { echo "SUBMIT line not emitted"; cat /tmp/poke-server.out; exit 1; }

# verify state file updated
grep -q '"id":"abc"' /tmp/poke-test.json || { echo "state file did not record submission"; exit 1; }
echo "end-to-end OK"
```

Expected: `end-to-end OK` printed; curl returns 200; stdout captured a `SUBMIT abc null` line; state file contains the submission.

- [ ] **Step 5: Close Task 10's act issue**

```bash
act close <task-10-issue-id> --reason "v0 complete; SKILL.md activates via symlink, structural checks pass, reference server end-to-end smoke test passes"
```

(Substitute the actual issue ID from pre-flight.)

---

## Spec coverage check (self-review)

| Brief section | Covered by |
|---|---|
| What poke is | Task 9 §1, Task 2 (pattern.md) |
| Why this exists | Task 8 (README), Task 9 §1 |
| Defining property and consequences | Task 9 §1 |
| What poke is for / not for | Task 9 §2 |
| What a session looks like | Task 3 (wire-example.md walkthrough), Task 4 (lifecycle.md Monitor walkthrough) |
| The pattern (substrate-agnostic) | Task 2 (pattern.md) |
| The wire example (HTTP + JSON) | Task 3 (wire-example.md), Task 6 (server.go implements it), shared contracts (locked in plan) |
| Lifecycle mechanisms | Task 4 (lifecycle.md) |
| Skill structure | Task 9 (SKILL.md) |
| Working with the user | Task 9 §6 |
| Security considerations | Task 5 (security.md), Task 9 §8 |
| Reference example | Task 6 (server.go + tests), Task 9 §7 |
| Repo layout | Tasks 1, 8 (README maps it); collectively built by 1-9 |
| Out of scope | Not implemented (by definition); covered in brief and CLAUDE.md |

No gaps. No tasks orphaned.

---

## Execution handoff

**Plan complete.** Two execution options:

1. **Subagent-Driven (recommended)** — orchestrator dispatches a fresh subagent per Group-A task in its own worktree, then Group B (Task 7), then Group C parallel (Tasks 8, 9), then Task 10 in the orchestrator session. Fast iteration, isolation per task.
2. **Inline Execution** — work tasks sequentially in this session with checkpoints.

Subagent-driven is the natural fit given the sibling-repo workflow precedent.
