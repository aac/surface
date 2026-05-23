# arc-rsv2: plan-stage synthesis

**Arc:** `arc-reach-surface-v2`
**Ticket:** `act-2b453e`
**Date:** 2026-05-23
**Inputs:** four plan reviews (reach cold-eye, reach architect, surface cold-eye, surface architect), both plans, frozen design brief, round-2 design synthesis

---

## 1. Verdict: **proceed**

Both plans are ready for implementation after the must-fix items below are addressed. All four reviewers reached proceed or proceed-with-fixes verdicts. The reach plan is well-structured with sound channel/recipient separation, correct backward compatibility, and a realistic migration path. The surface plan is faithful to the frozen design brief, addresses all three design-synthesis carry-forward items concretely, and is appropriately non-prescriptive per P1. The must-fix items are narrow corrections -- a filename decision, a dependency edge fix, and a graph cleanup -- none requiring architectural rethinking.

---

## 2. Must-fix items

### Reach plan

**MF-R1. R5 filename: rename to `channel-shape.md`.**
*Flagged by:* reach cold-eye (M1, 95% confidence), reach architect (M1, high confidence).
*Convergence:* yes -- both independent reviewers flagged the same issue from different angles (cold-eye: naming-rule self-violation; architect: cross-deliverable link targets).
*Assessment:* genuine. The plan introduces a naming rule ("v2 uses 'channels' consistently") and then leaves the filename as `adapter-shape.md` with "implementer's call." This is a plan-level decision that affects R1 and R3 cross-references. The "file continuity" rationale doesn't apply -- this is a new directory (`skills/reach-v2/`), so there are no existing external references to preserve.
*Remediation:* rename R5 from `references/adapter-shape.md` to `references/channel-shape.md` in the deliverable table, dep graph, and acceptance criteria. One-line change in several places.

