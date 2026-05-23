# arc-rsv2 cold-eye review

**Reviewer stance:** cold-eye / first-principles. I did not write the handoff. I have not invested in the framing.

**Artifact:** `docs/arc-reach-surface-v2-design.md`

**Date:** 2026-05-23

---

## Stance 1: The eight principles (P1-P8)

### Re-derivation against actual friction

The trigger session had three friction points: (1) reach couldn't address a non-self recipient, (2) surface deployment stalled on a missing token whose retrieval path was undocumented, (3) environment discovery was re-derived from scratch every session.

**P1 (skills name questions, trust the agent).** Maps directly to friction point (1): the agent couldn't figure out the right move for a non-self send because the skill's shape didn't name the question cleanly. The revision strengthening "trust the agent" and *not* enumerating all decision axes is an improvement over the handoff's version. The handoff's P1 said "name the agent's load-bearing decisions + the axes those decisions live on + the criteria for choosing on each axis" -- that's three layers of prescription on a principle about non-prescription. The revised P1 says "give one example of an axis to illustrate the *kind* of reasoning, don't enumerate all." This is directionally correct and consistent with the process-learnings principle "trust agent competence when designing artifacts for agent consumers." **Confirmed: revision is an improvement.**

**P2 (setup gaps surface).** Maps to friction point (2). The KV-write bypass is the exact case. Principle holds. No notes.

**P3 (setup-time discovery, execution-time recall).** Maps to friction points (2) and (3) simultaneously. This is correctly identified as the architecture, not just a principle. The environment.md file is the concrete fix. Holds up.

**P4 (substrate-agnostic).** Does not map directly to any of the three friction points. It maps to a *prior* design decision (2026-05-18 in decisions.md) that was already hardened. Including it is correct -- it's a constraint the new design must preserve -- but it's inherited, not triggered. No issue; just noting the distinction.

**P5 (composable but independent, generic framing).** Maps to friction point (1): the agent bailed from reach to direct osascript partly because the cross-reference was too tight (reach = self-only adapter, not a generic delivery concept). The revision to "each is one instance of a broader category" is the right fix. Holds up.

**P6 (multi-recipient first-class).** Maps directly to friction point (1). The Sasank case. Holds up.

**P7 (lifetime per-artifact, team is a kind).** The revision separating team from lifetime is an improvement. The handoff's P7 collapsed three axes. The prior version in the brief apparently had `lifetime: ephemeral | enduring | team` -- that's a category error (team is not a lifetime). The fix to orthogonal axes is correct. **Confirmed: revision is an improvement.**

**P8 (harness-neutral).** Does not map to any trigger-session friction. This is a pre-existing principle restored from CLAUDE.md that the handoff omitted. Its inclusion is defensible -- it's a constraint the new design must not violate -- but it didn't cause any of the observed friction. Same status as P4: inherited constraint, not triggered principle.

### Assessment

Six of eight principles map to actual friction. Two (P4, P8) are inherited constraints with no trigger-session failure mode. Including inherited constraints is fine -- they're real constraints -- but calling them "principles" alongside trigger-derived ones slightly inflates the list. This is a minor organizational note, not a would-block.

**Would note as future work:** consider distinguishing "design principles (derived from friction)" from "inherited constraints (preserved from v0)" in the final SKILL.md structure, if the distinction aids an agent's reasoning about *why* each principle exists.

---

## Stance 2: The seven open questions (Q1-Q7)

### Are these the right questions?

**Q1 (channels vs recipients).** Right question. The framing does not presuppose -- it names two options and argues for the split. The argument is convincing: the composite model forced "create an adapter" for what was a "declare a recipient" operation.

**Q2 (teams).** Right question, and the "both shapes under one model" answer is clean. No hidden premises.

**Q3 (environment substrate).** Right question. The full deferral (both path and schema) is the right call. The prior version committed to `~/.aac-env/` which uses a personal handle -- that's premature path commitment. **Confirmed: full deferral is an improvement over the prior version.**

