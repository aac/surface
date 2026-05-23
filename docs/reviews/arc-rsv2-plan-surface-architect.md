# arc-rsv2: plan review — surface (architect)

**Arc:** `arc-reach-surface-v2`
**Reviewer stance:** architect — structural audit
**Reviewed:** `docs/arc-reach-surface-v2-plan-surface.md`
**Against:** frozen design brief (`docs/arc-reach-surface-v2-design.md`), final synthesis (`docs/reviews/arc-rsv2-synthesis-r2-2026-05-23.md`), current v0 skill (`skills/poke/`)
**Date:** 2026-05-23

---

## Findings

### Must-fix

**M1. D5 depends on D2, but D3/D4/D6 do not — graph says they do.** The ASCII dep graph (§3) draws D3, D4, and D6 as children of D2. The plan's own prose says D3, D4, and D6 are mechanical naming ports with no content dependency on D2's collaboration trust model. The parallelizable-units list (Group A) correctly treats them as independent of D2 — but the graph above contradicts it. The graph edges from D2 to D3/D4/D6 should be removed; only the D2→D5 edge is real. Without this fix, an orchestrator reading the graph (not the prose) would serialize D3/D4/D6 behind D2 unnecessarily.
**Confidence:** high — the graph and the prose disagree; the prose is correct.

**M2. D9 (symlink) does not depend on D8 (plugin.json).** The graph shows D9←D8. The symlink points at the `skills/surface/` directory, which exists as soon as any Group A deliverable lands. The plugin.json registration (D8) is unrelated to symlink setup — symlinks target the filesystem path, not a manifest entry. D9 should depend on D1 (SKILL.md must exist at the symlink target), not D8. Alternatively, D9 is fully independent since the directory exists after Pass 1.
**Confidence:** high — the symlink target is `~/Workspace/poke/skills/surface`, not a plugin.json path.

### Should-fix

**S1. No AC on D1 for the collaboration trust model pointer.** D1 §9 says "expanded headline: defaults are low-risk; third-party shares and collaboration surfaces need explicit trust decisions." But there is no acceptance criterion verifying that SKILL.md's security-considerations section actually points to the collaboration trust model in `references/security.md` or names the trust override concept. Brief §F makes the collaboration trust model native to v2 — the SKILL.md entry point should surface it, not just gesture at "expanded headline." Add an AC: "§9 names the collaboration trust model (default untrusted, operator-trust override) and points to security.md for detail."
**Confidence:** high — brief §F is explicit that this is native to v2, not an extension.

**S2. Plugin.json version lockstep creates a v0/v2 collision.** D8 says the plugin.json version updates to `0.1.0-alpha.1`. But CLAUDE.md's versioning rule says SKILL.md and plugin.json versions move in lockstep. During dogfood, both `skills/poke/` (at v0.1.0) and `skills/surface/` (at v0.1.0-alpha.1) coexist. The plan doesn't say which skill's version plugin.json tracks, or whether plugin.json carries two version fields (one per skill). This needs a one-sentence clarification — the plan's §6 hints ("tracks whichever skill is being promoted") but D8's AC just says "version field matches 0.1.0-alpha.1," which breaks the lockstep rule for the still-active poke skill.
**Confidence:** medium — the brief (§H) addresses this but the plan's D8 AC doesn't capture the coexistence nuance.

### Note

**N1. Carry-forward items are concretely addressed.** All three synthesis carry-forwards are mapped to specific D5 sections with concrete acceptance criteria. The scope calibration example (carry-forward #1) has an AC requiring "a concrete plausible-but-out-of-scope instruction." The URL forwarding walkthrough (carry-forward #3) has an AC requiring "contrasting per-surface vs per-recipient trust granularity." The double judgment call (carry-forward #2) is exercised across sections 4 and 5. This is well-handled.

**N2. Brief completeness coverage is thorough.** Every brief requirement I traced has a corresponding deliverable: eight principles (P1-P8) map to D1/D2; §B.Q4 cross-reference constraints map to D1 §2 ACs; §B.Q6 "task-shaped" maps to D2 ACs; §F security model maps to D5; §G setup/execution split maps to D1 §7; §H packaging maps to D8/D9. No orphan deliverables found — every D1-D9 traces to a brief requirement.

**N3. ACs are agent-testable.** Every acceptance criterion I reviewed is mechanically verifiable: string presence checks ("uses 'task-shaped' not 'ephemeral'"), section counts ("all nine sections present"), build commands (`go build`, `go test`, `python3 --help`), structural checks ("all seven sections present"). No subjective-judgment ACs found.

---

## Verdict: **iterate**

Two must-fix items in the dependency graph. Both are straightforward corrections (remove incorrect edges, fix D9's dependency). The should-fix items are small but worth addressing before implementation tickets are filed. After these fixes, the plan is ready for implementation dispatch.
