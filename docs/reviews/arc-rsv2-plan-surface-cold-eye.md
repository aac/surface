# arc-rsv2 plan review — surface (cold-eye)

**Arc:** `arc-reach-surface-v2`
**Artifact reviewed:** `docs/arc-reach-surface-v2-plan-surface.md`
**Reviewer stance:** cold-eye — first-principles review from outside the design conversation
**Cross-references read:** frozen design brief, round-2 synthesis, CLAUDE.md core principles, current `skills/poke/SKILL.md`, process-learnings guide, current plugin.json, existing poke references and examples

---

## Verdict: **proceed**

The plan is sound. It solves a real problem (surface v2 has genuine gaps in poke v0 around multi-recipient trust, collaboration, and the setup/execution credential split), the dep graph is correctly sequenced, and the carry-forward items from synthesis are properly addressed. Two should-fix items and three notes below. Nothing requires rethinking.

---

## Findings

### Should-fix

**S1. Plugin version lockstep creates a false signal during coexistence.**
*Confidence: high.*

D8 says `.claude-plugin/plugin.json` version updates to `0.1.0-alpha.1` in lockstep with surface SKILL.md. But the plugin currently tracks poke at `0.1.0`. Bumping the plugin version to surface's alpha version while poke is unchanged violates the CLAUDE.md versioning rule ("any landing that changes skill content bumps both version strings together") — because poke's skill content *hasn't* changed. During the coexistence period, the plugin version will track surface's alpha cadence while poke sits at 0.1.0, which breaks the eyeball-compare signal for poke. The plan should either: (a) keep the plugin version at 0.1.0 and note that surface's version is tracked only in its own SKILL.md frontmatter until cutover, or (b) acknowledge the lockstep rule applies per-skill and the plugin version tracks the most-recently-changed skill. Either is fine; the current plan is ambiguous and risks confusing the versioning signal it's trying to preserve.

**S2. D9 (symlink) depends on D1 (SKILL.md), not D8 (plugin.json).**
*Confidence: high.*

The dep graph says D9 depends on D8. But the symlink (`~/.claude/skills/surface` -> `~/Workspace/poke/skills/surface`) works the moment SKILL.md exists at the target path — it doesn't need plugin.json to be updated first. The dependency is on D1 (SKILL.md existing at the symlink target), not on D8. This is a minor graph error; it doesn't change the sequencing since D1 is already in pass 3 and D8/D9 are both in pass 4. But if someone parallelizes D8 and D9 in pass 4 (as the plan suggests), D9 could run before D8 with no issue — the stated dependency is wrong, just not harmful.

### Notes

**N1. Mechanical port deliverables (D3, D4, D6) are ideal dispatch-and-forget candidates; the plan could say so.**
*Confidence: medium.*

D3 (wire-example), D4 (lifecycle), and D6 (hosted-example) are described as naming-only updates — `poke` to `surface` throughout, no structural changes. These are textbook mechanical tasks. The plan correctly groups them in pass 1 for parallelism, but doesn't note that they're trivially verifiable (diff should show only naming changes; any structural change is a bug). An orchestrator dispatching these would benefit from an explicit "changes are naming-only; any structural diff is out-of-scope drift" note. Not blocking; the orchestrator can infer this from the deliverable descriptions.

**N2. The "attack surface" phrasing avoidance (synthesis authoring mitigation) is noted in D5 acceptance criteria but not in D2.**
*Confidence: medium.*

D2 (pattern.md) introduces the collaboration trust model and agent responsibilities section. If the drafter naturally uses "attack surface" phrasing in pattern.md's prose — plausible given the security-adjacent content — the mitigation isn't flagged there. D5's acceptance criteria catch it for security.md. The risk is low (pattern.md is less security-focused), but the mitigation should apply to all v2 content uniformly, not just the security reference.

**N3. The plan correctly avoids over-specifying prose, consistent with P1.**
*Confidence: high.*

Positive finding. The plan pins constraints and acceptance criteria, not sentences. Section plans are tables of content topics, not drafted paragraphs. Cross-reference constraints are testable pass/fail items, not prescribed wording. This is the right shape for a skill plan under the "trust the agent" / "non-prescriptive skill content" principles. The plan trusts the implementing agent to write good prose that satisfies the constraints — the brief's own methodology, applied one level down.

---

## Carry-forward item disposition — confirmed

All three synthesis carry-forward items are addressed with specific deliverable and section references:
1. Scope calibration example → D5 section 4. Concrete plausible-but-out-of-scope instruction.
2. Double judgment call → D5 sections 4 and 5, exercising both halves.
3. URL forwarding walkthrough → D5 section 5. Per-surface vs per-recipient trust granularity.

The fourth item (round-1 deferred items) is correctly noted as remaining deferred, with accurate reasoning that none are surface-skill deliverables.

---

## Dep graph assessment

The sequencing is correct. D5 (security.md) genuinely depends on D2 (pattern.md) for consistent trust-model language. D1 (SKILL.md) genuinely needs all references to exist before writing pointers. The four-pass structure is the minimum serial depth given these real dependencies. Reordering would not deliver faster value — the references are the substance; SKILL.md is the index. Building the index before the references would produce a hollow artifact that needs rewriting.

One edge is wrong (D9's dep on D8, noted in S2) but it doesn't affect sequencing since both are in the same pass.
