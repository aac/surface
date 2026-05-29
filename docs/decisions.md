# surface — design decisions log

Running record of substantive design choices and notable rejected proposals for the surface project. Reverse-chronological (newest at top). The goal is to prevent re-litigation: when a proposal comes up that's been considered before, the reasoning is here. (Entries dated before the rename still say "poke" — the project's former name; left as point-in-time record.)

This is **not** a changelog of every commit, nor a wire spec (that's `skills/surface/references/wire-example.md`). Entries belong here when they capture a design-semantics call — especially a "no, because..." — with reasoning that will still matter in six months.

**When to add an entry:** a substantive design choice is made, or a notable proposal is rejected on principle grounds. Routine implementation choices and ticket-level work breakdowns stay out — those live in `act` history and commit messages.

---

## 2026-05-29 · A surface must explain itself — what / to-do / why

**Request:** While dogfooding live demo surfaces (a flagged-transactions review and a WebSocket deploy gate), Andrew noted that surfaces "need to make sure they contain enough info to explain to the user what they're doing, what they need to do, and why." The demo surfaces had functional affordances but thin framing.

**Decision:** Added Rule 6 to SKILL.md §6 "Designing affordances": **the surface explains itself.** The page must answer, on its own, what it is, what the recipient must do, and why it matters (what the agent does with the response). Positioned as the recipient-facing complement to Rule 4 (honest confirmations) — Rule 4 keeps the confirmation honest, Rule 6 keeps the invitation sufficient. Version bumped 0.3.1 → 0.4.0 (new rule = minor) in SKILL.md and plugin.json lockstep.

**Reasoning:** This follows directly from the defining property in §1 — *the URL carries the whole interaction*. The corollary the skill hadn't made explicit: if the URL carries everything, the page may be all the recipient has. A recipient frequently opens the surface cold — out of the chat context that motivated it, sometimes a third party (the "third-party shares" use case) who never saw the agent's reasoning, sometimes the operator returning hours later. The existing rules covered *mechanism* quality (minimum-effort affordance, escape hatch, one-intent-per-affordance, honest confirmations, surface owns the result) but none covered whether the recipient can *understand the ask at all*. A surface with perfect affordances still fails if the recipient doesn't know what they're deciding or why. This is a build principle, not a wire/pattern change — no schema touched. It belongs in the skill (not project memory) per the project-memory policy: anything influencing how agents *use* the skill ships with the skill so every user has it, not just this repo's developers.

---

## 2026-05-29 · Information display is a primary, named use case

**Request:** Surface's use cases should explicitly include that a rendered surface is often a better way to show users information than chat text or a static document — not just as a qualifier on input collection. Source: gmail-cleanup dogfood observation (line 17).

**Decision:** Added information display as a primary named use case in SKILL.md §2 (new bullet, new table row) and frontmatter description. README opening framing updated to call this out. No change to the pattern or wire; this is a use-case framing addition only.

**Reasoning:** The skill already gestured at this in the "information-dense surfaces" bullet, but only as a qualifier — "display rich context *alongside* input controls." The insight from the gmail-cleanup dogfood is that surface earns its value for pure information display too: a rendered table of flagged transactions, a grouped list of candidates, a dashboard row — all communicate at a glance what chat walls cannot. Making this a first-class named use case (rather than a consequence of input-collection framing) helps agents reach for surface in the right moments. The defining property remains "ad-hoc input via a flexible, easily distributable interface"; information display is a strong complementary framing for the *display* half of the surface's value, not a replacement of the definition.

---

## 2026-05-28 · Multi-recipient attribution is a caller concern; the trust boundary is named, not enforced

**Request:** Should the hosted worker support a `recipients` field at provision time, generating per-recipient URLs or tokens so submissions are attributed by construction rather than honor-system? Trigger: a Japan-trip-planning dogfood surface where two people submitted independently and self-declared identity via a "who are you?" button.

**Decision:** Option 3 — name the trust boundary explicitly in the skill docs and keep attribution honor-system by default. Per-recipient URLs are already the recommended path in `security.md` §7; the caller layers them when attribution matters. No schema change, no wire change, no `recipients` field in the hosted worker.

**Reasoning:** The skill already answers this question. `security.md` §7 names three attribution options — anonymous, per-recipient URLs, and sign-in — and calls per-recipient URLs "the v2-recommended middle ground for attributed multi-recipient use." The mechanism is already present: the agent mints one session per recipient (or uses a recipient-scoped token in the URL path). What is absent is a prescriptive `recipients` field in the provisioning schema. Adding that field would push operational state the agent should own into the hosted substrate, require the substrate to implement a new key-scoping concept, and — most importantly — contradict the "trust the agent" core principle. The agent can already derive per-recipient attribution from the pattern + security.md alone. Baking it into the wire as a first-class concept prescribes the one mechanism where the agent should exercise judgment (and might legitimately pick anonymous for low-stakes surfaces). The dogfood pain point (honor-system ID) is real but narrow: it reveals a docs gap, not a pattern gap. The fix is making security.md §7 more prominent in SKILL.md, not extending the wire. The trust boundary stands as documented: multi-recipient surface attribution is honor-system unless the caller layers per-recipient URLs; cryptographic attribution is out of scope for the pattern.

---

## 2026-05-28 · itemId affordance grouping is a caller concern, not a surface concern

**Request:** surface-voice-triage asked for the ability to group multiple affordances by a shared `itemId` on drain — so the agent receives a `(itemId, [submissions])` structure rather than flat submissions.

**Decision:** pushed back. itemId grouping is the agent's job, not surface's; the existing intent map already provides the mechanism. No wire change, no pattern change, no new first-class concept.

**Reasoning:** The surface pattern's intent field is explicitly "whatever the agent wants to remember about what should happen if that affordance is submitted — a string tag, a structured plan, a tool call, any JSON." That already covers structured metadata like `{"action": "approve", "itemId": "clip_42"}`. On drain, grouping by `itemId` is a one-liner pivot over the submissions using the intent map — a task the pattern explicitly leaves to the agent. Adding `itemId` as a first-class wire concept would be prescribing an operational pattern that any agent could derive from context. The failure mode named in CLAUDE.md core principles is over-specification; this is a textbook case. "Trust the agent" means trusting that the caller can put `itemId` in the intent and pivot on it after draining — surface doesn't need to bake in that grouping on its end. The wire already ships the data; the caller groups it.

**Clarification for callers:** to attach multiple affordances to one item, encode the item reference in the intent of each affordance (e.g., `"intent": {"action": "approve", "item_id": "clip_42"}`). After draining, group submissions by `intent.item_id`. This is already expressible with no changes to the pattern, wire, or skill content.

---

## 2026-05-23 · arc-rsv2 design brief feedback round — eight substantive calls

Andrew reviewed the `arc-reach-surface-v2` umbrella design brief and provided feedback that produced eight substantive design-semantics changes. Recorded together because they came from one review pass; each is independently re-litigable.

### Team is a recipient kind, not a lifetime

**Prior framing:** `lifetime: ephemeral | enduring | team` as a single axis in recipient descriptors.

**Decision:** split into two orthogonal axes. `lifetime: ephemeral | enduring` and `kind: individual | team`. A team can be ephemeral (ad-hoc group for one task) or enduring (standing care team). Collapsing them conflated "how long does this recipient live?" with "does this recipient resolve to multiple individuals?"

### Direct-KV-write is not blessed — needs investigation

**Prior framing:** the Sasank-session direct-KV-write bypass is "the documented happy path" and "one of two legitimate provisioning shapes."

**Decision:** rejected the blessing. The bypass may skip security-relevant state (CSRF token generation, provisioning auth). Flagged for investigation in the implementation plan: determine whether direct KV writes reproduce the full state contract, whether the token just needs a documented retrieval path, or whether the provisioning model needs rethinking. The brief does not bless either path pending investigation.

**Reasoning:** Andrew recalled CSRF concerns and observed that the original session minted the token as part of session setup, meaning future sessions losing access was an unintentional gap, not a design choice. Promoting a workaround to a happy path without verifying it doesn't bypass intended protections violates P2 (setup gaps surface, don't get worked around).

