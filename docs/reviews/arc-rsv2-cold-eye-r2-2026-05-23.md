# arc-rsv2 cold-eye review -- round 2

**Reviewer stance:** cold-eye / first-principles. Same reviewer as round 1.

**Artifact:** `docs/arc-reach-surface-v2-design.md` (revised per synthesis must-fix list)

**Date:** 2026-05-23

**Prior review:** `docs/reviews/arc-rsv2-cold-eye-2026-05-23.md` (round 1)

---

## Disposition of round-1 findings

### Must-fix item 1: Preflight verification step (my Stance 7b)

**Addressed.** Section G now includes a "Preflight verification" subsection. The agent reads `environment.md` at session start and verifies named credential locations are still reachable; stale locations surface per P2 with an offer to re-run setup. This is exactly the addition I requested. The framing is right: it closes the staleness gap the setup/execution split alone leaves open, and it stays bounded (verify named locations, not scan).

### Must-fix item 5: Collaboration canvas stress test framing (my Stance 5)

**Addressed.** Section I case 2 now reads "Collaboration trust model: validated in v2. Collaboration infrastructure: design-compatible but not validated -- requires capabilities v2 does not spec." This replaces the prior "not broken; not fully supported" language and is honest about what v2 actually provides. The two-layer split (trust model vs infrastructure) is a precise decomposition.

### Must-fix item 7: Pin constraints, not exact prose (my Stance 6 / Q4)

**Addressed.** Section D and Q4 now pin six numbered constraints (generic framing, explicit skill paths, placement in when-to-use/examples, reach not URL-specific, in-session delivery can open the browser, reach preferred over direct send). Below the constraints: "What's left to SKILL.md drafters: the exact wording." This is the right shape -- pass/fail criteria without prescribing sentences. The prior version's pinned prose is gone. Improvement confirmed.

### Must-fix item 6: Partial delivery failure (synthesis item, my Stance 7c contributed)

**Addressed.** Section E "Send-time semantics" now includes a "Partial delivery" paragraph requiring per-recipient delivery outcomes. The wording is: "The agent must know per-recipient delivery outcomes -- which recipients received the message and which did not. Details of the outcome shape are deferred to the implementation plan, but the requirement is fixed." This is the right level -- names the requirement, defers the shape. Consistent with P1 (name the question).

### Must-fix items 2, 3, 4 (from other reviewers; checking for coherence)

**Item 2 (per-recipient trust stronger than per-surface trust).** Addressed in Section F, subsection "URL forwarding and trust granularity" (item 7 in the security reference list). Names the risk that per-surface trust is defeated by forwarding, per-recipient trust is not. Does not prescribe which to use -- agent's call. Coherent with P1.

**Item 3 (preflight verification).** Same as my item 1 above. Addressed.

**Item 4 (harness-classifier gap).** Addressed in Section G "Why this avoids credential-classifier collisions," final bullet. Notes that harness-level classifiers may still block named reads; if so, P2 applies. This is the right framing -- the skill structures access for informed classifier decisions but doesn't promise classifier behavior.

### Must-fix item 8: Symlinks + cross-repo path audit in cutover (architect review)

**Addressed.** Section H "Cutover" now has six numbered steps. Step 5 covers symlink updates after `git mv`, including removing dogfood-period symlinks. Step 6 covers cross-repo path audit (grep downstream repos and dotfiles for old skill paths). Both items the architect flagged are now explicit.

---

## New concerns in the revised brief

### The collaboration trust model (Section F) -- coherence check

The collaboration trust model is the largest new content in the revision. I examine it for coherence with the rest of the brief and with P1.

**What's good:** The three-layer structure is clean: (a) default-untrusted for all non-operator submissions, (b) operator-trust override for specific recipients, (c) even under trust, the envelope/content boundary applies with different semantics. The "trusted submissions and the envelope/content boundary" subsection is the synthesis's must-fix item 1 and is handled well -- trusted recipients' structured affordances are instructions; trusted recipients' free-text CAN be instructions within scope; the residual risk (compromised account, scope exceed) is named as an accepted tradeoff the operator opted into.

