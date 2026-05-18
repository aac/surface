# poke — design decisions log

Running record of substantive design choices and notable rejected proposals for the poke project. Reverse-chronological (newest at top). The goal is to prevent re-litigation: when a proposal comes up that's been considered before, the reasoning is here.

This is **not** a changelog of every commit, nor a wire spec (that's `brief.md`). Entries belong here when they capture a design-semantics call — especially a "no, because..." — with reasoning that will still matter in six months.

**When to add an entry:** a substantive design choice is made, or a notable proposal is rejected on principle grounds. Routine implementation choices and ticket-level work breakdowns stay out — those live in `act` history and commit messages.

---

## 2026-05-18 · Substrate-specific documentation in pattern.md

**Proposal:** document Tailscale as an alternative substrate to a Cloudflare-deployed surface (URL served via MagicDNS from a local agent process to the user's phone on the same tailnet). Or — failing that — add a generalized "Choosing a substrate" property frame (durability / reach / recipient control / channel constraints) to `references/pattern.md` so agents have a decision rubric.

**Decision:** rejected both.

**Reasoning:** naming specific substrates violates "pattern is the contract; everything substrate-specific is illustration" (CLAUDE.md core principles). Generalizing a rejected specific into a rubric doesn't fix the violation — the pattern shouldn't teach a selection frame if it doesn't pick. Existing pattern.md ("Examples of substrates" + "Beyond the pattern (agent responsibilities)") already gives an agent enough scaffolding to derive substrate choice from environment + task. Two adversarial reviewers (skeptic + pragmatist) dispatched in parallel independently concluded skip; pragmatist noted line 52 already compresses three of the four candidate axes into one sentence. The Tailscale-vs-CF rubric stays in conversation history, not in the skill.

---

## 2026-05-17 · Relax HTTP 415 / body-cap status to implementation-defined

**Proposal (originally landed in act-a063):** pin HTTP 415 as the canonical status for unsupported content type, and HTTP 413 for body-cap rejection, as part of the rust-references-only doc-coherence pass.

**Decision:** reversed in act-087a (commit `3f917fc`). Status codes for these cases are implementation-defined, not wire shape.

**Reasoning:** the act-a063 references-only port surfaced doc gaps; some were genuine (state schema, SUBMIT line shape, multipart field name, RFC3339 timestamps — kept pinned), but others were operational variation the substrate was correctly absorbing. Pinning HTTP status codes on individual edge cases drifted into over-prescription. Default rule: pin only what genuinely belongs on the wire; operational specifics stay implementation-defined.

**Principle:** "trust the agent" — over-specification is the failure mode.

---

## 2026-05-17 · Substrate-agnostic test = "working poke-like thing," not byte-identical sibling match

**Proposal (implicit, from earlier dispatch shape):** validate alternative-substrate ports by comparing them byte-for-byte against existing sibling implementations (Go, Python, etc.).

**Decision:** rejected. The validating question is "can the agent build a working poke-like server from `SKILL.md`, `references/`, and the brief alone?" — not "does it match an existing sibling impl byte-for-byte?" Codified in `brief.md` §"The substrate-agnostic test (methodology)" and in commit `011bc3c` (act-6fb6).

**Reasoning:** dispatching a fresh references-only port with instructions to "mirror Go" defeats the test at the dispatch layer — the new impl ends up cloning a sibling's operational choices rather than independently deriving them. Operational divergence (port choice, watchdog details, error statuses, body-cap policy, Cache-Control specifics) is signal of validation, not failure. Convergence on the wire envelope (state schema, SUBMIT line shape, multipart field name, RFC3339 timestamps) is signal the docs pinned the right things.

**Captured as memory:** `feedback_references_only_lens.md`.

---

## 2026-05-17 · Skill content is harness-neutral; packaging is a separate layer

**Proposal:** allow SKILL.md or references to branch on harness ("for Cowork do X / for Claude Desktop do Y") where harness primitives differ.

**Decision:** rejected. Same skill bytes ship to every harness; agents derive substrate choice from environmental constraints (can I bind a port? is outbound HTTPS allowed?), not from a harness label. Harness-specific artifacts (`.claude-plugin/plugin.json`, install instructions, future manifest variants) live at the packaging layer around the skill bundle, never inside it. Pinned in CLAUDE.md core principles (commit `a79f80c`).

**Reasoning:** harness labels are not stable abstractions — the constraint set is. If skill content starts naming harnesses, the bundle stops being portable and the wrapper-vs-content layering collapses.

---

## 2026-05-17 · Repo restructure: bundle skill under skills/poke/

**Decision:** moved skill content into `skills/poke/` (commit `c7182d0`, act-63fb), with `.claude-plugin/plugin.json` at repo root as the Claude Desktop / Cowork packaging wrapper.

**Reasoning:** packaging and skill content need to live at different layers (see above). Putting the skill bundle in `skills/poke/` makes the layering structural — only files under `skills/poke/` ship as part of the runtime skill; `docs/`, `README.md`, `CLAUDE.md`, `LICENSE`, and `.claude-plugin/` are tooling and human-reader artifacts. Future harness wrappers add files alongside `.claude-plugin/` without touching skill content.

---

## (design phase, pre-implementation) · v0 ships skill bundle only; no bundled binary

**Proposal:** ship a `poke-serve` binary (or equivalent installable tool) in v0 alongside the skill.

**Decision:** deferred to v1. v0 ships only the skill bundle — `SKILL.md`, `references/`, `examples/server.go` as a reference impl agents read and re-implement themselves. Recorded in `brief.md` §"Out of scope."

**Reasoning:** "ship the narrow shape, grow based on real usage" (principle borrowed from `ask`). The Go reference exists to be read and re-implemented, not installed. v0's job is to prove the pattern works on docs alone — the substrate-agnostic test. If that test passes, v1 can wrap a canonical implementation; if it doesn't, a bundled binary wouldn't have fixed anything.

---

## (design phase, pre-implementation) · poke stands alone

**Proposal (considered briefly):** couple poke with `ask` or `act` so the three skills compose into a single agent-workflow toolkit.

**Decision:** rejected. poke has no dependency on `ask`, `act`, or any other skill. Pinned in CLAUDE.md core principles.

**Reasoning:** the skills serve different audiences (poke = ad-hoc user input; ask = human decision inbox; act = agent task tracker). Coupling them would force users of one to adopt the others. Composition happens at the agent layer, not in the skill bundles.

---

## (design phase, pre-implementation) · Security in its own reference, not in SKILL.md

**Proposal:** embed security caveats (free-field injection, deployment posture, link unguessability) inline in SKILL.md so they're impossible to miss.

**Decision:** rejected. Security lives in `references/security.md`, lazy-loaded.

**Reasoning:** SKILL.md stays focused on the pattern. Caveats inlined into the entry point dilute the value of the skill and crowd out the load-bearing content. The reference is one click away; agents that need it will load it. Recorded in CLAUDE.md core principles and in `brief.md` §"Skill structure."