**Q4 (cross-reference language).** Right question. The pinned phrasing is good. One observation: the reach-side phrasing says "a common case is delivering a URL minted by another tool" -- this risks making URL delivery the headline case despite the principle that reach delivers payloads of any shape. The brief acknowledges this in the notes ("Reach is not URL-specific") but the phrasing itself leads with the URL case. Minor tension, not a would-block.

**Q5 (substrate survey).** Right question, and the "setup-time only, not per-invocation" discipline is the correct answer. This is a direct application of P3.

**Q6 (live updates).** Right question, right deferral. The "task-shaped" rewording of "ephemeral" is a good move -- it admits longer-lived surfaces without committing to a live-updates spec.

**Q7 (provisioning auth).** Right question. The revision flagging direct-KV-write for investigation rather than blessing it is an improvement. The prior version apparently treated the bypass as a legitimate provisioning shape; the revised version treats it as an observed workaround pending investigation. This is consistent with P2 (setup gaps surface, don't invent bypasses). **Confirmed: revision is an improvement.**

### Hidden premises

I found one hidden premise worth naming: **Q1-Q7 all assume the two-skill framing is correct.** None of them asks "should reach and surface merge?" The brief addresses this in the executive summary's "rejects" list ("Surface is just reach's UI layer; merge them" -- rejected), but the rejection is stated as a conclusion, not argued from the trigger session's evidence. I examine this further under Stance 4.

**Would iterate:** The Q4 pinned phrasing for reach leads with URL delivery. Suggest the SKILL.md draft lead with message/notification delivery and mention URL as one payload shape among several, to avoid the URL-centric framing the brief itself warns against.

---

## Stance 3: Naming (poke -> surface)

### Re-litigating without deference

The brief argues: "poke" is Andrew-coded informal; "surface" reads as adoptable; the word is already common-noun throughout poke's SKILL.md.

**In favor of the rename:**
- The SKILL.md already says "the surface owns the result," "the surface exposes affordances," etc. Promoting common-noun to proper-noun is consonant.
- For multi-recipient/team/third-party cases, "surface" is more legible than "poke."
- If the goal is adoptability beyond a single contributor, "surface" reads better to someone encountering it cold.

**Against the rename:**
- "Surface" is genuinely overloaded. "Attack surface" in security writing is the most concerning overlap because the skill has a security reference that discusses attack vectors. A section titled "Security considerations for the surface" now reads ambiguously.
- "Surface" as a verb ("the agent surfaces a gap") collides with "surface" as the skill's noun. P2 says "setup gaps surface" -- that's the verb. The skill is called "surface" -- that's the noun. In the same document.
- Process-learnings says "check existing namespaces before committing to a name." The brief acknowledges the overlap but calls it acceptable. I'm not convinced the security-reference collision has been adequately weighed.

**My position:** The rename is defensible but not clearly better than keeping "poke." The arguments for adoption by others carry real weight, but they're speculative -- there are no other adopters yet, and v2 is still a solo-dogfood project. The verb/noun collision within the skill's own principles (P2: "setup gaps surface") is a concrete readability problem. The security-reference ambiguity ("attack surface" vs "the surface") is a concrete authoring problem.

**Would iterate:** The rename is the brief's weakest unforced position. If reviewers push back, I'd recommend the synth reopening it rather than defending it. The brief correctly marks this as "final, not deferred to synth" with a reviewer-escape clause -- that's the right process shape. My push-back is recorded; if no other reviewer raises it, the rename stands.

---

## Stance 4: The "two skills" framing

### Is "outbound message" actually separable from "inbound action"?

The brief rejects the merge with a one-liner: "Reach without a surface (status-only ping) and surface without reach (in-session URL) are both real."

This is true but insufficient. The question isn't whether edge cases exist where only one is needed -- it's whether the *common case* benefits from the separation. Let me examine the six stress tests:

1. **Friend one-off.** Uses both. The agent mints a surface and delivers via reach.
2. **Collaboration canvas.** Uses both (surface + reach to share).
3. **Medical team.** Uses both.
4. **Status reach without surface.** Reach only.
5. **Surface without reach.** Surface only.
6. **Cron-triggered.** Uses both.

Four of six use both together. The two solo cases are real but less common. This is the pattern of two things that compose more often than they stand alone.

**However:** the separation is still correct, for a reason the brief doesn't articulate strongly enough. The separation isn't about frequency of co-use -- it's about **ownership**. Surface owns the UI rendering, intent mapping, draining, and submission processing. Reach owns channel selection, recipient resolution, and delivery. These are genuinely different concerns with different failure modes, different setup workflows, and different security models. Merging them would produce a skill that's either too large to be non-prescriptive (violating P1) or that conflates two distinct setup conversations.

The "one skill with two faces" alternative would require the merged skill to handle: mint IDs + render HTML + drain submissions + select channels + resolve recipients + deliver payloads. That's two skills jammed into one SKILL.md. The agent reading it would need to parse which face applies. Separation is correct.

**Would note as future work:** The brief should strengthen the separation argument from "both solo cases are real" to "the concerns have different ownership, failure modes, and setup workflows." The current one-liner is too thin to survive hard scrutiny.

---

## Stance 5: Motivating use cases

### The collaboration canvas (case 2)

This case requires: persistent surface, live updates, multi-recipient, agent-as-participant, bidirectional state. The brief correctly defers it to a follow-on arc. But the brief also uses it as a stress test, claiming "not broken; not fully supported."

**Push-back:** "Not broken" is misleading. The case requires capabilities that don't exist in v2. A more honest characterization is "not foreclosed by the design; not addressable by v2." The brief's own Q6 analysis names the three qualitative differences (bidirectional state, persistent state, event-driven updates). These aren't incremental extensions -- they're a different artifact shape.

The risk: including the collaboration canvas as a stress test that "passes" (even with caveats) creates an implicit promise that v2 is on a path toward it. If the follow-on arc discovers that live-update surfaces need a fundamentally different wire (websockets, not HTTP POST), the v2 design might actually foreclose on it despite the brief's claim.

**Would iterate:** Reframe case 2 from "not broken" to "design-compatible but not validated." The current language overstates what "does not foreclose" means. Alternatively, drop it from the stress tests and keep it in Q6 as a named future case. A stress test should exercise the design, not test whether the design "doesn't break" something it doesn't address.

### The medical team (case 3)

This case is more grounded than the collaboration canvas. The reach layer (team recipient, fan-out, mixed channels) is fully specified. The surface layer (collaborative review, persistent, security-sensitive) is partly deferred (persistent surface is Q6). But the reach-side design handles the multi-recipient and team semantics cleanly.

**However:** the medical-team case introduces a concern the brief doesn't address: **urgency semantics**. The handoff names "mixed-urgency reach across the team." The brief's recipient-descriptor model has a `## Preferences` section for "quiet hours, channel ordering," but doesn't name urgency as a first-class concern. If a medical team member needs to be paged at 3am for a critical finding, the current model would need either (a) per-message urgency that overrides quiet-hours preferences, or (b) the agent to ignore preferences and use the most intrusive channel available. Neither is named.

**Would note as future work:** Urgency as a reach-side concern is missing from the recipient-descriptor model. This doesn't block v2 (the agent can make the judgment call), but it's a gap the brief should name in section J (findings the brief surfaces but does not settle).

---

## Stance 6: P1 consistency -- does the brief pre-decide things the agent should decide?

P1 says: "the skill's default posture toward the agent is trust your judgment." The brief should name questions, not answers.

### Where the brief is consistent with P1

- Q1 position (separable model) names the shape but leaves send-time composition to the agent.
- Q2 position (both team shapes) lets the descriptor decide, not the skill.
- Q6 deferral leaves the "ephemeral or persistent" choice to the agent.
- Q7 position flags the investigation without blessing a path.
- The security model (section F) names the default posture but explicitly says "the agent decides when the override applies."

### Where the brief may over-prescribe

1. **Recipient descriptor file shape (section E).** The brief specifies frontmatter fields (`lifetime`, `kind`, `created_at`, `created_via`), section headers (`## Recipient`, `## Delivery`, `## Preferences`, `## Notes`), and delivery sub-shapes (`direct`, `fan-out`, `shared-channel`). This is quite specific for a skill that claims to "name questions, not answers." Counter-argument: recipient descriptors are *reach's wire shape*, analogous to the state file shape in poke v0's wire example. Wire shapes need to be specified enough that agents producing them and agents consuming them agree on structure. The level of specificity is appropriate for a wire-example-level reference, not for SKILL.md itself. **If this detail ends up in SKILL.md rather than in a reference file, it over-prescribes. If it stays in references/, it's fine.**

2. **Environment.md file shape (section G).** Same analysis as above. The `schema_version`, `generated_at`, section headers, and example entries are reference-level detail. Appropriate for `references/environment.md`; would be over-prescription in SKILL.md.

3. **The Q4 pinned phrasing.** The brief pins exact cross-reference wording for both skills' SKILL.md files. This is the most prescriptive element in the brief. It constrains the SKILL.md authors to specific sentences rather than naming the intent and letting them draft. **Would iterate:** pin the *constraint* (each is "one instance of a broader category"; include explicit path; placement in when-to-use + examples), not the *prose*. Let the SKILL.md drafters write sentences that serve their context.

### Assessment

The brief is mostly consistent with P1. The risk areas are (a) pinned prose being transplanted verbatim into SKILL.md rather than treated as reference-level guidance, and (b) file shapes being interpreted as prescriptive rather than illustrative. The SKILL.md drafting phase should treat sections E, G, and the Q4 phrasing as reference material, not as SKILL.md content.

**Would iterate:** Add a note in section H or a new preamble clarifying that wire shapes (recipient descriptors, environment files) and pinned cross-reference language are reference-level content for the implementation plans, not SKILL.md-level content. The implementation plans should decide what goes in SKILL.md vs references/.

---

## Stance 7: What's missing

### (a) Cron-only workers

The brief covers this in stress-test case 6 ("cron-triggered reach + surface") and claims it works because environment.md is populated at setup time. This is mostly right, but there's a gap: **who runs setup for a cron-only worker?**

Setup (P3) is interactive -- it happens in a setup conversation with the user. A cron-only worker, by definition, runs without an interactive session. If the worker is deployed to a fresh environment (a new machine, a container, a CI runner), there's no setup conversation to populate environment.md.

The brief's answer is implicit: setup happened once on the contributor's machine, and the cron worker runs on the same machine. This works for the solo-dogfood case. But the brief's own goal (section 0, handoff section 2) is to "generalize off Andrew specifically." For a multi-machine deployment, environment.md portability becomes a concern.

**Would note as future work:** The brief should note that environment.md is currently machine-local and that cross-machine portability (for cron workers on different hosts) is a follow-on concern. Not a v2 blocker, but worth naming in section J.

### (b) Testability -- fresh agent verification

The brief describes setup-time discovery but doesn't describe a **verification step** where the agent confirms its environment is complete before attempting a send or surface deployment.

Concrete scenario: an agent reads environment.md and finds `provisioning: token-gated` with `credential_location: keychain entry "surface-provision-token"`. The keychain entry has since been deleted (key rotation, machine migration). The agent attempts the provisioning call and fails at send time.

The fix is a "preflight check" step: before the first send/deploy in a session, the agent verifies that the credential locations named in environment.md are still reachable. This is a bounded check (read specific named locations), not an open-ended scan (consistent with P3).

**Would iterate:** Add a preflight-verification step to the setup-execution split (section G). At the start of each session, the agent reads environment.md and verifies that named credential locations are reachable. If any are stale, surface the gap (P2) rather than discovering it at send time. This is a small addition that prevents a class of runtime failures.

### (c) Failure semantics -- partial success

The brief doesn't address what happens when reach sends to a team of 5 and delivery succeeds for 3 and fails for 2.

For fan-out teams, reach iterates per member. If some deliveries fail (channel down, recipient unreachable, rate-limited), the agent needs a model for:
- Does it report partial success?
- Does it retry failed deliveries?
- Does it surface the failure to the operator?

The brief's P1 answer would be "the agent decides." That's probably correct for v2 -- failure semantics are operational, and P1 says trust the agent. But naming the question in SKILL.md would help the agent know it *should* decide.

**Would note as future work:** The reach v2 SKILL.md should name partial-delivery failure as one of the judgment calls the agent owns. Not prescribe a retry policy, but name the question: "when a multi-recipient send partially fails, what does the agent do?" This is a P1-shaped addition (name the question, trust the agent to answer).

---

## Positive findings (where the brief got it right)

1. **P3 as architecture.** The setup-time discovery / execution-time recall split is the single most valuable contribution of this brief. It directly fixes the trigger session's credential-classifier collision and generalizes cleanly.

2. **Recipient descriptors with orthogonal axes.** The separation of lifetime from kind, and the unified model where teams are just recipients whose delivery resolves to fan-out or shared-channel, is elegant. It avoids a separate "team" file type and keeps the model small.

3. **Security model with operator-trust override.** The default-untrusted posture for third-party submissions with an explicit operator override is the right balance. It prevents the injection attack without preventing collaboration. The concrete attack walkthrough in section F is good -- it gives agents a specific scenario to reason about, not an abstract warning.

4. **New directories, not in-place edits.** The rollout strategy (side-by-side, old stays live, cutover is a separate step) is sound and low-risk.

5. **Full deferral of shared environment substrate.** Deferring both path and schema until observable overlap exists from two running skills is disciplined. The prior version's premature path commitment (`~/.aac-env/`) was correctly rejected.

6. **Q7 investigation flag.** Treating direct-KV-write as an observed workaround pending investigation (rather than blessing it) is correct and consistent with P2.

7. **The "task-shaped" rewording of "ephemeral."** Admitting longer-lived surfaces without committing to a live-updates spec is a precise linguistic fix.

---

## Items inherited from prior-session momentum

### The rename (poke -> surface)

As argued in Stance 3, the rename carries real costs (verb/noun collision in P2, security-reference ambiguity) that the brief acknowledges but dismisses too quickly. The adoption argument is speculative (no other adopters exist). This is the item most likely inherited from prior-session enthusiasm rather than derived from first principles.

### The nine-to-eight reduction as a headline

The brief frames "nine principles to eight" as a structural improvement. In reality, one principle was merged (P8 into P1) and one was dropped-and-reframed (P9 into the security model). The net effect is two fewer principles, one of which (P8) was genuinely redundant and one of which (P9) was reframed. The merge is editorial cleanup; the reframe is substantive. Headlining the count reduction risks overstating the structural change. Minor.

---

## Verdict-shaped summary

**Lean: proceed, with iteration on three items before synth.**

The brief is architecturally sound. P3 (setup/execution split), the recipient-descriptor model, and the security posture are the load-bearing contributions, and all three hold up under scrutiny. The eight principles map to real friction (six directly, two as inherited constraints). The open questions are the right questions, and the positions taken are defensible.

**Three items to iterate before synth:**

1. **Preflight verification step (Stance 7b).** Add a named step where the agent verifies environment.md credential locations are still reachable at session start. Small addition, prevents a class of runtime failures.

2. **Collaboration canvas stress-test framing (Stance 5).** Reframe from "not broken" to "design-compatible but not validated," or drop from stress tests. Current language overstates what v2 provides.

3. **Q4 pinned phrasing (Stance 6).** Pin the constraints (generic framing, explicit paths, placement rules), not the exact prose. Let SKILL.md drafters write context-appropriate sentences.

**Two items to note for the SKILL.md drafting phase:**

4. Wire shapes (recipient descriptors, environment files) are reference-level content. The implementation plans should decide placement; the brief should not imply they belong in SKILL.md.

5. Partial-delivery failure and urgency semantics should be named as agent judgment calls in reach v2's SKILL.md.

**One item where the reviewer disagrees but does not block:**

6. The poke-to-surface rename. Defensible but not clearly better. The verb/noun collision and security-reference ambiguity are real costs. If no other reviewer raises this, the rename stands; if another does, the synth should reopen.