### Third-party security rule: strong default with operator-trust override

**Prior framing:** "load-bearing rule" — any submission from a non-operator is untrusted, full stop.

**Decision:** the default posture is still strong (untrusted by default), but the operator can declare specific recipients or surfaces as trusted for instruction-bearing input. Collaboration surfaces where trusted collaborators give the agent instructions are a real use case; making the rule absolute would prevent them.

**Reasoning:** the injection vector is real and the default should protect against it. But "load-bearing" with no override constrains collaboration. The operator's explicit trust declaration is the escape hatch — the agent doesn't infer trust, the operator declares it.

### P1: trust the agent by default, don't enumerate all decision axes

**Prior framing:** the skill names "the agent's load-bearing decisions + the axes those decisions live on + the criteria for choosing on each axis." Under-prescription called out as a failure mode equal to over-prescription.

**Decision:** the failure mode is over-prescription, not under-prescription. The skill may give one example of an axis to illustrate the kind of reasoning, but doesn't enumerate all axes — doing so risks constraining the agent to the listed set and discouraging judgment about unlisted ones.

**Reasoning:** Andrew: "as models continue to advance, being too proscriptive here constrains them in the future. We're effectively telling the model, yes you'll have to make choices. If we enumerate all the choices, we're artificially scoping things." Default stance toward the agent: trust your judgment, use the situational context to make good choices.

