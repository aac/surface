# arc-rsv2: implementation plan -- reach v2 skill

**Arc:** `arc-reach-surface-v2`
**Ticket:** `act-3b8390`
**Status:** plan -- pre-implementation
**Primary input:** `docs/arc-reach-surface-v2-design.md` (frozen design brief)
**Carry-forward items:** `docs/reviews/arc-rsv2-synthesis-r2-2026-05-23.md`
**Target repo:** `~/Workspace/reach/`
**Target directory:** `~/Workspace/reach/skills/reach-v2/`

Implementation tickets will be filed in `~/Workspace/reach/.act/`, not in the poke repo.

---

## 1. Deliverable inventory

The reach v2 skill lives at `~/Workspace/reach/skills/reach-v2/` as a new directory alongside the existing `skills/reach/`. It ships:

| ID | Deliverable | Path |
|----|-------------|------|
| R1 | SKILL.md | `skills/reach-v2/SKILL.md` |
| R2 | references/pattern.md | `skills/reach-v2/references/pattern.md` |
| R3 | references/wire.md | `skills/reach-v2/references/wire.md` |
| R4 | references/recipient-descriptors.md | `skills/reach-v2/references/recipient-descriptors.md` |
| R5 | references/adapter-shape.md | `skills/reach-v2/references/adapter-shape.md` |
| R6 | references/preferences.md | `skills/reach-v2/references/preferences.md` |
| R7 | references/setup-workflow.md | `skills/reach-v2/references/setup-workflow.md` |
| R8 | references/security.md | `skills/reach-v2/references/security.md` |
| R9 | references/environment.md | `skills/reach-v2/references/environment.md` |
| R10 | examples/ambient-auth-adapter.md | `skills/reach-v2/examples/ambient-auth-adapter.md` |
| R11 | examples/credential-store-adapter.md | `skills/reach-v2/examples/credential-store-adapter.md` |
| R12 | examples/recipient-individual.md | `skills/reach-v2/examples/recipient-individual.md` |
| R13 | examples/recipient-team.md | `skills/reach-v2/examples/recipient-team.md` |
| R14 | Symlink | `~/.claude/skills/reach-v2` -> `~/Workspace/reach/skills/reach-v2` |
| R15 | Migration documentation | `skills/reach-v2/references/migration.md` |

---

## 2. SKILL.md structure and content outline (R1)

The v2 SKILL.md follows the v0 structural pattern (section-numbered, frontmatter with version and description) but incorporates the v2 design changes. Content is outlined here at the section level; prose is the implementer's job.

