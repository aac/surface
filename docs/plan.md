# poke v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Before starting, read `CLAUDE.md` — its "Trust the agent" and "Non-prescriptive skill content" principles are load-bearing and override surface-level completeness instincts. The plan below is directive on mechanics and acceptance criteria; for prose and implementation choices within those constraints, trust your judgment.**

**Goal:** Ship v0 of poke — a self-contained skill bundle (`SKILL.md` + `references/*.md` + Go reference server) distributable as a git repo and activated via symlink into `~/.claude/skills/poke`.

**Architecture:** Skill-first. The pattern lives in docs and reference markdown; one canonical HTTP+JSON wire is illustrated in `references/wire-example.md` and implemented in `examples/server.go` (Go, stdlib-only). No bundled binary, no installable tool, no MCP server. Agents read the references and the example, then implement whatever wire fits their environment.

**Tech Stack:** Go 1.25+ stdlib only (matches sibling repos `ask`/`act`); Markdown for docs and skill content; bash for verification.

---

## File Structure

| File | Purpose | Status |
|---|---|---|
| `.gitignore` | Standard Go + IDE ignores | to create |
| `LICENSE` | MIT, matching sibling repos | to create |
| `README.md` | Human-facing intro: what poke is, install, repo map | to create |
| `SKILL.md` | Skill entry point with frontmatter, 8 sections | to create |
| `references/pattern.md` | Substrate-agnostic pattern definition | to create |
| `references/wire-example.md` | HTTP+JSON wire walkthrough (canonical illustration) | to create |
| `references/lifecycle.md` | Autonomous-drain mechanism space + Monitor worked example | to create |
| `references/security.md` | Deployment-specific concerns | to create |
| `examples/server.go` | Runnable Go reference server (~80 lines, stdlib-only) | to create |
| `examples/server_test.go` | Tests for the reference server | to create |
| `docs/brief.md` | Converged v0 design | exists |
| `docs/plan.md` | This document | exists |
| `CLAUDE.md` | Repo conventions + load-bearing principles | exists |

## Pre-flight (orchestrator — do once before dispatching subagents)

These are setup steps the orchestrator runs in the main checkout before any task dispatch. Not numbered tasks because they're one-time.

1. **Initialize `act`** for poke: `cd ~/Workspace/poke && act init`. This creates `.act/` for issue tracking, matching the sibling repos' workflow.
2. **Create act issues** mirroring Tasks 1–9 below. Use `act new "<task title>" --body "<task scope>"` for each. Title and scope from this plan's task headings.
3. **Install `.act/hooks/close`** for pre-close gates. Required to pass on close: `gofmt -l .` (empty), `go vet ./...`, `go test ./...`. Match the pattern in `~/Workspace/ask/.act/hooks/close`.
4. **Install `.githooks/commit-msg`** for the direct-commit-to-main guard. Match `~/Workspace/ask/.githooks/commit-msg`. Then `git config --local core.hooksPath .githooks` in the poke repo.
5. **Establish baseline commit gate.** First commit of each task includes the `(act-XXXX)` marker for its issue.

---

### Task 1: Repo hygiene (`.gitignore`, `LICENSE`)

**Scope:** Standard Go + OS ignores; MIT license matching `ask`/`act`.

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

# Local scratch
/.tmp/
```

- [ ] **Step 2: Write `LICENSE`**

Copy the MIT LICENSE file from `~/Workspace/ask/LICENSE` (or sibling) verbatim; replace the copyright year and holder line if needed.

- [ ] **Step 3: Commit**

```bash
git add .gitignore LICENSE
git commit -m "chore: gitignore and license (act-XXXX)"
```

---

### Task 2: `README.md`

**Scope:** Human-facing project intro. Tells someone browsing the repo what poke is, how to install it, what's in each file. NOT loaded by Claude — purely for humans.

**Files:**
- Create: `README.md`

**Content requirements (cover all of these; prose is yours):**

1. One-paragraph "what poke is" — pattern + skill for ad-hoc structured user input via distributable UI surfaces; v0 ships docs + reference, no bundled binary.
2. **Install** — `git clone <url> ~/Workspace/poke` then `ln -s ~/Workspace/poke ~/.claude/skills/poke`.
3. **What's in this repo** — table or short list mapping each top-level file/dir to its purpose. Distinguish "shipped as skill" (SKILL.md, references/, examples/) from "for humans" (README, LICENSE, docs/, CLAUDE.md).
4. **Where the design lives** — pointers to `docs/brief.md` (v0 design) and `CLAUDE.md` (development principles).
5. **License line** — MIT.

**Acceptance:** A first-time visitor can clone, install, and know where to look for more depth in under a minute. No content that contradicts `docs/brief.md` or `CLAUDE.md`.

- [ ] **Step 1: Write README.md** per content requirements above.

- [ ] **Step 2: Read it back as a stranger.** Could someone with no context install poke? Could they find the brief? Is the repo map clear? Fix anything that fails the stranger test.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: human-facing README (act-XXXX)"
```

