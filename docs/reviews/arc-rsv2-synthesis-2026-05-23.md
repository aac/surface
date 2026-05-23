# arc-rsv2 design-stage synthesis

**Arc:** `arc-reach-surface-v2`
**Date:** 2026-05-23
**Inputs:** architect review, cold-eye review, security review, design brief, v2-redesign handoff
**Verdict:** **iterate** -- brief stands with bounded must-fix revisions before plan stage

---

## Reviewer summaries

### Architect review

The architect validated the two-skill decomposition, the recipient-vs-channel separation, the environment deferral, and the cross-reference shape. All six stress tests passed under scrutiny. Two must-fix items identified, both scoped to the cutover checklist in Section H: (1) symlink updates are missing from the cutover steps -- after `git mv`, the `~/.claude/skills/poke` symlink dangles, and (2) the cutover should include a cross-repo path audit for downstream references to `~/.claude/skills/poke/`. Two additional open questions noted for implementation planning: ephemeral recipient file accumulation (who cleans up?), and per-recipient URL multiplication when fan-out teams need submission attribution. No architectural disagreements. Verdict: would proceed.

### Cold-eye review

The cold-eye reviewer re-derived each principle against the trigger session's actual friction, confirming six of eight principles map to real friction and two (P4 substrate-agnostic, P8 harness-neutral) are inherited constraints that didn't cause the observed failures. Three iterate items: (1) add a preflight verification step where the agent confirms environment.md credential locations are still reachable at session start, preventing stale-credential runtime failures; (2) reframe the collaboration canvas stress test from "not broken" to "design-compatible but not validated," since the case requires capabilities that don't exist in v2; (3) pin the Q4 cross-reference constraints (generic framing, explicit paths, placement rules) rather than exact prose, letting SKILL.md drafters write context-appropriate sentences. Two items noted for the drafting phase: wire shapes (recipient descriptors, environment files) should be reference-level content, not SKILL.md-level; and partial-delivery failure and urgency semantics should be named as agent judgment calls. The rename (poke to surface) was flagged as the brief's weakest unforced position -- verb/noun collision with P2 ("setup gaps surface") and security-reference ambiguity ("attack surface" vs "the surface") are real costs against speculative adoption benefits -- but the reviewer does not block on it. Verdict: lean proceed, with iteration on three items.

### Security review

No blocking findings. The default-untrusted posture for third-party submissions, the setup/execution split for credential handling, and the investigation stance on direct-KV-write all hold. Four iterate-severity findings: (1) operator-trust override should distinguish per-recipient trust (stronger) from per-surface trust (weaker, defeated by URL forwarding); (2) the brief should acknowledge that bounded retrieval paths documented in the environment file may still be blocked by harness-level classifiers, and that P2 (surface the gap) is the correct degradation; (3) even trusted participants' content should traverse the envelope/content trust boundary -- trust-for-instruction does not collapse the distinction between structured affordances and free-form content; (4) multi-recipient sends must produce per-recipient delivery outcomes so the agent knows which recipients received the message and which did not. Four follow-on-severity findings noted for future arcs: environment file as credential-location oracle, persistent surface exposure windows, per-skill file divergence as a security benefit of deferral, and per-recipient URL privacy implications. The security reviewer also surfaced two new risks the brief introduces that the handoff did not mention: the operator-trust override itself (new in the brief, introduces the forwarded-URL vector), and the agent-as-participant injection vector under trust override.

---

## Cross-reviewer convergence (high signal)

Three issues surfaced independently across multiple reviewers:

