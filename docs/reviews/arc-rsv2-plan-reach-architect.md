# arc-rsv2: plan review -- reach (architect)

**Arc:** `arc-reach-surface-v2`
**Ticket:** `act-38dd2a`
**Reviewer stance:** architect -- structural audit
**Input:** `docs/arc-reach-surface-v2-plan-reach.md`
**Cross-referenced:** frozen design brief, round-2 synthesis, CLAUDE.md, v0 reach SKILL.md, live v0 registry state (`~/.reach/`)

I read the plan at the path above, the frozen design brief, the final synthesis, the v0 SKILL.md, and the actual on-disk v0 state (one `imessage.md` adapter with hardcoded `+14128892215`, `preferences.md` with `routine_channels: [imessage]`, no `credentials` file, no `environment.md`).

---

## Findings

### Must-fix

**M1. R5 filename vs content mismatch -- the plan leaves the decision unresolved at the wrong layer.** (Confidence: high)

R5 is listed as `references/adapter-shape.md` in the deliverable table and acceptance criteria say "Renamed focus: 'channel shape' (title may stay as adapter-shape.md for file continuity or rename -- implementer's call)." But `references/wire.md` (R3) and SKILL.md (R1) both reference the channel shape concept by its v2 name. If R5 keeps the filename `adapter-shape.md` while the entire v2 vocabulary uses "channel," every cross-reference from R1 and R3 into R5 will link to a filename that contradicts the terminology the reader just absorbed. This is a plan-level decision, not an implementer-level one -- the plan should pick: either rename the file to `channel-shape.md` (clean break, new skill directory anyway) or pin the filename as `adapter-shape.md` with an explicit rationale (e.g., preserving grep-ability for v0-era readers). Leaving it to implementer judgment when the choice affects cross-deliverable link targets is a dep-graph gap.

**M2. Phase 1 independence claim for R15 (migration.md) is wrong -- R15 has a soft dependency on R4.** (Confidence: high)

R15 (migration.md) documents "per-adapter migration steps (extract channel, extract recipient handle, write to `channels/` and `recipients/`)" and must describe the recipient descriptor file shape to explain where extracted handles land. R4 (recipient-descriptors.md) defines that file shape. If R15 is written in Phase 1 without R4, it either (a) re-derives the recipient descriptor shape (risking drift when R4 lands) or (b) forward-references R4 that doesn't exist yet. The plan should either move R15 to Phase 2 (after R4) or explicitly note that R15 can forward-reference R4's shape from the design brief without needing R4 to be written first. The current dep graph says "no dependencies" for R15 and that's structurally incorrect.

### Should-fix

**S1. No `credentials` directory in the v0 state -- migration section assumes it exists.** (Confidence: high)

Section 11 says "Existing v0 reach installs have: ... `~/.reach/credentials` -- unchanged in v2." The actual v0 install on this machine has no `credentials` file or directory -- the sole adapter (iMessage) uses ambient auth. The migration section should account for the case where `credentials` doesn't exist rather than listing it as a given. The migration path is otherwise correct; this is about the migration reference (R15) not misleading implementers into expecting something that may not be present.

**S2. Phase 3 dep edges for R6 (preferences.md) are too narrow.** (Confidence: medium)

R6 depends only on R4 in the plan. But R6's acceptance criteria say "Global preferences structure unchanged. New section: per-recipient preferences live in recipient descriptors, not in the global file." The "not in the global file" framing requires understanding the global-vs-recipient boundary, which is established in R2 (pattern.md, invariant 2: "channel files describe channels; recipient descriptors describe who"). R6 should also depend on R2. Without R2, the implementer of R6 has no authoritative source for why per-recipient prefs don't belong in the global file beyond the plan prose itself. In practice this is unlikely to cause a real bug (the design brief is available), but the dep graph should be accurate.

**S3. v0 wire's `{url}` backward-compat token tolerance is documented in migration (R15) but not in channel shape (R5).** (Confidence: medium)

The plan says agents encountering `{url}` in a channel file should treat it as equivalent to `{payload}`, and documents this in R15. But R5 (channel/adapter shape) is the reference implementers consult when writing or reading channel files. If the tolerance lives only in R15, an implementer working on a channel file won't know about it unless they also read the migration reference. The tolerance should be noted in R5's acceptance criteria too -- one sentence is sufficient.

### Note

**N1. The `self` recipient bootstrap during migration has a subtle ordering question.** (Confidence: medium)

Migration step 3 says "Creates a recipient descriptor at `~/.reach/recipients/self.md` (or appends to it) with the extracted handle mapped to this channel." With only one adapter (the current state), this is trivial. With multiple adapters (hypothetical v0 installs with `imessage.md`, `pushover.md`, etc.), the migration iterates adapters and each one "appends to" `self.md`. The plan should note that the `self.md` file is created on the first adapter iteration and extended on subsequent ones -- the "(or appends to it)" parenthetical is correct but could be misread as two alternative strategies rather than one iterative process.

**N2. R12 and R13 (recipient examples) are in Phase 4, depending on R4 (Phase 1) -- but the dep table says they depend on R4, not on R5.** These examples don't need channel shape to be written; they're pure recipient-descriptor illustrations. The dep edges are correct. Noting this because it looks odd at first glance (recipient examples in the same phase as channel examples) but the logic holds.

---

## Dep graph summary

The dep graph is largely correct. The two structural issues are:

1. R15 should depend on R4 (or explicitly document a forward-reference strategy).
2. R6 should depend on R2 in addition to R4.

Neither requires phase restructuring -- R15 can move to Phase 2 alongside R3 and R5, or stay in Phase 1 with an explicit forward-reference note. R6's additional dep on R2 doesn't change its phase (R2 is Phase 1, R6 is Phase 3).

Parallelism claims hold after corrections: Phase 1 drops from 4 to 3 parallel items if R15 moves; everything else is unchanged.

## Migration path assessment

Sound. The assisted-not-automatic strategy is right. The coexistence model (v2 reads `channels/`, falls back to `adapters/`) handles the transition cleanly. The `{url}` tolerance is the right bridge. The one gap is the `credentials` assumption (S1).

## Channel/recipient separation tractability

The plan gives sufficient guidance. The degenerate case (self-only channels keeping hardcoded recipients) is explicitly named, which prevents unnecessary migration churn. The call-shape token expansion (`{recipient}`, `{payload}`) is well-specified. An implementer sitting down to split the existing `imessage.md` adapter would know what to produce.

## Cross-repo ticket split

Clean. The plan correctly identifies that implementation tickets go in `~/Workspace/reach/.act/`, references this plan and the design brief as inputs, and notes that commit markers reference reach-repo tickets. No ambiguity about which repo owns what.

## Send-signature backward compatibility

The claim that `(recipient?, message, payload?)` is backward-compatible holds. Omitting `recipient` defaults to `self`; passing a URL as `payload` behaves identically to the old `url` parameter. Existing agents calling the old shape get correct behavior. The `{url}` token tolerance during migration is the remaining edge, and the plan handles it.

---

## Verdict: **proceed**

Two must-fix items (R5 naming decision, R15 dep edge) and three should-fix items. None require rethinking the plan's architecture. The dep graph needs minor corrections; the migration path is sound; the channel/recipient separation is tractable; the cross-repo split is clean; backward compatibility holds.