---

### Task 3: `references/pattern.md`

**Scope:** The substrate-agnostic pattern definition. This is what *any* implementation must preserve. SKILL.md will reference this as the canonical pattern doc.

**Files:**
- Create: `references/pattern.md`

**Content requirements (cover all; prose is yours):**

1. Pattern statement (one paragraph): poke is a way to collect ad-hoc input from a user via a flexible, easily distributable interface.
2. **The five invariants** (per `docs/brief.md` §"The pattern"):
   - Agent owns the intent map (opaque ID → meaningful intent, stable across draining).
   - Surface exposes affordances by ID.
   - Agent autonomously drains.
   - Submissions are typed by construction.
   - Surfaces are ephemeral.
3. **Terms** — define affordance, intent, submission, drain channel, session. Each in one sentence.
4. **What's substrate-agnostic vs substrate-specific.** State shape, wire format, server choice, lifecycle mechanism, styling, ID format are all implementation. Only the five invariants are normative.
5. **Examples of substrates that preserve the pattern** — HTTP + JSON (illustrated in `wire-example.md`), Slack interactive messages, Telegram inline keyboards, Cloudflare Worker + KV, raw sockets. One line each; not exhaustive.
6. **Beyond the pattern (agent responsibilities).** Operational concerns (concurrent pokes, port choice, server teardown, idempotency, user-never-clicks timeouts, browser caching, state file lifecycle) are agent responsibilities; the pattern doesn't prescribe.

**Acceptance:** An agent reading only this file should understand the pattern well enough to implement it on any substrate. No prescription beyond the five invariants. No mention of `Monitor` or any Claude Code primitive — those belong in `lifecycle.md`.

- [ ] **Step 1: Write `references/pattern.md`** per content requirements.

- [ ] **Step 2: Self-check** — re-read with the "Trust the agent" principle in mind. Is anything prescriptive that should be left to the agent? Cut it.

- [ ] **Step 3: Commit**

```bash
git add references/pattern.md
git commit -m "docs: references/pattern.md (act-XXXX)"
```

---

### Task 4: `references/wire-example.md`

**Scope:** The canonical HTTP+JSON wire walkthrough. Explicitly illustrative, not normative — alternative wires are valid as long as the pattern is preserved.

**Files:**
- Create: `references/wire-example.md`

**Content requirements (cover all):**

1. Framing: this is *one* concrete wire (HTTP + JSON, localhost-shaped). The `examples/server.go` reference implements exactly this wire. Other wires are valid; conformance is to the pattern, not the wire.
2. **Routes:**
   - `GET /` → serves the agent-rendered HTML
   - `POST /submit` → accepts JSON body `{ "id": "<affordance-id>", "payload": <json-or-null> }`; appends to state; emits one stdout line per submission
   - `GET /static/<path>` → optional, for assets the agent's HTML references
3. **State shape** (`.poke-state.json` — one common form), as in `docs/brief.md`:
   ```json
   {
     "session_id": "01HXYZ...",
     "affordances": {
       "abc123": { "label": "Approve", "intent": "approve_pr_456" }
     },
     "submissions": [
       { "id": "abc123", "payload": null, "at": "2026-05-16T12:34:56Z" }
     ]
   }
   ```
