# arc-rsv2: plan review -- reach (cold-eye)

**Arc:** `arc-reach-surface-v2`
**Ticket:** `act-bde4f5`
**Plan reviewed:** `docs/arc-reach-surface-v2-plan-reach.md`
**Upstream spec:** `docs/arc-reach-surface-v2-design.md` (frozen)
**Synthesis carry-forwards:** `docs/reviews/arc-rsv2-synthesis-r2-2026-05-23.md`
**Reviewer stance:** cold-eye (first-principles challenge; I am not the plan author)

**Documents read:** plan (603 lines), frozen design brief (641 lines), round-2 synthesis, CLAUDE.md, process-learnings.

---

## Findings

### Must-fix

**M1. R5 filename contradicts the rename.** The plan renames the concept from "adapters" to "channels" throughout, names the section "Channel shape," but keeps the filename `references/adapter-shape.md` and says the rename is "implementer's call." This isn't an implementer's call -- it's a first-principles consistency issue. The plan introduces a naming rule (section 3: "v2 uses 'channels' consistently") and then immediately violates it at the file level. A fresh agent reading the directory listing will see `adapter-shape.md` and infer the adapter concept still exists. The plan should either commit to `references/channel-shape.md` or explain why the old filename is preserved (e.g., external references).
**Confidence:** high (95%). The plan explicitly states a naming rule and breaks it in the same document.

**M2. Circular dependency in Phase 3.** R7 (setup-workflow) depends on R15 (migration), but R15 is in Phase 1 and R7 is in Phase 3. That's fine on its own. However, R7's acceptance criteria (section 13) says "migration detection: if v0 layout detected, offer migration" -- meaning R7 must reference R15's content. But section 11 (migration path) describes the migration as "offered during the first v2 setup conversation," making the migration a *part of* the setup workflow, not just a reference from it. R7 and R15 have tighter coupling than the dependency graph suggests. The plan should clarify whether R15 is a self-contained reference document or whether R7 subsumes the migration conversation flow, with R15 only documenting the file-level mechanics.
**Confidence:** moderate (70%). The plan might intend for R15 to be the mechanical reference and R7 to describe the conversational flow that invokes it, but this intent is not stated. An implementer could produce two documents that overlap or contradict each other.

### Should-fix

**S1. The "degenerate case" escape hatch weakens the migration path.** Section 3 says single-recipient channels CAN hardcode the recipient and skip `{recipient}`. Section 11 says migration extracts recipients into separate files. These two rules create ambiguity: during migration of a self-only `imessage-self.md` adapter, does the agent (a) split into `channels/imessage.md` with `{recipient}` + `recipients/self.md`, or (b) write `channels/imessage.md` with the hardcoded number (degenerate case) and skip creating a recipient entry? Both are valid under the plan. The migration section should state which path is taken, or explicitly leave it to the agent with a note that both are correct. Otherwise two different migration agents will produce incompatible registry layouts for the same input.
**Confidence:** high (85%). The plan describes both paths but doesn't state which the migration uses.

**S2. The plan over-specifies the SKILL.md section numbering.** Section 2 lays out a 14-section outline with specific content per section. This is substantial prescription for a skill whose core principle (P1) says "trust the agent" and whose CLAUDE.md says "over-specification is the failure mode." The design brief explicitly says "the brief does not draft SKILL.md content" and "the exact wording is the implementer's call." The plan then provides a near-complete table of contents with per-section content outlines. This constrains the SKILL.md author's judgment on structure, ordering, and emphasis in ways the frozen spec deliberately avoided. A section-level outline is useful; the issue is the prescriptive detail within each section (e.g., "Add: reach delivers payloads of any shape" is content direction, not structural guidance).
**Confidence:** moderate (70%). Plans inherently need more specificity than briefs, and there's a judgment call about where the line sits. But the plan names specific sentences and content adds that feel like drafting, not planning.