**Frontmatter:**
- `name: reach`
- `version: 0.2.0-alpha.1` (v2 starts at 0.2.0 since it inherits reach's version line, unlike surface which is a new skill)
- `description:` updated to reflect recipient model and payload generalization

**Section plan:**

1. **What reach is** -- defining property (unchanged), required mechanism (human-controlled vocabulary, unchanged), useful consequences (updated: per-contributor, composes with any structured-reply surface, agent-mediated setup). Add: reach delivers payloads of any shape (messages, files, URLs, notifications), not just `{message, url?}`.

2. **Why reach exists** -- motivating gap (unchanged). Add the one-off-friend friction case as a second motivating gap: the v0 composite adapter model made "send this to someone new" a heavyweight channel-setup workflow when it should be a lightweight recipient declaration.

3. **When to use / when not to use** -- table and rules largely preserved. Add multi-recipient and team cases to the "use reach when" list. Cross-reference to surface skill: "surface is one input-URL-minting tool among many; reach is one outbound-delivery substrate among many. Each skill cross-references the other as an example, not a required partner." Include explicit skill path (`~/.claude/skills/surface/`). Placement: one bullet in the "use reach when" list and one walked example. Reach is the preferred path for channel navigation when available; direct send is the fallback when reach isn't installed.

4. **The pattern** -- invariant summary. v2 changes to the six invariants:
   - Invariant 1: registry now includes `channels/`, `recipients/`, `preferences.md`, `environment.md`.
   - Invariant 2: "adapters describe channels" becomes "channel files describe channels; recipient descriptors describe who." Adapter files lose hardcoded recipients. The naming shifts from "adapters" to "channels" to reflect the separation.
   - Invariant 5: send signature changes from `{message, url?}` to `(recipient?, message, payload?)`.
   - Invariant 6: atomic writes discipline extends to recipient descriptors.
   - Invariants 3, 4: unchanged in substance.
   - Add: partial delivery failure requirement -- multi-recipient sends must report per-recipient outcomes.

5. **The wire (what's pinned)** -- summary of pinned inter-agent pieces. Key changes enumerated; full spec in `references/wire.md`.

6. **Channel shape** -- replaces "Adapter shape." Section describes the channel file format (same five sections, same order). Rename from "adapter" to "channel" throughout. The channel file no longer contains recipient-specific handles; those move to recipient descriptors.

7. **Recipient descriptors** -- new section. Summarizes the file shape, lifetime/kind axes, send-time composition with channels. Points to `references/recipient-descriptors.md` for full spec.

8. **Preferences** -- largely preserved. Add: per-recipient preferences live in the recipient descriptor's `## Preferences` section, not in the global preferences file. Global preferences still govern contributor-level routing.

9. **Setup workflow** -- updated to reflect:
   - Channel setup: same 5-step spine as v0, but the channel file drops hardcoded recipients.
   - Recipient creation: new lightweight workflow (2-3 turns, not 5 steps). Agent infers ephemeral/enduring from context.
   - Environment file creation: setup writes `~/.reach/environment.md` recording discovered tools, credential locations, and channel availability.
   - First-run migration: if `~/.reach/adapters/` exists but `~/.reach/channels/` does not, the setup workflow offers to migrate (see R15).

10. **What a session looks like -- send flow** -- updated send spine:
    1. Agent has something to ship.
    2. Agent reads the registry (channels dir, recipients dir, `preferences.md`, `environment.md` -- all fresh, no caching).
    3. Agent resolves recipient (explicit or default `self`).
    4. Agent picks channel per recipient's delivery preferences + global preferences + any in-session override.
    5. Credential tier resolved at channel-selection time.
    6. Agent invokes channel's call shape with `(recipient, message, payload?)`, substituting `{message}`, `{payload}`, and recipient-specific tokens from the descriptor's delivery section.
    7. For multi-recipient/team: iterate per-recipient, report per-recipient outcomes.
    8. Prefs-edit promotion: diff-quote discipline unchanged.

11. **Working with the user** -- unchanged in substance. Add: recipient creation is conversational and lightweight; the agent infers lifetime from context.

12. **Reference examples** -- two channel examples (same as v0, minus hardcoded recipients) plus two recipient descriptor examples (individual and team).

13. **Security considerations** -- updated must-fix list and deferred items. Points to `references/security.md`. Key additions: recipient descriptor provenance (same treatment as adapter provenance -- surface unknown-provenance descriptors), partial delivery failure transparency.

14. **Out of scope (v2)** -- updated from v0. Items moved in-scope: multi-recipient/team reach, environment file. Items still deferred: shared CLI binary, channel-specific tooling, routing policy engine, delivery confirmation, cross-machine sync, inbound replies, tone/templating, live updates / persistent surfaces, shared cross-skill environment schema.

---

## 3. Channel/recipient separation (brief section E)

### What changes

v0's `~/.reach/adapters/` directory with composite files (e.g., `imessage-self.md` containing both channel mechanics and a hardcoded recipient phone number) splits into:

- `~/.reach/channels/<channel>.md` -- describes *how* to reach over a channel. Same five-section structure as v0 adapters (`## Channel`, `## Capabilities`, `## Credentials`, `## Call shape`, `## Notes`), but `## Call shape` uses `{recipient}` as a substitution token instead of hardcoding a phone number/handle.
- `~/.reach/recipients/<id>.md` -- describes *who* to reach. Contains delivery info (channel + handle pairs), lifetime, kind, preferences.

### Naming: "adapters" -> "channels"

The v0 term "adapters" was accurate for composite files. With the split, the channel file describes a channel, not an adapter in the composite sense. v2 uses "channels" consistently. The directory renames from `adapters/` to `channels/`.

### Call shape token expansion

v0 substitution surface: `{message}`, `{url}`.
v2 substitution surface: `{message}`, `{payload}`, `{recipient}`.

- `{payload}` replaces `{url}` to reflect that reach delivers content of any shape. When payload is a URL, the substitution behaves identically. When payload is something else (a file path, a structured blob, a status message), the channel's `## Capabilities` section governs whether the channel can carry it.
- `{recipient}` is resolved from the recipient descriptor's delivery section -- the specific handle for this channel (a phone number, a Slack user ID, an email address). When the channel has exactly one implicit recipient (self-only), `{recipient}` still works -- it just resolves from `recipients/self.md`.

### Degenerate case: single-recipient channels

When a channel will only ever reach one recipient (the contributor's own iMessage, their own Pushover), the channel file CAN hardcode the recipient in `## Call shape` and skip the `{recipient}` token. This is the v0 shape preserved. No migration required for these channels until the contributor wants to reach a second person over the same channel.

---

## 4. Recipient descriptor file shape and lifecycle (R4, R12, R13)

### File shape

`~/.reach/recipients/<id>.md`, where `<id>` is an agent-generated slug.

```
---
lifetime: ephemeral | enduring
kind: individual | team
created_at: <ISO 8601>
created_via: setup-conversation | in-session-mint | dotfiles-import
---

## Recipient
<who this person/group is -- name, relationship, context. Free prose.>

## Delivery
<one of:
  - direct: a list of (channel, handle) pairs
  - fan-out: members: [<recipient-id>, ...]
  - shared-channel: channel: <channel>, handle: <handle>
>

## Preferences
<optional per-recipient routing prefs. Free prose.>

## Notes
<anything else.>
```

### Lifecycle

1. **Creation.** Three paths:
   - **Setup conversation** (`created_via: setup-conversation`): during reach setup, the agent creates `recipients/self.md` as the default recipient. May create additional recipients the user names.
   - **In-session mint** (`created_via: in-session-mint`): agent creates a recipient on-the-fly when the user says "send this to X." Agent infers `lifetime: ephemeral` for one-off sends. Written atomically (temp file + rename), same discipline as channel files.
   - **Dotfiles import** (`created_via: dotfiles-import`): a recipient descriptor appeared in the directory via dotfiles sync or manual creation. Treated as unknown-provenance until surfaced to the user (same discipline as unknown-provenance adapters in v0).

2. **Promotion.** An ephemeral recipient can be promoted to enduring by the agent updating the frontmatter (`lifetime: enduring`). The agent may suggest promotion when the same recipient is reached a second time. No automatic promotion -- agent judgment.

3. **Deletion.** Ephemeral recipients may be deleted after the send, or retained for potential promotion. Enduring recipients persist across sessions. Deletion of enduring recipients follows the diff-quote discipline (confirm before removing). Cleanup of stale ephemeral recipients is the agent's responsibility -- not prescribed, but the agent should not accumulate unbounded ephemeral files.

4. **`self` recipient.** Created during setup. `lifetime: enduring`, `kind: individual`. Contains the contributor's own contact handles across channels. Default recipient when no recipient is named in a send. This formalizes what was implicit in v0 (where the recipient was hardcoded in each adapter).

---

## 5. Team support (brief section E, Q2)

A team is a recipient descriptor with `kind: team`. Two delivery modes:

### Fan-out

```yaml
---
lifetime: enduring
kind: team
---
```
```
## Delivery
delivery: fan-out
members: [alice, bob, carol]
```

At send-time, reach reads each member's recipient descriptor and applies their per-recipient channel preferences. If Alice prefers iMessage and Bob prefers email, both get the message on their preferred channel. This is iteration over the member list, not a broadcast primitive.

### Shared-channel

```
## Delivery
delivery: shared-channel
channel: slack
handle: #care-team
```

Reach sends once to the shared channel handle. No per-member iteration. The channel file for `slack` must support a `{recipient}` token that resolves to a channel handle (not a person handle).

### Team lifetime

Teams can be ephemeral (ad-hoc group assembled for one task) or enduring (standing team like a care team). The lifetime axis is orthogonal to kind -- same as for individuals.

### Fan-out and partial delivery

Fan-out sends iterate per member. Each member's delivery is an independent attempt. The agent must know which members received the message and which did not -- see section 7.

---

## 6. Send signature change (brief section E)

### v0 signature
`{message: string, url?: string}`

### v2 signature
`(recipient?, message, payload?)`

- **`recipient`** (optional): slug or list of slugs from `~/.reach/recipients/`. Defaults to `self` when omitted. This preserves backward compatibility -- existing code that calls `reach.send({message: "..."})` continues to work, reaching `self` via the contributor's preferred channel.
- **`message`** (required): the text content of the send. Unchanged.
- **`payload`** (optional): replaces `url`. Can be a URL, a file path, a structured notification body, or any content the channel can carry. The channel's `## Capabilities` section governs what payload shapes it supports.

### Substitution surface change

v0: `{message}`, `{url}` in call shapes.
v2: `{message}`, `{payload}`, `{recipient}` in call shapes.

`{url}` is not a recognized token in v2. Channels migrated from v0 that use `{url}` need the token updated to `{payload}`. During the migration period, agents encountering `{url}` in a channel file should treat it as equivalent to `{payload}` -- this tolerance is documented in R15 (migration).

### Backward compatibility

- Omitting `recipient` defaults to `self`: v0 behavior preserved.
- Passing `url` as the payload value: the substitution is identical. A channel whose call shape was `send "{message} {url}"` becomes `send "{message} {payload}"` -- same runtime behavior when the payload is a URL.
- Agents reading old reach docs that describe `(message, url?)` can use the new reach without learning the multi-recipient shape -- the default-self behavior is the same.

---

## 7. Partial delivery failure

### Requirement (from brief section E)

Multi-recipient sends can partially fail. Silent partial failure -- where the agent cannot distinguish "delivered to everyone" from "delivered to 3 of 5" -- is not acceptable.

### Design

The agent iterates per-recipient for fan-out sends and tracks per-recipient outcomes. The outcome set is:

- **delivered**: the channel's call shape executed without error for this recipient.
- **failed**: the call shape errored. The error is captured.
- **skipped**: the recipient was skipped (e.g., channel not available for this recipient, recipient descriptor malformed).

The agent reports outcomes to the calling context. The exact reporting shape is the agent's decision -- the requirement is that per-recipient status is available, not that it takes a specific form. Options include:

- Structured return value with a per-recipient map.
- Prose summary naming successes and failures.
- Per-recipient log entries.

### What the skill pins

The skill pins the *requirement* (per-recipient outcomes must be available) and the *failure modes to avoid* (silent partial failure, retry-via-fallthrough). The skill does not pin the reporting shape -- that's implementation. The wire reference names the requirement; `references/wire.md` documents it as a send-time invariant.

---

## 8. Environment file -- `~/.reach/environment.md` (R9)

### Purpose

Records the contributor's reach substrate state at setup time so execution-time sends never need to scan for credentials or tools. This is the P3 (setup-time discovery, execution-time recall) application to reach.

### File shape

```
---
schema_version: 1
generated_at: <ISO 8601>
generated_via: setup-conversation
---

## Channels

- imessage: available (osascript ambient auth)
- pushover: available (token in keychain entry "pushover-token")
- email: not configured
- slack: available (slack-cli on PATH)

## Tools

- osascript: /usr/bin/osascript
- curl: /usr/bin/curl
- gh: /opt/homebrew/bin/gh (authed)
- slack: not installed

## Credentials (locations, not contents)

- PUSHOVER_USER_KEY: keychain entry "pushover-user-key"
- PUSHOVER_APP_TOKEN: keychain entry "pushover-app-token"
- (iMessage: ambient, no credential needed)
- (slack-cli: ambient, no credential needed)
```

### Lifecycle

1. **Created during setup** -- first setup conversation writes `environment.md`. Subsequent channel additions append/update sections.
2. **Read at execution** -- every send reads `environment.md` to know what channels are available and where credentials live. The file supplements (does not replace) the channel directory scan.
3. **Preflight verification** -- at session start, the agent reads `environment.md` and verifies that named credential locations are still reachable (the env var exists, the keychain entry resolves, the CLI is on PATH). Stale locations surface per P2 and the agent offers to re-run setup for affected channels.
4. **Never contains raw credentials** -- only locations and retrieval paths.

### Why this avoids credential-classifier collisions

The execution path reads a named, bounded location (`security find-generic-password -s pushover-token -w`) rather than scanning the keychain. The distinction between "read this specific entry" and "search the keychain for anything that looks like a token" is what classifiers differentiate on. The environment file structures credential access so classifiers can make informed decisions.

The skill documents that harness-level classifiers may still block named reads. If that happens, P2 applies -- the gap surfaces as a setup issue.

---

## 9. Cross-reference to surface skill

### Constraints (from brief section D, Q4)

The following constraints are pinned. SKILL.md prose satisfies them; the exact wording is the implementer's call.

1. Generic framing: "reach is one outbound-delivery substrate among many; surface is one input-URL-minting tool among many."
2. Explicit skill path: `~/.claude/skills/surface/` named so agents encountering reach can locate surface.
3. Placement: in the "When to use" section (one bullet) and in a walked example in the examples section. Never in "What reach is."
4. Reach is not URL-specific. Reach delivers payloads of any shape.
5. In-session delivery note: the agent can open the URL in the user's browser, not just paste it.
6. Reach is the preferred path for channel navigation when available. Direct send (osascript, sendmail) is the fallback when reach isn't installed.

### Anti-patterns

- No forward dependency ("load surface before using reach").
- No URL-only framing (reach delivers more than URLs).

### Future-tool slot-in

Any tool that mints an input URL (surface, a hypothetical canvas skill, a Doodle poll, a Lu.ma RSVP page) can be delivered via reach without changes to reach. The cross-reference names surface as one example of this category.

---

## 10. Setup workflow changes (R7)

### v0 setup: 5-step channel setup

Steps are preserved for channel setup in v2, with one modification: the channel file no longer hardcodes recipient handles. The `## Call shape` uses `{recipient}` as a substitution token (or hardcodes the handle if the channel is self-only -- degenerate case).

### New: recipient creation workflow

Not a formal 5-step process. The agent creates recipient descriptors conversationally:

1. User provides contact info ("send this to Alice at 555-1234").
2. Agent creates `~/.reach/recipients/alice.md` with appropriate frontmatter (ephemeral for one-off, enduring if the user implies ongoing use).
3. No test send required for recipient creation (the channel's test already validated the channel works; the recipient is just a handle).

The `self` recipient is created during initial reach setup (first channel setup conversation). The setup workflow prompts: "I'll also create your default recipient file at `~/.reach/recipients/self.md` with your contact handles across the channels we just set up."

### New: environment file creation

After channel setup completes, the agent writes or updates `~/.reach/environment.md` recording:
- Which channels are available and their auth mode.
- Which tools were found on PATH.
- Where credentials are stored (locations only).

### First-run migration

If `~/.reach/adapters/` exists but `~/.reach/channels/` does not, the setup workflow detects a v0 installation and offers migration (see section 11).

---

## 11. Migration path from v0 reach

### Scope

Existing v0 reach installs have:
- `~/.reach/adapters/<channel>.md` -- composite files with hardcoded recipients
- `~/.reach/preferences.md` -- unchanged in v2
- `~/.reach/credentials` -- unchanged in v2

v2 reach needs:
- `~/.reach/channels/<channel>.md` -- channel files without hardcoded recipients
- `~/.reach/recipients/<id>.md` -- recipient descriptors
- `~/.reach/environment.md` -- environment file
- `~/.reach/preferences.md` -- unchanged

### Migration strategy: assisted, not automatic

Migration is **offered during the first v2 setup conversation**, not performed automatically. The agent:

1. **Detects** v0 layout: `~/.reach/adapters/` exists, `~/.reach/channels/` does not.
2. **Proposes** migration: "I see your existing reach adapters. I can migrate them to the v2 format -- this separates channels from recipients and adds an environment file. Your existing preferences and credentials are unchanged. Want me to proceed?"
3. **For each adapter file**, the agent:
   - Reads the adapter.
   - Extracts the channel mechanics (everything except the hardcoded recipient handle in `## Call shape`).
   - Writes a new channel file at `~/.reach/channels/<channel>.md` with `{recipient}` replacing the hardcoded handle.
   - Creates a recipient descriptor at `~/.reach/recipients/self.md` (or appends to it) with the extracted handle mapped to this channel.
4. **Writes** `~/.reach/environment.md` from the discovered state.
5. **Preserves** `~/.reach/adapters/` as-is. The old directory is not deleted -- agents reading v0 reach can still use it. v2 reach reads from `channels/` and `recipients/`; v0 reach reads from `adapters/`. Both coexist.

### Backward compatibility during migration period

- v2 reach reads `channels/` and `recipients/`. If `channels/` doesn't exist, falls back to reading `adapters/` (v0 behavior).
- v0 reach reads `adapters/`. Unaware of `channels/` and `recipients/`.
- The two coexist without conflict. Edits to the old `adapters/` dir are not synced to `channels/` -- the migration is a one-time operation, not a bidirectional sync.

### `{url}` -> `{payload}` token tolerance

During migration, agents encountering `{url}` in a channel file treat it as equivalent to `{payload}`. This is documented in `references/migration.md` so agents don't reject migrated files that haven't been manually updated.

### Post-cutover cleanup

After v2 is validated and the old `skills/reach/` is archived, the `~/.reach/adapters/` directory can be removed. This is a user decision, not an automated step. The migration reference documents the cleanup path.

---

## 12. Dependency graph and implementation sequence

### Phase 1: Foundation (no dependencies)

These deliverables can be implemented in parallel. They have no cross-dependencies.

| Deliverable | Description | Depends on |
|-------------|-------------|------------|
| R2 | references/pattern.md -- updated invariants | -- |
| R4 | references/recipient-descriptors.md -- file shape, lifecycle, team semantics | -- |
| R9 | references/environment.md -- file shape, preflight verification | -- |
| R15 | references/migration.md -- v0 -> v2 migration path | -- |

### Phase 2: Wire and channel shape (depends on Phase 1)

These reference the pattern invariants and recipient model.

| Deliverable | Description | Depends on |
|-------------|-------------|------------|
| R3 | references/wire.md -- updated pins (substitution surface, partial delivery, recipient resolution) | R2, R4 |
| R5 | references/adapter-shape.md -- renamed to reflect channel focus; updated call shape tokens | R2, R4 |

### Phase 3: Workflows and security (depends on Phase 2)

| Deliverable | Description | Depends on |
|-------------|-------------|------------|
| R7 | references/setup-workflow.md -- updated with recipient creation, env file creation, migration detection | R3, R4, R9, R15 |
| R8 | references/security.md -- updated must-fix list, recipient provenance, partial delivery transparency, carry-forward items from synthesis | R3, R4 |
| R6 | references/preferences.md -- per-recipient prefs in descriptors, global prefs unchanged | R4 |

### Phase 4: Examples (depends on Phase 2)

| Deliverable | Description | Depends on |
|-------------|-------------|------------|
| R10 | examples/ambient-auth-adapter.md -- updated iMessage channel (no hardcoded recipient) | R5 |
| R11 | examples/credential-store-adapter.md -- updated Pushover channel (no hardcoded recipient) | R5 |
| R12 | examples/recipient-individual.md -- illustrative individual recipient | R4 |
| R13 | examples/recipient-team.md -- illustrative team recipient (fan-out and shared-channel) | R4 |

### Phase 5: SKILL.md (depends on all of the above)

| Deliverable | Description | Depends on |
|-------------|-------------|------------|
| R1 | SKILL.md -- the entry point, referencing all references and examples | R2-R13, R15 |

### Phase 6: Packaging and activation

| Deliverable | Description | Depends on |
|-------------|-------------|------------|
| R14 | Symlink `~/.claude/skills/reach-v2` -> `~/Workspace/reach/skills/reach-v2` | R1 |

### Parallelism summary

- **4 tickets in parallel** (Phase 1): R2, R4, R9, R15
- **2 tickets in parallel** (Phase 2): R3, R5
- **3 tickets in parallel** (Phase 3): R6, R7, R8
- **4 tickets in parallel** (Phase 4): R10, R11, R12, R13
- **1 ticket sequential** (Phase 5): R1
- **1 ticket sequential** (Phase 6): R14

---

## 13. Acceptance criteria per deliverable

### R1 -- SKILL.md
- Follows section plan in section 2 of this document.
- Frontmatter version is `0.2.0-alpha.1`.
- All v2 concepts present: channel/recipient separation, send signature, environment file, multi-recipient/team, partial delivery, cross-reference to surface.
- Passes the v0-style substrate-agnostic test: a fresh agent reading only SKILL.md (no v0 knowledge, no v2 design brief) can understand the pattern and build a working reach setup.
- No personal identifiers. Examples use generic placeholders.
- No harness-specific branching.

### R2 -- references/pattern.md
- Six invariants updated per section 2 (registry layout, channel/recipient split, send signature, atomic writes for recipients).
- Partial delivery failure named as a send-time requirement.
- Terms section updated (adapter -> channel, new: recipient descriptor, payload).
- Normative/illustrative boundary preserved.

### R3 -- references/wire.md
- Substitution surface updated: `{message}`, `{payload}`, `{recipient}`.
- Payload contract updated: `(recipient?, message, payload?)`.
- Partial delivery requirement documented as a send-time pin.
- Credential resolution timing: unchanged.
- Preferences frontmatter: unchanged.
- Recipient resolution: new section documenting how `{recipient}` is resolved from the descriptor's delivery section at send-time.
- Multi-recipient iteration: new section documenting fan-out semantics.
- `{url}` backward-compatibility note for migration.

### R4 -- references/recipient-descriptors.md
- File shape matches design brief section E.
- Lifetime axis: ephemeral, enduring. Kind axis: individual, team.
- Delivery modes: direct (channel + handle pairs), fan-out (member list), shared-channel (single handle).
- Lifecycle: creation, promotion, deletion, self-recipient.
- Provenance discipline: unknown-provenance descriptors surfaced, not skipped.
- No personal identifiers in examples.

### R5 -- references/adapter-shape.md
- Renamed focus: "channel shape" (title may stay as adapter-shape.md for file continuity or rename -- implementer's call).
- Five required sections unchanged in names and order.
- `## Call shape` examples use `{recipient}` and `{payload}` tokens.
- Substrate-agnostic test methodology preserved.
- Degenerate case (self-only, hardcoded recipient) documented.

### R6 -- references/preferences.md
- Global preferences structure unchanged.
- New section: per-recipient preferences live in recipient descriptors, not in the global file. Global prefs govern contributor-level routing; recipient prefs govern per-recipient overrides.
- Frontmatter fields unchanged: `quiet_hours`, `blocker_channels`, `routine_channels`.
- Conflict resolution unchanged: prose wins.

### R7 -- references/setup-workflow.md
- Channel setup: 5-step spine preserved, minus hardcoded recipients.
- Recipient creation: lightweight conversational workflow documented.
- Environment file creation: documented as part of setup completion.
- Migration detection: if v0 layout detected, offer migration.
- Sample conversation updated to show channel + recipient creation.

### R8 -- references/security.md
- v0 must-fix items preserved and updated:
  - #1 (adapter provenance) extended to recipient descriptor provenance.
  - #2 (credential-store hygiene) unchanged.
  - #3 (prefs-edit confirmation) unchanged.
  - #4 (injection-aware override) unchanged.
- New v2 items:
  - Partial delivery failure transparency: agent must not silently swallow delivery failures.
  - Recipient descriptor provenance: unknown-provenance descriptors surfaced before use.
- Carry-forward items from synthesis round 2:
  - Trusted free-text scope calibration: one concrete example of a plausible-but-out-of-scope instruction.
  - Double judgment call (recipient trust + instruction scope) as high-attention area.
  - Collaboration trust + URL forwarding walkthrough.
- Named-but-deferred items updated (add multi-recipient confused-deputy).

### R9 -- references/environment.md
- File shape matches design brief section G.
- Channels, tools, credential locations sections.
- Preflight verification documented: session-start check of credential location reachability.
- Harness-classifier interaction documented: bounded reads are the skill's intent; classifier policy is harness-level.
- Never contains raw credentials.

### R10, R11 -- channel examples
- Same two channels as v0 (iMessage ambient-auth, Pushover credential-store).
- `## Call shape` updated: `{recipient}` token replaces hardcoded phone/handle. `{payload}` replaces `{url}`.
- Degenerate self-only case noted in channel examples as a valid simplification.

### R12 -- examples/recipient-individual.md
- Individual recipient with `lifetime: ephemeral`, `kind: individual`.
- Direct delivery with one or two (channel, handle) pairs.
- Generic placeholder for name and contact info.

### R13 -- examples/recipient-team.md
- Team recipient showing both delivery modes (fan-out with member list, shared-channel with a channel handle).
- Generic placeholder names.

### R14 -- Symlink
- `~/.claude/skills/reach-v2` symlink created and functional.
- Smoke test: a fresh agent session with reach-v2 loaded can read SKILL.md and enumerate the references.

### R15 -- references/migration.md
- v0 layout detection criteria.
- Per-adapter migration steps (extract channel, extract recipient handle, write to `channels/` and `recipients/`).
- `{url}` -> `{payload}` token tolerance documented.
- `preferences.md` and `credentials` unchanged.
- Old `adapters/` directory preserved, not deleted.
- Post-cutover cleanup path documented.

---

## 14. Dogfood validation criteria

After implementation, the reach v2 skill is validated against these cases (from brief section I):

1. **Self-only send** -- `reach.send({message: "deploy finished"})`. Default recipient `self`, existing channel. Should work identically to v0.
2. **One-off friend** -- user provides a name and phone number. Agent mints ephemeral recipient, sends via iMessage. Target: 2-3 turns, not 12.
3. **Multi-recipient** -- 3+ recipients, mixed channels. Per-recipient delivery outcomes visible.
4. **Team fan-out** -- one team descriptor, fan-out to members on different channels.
5. **Cron-triggered autonomous send** -- environment file provides credential locations; no classifier collision.
6. **Surface URL delivery** -- agent has a surface URL, delivers via reach to a non-self recipient.

---

## 15. Notes for ticket filing

Implementation tickets will be filed in `~/Workspace/reach/.act/`. The plan recommends the following ticket structure aligned with the dependency graph:

- One ticket per phase, or one ticket per deliverable -- implementer's judgment based on the size of each deliverable.
- Phase 1 tickets can be dispatched in parallel.
- Phase 5 (SKILL.md) should be a single ticket -- it's the integration point that references everything else.
- Phase 6 (symlink + smoke test) is the final gate.

Tickets should reference this plan document and the frozen design brief. The act markers in commit messages should reference the reach repo's act tickets, not the poke repo's `act-3b8390` (which is this plan ticket).
