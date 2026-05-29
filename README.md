# surface

`surface` is a pattern + skill that lets an agent generate ephemeral, structured UI surfaces to collect ad-hoc input from a user, and react to submissions autonomously. The surface is a URL pointing at agent-rendered HTML; the agent owns what each affordance means; submissions arrive in known shape. Surfaces are also a primary tool for *showing* users information — tables, grouped lists, flagged rows, and rich layout communicate at a glance what chat text or a static document cannot. v0 ships the skill bundle, four reference servers (Go, Python, Node, Rust) for the local-loopback substrate, and a Cloudflare Worker reference for the hosted substrate. No installable binary yet.

## Why surface (and why not a form)

Agents already have three ways to collect structured input, each with a gap: a **chat reply** (unstructured, and only if the user is in chat), an **inline chat-client widget** (structured, but trapped inside a supported chat surface), or a **purpose-built app or form** (full UI, but real build-and-maintain cost). surface fills the space between them — task-shaped UI the agent generates for the moment and discards.

The honest objection is "isn't this just a web form?" The answer is no, and the reason is the shift in *who builds it and how disposable it is*:

- **The cost of bespoke collapsed to the cost of asking.** A form builder gives you fixed fields and one respondent. surface lets an agent generate a UI *shaped to the task* — a drag-to-rank, a floor-plan annotator, a refereed two-player game, a flagged-transactions review with per-row decisions — in the time it takes to describe it, then throw it away. When making a custom interactive surface gets that cheap, the calculus flips: interactions that were never worth building a UI for (too one-off, too oddly-shaped, too ephemeral) become worth a surface, because nobody has to build and own anything.
- **The URL carries the whole interaction.** Because the response surface lives at the URL, *any* outbound channel — email, SMS, push, a paging system — becomes a reply path, not just a notification. That reframes "the user isn't in chat" from a dead end into a delivery choice.
- **Reactions are code, so monitoring is cheap.** The agent encodes the drain-and-react logic and lets it run; it only re-engages for submissions that genuinely need judgment. Watching a live surface is not an LLM-call-per-interaction tax — the mechanical reactions cost nothing once written.
- **Ephemeral by design.** surface is for the moment, not forever. For durable, recurring needs, a real app or form tool is the right call — and the skill says so. The boundary is the point: surface fills the gap *below* the threshold where standing up and maintaining a tool makes sense.

## Not in scope (yet)

surface deliberately ships narrow and grows on real-use signal. Currently out of scope:

- **A bundled/installable server binary.** v0 is skill-only — the reference servers in `skills/surface/examples/` exist to be read and re-implemented, not installed. A canonical `surface-serve` is a v1 question.
- **Templating / surface-authoring helpers.** The agent writes the HTML/JS directly; a helper layer waits on friction signal.
- **Substantive prompt-injection mitigation patterns.** `references/security.md` names the caution; deeper sanitization guidance accrues as real untrusted-input use does.
- **Persistent surfaces, link expiration, one-time-use semantics.** Surfaces are ephemeral; agents handle lifetime in their own state if they need it.

(Hosted deployment and a push/WebSocket transport were once on this list — both have since shipped, as `references/hosted-example.md` and `references/websocket-example.md`.)

## Install

The repo is packaged for both Claude Code and Codex. The actual skill bundle lives under `skills/surface/` and is harness-neutral — the same skill bytes load on either harness. Only the packaging wrapper differs.

### Claude Code

`.claude-plugin/plugin.json` at the root declares the Claude plugin. Two install paths:

**Claude Code CLI (skills-dir symlink):**

```sh
git clone <repo-url> ~/Workspace/surface
ln -s ~/Workspace/surface/skills/surface ~/.claude/skills/surface
```

**Claude Desktop / Cowork (plugin install):** install the plugin from this repo so it appears in the customize view. Plugin discovery is driven by `.claude-plugin/plugin.json` at the repo root; the skill is auto-discovered under `skills/surface/`.

### Codex

`.codex-plugin/plugin.json` at the root declares the Codex plugin. Skill bundle discovered under `skills/surface/`.

**Codex CLI (skills-dir symlink):**

```sh
git clone <repo-url> ~/Workspace/surface
ln -s ~/Workspace/surface/skills/surface ~/.codex/skills/surface
```

**Plugin install:** point Codex at this repo; the `.codex-plugin/plugin.json` manifest carries the skill pointer and metadata.

### CLI-only install (no marketplace)

For offline use or environments without plugin marketplace access, `install.sh` at the repo root handles detection, symlink install, and uninstall for both harnesses:

```sh
git clone https://github.com/aac/surface.git
cd surface
./install.sh                        # auto-detects Claude Code or Codex
./install.sh --target claude        # override to Claude Code
./install.sh --target codex         # override to Codex
./install.sh --uninstall            # remove the installed skill
```

The script can also be piped via curl — it will clone the repo to `~/.local/share/surface/` if no local checkout is found. See the `# Usage:` block at the top of `install.sh` for full details.

**Codex lifecycle primitive mapping.** The mechanism categories in `skills/surface/references/lifecycle.md` (push-stream, polling, FS watch, hosted poll, webhook) are harness-neutral; primitives differ:

| Category | Claude Code | Codex |
|---|---|---|
| Push-stream on subprocess stdout | `Bash(run_in_background)` + `Monitor` | Long-running `exec_command` session + `write_stdin`/output polling |
| Scheduled wake-ups for cadence | `ScheduleWakeup`, `/loop` | Heartbeat automations |
| FS drop-directory watch | `fswatch`/`inotifywait`/polling | Same — OS-level primitives are harness-neutral |
| Hosted poll | `WebFetch` / HTTP | `WebFetch` / HTTP — same |
| Tear-down | `KillShell` | Codex session/process-group teardown |

A surface that requires the user to come back to chat and say "I clicked it" has failed the pattern. Any Codex adaptation must include a real drain path (long-running stdout polling, drop-directory polling, heartbeat-driven re-check, hosted poll, or webhook where available).

### What loads

Each harness loads `skills/surface/SKILL.md` and what it explicitly references; everything else in this repo is for humans reading the project.

## What's in this repo

**Shipped as the skill** (Claude loads these at runtime, all under `skills/surface/`):

| Path | Purpose |
|---|---|
| `skills/surface/SKILL.md` | Skill entry point — what surface is, when to use it, links into the references. |
| `skills/surface/references/pattern.md` | The substrate-agnostic pattern. The contract every implementation must preserve. |
| `skills/surface/references/wire-example.md` | One concrete wire (HTTP + JSON over localhost). Illustrative, not normative. |
| `skills/surface/references/lifecycle.md` | The mechanism space for autonomous draining (Monitor, polling, fs watch, push webhook). |
| `skills/surface/references/security.md` | Trust boundary, deployment posture, free-field content as injection vector. Concrete CSRF + URL-unguessability notes from the worker reference. |
| `skills/surface/references/hosted-example.md` | Cloudflare Worker + KV wire walkthrough — sibling to `wire-example.md`, for the hosted substrate. |
| `skills/surface/examples/server.go` | Go reference server implementing the wire example. Supports either stdout (`SUBMIT` lines) or filesystem-drop drain via `--drain-mode={stdout,fs}`. Read it for orientation, re-implement in whatever fits. |
| `skills/surface/examples/server_test.go` | Tests for the Go reference. |
| `skills/surface/examples/reveal/reveal.go` | Minimal inline-reveal example for Rule 5 (the surface owns the result). Click → /submit returns the reveal payload → page swaps it into an inline panel. Stdlib only. |
| `skills/surface/examples/server.py` | Python stdlib reference, independently derived from the references (not Go-mirrored). Diverges from the Go sibling on operational details (port 8000, no parent-death watchdog, hard 32 MiB multipart cap) — same wire contract. |
| `skills/surface/examples/test_server.py` | Tests for the Python reference. |
| `skills/surface/examples/server.mjs` | Node reference (single-file ESM, stdlib only). Independently derived from the references. |
| `skills/surface/examples/server.test.mjs` | Tests for the Node reference (uses `node:test`). |
| `skills/surface/examples/rust/` | Rust reference as a Cargo project. Uses `tiny_http` + `multipart`; sync HTTP rather than async. Independently derived from the references. |
| `skills/surface/examples/worker/` | Cloudflare Worker + KV reference for the hosted substrate. Deploy with `cd skills/surface/examples/worker && npm install && wrangler deploy`. See `skills/surface/references/hosted-example.md` for the wire and `skills/surface/examples/worker/README.md` for the deploy story. |

Three of the four local references (Python, Node, Rust) were built without their authors reading the existing siblings — they derived the impl from `skills/surface/references/` alone. The operational divergences between them (different ports, different watchdog choices, different error-status policies) are the validation: the pattern survives independent re-derivation across multiple substrates.

**Packaging** (harness-specific plugin wrappers, not loaded as part of the skill):

| Path | Purpose |
|---|---|
| `.claude-plugin/plugin.json` | Claude plugin manifest. Makes the bundle installable as a Claude Desktop / Cowork plugin; skills under `skills/` are auto-discovered. |
| `.codex-plugin/plugin.json` | Codex plugin manifest. Sibling to the Claude manifest with the same `skills/` pointer and lockstep `version`. Harness-neutral skill content stays under `skills/surface/`. |

**For humans** (not loaded by Claude):

| Path | Purpose |
|---|---|
| `README.md` | This file. |
| `LICENSE` | Apache 2.0. |
| `AGENTS.md` | Conventions for agents and contributors working on `surface` itself (load-bearing design principles, branch policy, halt conditions). `CLAUDE.md` is a thin shim that imports it so Claude Code auto-loads it. |
| `docs/decisions.md` | Running log of substantive design choices and rejected proposals, with reasoning. |
| `skills/surface/go.mod` | Go module declaration for the reference server. |

## Where the design lives

- **`skills/surface/SKILL.md`** + **`references/`** — the canonical design: the pattern, the wire example, lifecycle mechanisms, security stance. Start here to understand the shape of the thing.
- **`AGENTS.md`** — the load-bearing principles (trust the agent, pattern is the contract, autonomous draining is foundational). Read before changing anything in the skill bundle. (`CLAUDE.md` just imports this for Claude Code.)
- **`docs/decisions.md`** — why specific design calls were made (and why proposals were rejected). Read before re-opening a settled question.

## Privacy / telemetry

This skill phones no one home. It emits no telemetry and collects no data. Any outbound network activity happens only through hosted-substrate references the user explicitly opts into (e.g., the Cloudflare Worker reference), and is entirely controlled by the operator.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
