# poke

`poke` is a pattern + skill that lets an agent generate ephemeral, structured UI surfaces to collect ad-hoc input from a user, and react to submissions autonomously. The surface is a URL pointing at agent-rendered HTML; the agent owns what each affordance means; submissions arrive in known shape. v0 ships the skill bundle, four reference servers (Go, Python, Node, Rust) for the local-loopback substrate, and a Cloudflare Worker reference for the hosted substrate. No installable binary yet.

## Install

The repo is packaged for both Claude Code and Codex. The actual skill bundle lives under `skills/poke/` and is harness-neutral — the same skill bytes load on either harness. Only the packaging wrapper differs.

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

**Codex lifecycle primitive mapping.** The mechanism categories in `skills/poke/references/lifecycle.md` (push-stream, polling, FS watch, hosted poll, webhook) are harness-neutral; primitives differ:

| Category | Claude Code | Codex |
|---|---|---|
| Push-stream on subprocess stdout | `Bash(run_in_background)` + `Monitor` | Long-running `exec_command` session + `write_stdin`/output polling |
| Scheduled wake-ups for cadence | `ScheduleWakeup`, `/loop` | Heartbeat automations |
| FS drop-directory watch | `fswatch`/`inotifywait`/polling | Same — OS-level primitives are harness-neutral |
| Hosted poll | `WebFetch` / HTTP | `WebFetch` / HTTP — same |
| Tear-down | `KillShell` | Codex session/process-group teardown |

A poke that requires the user to come back to chat and say "I clicked it" has failed the pattern. Any Codex adaptation must include a real drain path (long-running stdout polling, drop-directory polling, heartbeat-driven re-check, hosted poll, or webhook where available).

### What loads

Each harness loads `skills/poke/SKILL.md` and what it explicitly references; everything else in this repo is for humans reading the project.

## What's in this repo

**Shipped as the skill** (Claude loads these at runtime, all under `skills/poke/`):

| Path | Purpose |
|---|---|
| `skills/poke/SKILL.md` | Skill entry point — what poke is, when to use it, links into the references. |
| `skills/poke/references/pattern.md` | The substrate-agnostic pattern. The contract every implementation must preserve. |
| `skills/poke/references/wire-example.md` | One concrete wire (HTTP + JSON over localhost). Illustrative, not normative. |
| `skills/poke/references/lifecycle.md` | The mechanism space for autonomous draining (Monitor, polling, fs watch, push webhook). |
| `skills/poke/references/security.md` | Trust boundary, deployment posture, free-field content as injection vector. Concrete CSRF + URL-unguessability notes from the worker reference. |
| `skills/poke/references/hosted-example.md` | Cloudflare Worker + KV wire walkthrough — sibling to `wire-example.md`, for the hosted substrate. |
| `skills/poke/examples/server.go` | Go reference server implementing the wire example. Supports either stdout (`SUBMIT` lines) or filesystem-drop drain via `--drain-mode={stdout,fs}`. Read it for orientation, re-implement in whatever fits. |
| `skills/poke/examples/server_test.go` | Tests for the Go reference. |
| `skills/poke/examples/reveal/reveal.go` | Minimal inline-reveal example for Rule 5 (the surface owns the result). Click → /submit returns the reveal payload → page swaps it into an inline panel. Stdlib only. |
| `skills/poke/examples/server.py` | Python stdlib reference, independently derived from the references (not Go-mirrored). Diverges from the Go sibling on operational details (port 8000, no parent-death watchdog, hard 32 MiB multipart cap) — same wire contract. |
| `skills/poke/examples/test_server.py` | Tests for the Python reference. |
| `skills/poke/examples/server.mjs` | Node reference (single-file ESM, stdlib only). Independently derived from the references. |
| `skills/poke/examples/server.test.mjs` | Tests for the Node reference (uses `node:test`). |
| `skills/poke/examples/rust/` | Rust reference as a Cargo project. Uses `tiny_http` + `multipart`; sync HTTP rather than async. Independently derived from the references. |
| `skills/poke/examples/worker/` | Cloudflare Worker + KV reference for the hosted substrate. Deploy with `cd skills/poke/examples/worker && npm install && wrangler deploy`. See `skills/poke/references/hosted-example.md` for the wire and `skills/poke/examples/worker/README.md` for the deploy story. |

Three of the four local references (Python, Node, Rust) were built without their authors reading the existing siblings — they derived the impl from `skills/poke/references/` alone. The operational divergences between them (different ports, different watchdog choices, different error-status policies) are the validation: the pattern survives independent re-derivation across multiple substrates.

**Packaging** (harness-specific plugin wrappers, not loaded as part of the skill):

| Path | Purpose |
|---|---|
| `.claude-plugin/plugin.json` | Claude plugin manifest. Makes the bundle installable as a Claude Desktop / Cowork plugin; skills under `skills/` are auto-discovered. |
| `.codex-plugin/plugin.json` | Codex plugin manifest. Sibling to the Claude manifest with the same `skills/` pointer and lockstep `version`. Harness-neutral skill content stays under `skills/poke/`. |

**For humans** (not loaded by Claude):

| Path | Purpose |
|---|---|
| `README.md` | This file. |
| `LICENSE` | Apache 2.0. |
| `CLAUDE.md` | Conventions for agents working on `poke` itself (load-bearing design principles, branch policy, halt conditions). |
| `docs/brief.md` | Converged v0 design — pattern, wire, lifecycle, skill structure, security stance, out-of-scope. |
| `docs/plan.md` | v0 implementation plan. |
| `docs/session-handoff.md` | Cross-session context for agents picking up work. |
| `skills/poke/go.mod` | Go module declaration for the reference server. |

## Where the design lives

- **`docs/brief.md`** — the converged v0 design. Start here if you want to understand the shape of the pattern, the wire example, lifecycle mechanisms, and what was deliberately left out of v0.
- **`CLAUDE.md`** — the load-bearing principles (trust the agent, pattern is the contract, autonomous draining is foundational). Read before changing anything in the skill bundle.

## Privacy / telemetry

This skill phones no one home. It emits no telemetry and collects no data. Any outbound network activity happens only through hosted-substrate references the user explicitly opts into (e.g., the Cloudflare Worker reference), and is entirely controlled by the operator.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