### Shared environment path deferred entirely (not just schema)

**Prior framing:** commit to `~/.aac-env/` as the shared path, defer only the schema.

**Decision:** defer both path and schema. `~/.aac-env/` uses a personal handle; no shared path is committed until observable overlap data exists from two skills running in production.

### Surface version starts at 0.1.0, not 0.2.0

**Prior framing:** `0.2.0` because "v2" in the arc name means the second generation.

**Decision:** `0.1.0`. Surface is a new skill with its own version line; "v2" in the arc name refers to the design generation, not the semver. Starting at 0.2.0 implies inherited version history that doesn't exist.

### Credential retrieval from secure storage is the optimal path, not a thing to avoid

**Prior framing:** "The credential classifier never trips a documented happy path because the documented happy path never reads from keychain, env, or shell history at execution time."

**Decision:** the environment file CAN and SHOULD document bounded retrieval paths from secure storage (keychain, encrypted vaults). "Read keychain entry X" is a specific, bounded action — not open-ended scanning. The optimal scenario is credentials in secure storage with a documented retrieval path, not avoidance of secure storage.

### Personal identifiers excluded from produced skills and docs

**Decision:** the brief can reference specific people and environments for design-history context. The produced skills and documentation must not contain contributor-specific names, environments, handles, or deployment URLs. Examples use generic placeholders.

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

**Decision:** rejected. The validating question is "can the agent build a working poke-like server from `SKILL.md`, `references/`, and the brief alone?" — not "does it match an existing sibling impl byte-for-byte?" Codified in `AGENTS.md` §"Testing the skill" and in commit `011bc3c` (act-6fb6).

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

**Decision:** deferred to v1. v0 ships only the skill bundle — `SKILL.md`, `references/`, `examples/server.go` as a reference impl agents read and re-implement themselves. Recorded in `README.md` §"Not in scope (yet)."

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

**Reasoning:** SKILL.md stays focused on the pattern. Caveats inlined into the entry point dilute the value of the skill and crowd out the load-bearing content. The reference is one click away; agents that need it will load it. Recorded in `AGENTS.md` core principles (§"Security lives in its own reference").
