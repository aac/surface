# Multi-round collaborative surface

This document walks through a class of surface session that spans more than one
round: multiple recipients each fill out an initial surface independently, the
agent synthesizes their submissions into a new surface, and one or more follow-up
rounds refine or resolve the output. The pattern in `pattern.md` applies
throughout — every round is a normal surface, the agent owns the intent map,
submissions are drained autonomously. What changes is that submission from one
round generates the surface for the next.

This is **illustrative, not normative**. Substrate, state shape, delivery
channel, and inter-round cadence are all agent choices. The pattern doesn't
prescribe them.

## Common moves

A multi-round collaborative session is built from a few recurring *moves*, not a
fixed sequence of stages. The ones below are common building blocks — an agent
composes whichever the task needs, in whatever order, repeating or skipping
freely. None is mandatory and there is no required progression; the shape is the
agent's to fit to the task. The part that generalizes is **the decision flow**
further down — what to weigh at each step, independent of which moves you use.

### Collection (multi-recipient)

The agent designs a surface and delivers it to several recipients. Each recipient
fills it out independently; the agent drains each submission as it arrives. The
multi-recipient shape is the same as a single-recipient surface: one URL for
each recipient or one shared URL depending on the trust model and attribution
needs (see `security.md` §7 for per-recipient URL considerations).

The agent waits for all submissions — or for enough submissions to proceed, if
the task tolerates partial input. What "enough" means is the agent's call based
on the task.

### Synthesis

When the agent has the input it needs, it reads the collected submissions and
compares them. The synthesis step is agent-side computation: reading the
submissions from state, identifying agreement and disagreement, producing a
summary or draft of the combined output.

The synthesis product — whatever the agent computes — becomes the content of the
synthesis surface. The synthesis output is not a chat message or an intermediate
file; it is rendered into a new surface and delivered back to the recipients (or
a subset of them). This keeps the interaction self-contained: recipients see the
agent's synthesis in context, with affordances for responding to it.

Pseudocode for the synthesis step:

```
submissions = read_all_collected_submissions()
agreements = []
disagreements = []

for each question in the surface schema:
    values = [s[question] for s in submissions]
    if all_same(values):
        agreements.append((question, values[0]))
    else:
        disagreements.append((question, values))

synthesis = build_synthesis(agreements, disagreements)
# synthesis is the content of the synthesis surface
```

The agent decides what "same" means and what to do with disagreements — simple
majority, explicit tiebreaking, surfacing all options for the next round.

### Voting / review

The synthesis surface presents the synthesis (the draft itinerary, the proposed
plan, the distilled options) and asks recipients to respond — vote, approve,
flag issues, rank alternatives, or request changes.

This move reuses the multi-recipient shape from collection: the agent delivers
the new surface, drains submissions autonomously, and reads results.

When votes converge — all recipients select the same option or approve the same
output — the agent can act on the consensus and conclude. When they diverge, a
tiebreaker move can follow.

### Tiebreaker (only if needed)

If a review reveals contention on specific points — recipients picked different
options, flagged incompatible constraints, or produced contradictory feedback —
the agent generates a targeted tiebreaker surface. The tiebreaker is narrower
than the full review: it presents only the contested points and the minimum input
needed to resolve them, not the full synthesis again.

A tiebreaker is not always needed. If a review already produces consensus, skip
straight to acting on the result. The tiebreaker is a release valve for genuine
disagreement, not a default step.

If the tiebreaker itself produces disagreement, the agent may generate another
narrow follow-up, or it may conclude that the decision needs a different
resolution mechanism (a designated decider, a coin flip, a structured deliberation
— outside the surface pattern).

## The decision flow

At each step, two decisions recur:

**When to move forward.** The agent moves from one round to the next when it has
enough input to act — all submissions arrived, enough to achieve quorum, a
timeout elapsed, or some task-specific condition. The criteria are the agent's to
set based on the task.

**When to add another round.** Another round is only warranted when the current
submissions are insufficient to act: genuine disagreement on a review, partial
input that leaves the synthesis ambiguous, or recipients explicitly flagging that
the synthesis missed something. Don't add rounds for thoroughness; add them for
resolution.

**When to stop.** The session is done when one of the following is true:
- The output is actionable (consensus, approved plan, resolved disagreements).
- A round fails to make progress (same disagreements as last round, no new input).
- The cost of another round exceeds the value of the resolution it would produce.

At that point, the agent acts on whatever it has — either the consensus result or
the partial result with documented caveats — and tears down any remaining surface
infrastructure.

## What stays constant across rounds

Each round is a normal surface session: the agent mints fresh affordance IDs,
persists the intent map, delivers the URL, drains autonomously. The five
invariants from `pattern.md` apply to every round independently.

What the multi-round shape adds:

- **Cross-round state.** The agent accumulates submissions from all rounds in
  whatever state form fits the substrate. The per-round state file or KV entry is
  a round-local artifact; the cross-round picture (all submissions, the
  synthesized output, the vote results) lives in agent-side state that outlasts
  any single surface.
- **Synthesis as a surface.** The output of the synthesis step is rendered as a
  surface, not delivered through another channel. This keeps the interaction in
  the medium the pattern is designed for and ensures the agent drains the response
  autonomously like any other round.
- **Session continuity.** Recipients in a multi-round session may not complete all
  rounds in one sitting. The agent's strategy for re-engaging a recipient who
  hasn't responded — re-delivering the URL, sending a reminder, waiting longer —
  is an agent choice, not specified by the pattern.

## Worked sketch

One concrete composition of the moves above — numbered here only to follow this
single scenario, not as a required template — at the pattern level (not
implementation-specific):

**Setup.** Two people need to plan a multi-day trip together. The agent builds
a trip-preference surface — destination priorities, budget, activity types,
scheduling constraints — and delivers it to both independently.

**Stage 1.** Each person fills out the surface. The agent drains both submissions.

**Stage 2.** The agent reads both submissions:
- Overlapping preferences → draft itinerary sections (confirmed).
- Conflicting preferences (one prefers cities, one prefers nature) → two itinerary
  options, one per preference style, included in the Stage 2 surface.
- Unconstrained choices → agent fills them in, noted as defaults.

The agent renders a draft itinerary surface showing the confirmed sections and
the two contested options. It mints affordances for "approve this plan" and
"pick option A / option B" on the contested sections.

**Stage 3.** Both recipients open the Stage 2 surface. One prefers Option A; the
other prefers Option B. Both approve the confirmed sections.

**Stage 4.** The agent generates a tiebreaker surface presenting only the
one contested point (city vs nature days) with specific alternatives to rank.
Both recipients respond. One of the options ranks higher for both — consensus
reached. The agent finalizes the itinerary and tears down the surface.

If Stage 3 had produced full agreement, Stage 4 would have been skipped
entirely.

## Notes

- Per-recipient URL attribution (useful when the agent needs to know which
  recipient submitted what) is a caller concern, not prescribed by the pattern.
  See `security.md` §7.
- The synthesis step may be computationally non-trivial — comparing free-text
  answers, running a model-assisted summarization, applying domain-specific
  reconciliation logic. Those are agent decisions; the pattern only specifies that
  the synthesis output becomes the next surface.
- Multi-round sessions accumulate surface state across sessions. The agent is
  responsible for lifecycle — when to clean up, how to handle a recipient who
  never responds, what to do if a round surface expires before all submissions
  arrive. See `pattern.md` §"Beyond the pattern".