**Where it sits with P1:** The trust model names the default posture and the override mechanism. It does not prescribe how trust is declared -- "the mechanism is the agent's judgment informed by the operator's intent" is explicitly stated. This is P1-consistent. The skill names the question (when is a recipient trusted?); the agent decides.

**One observation, not a would-block:** The free-text treatment for trusted recipients is the most nuanced part of the model. The brief says trusted free-text "CAN be treated as instructions within the scope of the surface's purpose. The agent uses judgment about whether the instruction is reasonable and within scope." This is correct but introduces a double judgment call: the agent decides both (a) whether the recipient is trusted and (b) whether the trusted recipient's instruction is in scope. That's a lot of inference for an agent to get right, especially under the collaboration-canvas case where the scope of "within the surface's purpose" is inherently broad. The brief is right not to prescribe more -- but the implementation plan should note this as a high-attention area for the security reference. Not blocking.

### Consistency with P1 (trust the agent) -- full pass

The revised brief is more consistent with P1 than the round-1 version. The Q4 change (constraints not prose) was the biggest P1-consistency fix. The remaining wire shapes (recipient descriptors in Section E, environment files in Section G) are still detailed, but my round-1 review already noted these are appropriate at reference level, not SKILL.md level. The synthesis deferred this to the implementation plan ("wire shapes are reference-level content"), which is the right placement decision. No new P1 violations introduced by the revision.

### Brief self-consistency

No internal contradictions found. The collaboration trust model in Section F is consistent with the security reference item list (items 1-7 all cohere). The preflight verification in Section G is consistent with P2 and P3. The cutover checklist in Section H is consistent with the new-directories rollout model. The stress tests in Section I correctly reference the updated Section F framing for the collaboration canvas case.

---

## Round-1 items NOT in the must-fix list -- status check

These were noted as "deferred to implementation planning" in the synthesis. Confirming the brief correctly does not address them (and should not -- they're implementation-plan scope):

- **Urgency semantics in reach (my Stance 5, medical team case).** Not addressed in the brief. Correct -- this is a SKILL.md drafting concern, not a brief concern.
- **Wire shapes as reference-level content (my Stance 6).** Not addressed in the brief. Correct -- deferred to implementation plan per synthesis.
- **Environment file portability (my Stance 7a).** Not addressed in the brief. Correct -- follow-on concern.
- **Cron-only worker setup (my Stance 7a).** Not addressed. Correct -- follow-on.

All four are correctly deferred.

---

## Round-1 positive findings -- do they still hold?

1. **P3 as architecture.** Still the load-bearing contribution. Preflight verification strengthens it.
2. **Recipient descriptors with orthogonal axes.** Unchanged and still clean.
3. **Security model with operator-trust override.** Strengthened by the collaboration trust model, URL forwarding granularity, and trusted-submission envelope/content treatment.
4. **New directories, not in-place edits.** Unchanged. Cutover checklist improved.
5. **Full deferral of shared environment substrate.** Unchanged.
6. **Q7 investigation flag.** Unchanged.
7. **"Task-shaped" rewording.** Unchanged.

All hold.

---

## Verdict-shaped summary

**Verdict: proceed to plan stage.**

All eight must-fix items from the round-1 synthesis are addressed. No must-fix items remain open. No new blocking concerns introduced by the revision. The collaboration trust model is coherent with the rest of the brief and with P1. The brief is internally consistent.

The one observation I'd carry forward to the implementation plan: the double judgment call in trusted free-text handling (is the recipient trusted? is the instruction in scope?) is worth flagging as a high-attention area for the security reference's examples and walkthroughs. This is implementation-plan scope, not a brief revision.

The rename (poke to surface) -- my round-1 disagreement -- stands per the synthesis. I do not re-litigate it.

The brief is ready for plan-stage work.
