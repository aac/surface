# arc-rsv2 architect review

**Reviewer stance:** architecture (shape and decomposition)
**Artifact:** `docs/arc-reach-surface-v2-design.md`
**Date:** 2026-05-23

---

## 1. Two skills vs other decompositions

**Verdict: the two-skill umbrella shape is correct. Defend.**

The brief's own stress tests prove the decomposition: use case 4 (status reach without a surface) and use case 5 (surface without reach) are clean single-skill invocations with zero dead weight from the absent skill. A merged single skill would force agents to load reach machinery when minting an in-session surface for a present user, and force them to load surface rendering when sending a plain "job done" notification. Neither is acceptable overhead for a skill bundle whose entry point is supposed to be read-once-and-act.

A three-skill decomposition (reach, surface, environment) was rightly rejected. Environment is a file convention, not an active capability. Promoting it to a skill would violate the existing principle (Q3 analysis) that both skills depend on the file, not on a skill being installed. An environment skill would create a hidden prerequisite that defeats "stands alone."

The umbrella-with-two-tracks shape is the right call: shared design phase ensures the cross-reference shape composes, parallel implementation avoids artificial serialization, joint dogfood validates composition.

## 2. Environment substrate framing (Q3)

**Verdict: deferral of both path and schema is correct. No commitments needed now.**

The brief's reasoning is sound: designing a shared environment substrate without observable overlap data from two running skills is designing-without-pull-signal. The per-skill files (`~/.reach/environment.md`, `~/.surface/environment.md`) are independently useful and independently testable.

**Composability with future skills:** the per-skill convention composes cleanly. A hypothetical future skill (call it `canvas`) would write `~/.canvas/environment.md`. When observable overlap emerges across three skills, the shared-convention arc has three data points instead of one, producing a better-grounded schema. Nothing in the per-skill shape forecloses the shared shape.

**One thing to watch:** the `schema_version: 1` field in the environment file shape (Section G) is per-skill scoped. If a shared convention eventually lands, that field name may collide with a cross-skill schema version. This is not a must-fix -- it is an observation that the follow-on arc should name this field's scope explicitly when designing the shared shape.

## 3. Cross-reference shape between the two skills (Q4 / Section D)

**Verdict: the shape is correct and future-proof. The canvas test passes cleanly.**

The brief runs the canvas test in Section D and it passes: canvas mints a URL, the agent gives it to reach, reach delivers it. No changes to reach needed. The inverse (a new delivery channel like `signal-bot` ships its own adapter; surface is unchanged) also passes.

**Stress test with a hypothetical "canvas" skill:**

- Canvas mints a persistent collaborative URL (tldraw-shaped).
- Agent gives the URL to reach with `recipient: care-team` (a team descriptor).
- Reach fans out to team members via their preferred channels.
- Canvas is "another surface-shaped thing" in reach's example list; reach is "another reach-shaped thing" in canvas's delivery options.
- No skill rewrites. The cross-reference language ("each is one instance of a broader category") admits canvas with zero changes.

The explicit skill paths in the cross-references (`~/.claude/skills/surface/`, `~/.claude/skills/reach/`) are good -- they let an agent encountering one skill locate the other without prior knowledge. The anti-pattern guidance (no forward dependency, no URL-only framing) correctly prevents the bundle from re-forming.

**One refinement worth considering:** the cross-reference placement rule says "when-to-use + examples, never in section 1 'what this is.'" This is correct for preventing tight coupling, but the implementation-plan authors should verify that the "when to use" section doesn't accidentally make the cross-reference look like a prerequisite by leading with it. The brief's pinned phrasing in Q4 is careful about this; the implementation plans should preserve that care.

## 4. Multi-recipient and team modeling (Section E)

**Verdict: the recipient-vs-channel decomposition is architecturally sound. One open question.**

The orthogonal axes (lifetime: ephemeral/enduring; kind: individual/team) cover the space cleanly:

- **Ephemeral individual** (the Sasank case): mint `recipients/sasank.md` with `lifetime: ephemeral`, send, optionally promote. Clean.
- **Enduring individual** (self, a spouse): `lifetime: enduring`, lives across sessions. Clean.
- **Ephemeral team** (ad-hoc group for one task): `kind: team`, `lifetime: ephemeral`, `delivery: fan-out`. Clean.
- **Enduring team** (care team, ops rotation): `kind: team`, `lifetime: enduring`, `delivery: shared-channel` or `delivery: fan-out`. Clean.
- **Groups with native channels** (a Slack channel): `delivery: shared-channel`, `channel: slack`, `handle: #care-team`. Reach sends once. Clean -- no N+1 fan-out for a channel that natively supports groups.