**MF-R2. R15 dependency on R4.**
*Flagged by:* reach architect (M2, high confidence). Reach cold-eye flagged the adjacent issue (M2, 70% confidence) -- the R7/R15 coupling -- which has the same root cause: R15's independence claim is wrong.
*Convergence:* partial -- both reviewers see coupling issues with R15, though from different angles. The architect's finding is the structural one (R15 must describe the recipient descriptor shape to explain where extracted handles land); the cold-eye's finding is the organizational one (R7 subsumes R15's conversational flow).
*Assessment:* genuine. R15 cannot be written without knowing R4's file shape. Two options: (a) move R15 to Phase 2, or (b) keep R15 in Phase 1 with an explicit note that it forward-references the recipient descriptor shape from the design brief (not from R4). Option (b) is cleaner -- the design brief is frozen and available; R15 can reference the brief's shape directly. Phase 1 stays at 4 parallel items.
*Remediation:* add explicit note to R15 that it references the recipient descriptor shape from the frozen design brief, not from R4. Add R4 as a soft dependency (R15 should be reviewed for consistency with R4 after R4 lands, but doesn't block on it). Separately, add a one-sentence clarification to R7 that the migration *conversation flow* lives in R7's setup workflow, while R15 documents the *file-level mechanics* that R7 invokes.

### Surface plan

**MF-S1. Dependency graph edges D2->D3/D4/D6 are incorrect.**
*Flagged by:* surface architect (M1, high confidence).
*Assessment:* genuine. The plan's own prose correctly groups D3, D4, D6 as independent of D2 in the parallelizable-units list (Group A). The ASCII dep graph contradicts this by drawing D3, D4, D6 as children of D2. The prose is correct -- these are mechanical naming ports with no content dependency on D2's collaboration trust model.
*Remediation:* remove the D2->D3, D2->D4, D2->D6 edges from the ASCII dep graph. D3, D4, D6 remain in Pass 1 as independent items. Only D2->D5 is a real dependency.

**MF-S2. D9 dependency is on D1, not D8.**
*Flagged by:* surface architect (M2, high confidence), surface cold-eye (S2, high confidence).
*Convergence:* yes -- both reviewers independently identified the same incorrect edge.
*Assessment:* genuine. The symlink targets the filesystem path `~/Workspace/poke/skills/surface`, which exists as soon as SKILL.md (D1) is written. Plugin.json registration (D8) is unrelated to symlink creation.
*Remediation:* change D9's dependency from D8 to D1. D9 can run in parallel with D8 in Pass 4, or even be treated as a Pass 3 followup after D1.

---

## 3. Should-fix items

### Reach plan

**SF-R1. Migration path ambiguity for self-only channels.**
*Flagged by:* reach cold-eye (S1, 85% confidence).
*Assessment:* genuine but bounded. The plan documents both the degenerate case (self-only channels can hardcode the recipient) and the migration path (extract recipients into separate files). For migration specifically, the cleaner path is to always split -- create `channels/imessage.md` with `{recipient}` + `recipients/self.md` -- because this gives the contributor a working multi-recipient-ready setup without a second migration later. The degenerate case is for *new* self-only channel files, not migrated ones.
*Remediation:* add one sentence to section 11: "Migration always splits to the full model (`{recipient}` token + `recipients/self.md`). The degenerate case (hardcoded recipient in channel file) applies to new self-only channels created after migration, not to migrated files."

**SF-R2. `credentials` file assumption in migration section.**
*Flagged by:* reach architect (S1, high confidence) -- verified against actual on-disk state.
*Assessment:* genuine. The v0 install has no `credentials` file. The migration section lists it as a given.
*Remediation:* change "unchanged in v2" to "unchanged in v2 if present" for the `credentials` entry in section 11.

**SF-R3. R6 should depend on R2 in addition to R4.**
*Flagged by:* reach architect (S2, medium confidence).
*Assessment:* genuine but low-impact. R6's "per-recipient preferences live in recipient descriptors, not in the global file" framing is grounded in R2's invariant 2. In practice the design brief provides this context, so the implementer won't be lost. Still, the dep graph should be accurate.
*Remediation:* add R2 as a dependency for R6 in the Phase 3 table. No phase restructuring needed (R2 is Phase 1).

**SF-R4. `{url}` backward-compat tolerance documented in R15 but not R5.**
*Flagged by:* reach architect (S3, medium confidence).
*Assessment:* genuine. An implementer working on a channel file consults R5, not R15. One sentence in R5 noting the tolerance is sufficient.
*Remediation:* add to R5 acceptance criteria: "Notes `{url}` as a deprecated alias for `{payload}`, tolerated during migration."

### Surface plan

**SF-S1. Plugin.json version lockstep creates a false signal during coexistence.**
*Flagged by:* surface cold-eye (S1, high confidence), surface architect (S2, medium confidence).
*Convergence:* yes -- both reviewers flagged the same versioning ambiguity.
*Assessment:* genuine. During dogfood coexistence, plugin.json can't track two skills' versions simultaneously without breaking the eyeball-compare signal for one of them.
*Remediation:* keep plugin.json version at `0.1.0` (tracking poke, the active production skill) until cutover. Surface's version is tracked only in its own SKILL.md frontmatter (`0.1.0-alpha.1`). Update D8 acceptance criteria accordingly.

**SF-S2. D1 needs an AC for the collaboration trust model pointer.**
*Flagged by:* surface architect (S1, high confidence).
*Assessment:* genuine. Brief section F makes the collaboration trust model native to v2. SKILL.md's security section should name it, not just gesture at an "expanded headline."
*Remediation:* add AC to D1: "Section 9 names the collaboration trust model (default untrusted, operator-trust override) and points to security.md for the full model."

### Cross-plan

**SF-X1. Reach plan SKILL.md section outline is arguably over-prescribed.**
*Flagged by:* reach cold-eye (S2, 70% confidence).
*Assessment:* borderline. The cold-eye is right that a 14-section outline with per-section content adds verges on drafting, not planning. However, the plan-level outline serves a real purpose: it's the acceptance-criteria backbone for R1 and ensures coverage of all v2 concepts. The design brief deferred SKILL.md prose to this phase; the plan needs to specify *what* the SKILL.md covers without specifying *how* it says it. The current outline is on the prescriptive side of that line but not over it. The content-direction items ("Add: reach delivers payloads of any shape") are coverage flags, not prose direction.
*Disposition:* acknowledge but do not remediate. The implementer should treat the section plan as a coverage checklist, not a structural mandate. If a different section organization better serves the content, the implementer should use it.

---

## 4. Notes

**N1. Team descriptor circular references.** Reach cold-eye (N1) noted that nothing prevents circular fan-out (team A lists team B, team B lists team A). The "trust the agent" principle suggests not over-specifying, but a one-line note in R4 ("circular fan-out is the agent's responsibility to avoid") prevents an infinite loop at send time. Worth including; not blocking.

**N2. "Attack surface" phrasing avoidance should apply uniformly.** Surface cold-eye (N2) noted the authoring mitigation is flagged in D5 (security.md) but not D2 (pattern.md). Low risk since pattern.md is less security-focused, but the mitigation should be a blanket note for all v2 content.

**N3. Environment file preflight timing.** Reach cold-eye (N3) noted that "at session start" really means "at first reach invocation in a session." This is correctly left to agent judgment per P1.

**N4. Mechanical port deliverables (surface D3/D4/D6) are dispatch-and-forget.** Surface cold-eye (N1) noted these are trivially verifiable -- diff should show only naming changes. Useful orchestration signal.

**N5. `{url}` deprecation lifecycle.** Reach cold-eye (S3) asked how long the `{url}` tolerance lasts. Not blocking -- the tolerance exists for migration, and the natural termination is "when no channel files use `{url}` anymore." No explicit deprecation timeline needed for a skill consumed by agents, not humans.

---

## 5. Implementation ticket draft

Tickets are grouped by repo. Each ticket is scoped for a single agent dispatch. Dependencies reference other tickets in the same list by their draft ID (e.g., "blocks on T-R1").

### Reach tickets (filed in `~/Workspace/reach/.act/`)

**T-R1: Pattern reference (R2)**
*Scope:* Write `skills/reach-v2/references/pattern.md` -- six invariants updated per the plan (registry layout, channel/recipient split, send signature, atomic writes for recipients, partial delivery requirement). Terms section updated (adapter->channel, new terms). Normative/illustrative boundary preserved.
*ACs:* (1) Six invariants present with v2 updates. (2) Partial delivery failure named as send-time requirement. (3) Terms section updated. (4) No personal identifiers.
*Deps:* none.

**T-R2: Recipient descriptors reference (R4)**
*Scope:* Write `skills/reach-v2/references/recipient-descriptors.md` -- file shape, lifetime/kind axes, delivery modes, lifecycle (creation, promotion, deletion, self-recipient), provenance discipline. Include one-line note about circular fan-out being the agent's responsibility to avoid.
*ACs:* (1) File shape matches design brief section E. (2) Lifetime and kind axes documented. (3) Three delivery modes documented. (4) Lifecycle documented. (5) No personal identifiers.
*Deps:* none.

**T-R3: Environment reference (R9)**
*Scope:* Write `skills/reach-v2/references/environment.md` -- file shape, channels/tools/credentials sections, preflight verification, harness-classifier interaction.
*ACs:* (1) File shape matches design brief section G. (2) Preflight verification documented. (3) Never contains raw credentials -- only locations. (4) Harness-classifier interaction noted.
*Deps:* none.

**T-R4: Migration reference (R15)**
*Scope:* Write `skills/reach-v2/references/migration.md` -- v0 layout detection, per-adapter migration steps, `{url}`->`{payload}` tolerance, coexistence model. Reference recipient descriptor shape from the frozen design brief (not from R4). Migration always splits to full model (no degenerate case during migration). Note `credentials` may not be present.
*ACs:* (1) V0 detection criteria documented. (2) Per-adapter migration steps documented. (3) Token tolerance documented. (4) Old `adapters/` preserved, not deleted. (5) `credentials` listed as "unchanged if present."
*Deps:* none. Soft dep on T-R2 for consistency review.

**T-R5: Wire reference (R3)**
*Scope:* Write `skills/reach-v2/references/wire.md` -- updated substitution surface (`{message}`, `{payload}`, `{recipient}`), payload contract, partial delivery requirement, recipient resolution, multi-recipient iteration, `{url}` backward-compat note.
*ACs:* (1) Substitution surface updated. (2) Partial delivery requirement as send-time pin. (3) Recipient resolution documented. (4) `{url}` backward-compat noted.
*Deps:* T-R1, T-R2.

**T-R6: Channel shape reference (R5)**
*Scope:* Write `skills/reach-v2/references/channel-shape.md` (renamed from `adapter-shape.md`). Five required sections, `{recipient}` and `{payload}` tokens in call shape examples, degenerate self-only case documented, `{url}` noted as deprecated alias for `{payload}`.
*ACs:* (1) Filename is `channel-shape.md`. (2) Five sections present. (3) `{recipient}` and `{payload}` tokens in examples. (4) Degenerate case documented. (5) `{url}` deprecation note present.
*Deps:* T-R1, T-R2.

**T-R7: Preferences reference (R6)**
*Scope:* Write `skills/reach-v2/references/preferences.md` -- global preferences unchanged, new section on per-recipient preferences in descriptors, conflict resolution.
*ACs:* (1) Global structure unchanged. (2) Per-recipient prefs location documented. (3) Conflict resolution unchanged.
*Deps:* T-R1, T-R2.

**T-R8: Setup workflow reference (R7)**
*Scope:* Write `skills/reach-v2/references/setup-workflow.md` -- channel setup (5-step spine minus hardcoded recipients), recipient creation (lightweight conversational workflow), environment file creation, migration detection and conversational flow. The migration conversation flow lives here; R15 documents the file-level mechanics this workflow invokes.
*ACs:* (1) Channel setup spine preserved minus hardcoded recipients. (2) Recipient creation workflow documented. (3) Environment file creation documented. (4) Migration detection and flow documented. (5) Sample conversation updated.
*Deps:* T-R5, T-R2, T-R3, T-R4.

**T-R9: Security reference (R8)**
*Scope:* Write `skills/reach-v2/references/security.md` -- v0 must-fix items updated (adapter provenance extended to recipient descriptor provenance), new v2 items (partial delivery transparency, recipient descriptor provenance), carry-forward items from design synthesis (trusted free-text scope calibration, double judgment call, collaboration trust + URL forwarding walkthrough).
*ACs:* (1) V0 items preserved and updated. (2) New v2 items present. (3) Carry-forward items addressed. (4) Avoid "attack surface" phrasing.
*Deps:* T-R5, T-R2.

**T-R10: Channel examples (R10, R11)**
*Scope:* Write `skills/reach-v2/examples/ambient-auth-adapter.md` and `credential-store-adapter.md` -- iMessage and Pushover channels updated with `{recipient}` and `{payload}` tokens, degenerate self-only case noted.
*ACs:* (1) `{recipient}` replaces hardcoded handles. (2) `{payload}` replaces `{url}`. (3) Degenerate case noted.
*Deps:* T-R6.

**T-R11: Recipient examples (R12, R13)**
*Scope:* Write `skills/reach-v2/examples/recipient-individual.md` and `recipient-team.md` -- individual ephemeral recipient, team recipient showing both fan-out and shared-channel delivery modes. Generic placeholders.
*ACs:* (1) Individual example with ephemeral lifetime. (2) Team example with both delivery modes. (3) No personal identifiers.
*Deps:* T-R2.

**T-R12: SKILL.md (R1)**
*Scope:* Write `skills/reach-v2/SKILL.md` -- the entry point referencing all references and examples. Frontmatter version `0.2.0-alpha.1`. All v2 concepts present. Cross-reference to surface skill satisfying brief section B.Q4 constraints. Treat the plan's section outline as a coverage checklist, not a structural mandate.
*ACs:* (1) Frontmatter version is `0.2.0-alpha.1`. (2) All v2 concepts present. (3) Cross-reference satisfies brief Q4 constraints. (4) Passes substrate-agnostic test. (5) No personal identifiers, no harness-specific branching.
*Deps:* T-R1, T-R2, T-R3, T-R4, T-R5, T-R6, T-R7, T-R8, T-R9, T-R10, T-R11.

**T-R13: Symlink and smoke test (R14)**
*Scope:* Create symlink `~/.claude/skills/reach-v2` -> `~/Workspace/reach/skills/reach-v2`. Smoke test: a fresh agent session with reach-v2 loaded can read SKILL.md and enumerate the references.
*ACs:* (1) Symlink created and functional. (2) Smoke test passes.
*Deps:* T-R12.

### Surface tickets (filed in this repo's `.act/`)

**T-S1: Pattern reference (D2)**
*Scope:* Write `skills/surface/references/pattern.md` -- five invariants (fifth reworded to "task-shaped"), terms section, normative/illustrative distinction, new collaboration trust model section. Avoid "attack surface" phrasing.
*ACs:* (1) Five invariants present; invariant 5 uses "task-shaped." (2) Collaboration trust model section present with default posture, override, pointer to security.md. (3) No personal identifiers. (4) Normative/illustrative distinction preserved.
*Deps:* none.

**T-S2: Wire example reference (D3)**
*Scope:* Port `skills/poke/references/wire-example.md` to `skills/surface/references/wire-example.md` -- naming update only (`poke`->`surface`). No structural changes.
*ACs:* (1) All `poke` references replaced with `surface`. (2) State schema, routes, SUBMIT line format unchanged. (3) No personal identifiers.
*Deps:* none.

**T-S3: Lifecycle reference (D4)**
*Scope:* Port `skills/poke/references/lifecycle.md` to `skills/surface/references/lifecycle.md` -- naming update only.
*ACs:* (1) All `poke` references replaced with `surface`. (2) Four mechanism shapes preserved. (3) No personal identifiers.
*Deps:* none.

**T-S4: Hosted example reference (D6)**
*Scope:* Port `skills/poke/references/hosted-example.md` to `skills/surface/references/hosted-example.md` -- naming update, provisioning section generalized (Cloudflare Worker as one illustration, not canonical), personal deployment URLs removed, brief section J.3 investigation note as open question.
*ACs:* (1) All `poke` references replaced with `surface`. (2) Provisioning section leads with general rule. (3) No personal identifiers or deployment URLs. (4) Brief J.3 investigation note present.
*Deps:* none.

**T-S5: Example servers (D7)**
*Scope:* Port `skills/poke/examples/server.go`, `server_test.go`, `server.py` to `skills/surface/examples/` -- naming update only. No functional changes.
*ACs:* (1) `go build ./skills/surface/examples/` succeeds. (2) `go test ./skills/surface/examples/` passes. (3) `python3 skills/surface/examples/server.py --help` exits 0. (4) All `poke` references in comments/logs replaced with `surface`.
*Deps:* none.

**T-S6: Security reference (D5)**
*Scope:* Write `skills/surface/references/security.md` -- seven sections per the plan: envelope/content trust boundary, third-party-share default rule, operator-trust override and collaboration trust, trusted free-text scope calibration (carry-forward #1), collaboration trust + URL forwarding walkthrough (carry-forward #3), deployment posture, cross-tool replay and submission attribution. Double judgment call (carry-forward #2) exercised across sections 4 and 5. Avoid "attack surface" phrasing.
*ACs:* (1) All seven sections present. (2) Third-party-share default rule stated. (3) Collaboration trust model named. (4) Scope calibration example with concrete plausible-but-out-of-scope instruction. (5) URL forwarding walkthrough contrasting per-surface vs per-recipient trust. (6) Hosted provisioning generalized. (7) No personal identifiers. (8) "Attack surface" phrasing avoided.
*Deps:* T-S1.

**T-S7: SKILL.md (D1)**
*Scope:* Write `skills/surface/SKILL.md` -- nine sections per the plan. Frontmatter version `0.1.0-alpha.1`. Cross-reference to reach satisfying brief section B.Q4 constraints. Section 9 names the collaboration trust model and points to security.md.
*ACs:* (1) Frontmatter version `0.1.0-alpha.1`. (2) All nine sections present. (3) Cross-reference satisfies all six Q4 constraints. (4) Fifth invariant uses "task-shaped." (5) Section 7 names setup/execution split without containing environment file schema. (6) Section 9 names collaboration trust model (default untrusted, operator-trust override) and points to security.md. (7) No personal identifiers, no harness-specific branching.
*Deps:* T-S1, T-S2, T-S3, T-S4, T-S6.

**T-S8: Plugin manifest update (D8)**
*Scope:* Update `.claude-plugin/plugin.json` to register `skills/surface/` alongside `skills/poke/`. Keep version at `0.1.0` (tracking poke, the active production skill). Surface version tracked only in SKILL.md frontmatter until cutover.
*ACs:* (1) `plugin.json` lists both `skills/poke/` and `skills/surface/`. (2) Version remains `0.1.0`.
*Deps:* T-S7.

**T-S9: Symlink setup (D9)**
*Scope:* Create symlink `~/.claude/skills/surface` -> `~/Workspace/poke/skills/surface`. Existing `~/.claude/skills/poke` symlink stays in place.
*ACs:* (1) Symlink created and functional. (2) Poke symlink unchanged.
*Deps:* T-S7.

### Umbrella tickets (filed in this repo's `.act/`)

**T-U1: Dogfood -- reach v2 + surface v2**
*Scope:* Exercise both new skills against the validation cases from both plans: self-only send, one-off friend (target 2-3 turns), multi-recipient (3+ recipients, mixed channels), team fan-out, cron-triggered autonomous send, surface URL delivery, surface without reach. Validate the credential-classifier-collision fix (the original trigger session's failure case).
*ACs:* (1) All validation cases pass. (2) One-off friend case completes in 5 turns or fewer. (3) No credential-classifier collisions on autonomous send.
*Deps:* T-R13, T-S9.

**T-U2: Compound -- capture process learnings**
*Scope:* At the close of the arc, capture any process learnings from the v2 design-plan-implement cycle for `/compound`.
*ACs:* (1) Session run. (2) Any learnings captured.
*Deps:* T-U1.

---

## Dispatch sequencing

### Reach (in `~/Workspace/reach/`)

```
Pass 1 (parallel):  T-R1, T-R2, T-R3, T-R4
Pass 2 (parallel):  T-R5, T-R6, T-R7
Pass 3 (parallel):  T-R8, T-R9, T-R10, T-R11
Pass 4 (serial):    T-R12
Pass 5 (serial):    T-R13
```

### Surface (in this repo)

```
Pass 1 (parallel):  T-S1, T-S2, T-S3, T-S4, T-S5
Pass 2 (serial):    T-S6
Pass 3 (serial):    T-S7
Pass 4 (parallel):  T-S8, T-S9
```

Reach and surface passes can run concurrently -- there are no cross-plan dependencies until dogfood (T-U1).
