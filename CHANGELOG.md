# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.9.0] - 2026-07-05

### Changed
- **Cut references harder** (act-208131), per the measured reference-eval A/B in skill-minimizer's `docs/pilot/reference-eval-ab-result.md`. Trimmed `references/security.md` and `references/lifecycle.md` to their single-home content: the third-party-share default-rule restatement and the localhost-reachability posture (`security.md`), and the server-vs-drain non-blocking-lifetime mechanics (`lifecycle.md`), were proven behavior-neutral to remove (SX1b/SX2, N=3) because the canonical copy lives in SKILL.md §2/§5/§9 and `references/pattern.md`. Unique/unmeasured content is untouched — the image/OCR upload injection vector, provisioning gate, CSRF, scope calibration, URL-forwarding, and attribution in `security.md`; the mint-vs-react long-gap / detached-regime / daemonized-server nuance in `lifecycle.md`.
- `references/wire-example.md`: folded the hosted substrate's `response.ok`-before-success rejection modes (CSRF-token failure, expired session URL) into the existing gotcha paragraph, so the one load-bearing line from the removed `hosted-example.md` survives in a kept doc.
- README.md and SKILL.md §8: repointed the removed hosted/WebSocket reference mentions to `references/pattern.md` and `references/security.md`. The WebSocket transport and hosted deployment remain valid substrates — described in SKILL.md §8 and the security reference rather than in dedicated reference walkthroughs.
- Moved the SKILL.md `version` from a top-level frontmatter key to `metadata.version`, the spec-compliant location (the [Agent Skills spec](https://agentskills.io/specification) allows only `name`/`description`/`license`/`compatibility`/`metadata`/`allowed-tools` at the top level). `skills-ref validate` now passes on the skill.
- `scripts/check-versions.sh` and CI now read the skill version via the new stdlib-only `scripts/skill-version.py` (CI has no YAML lib); `scripts/bump-version.sh` writes `metadata.version`.
- `scripts/lint-skill.py` now rejects any unexpected top-level frontmatter field — an in-repo spec check, so CI doesn't depend on the external demo-only `skills-ref` tool.

### Removed
- `references/hosted-example.md` and `references/websocket-example.md` — cut per the reference-eval A/B (behavior-neutral on removal; SX4, N=2). The hosted (Cloudflare Worker + KV) and WebSocket substrates are re-derivable from `references/pattern.md`'s substrate list, SKILL.md §8, and the poll-drain shape in `references/lifecycle.md`; the one gotcha worth keeping (`response.ok` before success) was relocated into `references/wire-example.md` (see Changed).
- Dropped the skills.sh README badge: the repo isn't indexed on skills.sh yet (the badge renders "resource not found"), and the apex→`www` redirect breaks GitHub's image proxy. Re-add once the repo is indexed (after a first `npx skills add aac/surface`), using the `www.skills.sh` URL.

### Fixed
- `claude plugin install` failed manifest validation on Claude Code (`skills: Invalid input`). Removed the `skills` array from `.claude-plugin/plugin.json` — Claude Code's manifest schema doesn't accept a `skills` array (pointing it at the directory instead of the `SKILL.md` file still fails the same way), and the skill is auto-discovered from `skills/surface/` regardless, matching the first-party-plugin convention. Also dropped the top-level `"$schema"` key from `.claude-plugin/marketplace.json`, which older Claude Code releases reject as an unrecognized key under `plugin validate`. Codex manifests (`.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`) are untouched, so Codex packaging is unaffected. ([#1](https://github.com/aac/surface/issues/1))
- CI's manifest check listed `skills` as a **required** field on `.claude-plugin/plugin.json` — directly enforcing the key that breaks `plugin install`. Dropped `skills` from the required-field loop in `.github/workflows/ci.yml` so it matches the Codex check (which never required it) and reflects auto-discovery.
- Added a top-level `description` to `.claude-plugin/marketplace.json`, clearing the only remaining `plugin validate` warning (now passes clean, no warnings).

## [0.8.1] - 2026-06-19

### Changed
- Trimmed the SKILL.md frontmatter `description:` from 1518 to 997 characters to stay under Codex's hard 1024-char skill-description limit (the skill failed to load under Codex). Merged overlapping clauses and condensed the enumerated examples to representative coverage; all distinct activation triggers are preserved.

## [0.8.0] - 2026-06-18

### Added
- SKILL.md §10 "Related skills" — names `ask` and `reach` as optional sibling skills that compose with surface, with the standalone property kept explicit.
- SKILL.md §5 note mapping the lifecycle shapes to concrete primitives per harness (Claude Code and Codex), so the skill reads cleanly on either.

### Removed
- `examples/inline-reveal.{py,md}` — the "surface owns the result" example that rendered a result **pre-authored at mint time**. It reads as full-duplex but can't carry a result the agent *computes* from the submission; now that surface is full-duplex it was a misleading first example (an agent could reach for it and ship the weaker thing). Rule 5 — the principle that the surface owns the result — stays in `SKILL.md` §6.

### Changed
- `references/multi-round.md`: reframed the rigid "four stages" structure into composable "common moves" — no required progression — consistent with the non-prescriptive / trust-the-agent principle.
- De-coupled SKILL.md from Claude Code-specific vocabulary for the public/cross-harness release: harness primitive names in the prose (e.g. `Monitor`, `ScheduleWakeup`) are now described generically ("a push-stream on stdout", "scheduled wake-ups"), with the concrete per-harness mapping moved to the §5 note and `references/lifecycle.md`. Removed the personal `~/.claude/skills/reach` path reference.

### Changed
- SKILL.md §2: delivering a loopback surface the user can reach from their own browser now **defaults to opening it for them** (paste alongside), rather than listing open/paste/both as co-equal options. Agents reliably picked paste-a-link — which pushes the click onto the user — because that friction is invisible to the agent's loop (same dynamic as the detached-reactor default). Scoped narrowly: reachable loopback + interactive session only; overridable; does not apply to unreachable loopback (SSH'd-in remote bind), hosted/tunnel URLs for third parties, or autonomous sessions. *How* to open stays the agent's call. §6 names the open-default as a setup decision the user can override. See `docs/decisions.md`.

## [0.6.2] - 2026-06-01

### Fixed
- `examples/tic-tac-toe.md` by-hand walkthrough, from a clean-room README review: the `affordances` entry now shows the locked `{label, intent}` schema (it had shown the bare `{kind, cell}` intent, contradicting `wire-example.md`); the build step now `cd`s to the module root (`./examples/` only resolves from `skills/surface/`); and a note warns that a taken `--port` makes the server exit silently while a stale dev server on the same port can answer with a false `200`.
- `install.sh --help` now strips the leading `#` comment marker from its usage block. The previous `sed 's/^# \?//'` used the GNU-only `\?`, which BSD/macOS sed ignores — so help printed raw comment markers on exactly the Macs the script targets. Switched to `sed -E 's/^# ?//'`.

## [0.6.1] - 2026-06-01

### Added
- `references/wire-example.md`: documented that `POST /submit`'s response body is **not** required to be empty — it is the natural channel for the Rule 5 "surface owns the result" inline-reveal, orthogonal to the stdout drain. Framed as an allowance, not a mandate. Surfaced by convergent confusion from two independent clean-room agents (act-0c78b0).

### Changed
- Triaged the references-only clean-room "gap" tickets in `docs/decisions.md`: rejected reference-server feature parity (drain-mode fs; RNG / `--bind` / watchdog) and the inline-reveal escape-hatch as prescriptive or low-value. Reference servers are illustrative, not normative, so impl-to-impl parity is a non-goal (act-48dae3, act-4774ff, act-2e8311).

### Fixed
- Both plugin manifests now declare `Apache-2.0`. The Codex manifest said `MIT` and the Claude manifest omitted the license field; both now match `LICENSE` and the README. Apache 2.0 chosen for its explicit patent grant (act-789bba).

## [0.6.0] - 2026-05-30

### Added
- Node.js reference server (`examples/server.mjs`) with a `node:test` suite (21 cases), independently derived from the references — not ported from a sibling (act-fe82ba).
- Rust reference server (`examples/rust/`, zero-dependency `std::net`), independently derived from the references (act-ec7718).
- Inline-reveal worked example (`examples/inline-reveal.py` / `inline-reveal.md`) demonstrating SKILL.md §6 Rule 5 — the `/submit` response carries the payload the page swaps inline, no chat bounce (act-606533).

### Fixed
- README "what's in this repo" example list corrected to what actually ships (Go + Python + Node + Rust references; tic-tac-toe and inline-reveal examples).

## [0.5.0] - 2026-05-29

### Added
- `references/lifecycle.md`: named the mint-session ≠ react-session split; established the **detached regime** for long-gap surfaces (mint, persist, detach, react later in a fresh agent) and documented the optional non-agent detector that gates a fresh agent only on a real submission — encouraged via a recognition cue, never mandated.

## [0.4.2] - 2026-05-29

### Fixed
- Synced the Codex manifest version (it had stranded behind the others) and repaired a dangling "design brief" pointer in SKILL.md §7.

## [0.4.1] - 2026-05-29

### Changed
- Retired `docs/brief.md`, redistributing its content to its proper homes: substrate-test methodology → `AGENTS.md`, why-exists and out-of-scope → `README.md`. The duplicated pattern/wire/lifecycle content was dropped (already canonical in the skill bundle).

## [0.4.0] - 2026-05-29

### Added
- SKILL.md §6 **Rule 6 — "the surface explains itself"**: a surface must state, on its own, what it is, what the recipient must do, and why it matters.

## [0.3.1] - 2026-05-29

### Added
- Information display named as a primary use case in SKILL.md §2 and the frontmatter description — a rendered surface is often a better way to *show* a user information than chat text or a static document (act-bd160b).

## [0.3.0] - 2026-05-29

### Added
- `references/websocket-example.md` — push/WebSocket transport walkthrough, sibling to the HTTP wire example (act-914ae1).

## [0.2.0] - 2026-05-29

### Added
- tldraw tic-tac-toe capability demo (`examples/tic-tac-toe.html` / `tic-tac-toe.md`): the recipient plays on the board, the agent drains moves and replies by rendering its move back onto the surface.

## [0.1.12] - 2026-05-28

### Added
- `references/pattern.md`: documented the multi-affordance-per-item shape (group affordances by encoding an item reference in each affordance's intent; pivot on drain).

## [0.1.11] - 2026-05-28

### Added
- `references/hosted-example.md`: per-recipient URL walkthrough for attributed multi-recipient surfaces.

## [0.1.10] - 2026-05-28

### Changed
- SKILL.md §9 now surfaces the `security.md` §7 attribution guidance (anonymous / per-recipient URLs / sign-in) inline.

## [0.1.9] - 2026-05-28

### Added
- `references/multi-round.md` — reference for multi-round collaborative surfaces (collect, synthesize, vote, optional tiebreaker).

## [0.1.8] - 2026-05-28

### Added
- `references/lifecycle.md`: no-submission timeout / discard semantics — what the agent does when nothing arrives.

## [0.1.7] - 2026-05-28

### Changed
- SKILL.md when-to-use: emphasized information-dense surfaces (rich context alongside structured input on one page).

## [0.1.5] - 2026-05-28

### Added
- SKILL.md §2: fallback "bottom of the chain" for URL delivery — when no outbound channel is available, paste in chat, log it, or ask the operator to deliver manually rather than failing.

## [0.1.3] - 2026-05-28

### Fixed
- `.codex-plugin/plugin.json` `.name` field changed from stale `"poke"` to `"surface"`; description aligned with the canonical `.claude-plugin/plugin.json` framing (multi-recipient, third-party share, copy-to-paste runbook use cases that were added during arc-rsv2 but missed in the codex manifest) (act-7d405d).

## [0.1.2] - 2026-05-28

### Added
- Boilerplate hygiene: `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, GitHub issue templates, no-telemetry line in README (act-ef97).
- CI workflow (`.github/workflows/ci.yml`): markdown lint, plugin manifest validation including three-way SKILL.md ↔ claude-plugin ↔ codex-plugin version lockstep, Go reference-server tests (act-1145).

### Fixed
- Reconciled three-way version drift across SKILL.md frontmatter, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` — all now align on `0.1.2` (act-e23c59).
- `skills/surface/go.mod` now declares a real Go toolchain version (`1.22`) instead of the non-existent `1.26.3`; CI switched to `go-version-file` (act-9dc9f4).

## [0.1.1] - 2026-05-27

### Changed
- Renamed project from `poke` to `surface`.
- Removed v0 skill bundle; v1 skill bundle (`skills/surface/`) replaces it.

## [0.1.0] - 2026-05-20

### Added
- Initial release (as `poke`): skill bundle, the Go and Python reference servers, and Claude and Codex packaging. (The Node and Rust references were added later, at 0.6.0.)