**The shape covers all cases.** The decision to make team a `kind` rather than a `lifetime` value was the right call (decisions.md confirms the reasoning).

**Open question: recipient descriptor garbage collection.** Ephemeral recipients accumulate as files in `~/.reach/recipients/`. The brief says they "may be deleted after the send" but doesn't name who deletes them or when. For a solo contributor this is fine (a handful of files). For a contributor who uses reach heavily with many one-off recipients, this could become a drawer of stale files.

**Proposed resolution:** this is an agent responsibility, not a spec concern. The brief should not prescribe cleanup (that would violate P1). But the implementation plan for reach v2 should note in its "agent responsibilities" section that ephemeral-recipient cleanup is the agent's call -- same as surface teardown is the agent's call today. Not a must-fix for the brief.

## 5. Substrate-agnostic posture (Q5, Q7)

**Verdict: the brief correctly avoids embedding a canonical substrate. Q7's investigation framing is sound.**

The substrate survey (Q5) is correctly scoped to setup-time only, writing results to the environment file. The brief does not name any substrate as preferred. The environment file example in Section G lists substrates as capabilities ("loopback: yes", "tailscale: up"), not as recommendations.

Q7's handling of the Cloudflare-Worker provisioning path is exactly right: the brief flags direct-KV-write as "an observed workaround that may or may not be correct" and defers to the implementation plan for investigation. This avoids both blessing a potentially unsafe bypass and prohibiting a potentially valid path. The three-option investigation frame (token needs documented retrieval path / direct KV is valid if full state contract reproduced / provisioning model needs rethinking) covers the space.

**Credential retrieval from secure storage:** the revised framing (keychain is the optimal storage location; the environment file documents a bounded retrieval path) is a meaningful improvement over the initial brief's "never reads from keychain" posture. The distinction between open-ended scanning (blocked, correctly) and specific named lookup (fine) is architecturally load-bearing and well-drawn.

## 6. Composability (P5 / Section I stress tests)

**Verdict: five of six stress tests pass cleanly. The sixth (collaboration canvas) is correctly deferred. No awkward workarounds forced by the shape.**

Walking each use case against the proposed shape:

1. **Friend one-off:** ephemeral recipient + existing channel + surface. Shape handles it in 2-3 turns. No workaround.
2. **Collaboration canvas:** deferred to follow-on arc. The "task-shaped" rewording of the ephemeral invariant correctly avoids foreclosing. The wire example's agnosticism to single-shot vs. multi-submission is verified by the existing `poke/references/wire-example.md`. No workaround -- just a not-yet-specced case.
3. **Medical team patient care:** team recipient (fan-out) + surface with per-recipient URLs for attribution. The security model (Section F) covers the trust boundary. The reach layer works fully; the persistent-surface layer is partly deferred (same as case 2). No workaround.
4. **Status reach without a surface:** `(recipient: self, message: "done")`. Existing reach shape preserved. Trivially clean.
5. **Surface without reach:** agent mints surface, opens in browser. The brief explicitly notes the in-session delivery improvement. No workaround.
6. **Cron-triggered reach + surface:** autonomous agent reads both environment files, uses documented retrieval paths for credentials. The classifier collision (the trigger session's root cause) is structurally fixed. No workaround.

**Version numbering (0.1.0 for surface):** correct. Surface is a new skill, not a poke patch release. The decisions.md entry documents the reasoning.

**One potential awkwardness spotted:** in the medical-team case (case 3), if the team needs per-recipient URLs for submission attribution (Section F, option c), the agent has to mint N surfaces (one per team member) rather than one shared surface with N recipients. This is a valid agent-side cost, but it's worth noting in the implementation plan that the "per-recipient URL for attribution" pattern may interact with fan-out teams in a way that multiplies surface provisioning. This is not a shape problem -- it's a provisioning cost the agent should be aware of.

## 7. Packaging / cutover shape (Section H)

**Verdict: the cutover is well-sequenced. Two items to audit.**

The new-directories-alongside-old approach is correct: side-by-side comparability, no mid-redesign breakage, abandonment is `rm -rf`.

**Must-audit item 1: symlink hygiene during cutover.**

The cutover steps (Section H) list:

1. Archive old: `git mv skills/poke skills/poke-v0`
2. Promote new: `git mv skills/surface skills/poke` (or keep as `surface` and update symlinks)
3. Update `.claude-plugin/plugin.json`

Missing from this list: **updating the symlink at `~/.claude/skills/poke`** (or creating `~/.claude/skills/surface`). The symlink currently points at `~/Workspace/poke/skills/poke/`. After the `git mv`, that target no longer exists. The cutover step needs to explicitly include:

```
rm ~/.claude/skills/poke
ln -s ~/Workspace/poke/skills/surface ~/.claude/skills/surface
# (or ln -s ~/Workspace/poke/skills/poke ~/.claude/skills/poke if the rename is reverted)
```

Similarly, the dogfood-period symlink `~/.claude/skills/surface` (created for testing) needs to be cleaned up or preserved depending on the naming decision.

**This is a must-fix for the cutover checklist,** not for the brief itself -- but the brief should note that symlink updates are part of the cutover step, since it's the document that names the cutover steps.

**Must-audit item 2: downstream references to `~/.claude/skills/poke/`.**

Other projects or skills may reference `~/.claude/skills/poke/` by path. The cross-reference language in Section D pins `~/.claude/skills/surface/` as the path. But during cutover, if the final name is `surface` (not `poke`), any downstream references to `~/.claude/skills/poke/` break. The cutover PR should grep for `skills/poke` across repos that might reference it.

The brief can't exhaustively list these, but it should note "cutover includes auditing cross-repo references to the old skill path" as a step.

---

## Must-fix items

1. **Cutover checklist (Section H) must include symlink update steps.** The `git mv` alone doesn't update `~/.claude/skills/poke` or clean up `~/.claude/skills/surface`. Without this, agents loading the skill by symlink will get a dangling reference after cutover. Add one bullet: "update symlinks at `~/.claude/skills/` to point at the promoted skill directory; remove dogfood-period symlinks."

2. **Cutover checklist should include a cross-repo path audit step.** "Grep for `skills/poke` in any repo that might reference the old path; update or alias." Without this, downstream cross-references break silently.

## Open questions the brief didn't surface

1. **Ephemeral recipient accumulation.** Who cleans up `~/.reach/recipients/` files with `lifetime: ephemeral` after the send? Proposed resolution: agent responsibility (consistent with P1). Note in the reach v2 implementation plan under "agent responsibilities."

2. **Per-recipient URL multiplication for attributed fan-out teams.** When a team uses fan-out delivery and the surface needs submission attribution (Section F, option c), the agent mints N surfaces instead of 1. Proposed resolution: this is a cost the agent trades off, not a shape problem. The implementation plan should name it so agents don't discover it mid-session.

## Disagreements

None. The brief takes defensible positions throughout. The two-skill decomposition, the environment deferral, the recipient-vs-channel separation, the team-as-kind-not-lifetime revision, the substrate-agnostic posture, and the cross-reference shape are all architecturally sound.

## Positive findings

1. **The team-as-kind revision (from the feedback round) was load-bearing.** The prior framing (`lifetime: ephemeral | enduring | team`) would have produced a three-way enum where two values (ephemeral, enduring) answered "how long?" and one (team) answered "how many?" -- a category error that would have leaked into every consumer. The orthogonal axes are the correct decomposition.

2. **The credential-retrieval revision was the right call.** The initial brief's "never reads from keychain" posture would have forced credentials into less-secure locations (env vars, plaintext files) to satisfy the constraint. The revised framing (secure storage is optimal; the environment file documents bounded retrieval) aligns security posture with the setup/execution split rather than fighting it.

3. **Q7's investigation framing (don't bless, don't prohibit, investigate) is exactly right** for a case where the brief can't yet determine the correct provisioning path. The three-option frame gives the implementation plan a concrete investigation target without premature commitment.

4. **The handoff's P9 (surface as chat back-channel) was correctly reframed.** The brief's analysis -- that the current poke SKILL.md already has the exception for free-text escape hatches, making P9 a strawman -- is accurate. Promoting the legitimate concern (trust posture for third-party free-text) into the security model is the correct architectural move.

## Verdict

**Would proceed with.** The two must-fix items are checklist additions to the cutover section, not architectural changes. The open questions are implementation-plan concerns, not brief-level gaps. The shape is sound, the decomposition is correct, the cross-reference design admits future tools without rewrite, and the stress tests pass. This brief is ready for the cold-eye reviewer and then synth.
