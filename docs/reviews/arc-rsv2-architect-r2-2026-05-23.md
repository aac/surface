# arc-rsv2 architect review — round 2

**Reviewer stance:** architecture (shape and decomposition)
**Artifact:** `docs/arc-reach-surface-v2-design.md` (revised post-synthesis)
**Date:** 2026-05-23
**Prior review:** `docs/reviews/arc-rsv2-architect-2026-05-23.md`

---

## Disposition of round-1 must-fix items

### 1. Cutover checklist: symlink updates

**Addressed.** Section H now includes step 5 ("Update symlinks") with explicit instructions to update or recreate symlinks after `git mv` and remove dogfood-period symlinks. The dangling-reference failure mode is covered.

### 2. Cutover checklist: cross-repo path audit

**Addressed.** Section H now includes step 6 ("Cross-repo path audit") directing a grep of downstream repos and dotfiles for old skill paths. The silent-breakage failure mode is covered.

---

## New and revised content

### 3. Multi-recipient partial delivery failure (Section E)

**Addressed and architecturally sound.** The send-time semantics subsection now states the requirement: "the agent must know per-recipient delivery outcomes -- which recipients received the message and which did not." The requirement is fixed; the outcome shape is deferred to the implementation plan. This is the right split -- the brief pins the invariant (no silent partial failure) without prescribing a wire shape for delivery receipts, which is implementation-plan territory. The requirement composes cleanly with the recipient-descriptor model: fan-out sends iterate recipients, so per-recipient outcomes are a natural byproduct of the iteration, not an architectural add-on.

### 4. Collaboration canvas stress test reframing (Section I, case 2)

**Addressed.** The language now reads "design-compatible but not validated" with an explicit split between the trust model (validated in v2) and the infrastructure (deferred). The prior "not broken" framing is gone. The two-layer decomposition -- trust model is native to v2, infrastructure is the follow-on arc -- is clean and correctly scoped.

### 5. Cross-reference shape: constraints not prose (Section D / Q4)

**Addressed and structurally sound.** Section B.Q4 now lists six pinned constraints with an explicit "what's left to SKILL.md drafters" carve-out. The constraints are testable (each is a pass/fail criterion a reviewer can audit against the produced SKILL.md). The brief no longer prescribes exact sentences, which gives drafters room to write context-appropriate prose while preserving the architectural invariants. The constraint list includes the "reach is not URL-specific" guard, which prevents the most likely authoring error.

### 6. Collaboration trust model native to v2 (Section F)

**Addressed.** The new subsection "Collaboration trust model -- native to v2" draws the correct line: the trust model (who can instruct the agent) is v2 scope; the infrastructure (bidirectional state, live updates) is follow-on. The envelope/content trust boundary is extended to trusted submissions -- structured affordances carry instructions, free-text from trusted participants is analyzed by the agent within the surface's scope. This is the symmetric application of the same rule the brief already had for untrusted submissions, which is architecturally consistent.

### 7. Preflight verification (Section G)

**Addressed.** The new "Preflight verification" subsection closes the gap between "setup recorded the location" and "the location is still valid." The agent reads `environment.md` at session start and verifies named credential locations are reachable. Stale locations surface per P2. This is a small addition with high value -- it prevents a class of runtime failures the setup/execution split alone could not catch.

---

## Stance items

### 1. Two skills vs other decompositions

**No change from round 1.** Still correct. No new content challenges the decomposition.

### 2. Environment substrate framing

**No change from round 1.** The new "harness-level classifiers may still block named reads" acknowledgment (Section G) is a good addition -- the brief no longer implies the skill can guarantee classifier behavior, which was a gap the security reviewer identified.

### 3. Cross-reference shape

**Improved from round 1.** The constraints-not-prose approach is strictly better than the prior pinned phrasing. The six constraints are auditable, the drafters have appropriate latitude, and the future-tool slot-in test (Section D) still passes.

### 4. Multi-recipient and team modeling

**Improved from round 1.** The partial-delivery requirement resolves the open question about silent failure in fan-out sends. The round-1 open questions (ephemeral recipient GC, per-recipient URL multiplication) remain correctly deferred to the implementation plan.

### 5. Substrate-agnostic posture

**No change from round 1.** Still sound.

### 6. Composability / stress tests

**Improved from round 1.** The collaboration-canvas reframing is the main change. All six stress tests now have honest framing: five validated, one design-compatible but not validated with the split clearly named.

### 7. Packaging / cutover shape

**Resolved from round 1.** Both must-fix items are addressed. The cutover checklist is now a complete sequence: archive, promote, update plugin.json, update symlinks, cross-repo path audit. No remaining gaps.

---

## New findings

None. The revisions are bounded and clean. No new architectural concerns introduced by the changes. The partial-delivery requirement, the trust-model/infrastructure split, and the constraints-not-prose approach all compose with the existing design without friction.

---

## Verdict

**Proceed.** All eight round-1 must-fix items from synthesis are addressed. No new architectural concerns. The brief is ready for plan-stage work.