4. **Submission semantics** — JSON-encoded payload, single-line stdout emission (`SUBMIT <id> <payload-json>`), how multi-line payloads should be JSON-escaped so the stdout line stays parseable.
5. **Multipart upload semantics** — `POST /submit` with `multipart/form-data`; server stores uploaded files under a path it chooses; the emitted stdout line includes the stored path(s) in the payload.
6. **ID format** — opaque, scoped per session. Reference server uses `crypto/rand` 16-char hex. Alternatives (ULID, UUID, hash) are equally valid for other implementations.
7. **Worked example** — render a one-affordance confirmation page; show the rendered HTML (10-15 lines, agent-authored); show a sample submission flow with the resulting stdout line.

**Acceptance:** A developer in any language could implement this wire from this document alone. Agents in CC reading it understand what the Go reference does.

- [ ] **Step 1: Write `references/wire-example.md`** per content requirements.

- [ ] **Step 2: Self-check** — does the worked example actually demonstrate the wire end-to-end? Does the multipart section handle the file-path semantics clearly?

- [ ] **Step 3: Commit**

```bash
git add references/wire-example.md
git commit -m "docs: references/wire-example.md (act-XXXX)"
```

---

### Task 5: `references/lifecycle.md`

**Scope:** The autonomous-drain mechanism space + a worked Monitor example for Claude Code.

**Files:**
- Create: `references/lifecycle.md`

**Content requirements (cover all):**

1. **Framing** — autonomous draining is foundational (per pattern); the mechanism is the agent's choice. Non-prescriptive.
2. **Mechanism space** (per `docs/brief.md` §"Lifecycle mechanisms"):
   - Monitor on background process stdout (Claude Code primitive). Preferred for local CC use.
   - ScheduleWakeup / /loop polling (Claude Code primitives). Timer-based fallback when streams aren't viable.
   - Filesystem watch (OS-level: fswatch / inotify). Push-driven via OS.
   - Push webhook into the agent (depends on environment). For remote/channel-driven setups.
3. **For each mechanism**: when it fits (one sentence), what's needed (one sentence), tradeoffs (one sentence).
4. **Worked Monitor example** — concrete pseudocode showing: spawn the reference server in background via Bash run_in_background; Monitor its stdout; parse `SUBMIT <id> <payload-json>` lines; look up intent in the agent-owned state file; act. 6-12 lines, agent-readable.
5. **Cadence guidance** — push-driven (Monitor, fs watch, webhook) is event-time; polling cadence depends on task latency tolerance (interactive review = seconds; async approval = minutes).
6. **Pointer back to "Beyond the pattern" in `pattern.md`** — timeout, idempotency, retry, recovery from agent crashes are agent responsibilities.

**Acceptance:** Agent in CC reading this can write the autonomous-drain glue for the canonical wire. Agent elsewhere can pick from the mechanism space and adapt.

- [ ] **Step 1: Write `references/lifecycle.md`** per content requirements.

