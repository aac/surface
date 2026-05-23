# arc-rsv2 design-stage synthesis -- round 2

**Arc:** `arc-reach-surface-v2`
**Date:** 2026-05-23
**Round:** 2
**Inputs:** architect review r2, cold-eye review r2, security review r2, round-1 synthesis, revised design brief
**Verdict:** **proceed** -- design converges. Plan stage can be filed.

---

## Reviewer summaries (round 2)

### Architect review

All round-1 must-fix items confirmed addressed. The cutover checklist now includes symlink updates (step 5) and cross-repo path audit (step 6). New content reviewed without concern: partial-delivery requirement in Section E is architecturally sound (per-recipient outcomes are a natural byproduct of fan-out iteration); collaboration trust model / infrastructure split in Section F is clean; constraints-not-prose in Q4 is strictly better than the prior pinned phrasing; preflight verification in Section G closes a real gap. No new architectural concerns introduced by the revisions. No new findings. Verdict: proceed.

### Cold-eye review

All eight synthesis must-fix items confirmed addressed, including the three the cold-eye originally raised (preflight verification, collaboration canvas reframing, constraints-not-prose). Cross-checked the other reviewers' must-fix items for coherence -- all hold. Full P1-consistency pass: the revised brief is more P1-consistent than round 1, primarily due to the Q4 constraints-not-prose change. Brief is internally self-consistent -- no contradictions found between collaboration trust model (Section F), security items (1-7), preflight verification (Section G), cutover checklist (Section H), and stress tests (Section I). One observation carried forward: the double judgment call in trusted free-text handling (is the recipient trusted? is the instruction in scope?) is worth flagging as a high-attention area for the security reference's examples. Not blocking; implementation-plan scope. The rename pushback is not re-litigated. Verdict: proceed.

### Security review

All four round-1 iterate-severity findings resolved: trust override granularity (Section F item 7), bounded retrieval vs harness classifier (Section G), content vs instruction for trusted submissions (Section F envelope/content extension), partial delivery failure (Section E). All four round-1 follow-on-severity findings remain correctly deferred. The collaboration trust model is assessed as the right tradeoff -- scope-bounded trusted free-text is more practical than the round-1 recommendation of structured-affordance-only trust. The security reviewer explicitly revised their own round-1 position, noting the prior recommendation was overly restrictive for collaboration use cases. Two new would-note findings: (1) "within the surface's scope" relies on agent inference -- one calibration example of a plausible-but-out-of-scope instruction would strengthen the security reference; (2) collaboration trust + URL forwarding interaction is already named in Section F item 7 but should be concretely walked in the security reference. Neither is blocking or iterate-level. Verdict: proceed.

---

## Comparison with round 1

### What converged

All eight round-1 must-fix items are resolved. Every reviewer independently confirmed this. The specific dispositions:

1. **Envelope/content trust boundary for trusted submissions** -- Section F now extends the boundary with nuanced scope-bounded semantics. The security reviewer revised their own round-1 recommendation (structured-affordance-only) to endorse the brief's softer position (trusted free-text CAN be instructions within scope) as more practical.
2. **Per-recipient trust stronger than per-surface trust** -- Section F item 7 names the URL-forwarding risk and the granularity tradeoff.
3. **Preflight verification** -- Section G now includes session-start verification of credential locations with P2 degradation.
4. **Harness-classifier gap acknowledgment** -- Section G explicitly notes the skill cannot guarantee classifier behavior; P2 applies if blocked.
5. **Collaboration canvas stress test reframing** -- Section I case 2 now reads "design-compatible but not validated" with the trust/infrastructure split named.
6. **Partial delivery failure** -- Section E send-time semantics now requires per-recipient delivery outcomes.
7. **Constraints not prose for cross-references** -- Section D / Q4 pins six testable constraints; drafters write the sentences.
8. **Symlink updates and cross-repo path audit** -- Section H cutover checklist now has six steps covering both.

### What's new in round 2

The collaboration trust model (Section F) is the largest new content in the revision. All three reviewers examined it; none found blocking or iterate-level issues. The cold-eye and security reviewers both noted the same observation from different angles: the double judgment call (recipient trust + instruction scope) is the most nuanced part, and the security reference should include calibration examples. This is convergent signal for the implementation plan, not a brief-level fix.

### Round-1 divergence -- status

The poke-to-surface rename was the only cross-reviewer divergence in round 1. The cold-eye reviewer explicitly does not re-litigate it in round 2. The divergence is resolved per the round-1 synthesis: the rename stands; authoring mitigations (rephrase P2's verb form, disambiguate "attack surface" in the security reference) are noted for SKILL.md drafting.

---

## Items to carry into the plan stage

These are note-level findings from round 2 that the implementation plans should address. None are brief-level fixes.

1. **Trusted free-text scope calibration.** Both cold-eye and security reviewers flagged that "within the surface's scope" is agent-inferred. The security reference should include one concrete example of a plausible-but-out-of-scope instruction (e.g., a collaborator asking the agent to send data to an external address) to calibrate agent judgment. (Source: security review Stance 1, cold-eye collaboration trust coherence check.)

2. **Double judgment call as high-attention area.** When a surface has trusted recipients submitting free-text, the agent makes two inference calls: (a) is the recipient trusted? and (b) is the instruction within scope? The security reference's examples and walkthroughs should exercise both calls, especially for cases where scope is inherently broad (collaboration canvas). (Source: cold-eye review, security review N1.)

3. **Collaboration trust + URL forwarding walkthrough.** The security reference should concretely walk the scenario where a trusted collaborator forwards a per-surface-trust URL to an outsider, so the agent has a worked example of the granularity choice. Already named in Section F item 7; the plan should ensure the security reference makes it concrete. (Source: security review N2.)

4. **Round-1 deferred items (unchanged, still deferred).** All items from the round-1 synthesis's "deferred to implementation planning" list remain correctly deferred: ephemeral recipient cleanup, per-recipient URL multiplication for attributed teams, urgency semantics, wire shapes as reference-level content, environment file portability, TTL exposure-window framework, per-recipient URL privacy, per-skill divergence as security benefit.

---

## Verdict: **proceed**

The design converges. All three reviewers independently reached "proceed to plan stage" with no blocking or iterate-level findings remaining. The eight round-1 must-fix items are all resolved. The two new would-note findings from the security reviewer and the one observation from the cold-eye reviewer are convergent (both point at the same area: trusted free-text scope calibration) and are implementation-plan scope, not brief-revision scope.

The brief is frozen as the spec for plan-stage work.

### Confirmation gate

Plan-stage tickets require Andrew's confirmation before filing. This synthesis is surfaced to Andrew; the orchestrator handles the confirmation step.