**S3. `{url}` backward-compatibility tolerance is under-specified.** Section 6 says "agents encountering `{url}` in a channel file should treat it as equivalent to `{payload}`" and section 11 says this is documented in R15. But the plan doesn't say how long this tolerance lasts or how it terminates. Is `{url}` supported indefinitely? Is there a deprecation signal? What happens when an agent writes a *new* channel file -- can it use `{url}`? Without a lifecycle for the tolerance, it becomes a permanent second token that agents must know about forever, defeating the rename.
**Confidence:** moderate (75%). This might be intentionally left to agent judgment, but the plan documents a specific tolerance without bounding it.

**S4. Missing explicit test for the recipient-descriptor model at implementation time.** The plan has dogfood validation criteria (section 14) but no acceptance criteria for the recipient-descriptor *file format* itself. R4's acceptance criteria (section 13) are structural ("file shape matches design brief"), but there's no "an agent can read a recipient descriptor, resolve the delivery section, and compose it with a channel" validation step at any phase gate. The wire works in the plan's prose; the question is whether the plan's implementer would know to verify composition works, not just that the file format is correct.
**Confidence:** moderate (65%). Dogfood case 2 (one-off friend) exercises this end-to-end, but that's Phase 6-equivalent validation, not a Phase 2 gate when the format is being written.

### Notes

**N1. Team descriptor circular references are unaddressed.** A team's `## Delivery` fan-out lists member recipient IDs. Nothing prevents a team from listing another team, which lists the first team. The plan doesn't need to prevent this, but the absence of a note about it means an implementer might not consider it. The references/recipient-descriptors.md (R4) is where a one-line "circular fan-out is the agent's responsibility to avoid" note would go.
**Confidence:** moderate (60%). This is an edge case, and the "trust the agent" principle suggests not over-specifying it. But it's the kind of thing that produces an infinite loop at send time if unaddressed.

**N2. The plan is appropriately scoped for its brief.** Carry-forward items from the round-2 synthesis (trusted free-text scope calibration, double judgment call, collaboration trust + URL forwarding walkthrough) are all accounted for in R8's acceptance criteria. The plan does not introduce new concepts beyond what the brief settled. The dependency graph is sound (modulo M2's coupling observation). The six-phase structure with clear parallelism is well-suited for agent dispatch.

**N3. Environment file preflight verification timing.** The plan says (section 8, lifecycle item 3) that preflight verification happens "at session start." The plan is for the reach *skill*, not a session-start hook. Who triggers preflight? If the agent loads reach mid-session, does it verify then? The brief says "at the start of each session," which the plan faithfully reproduces -- but the mechanism is the agent's choice, and the plan could note that "session start" means "first reach invocation in a session" rather than implying a hook.
**Confidence:** low (50%). This might be intentionally left to agent judgment per P1.

---

## Verdict: **proceed**, with M1 and M2 addressed

The plan is well-structured, faithful to the frozen design brief, and appropriately decomposed for parallel dispatch. The two must-fix items are narrow and low-cost to address: M1 is a filename decision (one line), M2 is a clarification of the R7/R15 boundary (one paragraph). The should-fix items are real but bounded -- S1 is the most substantive (migration ambiguity), and the remaining items are judgment calls where the plan is close to the right level of specificity.

The channel/recipient separation is the right cut. The plan correctly preserves the degenerate case (single-recipient channels stay simple) while making multi-recipient first-class. The recipient-descriptor model adds complexity that pays off: the one-off-friend case drops from 12 turns to 2-3, and team support falls out of the same shape. The migration path is realistic -- assisted-not-automatic is correct, and coexistence of `adapters/` and `channels/` is pragmatic.

The plan leaves appropriate room for agent judgment on operational concerns (reporting shape for partial delivery, recipient cleanup cadence, preflight verification mechanism) while pinning the structural decisions that need consistency across implementers (file shapes, token substitution surface, send signature).