- [ ] **Step 2: Self-check** — does the worked Monitor example actually compile (in the agent's head) into a working loop? Is the SUBMIT line parsing trivially obvious?

- [ ] **Step 3: Commit**

```bash
git add references/lifecycle.md
git commit -m "docs: references/lifecycle.md (act-XXXX)"
```

---

### Task 6: `references/security.md`

**Scope:** Deployment-specific security concerns. v0 trusts agents to think about security in their context; this reference reminds, doesn't dictate.

**Files:**
- Create: `references/security.md`

**Content requirements (cover all):**

1. **Stance** — v0 ships low-risk by construction (structured envelopes, private/local use is the default). This reference names the concerns to think through when stepping outside that default. Brevity over completeness; the agent will fill in context-specific reasoning.
2. **Free-field content as injection vector** — submission envelopes are typed; free-text, image, and file payloads are user-controlled. Agents must treat that content as untrusted before passing back to an LLM.
3. **Deployment posture** —
   - **Localhost (v0 default).** Reference server binds to `127.0.0.1`; reachable only from the same machine.
   - **LAN / tunneled / hosted.** Needs CSRF on `POST /submit`, unguessable URLs (long random session IDs in the URL), and auth or equivalent if the surface gates anything that matters.
4. **Cross-tool replay** — per-session ID scope (assuming fresh state per session) mitigates intra-machine replay where two pokes might collide. Hosted contexts need more.
5. **Out of scope for v0** — sanitization patterns, magic-link auth, formal link expiration, replay protection. Named here so agents know these are future work, not v0 omissions to invent ad-hoc.

**Acceptance:** Agent moving from localhost to a different deployment posture reads this and knows what to think about. No prescriptive checklists ("must use X library") — guidance, not recipes.

- [ ] **Step 1: Write `references/security.md`** per content requirements.

- [ ] **Step 2: Self-check** — is it brief enough that it won't dilute the skill when SKILL.md links to it? Does it remind rather than dictate?

- [ ] **Step 3: Commit**

```bash
git add references/security.md
git commit -m "docs: references/security.md (act-XXXX)"
```

---

### Task 7: `examples/server.go` (with tests)

**Scope:** Runnable Go reference server implementing the canonical HTTP+JSON wire. Stdlib-only. ~80 lines target (informational; not a hard ceiling). TDD-driven.

**Files:**
- Create: `examples/server.go`
- Create: `examples/server_test.go`

**Constraints:**
- Go stdlib only (no external imports). IDs via `crypto/rand` hex.
- Loopback bind by default (`127.0.0.1`); flag to override is acceptable but defaults to loopback.
- Flags: `--state <path>` (state file path), `--port <int>` (default `5173` or similar), `--html <path>` (path to agent-rendered HTML to serve at `GET /`), `--bind <addr>` (default `127.0.0.1`).
- Emits one line per submission to stdout in the exact format `SUBMIT <id> <payload-json>` (single line, JSON-escaped payload).

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

- [ ] **Step 2: Run the test, watch it fail (no `newHandler`)**

```bash
cd ~/Workspace/poke && go test ./examples/...
```

Expected: build error or test failure citing undefined `newHandler`.

- [ ] **Step 3: Implement minimum to pass — `newHandler`, HTML serving**

Skeleton (fill in):

```go
// examples/server.go
package main

import (
    "encoding/json"
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
    // implemented in Task 7 / Step 5
    http.Error(w, "not yet", http.StatusNotImplemented)
}

func main() {
    state := flag.String("state", "", "path to state JSON file")
    html := flag.String("html", "", "path to HTML to serve at /")
    port := flag.Int("port", 5173, "listen port")
    bind := flag.String("bind", "127.0.0.1", "bind address (loopback by default)")
    flag.Parse()
    if *state == "" || *html == "" {
        fmt.Fprintln(os.Stderr, "usage: server --state <path> --html <path> [--port N] [--bind addr]")
        os.Exit(2)
    }
    h := newHandler(*state, *html)
    addr := fmt.Sprintf("%s:%d", *bind, *port)
    fmt.Fprintf(os.Stderr, "poke server listening on %s\n", addr)
    if err := http.ListenAndServe(addr, h); err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
}
```

Suppress unused-import warning for `encoding/json` once submission is implemented.

- [ ] **Step 4: Run test, watch it pass**

```bash
go test ./examples/... -run TestServerServesHTML -v
```

Expected: PASS.

- [ ] **Step 5: Write failing test for submission**

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
    rec := httptest.NewRecorder()
    handler.ServeHTTP(rec, req)

    if rec.Code != http.StatusOK { t.Fatalf("status = %d", rec.Code) }

    w.Close()
    out, _ := io.ReadAll(r)
    if !strings.HasPrefix(string(out), "SUBMIT abc ") {
        t.Fatalf("stdout did not emit SUBMIT line: %q", string(out))
    }

    // verify state file appended
    data, _ := os.ReadFile(stateFile.Name())
    if !strings.Contains(string(data), `"id":"abc"`) {
        t.Fatalf("state file did not record submission: %s", string(data))
    }
}
```

- [ ] **Step 6: Run, watch it fail (501 Not Implemented)**

```bash
go test ./examples/... -run TestSubmit -v
```

Expected: FAIL with 501 status assertion.

- [ ] **Step 7: Implement `submit`**

Required behavior:
- Decode JSON body into `{id, payload}` struct.
- Acquire `h.mu`, read state file, append `{id, payload, at: time.Now().UTC().Format(time.RFC3339Nano)}` to `submissions`, write back atomically (write to tmp, rename).
- Emit `fmt.Printf("SUBMIT %s %s\n", id, payloadJSON)` to stdout.
- Return 200 with empty body.
- On any error: 400 with terse message.

Implementer's call on exact code; constraints above are the contract.

- [ ] **Step 8: Run, watch it pass**

```bash
go test ./examples/... -v
```

Expected: both tests PASS.

- [ ] **Step 9: Write failing test for multipart upload**

Skeleton: POST `multipart/form-data` with one file field `upload` + form field `id`; expect 200, expect a path in the stdout SUBMIT payload, expect the file at that path on disk with the original bytes.

(Test code: write it directly; ~30-40 lines. Implementer's call on exactly how to structure the multipart request — `mime/multipart` stdlib helps.)

- [ ] **Step 10: Run, watch it fail**

- [ ] **Step 11: Extend `submit` to handle multipart** — detect Content-Type, parse with `r.ParseMultipartForm`, save uploaded files under a tmp directory (e.g., `os.TempDir() + "/poke-uploads-<session>"`), include `{"files": ["/absolute/path/to/saved/file", ...]}` in the payload sent to stdout and state.

- [ ] **Step 12: Run, all tests pass**

```bash
go test ./examples/... -v
```

Expected: all three tests PASS.

- [ ] **Step 13: `go vet` and `gofmt`**

```bash
go vet ./...
gofmt -l . 
```

Both should report nothing.

- [ ] **Step 14: Commit**

```bash
git add examples/server.go examples/server_test.go
git commit -m "feat: Go reference server with HTML+submit+upload (act-XXXX)"
```

---

### Task 8: `SKILL.md`

**Scope:** The skill entry point. YAML frontmatter + 8 sections. Loads when Claude detects relevant intent or context. Other reference files are lazy-loaded by name from here.

**Files:**
- Create: `SKILL.md`

**Frontmatter (draft — refine if you can sharpen the trigger):**

```yaml
---
name: poke
description: Use when an agent needs to collect ad-hoc structured input from a user via a flexible, distributable interface — multi-choice decisions too big for chat, file or photo uploads, visual disambiguation, comparative ranking, approval gates when the user isn't in chat (push notification / email / SMS delivery of a URL). Generates an ephemeral page with opaque-ID affordances; an autonomous drain mechanism delivers structured submissions back to the agent. Not for: simple in-chat questions, durable apps, or interactions the agent can self-resolve.
---
```

**Sections** (in order, per `docs/brief.md` §"Skill structure"):

1. **What poke is** — pattern statement, defining property, required mechanism (autonomous draining), useful consequences (one-way channels, schema by construction). ~150-200 words.
2. **When to use / when not to use** — situational guidance; mirror brief §"What poke is for — and is not for" including the situation/tool table. Cross-references section 8 for security. ~200 words.
3. **The pattern** → `references/pattern.md`. Two-line summary + lazy-load pointer.
4. **The wire example** → `references/wire-example.md`. Two-line summary + lazy-load pointer.
5. **Lifecycle mechanisms** → `references/lifecycle.md`. Two-line summary + lazy-load pointer.
6. **Working with the user** (inline; no reference file) — interactive vs autonomous invocation; setup vs interaction distinction. ~100 words.
7. **Reference example** → `examples/server.go`. Two-line note: runnable Go reference, read for orientation, re-implement in any substrate.
8. **Security considerations** → `references/security.md`. One-line summary + lazy-load pointer.

**Acceptance:** SKILL.md is short (target ≤300 lines including frontmatter). Pattern is the contract; references carry depth. Trust-the-agent throughout — surfaces choices, doesn't prescribe.

- [ ] **Step 1: Write `SKILL.md` per the structure above.**

- [ ] **Step 2: Self-check** —
  - Does the `description` trigger reliably for the use cases in section 2 without over-triggering on simple chat questions?
  - Are inline sections short enough that the skill reads as "pattern + pointers" rather than "wall of guidance"?
  - Does any section overlap or contradict its referenced file?
  - Trust-the-agent: cut any sentence that prescribes when guidance would suffice.

- [ ] **Step 3: Commit**

```bash
git add SKILL.md
git commit -m "feat: SKILL.md entry point with 8 sections (act-XXXX)"
```

---

### Task 9: Smoke test verification

**Scope:** Confirm the bundle works end-to-end as a v0 deliverable. This is the "v0 complete" gate per CLAUDE.md.

**Files:** none created; pure verification.

- [ ] **Step 1: Symlink the repo as a skill**

```bash
ln -s ~/Workspace/poke ~/.claude/skills/poke
ls -la ~/.claude/skills/poke
```

Expected: symlink points to `~/Workspace/poke`, follows correctly.

- [ ] **Step 2: Smoke-test SKILL.md activation**

Open a fresh Claude Code session in any directory (a throwaway dir is fine). Confirm the `poke` skill appears in the available-skills list (system reminder at session start).

Expected: `poke - <description>` shows up. If it doesn't, the symlink or frontmatter is wrong; debug before proceeding.

- [ ] **Step 3: End-to-end reference server test**

In a terminal:

```bash
# write a tiny HTML page for the test
cat > /tmp/poke-test.html <<'EOF'
<html><body><form action="/submit" method="post" enctype="application/json">
  <button type="submit">click me</button>