**1. Multi-recipient partial delivery failure.** Both the cold-eye reviewer (Stance 7c: failure semantics for partial success) and the security reviewer (finding #4: silent partial delivery failure) independently identified that the brief does not address what happens when a fan-out send partially fails. The cold-eye frames it as a judgment-call the SKILL.md should name (consistent with P1); the security reviewer frames it as a requirement that the agent must know per-recipient outcomes (stronger). The convergence is high-signal: this is a real gap in the brief, and the two framings are compatible -- name the question (P1-shaped), and state the requirement that per-recipient outcomes are visible to the agent (security-shaped).

**2. Collaboration canvas overstated.** The cold-eye reviewer (Stance 5: "not broken" is misleading for a case requiring capabilities that don't exist in v2) and the architect reviewer (who noted the per-recipient URL multiplication cost for attributed fan-out teams in this case) both identified that the stress-test language overstates what v2 provides for the collaboration canvas. The architect's concern is narrower (a provisioning cost the agent should know about); the cold-eye's is broader (the framing itself is misleading). The cold-eye's recommendation -- reframe to "design-compatible but not validated" -- is the cleaner fix.

**3. Wire shapes are reference-level, not SKILL.md-level.** The cold-eye reviewer (Stance 6: P1 consistency) and the architect reviewer (positive finding about the file shapes being appropriate for wire-example-level reference) converge on the same placement guidance: the recipient descriptor file shape and environment file shape are reference-level content for implementation plans, and the brief should not imply they belong in SKILL.md. This is an implementation-plan concern more than a brief-level fix, but both reviewers noted it, suggesting it's worth a clarifying note.

---

## Cross-reviewer divergence (flag for adjudication)

**The poke-to-surface rename.** The architect review did not address the rename. The cold-eye reviewer pushed back on it as the brief's weakest unforced position, citing the verb/noun collision in P2 ("setup gaps surface") and the "attack surface" ambiguity in the security reference. The security reviewer did not comment on naming. The cold-eye did not block but recorded the push-back for synth.

My assessment: the cold-eye's objections are concrete and well-grounded. The verb/noun collision is a real readability problem within the skill's own principles -- "Setup gaps surface" (verb) appearing in a skill called "surface" (noun) will confuse agents parsing the sentence. The "attack surface" collision in the security reference is a real authoring problem -- a section discussing "attack surface considerations for the surface" reads poorly. However, these are authoring-level problems, not architectural ones. They can be mitigated by rephrasing P2 to avoid the verb form ("setup gaps are surfaced" or "setup gaps get flagged") and by using "the surface skill" or "the input surface" in the security reference to disambiguate from "attack surface." The rename decision is the brief's call, marked as final-with-reviewer-escape. One reviewer pushed back; none blocked. The rename stands unless Andrew reopens it, but the authoring mitigations should be noted for the SKILL.md drafting phase.

---

## Novel findings not in the handoff (highest value)

These are findings the reviewers surfaced that the handoff did not anticipate:

**1. Agent-as-participant content vs. instruction (security reviewer, finding #5).** The highest-value novel finding. The handoff named agent-as-participant as a use case and the brief defers the full pattern to a follow-on arc. But the security reviewer identified that the prompt-injection risk is present even in v2's scope: when the operator declares a surface trusted for instruction-bearing input, the brief doesn't distinguish between trust-for-response (agent considers the input) and trust-for-instruction (agent executes the input). Even trusted participants' free-form content should not be parsed as agent instructions unless it flows through a structured, instruction-bearing affordance. This is the same envelope/content trust boundary the brief already names for untrusted submissions, but it needs to be extended to trusted submissions too. This is a must-fix for the security reference.

**2. Operator-trust override granularity (security reviewer, finding #1).** The handoff proposed an absolute third-party untrust rule. The brief added the operator-trust override, which is correct for collaboration, but introduced a new vector: per-surface trust declarations are defeated by URL forwarding. The brief should note that per-recipient trust is strictly stronger than per-surface trust, and recommend per-recipient as the default when trust override is used.

**3. Preflight verification step (cold-eye reviewer, Stance 7b).** Neither the handoff nor the brief names what happens when the environment file's credential locations become stale between sessions (key rotation, machine migration). The preflight verification -- agent reads environment.md at session start and verifies named locations are reachable, surfacing gaps per P2 -- is a small addition that prevents a class of runtime failures the setup/execution split alone does not catch.

**4. Environment file portability (cold-eye reviewer, Stance 7a).** The brief's setup/execution split assumes the cron worker runs on the same machine where setup happened. For the goal of generalizing beyond Andrew, cross-machine environment portability becomes a concern. Correctly noted as a follow-on, not a v2 blocker.

**5. TTL as a security-relevant decision (security reviewer, finding #8.1).** The brief rewords "ephemeral" to "task-shaped" to admit longer-lived surfaces, but doesn't note that surface lifetime has security implications (longer-lived surfaces have larger exposure windows for URL-as-auth). The security reference should name the exposure-window framework for surfaces that outlive the originating task.

---

## Verdict: **iterate**

The brief's framing holds. The two-skill decomposition, the recipient-descriptor model, the setup/execution split, the environment deferral, and the security posture are all architecturally sound. No reviewer attacked the framing itself. All three converge on "advance to plan stage" with bounded revisions. The must-fix items are listable, bounded, and addressable by editing specific sections of the brief -- no rewrite of the problem statement is needed.

### Must-fix list (for the brief revision before plan stage)

1. **Extend the envelope/content trust boundary to trusted submissions (Section F).** The security reference should note that even when a surface or recipient is declared trusted, the distinction between structured affordances and free-form content still applies. Trust-for-instruction flows through structured, instruction-bearing affordances; free-form content from trusted participants is data the agent analyzes, not instructions the agent executes. This is the same rule the brief already has for untrusted submissions, applied symmetrically.

2. **Note that per-recipient trust is stronger than per-surface trust (Section F).** Per-surface trust declarations are defeated by URL forwarding. The brief currently names both "specific recipients (or a surface)" as trust targets without distinguishing their security properties. Add a note that per-recipient trust is recommended as the default when trust override is used, because per-surface trust degrades when URLs are forwarded beyond intended recipients.

3. **Add preflight verification to the setup/execution split (Section G).** At the start of each session, the agent reads environment.md and verifies that named credential locations are still reachable. If any are stale, surface the gap per P2. This is a small addition -- one paragraph in Section G -- that closes the gap between "setup recorded the location" and "the location is still valid."

4. **Acknowledge bounded-retrieval vs. harness-classifier gap (Section G).** The brief should note that documenting a bounded retrieval path in the environment file is the skill's intent, but whether the harness permits the named read is harness-level policy. If the harness blocks the named read, P2 applies -- the gap surfaces. This prevents the brief from implying the skill can guarantee classifier behavior.

5. **Reframe collaboration canvas stress test (Section I, case 2).** Change from "not broken; not fully supported" to "design-compatible but not validated." The current language overstates what v2 provides. The case requires capabilities (bidirectional state, persistent state, event-driven updates) that v2 does not spec. "Does not foreclose" is a weaker claim than "not broken."

6. **Name multi-recipient partial delivery failure (Section E or Section J).** The brief should state that multi-recipient sends produce per-recipient delivery outcomes. The agent must know which recipients received the message and which did not. This can be a one-sentence requirement in Section E's send-time semantics, with details deferred to the implementation plan.

7. **Pin cross-reference constraints, not exact prose (Section D / Q4).** Replace the pinned phrasing with pinned constraints: each cross-reference uses the generic "one instance of a broader category" framing, includes the explicit skill path, and is placed in when-to-use + examples (never in "what this is"). Let the SKILL.md drafters write context-appropriate sentences. The current pinned prose risks being transplanted verbatim into SKILL.md where it may not fit the surrounding context.

8. **Add symlink update and cross-repo path audit to cutover checklist (Section H).** The `git mv` alone does not update `~/.claude/skills/poke` or clean up dogfood-period symlinks. Add one bullet for symlink updates and one for grepping downstream repos for the old skill path.

### Items deferred to implementation planning or follow-on arcs (not must-fix for the brief)

- Ephemeral recipient file cleanup -- agent responsibility, note in reach v2 implementation plan.
- Per-recipient URL multiplication for attributed fan-out teams -- provisioning cost the agent should be aware of, note in implementation plan.
- Urgency semantics in reach -- missing from recipient-descriptor model, name as a judgment call in SKILL.md.
- Wire shapes (recipient descriptors, environment files) as reference-level content -- implementation plan decides placement.
- Environment file portability for cross-machine cron workers -- follow-on concern.
- TTL exposure-window framework for long-lived surfaces -- add to security reference during SKILL.md drafting.
- Per-recipient URL privacy implications -- add to security reference during SKILL.md drafting.
- Per-skill environment file divergence as a security benefit of deferral -- note for the shared-environment follow-on arc.

### Note on the rename

The poke-to-surface rename stands per the brief's "final, not deferred to synth" designation. One reviewer pushed back with concrete objections (verb/noun collision in P2, security-reference ambiguity); none blocked. The SKILL.md drafting phase should mitigate the verb/noun collision by rephrasing P2 to avoid the bare verb "surface" where it could be confused with the skill name, and should disambiguate "attack surface" from "the surface" in the security reference by using "the input surface" or "the surface skill" where context is ambiguous.

### Confirmation gate

Plan-stage tickets require Andrew's confirmation before filing. This synthesis is surfaced to Andrew; the orchestrator handles the confirmation step.
