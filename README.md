# poke

`poke` is a pattern + skill that lets an agent generate ephemeral, structured UI surfaces to collect ad-hoc input from a user, and react to submissions autonomously. The surface is a URL pointing at agent-rendered HTML; the agent owns what each affordance means; submissions arrive in known shape. v0 ships the skill bundle, four reference servers (Go, Python, Node, Rust) for the local-loopback substrate, and a Cloudflare Worker reference for the hosted substrate. No installable binary yet.

## Install

The repo is a Claude Code plugin: `.claude-plugin/plugin.json` at the root declares the plugin, and the actual skill bundle lives under `skills/poke/`. Two install paths:

**Claude Code CLI (skills-dir symlink):**

```sh
git clone <repo-url> ~/Workspace/poke
ln -s ~/Workspace/poke/skills/poke ~/.claude/skills/poke
```

**Claude Desktop / Cowork (plugin install):** install the plugin from this repo so it appears in the customize view. Plugin discovery is driven by `.claude-plugin/plugin.json` at the repo root; the skill is auto-discovered under `skills/poke/`.

Claude loads `skills/poke/SKILL.md` and what it explicitly references; everything else in this repo is for humans reading the project.

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

**Packaging** (Claude Desktop plugin wrapper, not loaded as part of the skill):

| Path | Purpose |
|---|---|
| `.claude-plugin/plugin.json` | Plugin manifest. Makes the bundle installable as a Claude Desktop / Cowork plugin; skills under `skills/` are auto-discovered. Harness-neutral skill content stays under `skills/poke/`. |

**For humans** (not loaded by Claude):

| Path | Purpose |
|---|---|
| `README.md` | This file. |
| `LICENSE` | MIT. |
| `CLAUDE.md` | Conventions for agents working on `poke` itself (load-bearing design principles, branch policy, halt conditions). |
| `docs/brief.md` | Converged v0 design — pattern, wire, lifecycle, skill structure, security stance, out-of-scope. |
| `docs/plan.md` | v0 implementation plan. |
| `docs/session-handoff.md` | Cross-session context for agents picking up work. |
| `skills/poke/go.mod` | Go module declaration for the reference server. |

## Where the design lives

- **`docs/brief.md`** — the converged v0 design. Start here if you want to understand the shape of the pattern, the wire example, lifecycle mechanisms, and what was deliberately left out of v0.
- **`CLAUDE.md`** — the load-bearing principles (trust the agent, pattern is the contract, autonomous draining is foundational). Read before changing anything in the skill bundle.

## License

MIT. See [`LICENSE`](LICENSE).