</form></body></html>
EOF

# initial state
echo '{"session_id":"test","affordances":{"abc":{"label":"Click","intent":"clicked"}},"submissions":[]}' > /tmp/poke-test.json

# run the server
cd ~/Workspace/poke
go run ./examples/server.go --state /tmp/poke-test.json --html /tmp/poke-test.html --port 5173 &
SERVER_PID=$!
sleep 1

# submit
curl -sf -X POST -H 'Content-Type: application/json' \
  -d '{"id":"abc","payload":null}' \
  http://127.0.0.1:5173/submit

# kill server
kill $SERVER_PID 2>/dev/null
```

Expected: curl returns 200 (no output); server stdout contained a line matching `SUBMIT abc null`. Verify the state file `/tmp/poke-test.json` now contains a submission record for `abc`.

- [ ] **Step 4: Commit a small verification note**

If everything passed, no code changes are needed. Optionally add a short note to README documenting that v0 verification passed.

```bash
# no-op or trivial README update
git status
```

- [ ] **Step 5: Close the v0 milestone**

Run `act close <last-issue> --reason "v0 complete; SKILL.md activates, reference server passes end-to-end smoke test"`.

---

## Spec coverage check (self-review)

| Brief section | Covered by |
|---|---|
| What poke is | Task 8 (SKILL.md §1), Task 3 (pattern.md) |
| Why this exists | Task 2 (README), Task 8 (SKILL.md §1) |
| Defining property and consequences | Task 8 (SKILL.md §1) |
| What poke is for / not for | Task 8 (SKILL.md §2) |
| What a session looks like | Task 4 (wire-example.md worked example), Task 5 (lifecycle.md Monitor walkthrough) |
| The pattern (substrate-agnostic) | Task 3 (pattern.md) |
| The wire example (HTTP + JSON) | Task 4 (wire-example.md), Task 7 (server.go implements it) |
| Lifecycle mechanisms | Task 5 (lifecycle.md) |
| Skill structure | Task 8 (SKILL.md) |
| Working with the user | Task 8 (SKILL.md §6) |
| Security considerations | Task 6 (security.md), Task 8 (SKILL.md §8) |
| Reference example | Task 7 (server.go + tests), Task 8 (SKILL.md §7) |
| Repo layout | Tasks 1-9 collectively |
| Out of scope | Not implemented (by definition); covered in brief and CLAUDE.md, no task needed |

No gaps. No tasks orphaned. Frontmatter on SKILL.md is the only "high-stakes" prose detail; flagged for self-check in Task 8.

---

## Execution handoff

**Plan complete and committed to `docs/plan.md`.** Two execution options:

1. **Subagent-Driven (recommended)** — orchestrator dispatches a fresh subagent per task in its own worktree; review between tasks; fast iteration; orchestrator handles ff-merges to main.
2. **Inline Execution** — work tasks sequentially in this session with checkpoints.

Subagent-driven is the natural fit given the sibling-repo (`ask`, `act`) workflow precedent. Inline is reasonable if you'd rather watch the work happen and intervene live.
