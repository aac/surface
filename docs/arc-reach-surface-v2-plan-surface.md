---
status: plan
arc: arc-reach-surface-v2
scope: surface v2 skill implementation
version_target: 0.1.0-alpha.1
---

# Surface v2 skill — implementation plan

**Arc:** `arc-reach-surface-v2`
**Spec:** `docs/arc-reach-surface-v2-design.md` (frozen)
**Synthesis:** `docs/reviews/arc-rsv2-synthesis-r2-2026-05-23.md`
**Repo:** this repo (`~/Workspace/poke`). Implementation lands in `skills/surface/` alongside the existing `skills/poke/`.

This plan covers the new `skills/surface/` directory — SKILL.md, references, and examples. It does not cover reach v2 (separate plan), cutover (post-dogfood), or the follow-on live-updates arc.

---

## 1. Directory structure

```
skills/surface/
├── SKILL.md                        # Skill entry point
├── references/
│   ├── pattern.md                  # Five invariants + collaboration trust model
│   ├── wire-example.md             # HTTP+JSON loopback wire (ported from poke, updated)
│   ├── lifecycle.md                # Drain mechanism space (ported from poke, updated)
│   ├── hosted-example.md           # Hosted substrate wire (ported from poke, updated)
│   └── security.md                 # Trust boundary, third-party shares, collaboration trust
└── examples/
    ├── server.go                   # Go reference (ported from poke)
    ├── server_test.go              # Go test suite (ported from poke)
    └── server.py                   # Python reference (ported from poke)
```

Rationale for file list:

- **pattern.md** evolves poke's `pattern.md`: same five invariants, reworded fifth ("ephemeral" becomes "task-shaped" per brief §B.Q6), plus the collaboration trust model as a new section.
- **wire-example.md** and **lifecycle.md** port from poke with naming updates (`poke` → `surface`, terminology alignment) but no structural changes — the wire is substrate-agnostic and still valid.
- **hosted-example.md** ports from poke with the provisioning-auth section generalized per brief §B.Q7: the Cloudflare Worker remains one illustration, but the general rule (any non-loopback substrate has a provisioning gate; setup records the gate and credential location) is the headline, not the specific implementation.
- **security.md** is the most changed reference — see deliverable D5 below.
- **examples/** ports a subset. Go (`server.go`, `server_test.go`) and Python (`server.py`) carry forward as orientation references. Node (`server.mjs`), Rust (`examples/rust/`), and Worker (`examples/worker/`) are not ported into v2 at alpha — they can be added post-dogfood if needed. The examples are illustration, not contract; two substrates is enough to demonstrate substrate-agnosticism.

Files **not** included in the new directory:

- No test suites for Python (`test_server.py`) or Node (`server.test.mjs`) in alpha — the Go test suite is the primary verification gate. Python and Node test suites are post-alpha work.
- No `reveal.go` (the Reveal.js helper is a convenience, not a pattern artifact).
- No worker deployment (`examples/worker/`) — hosted substrate is illustrated in `hosted-example.md` prose; the actual worker code is shared infrastructure that doesn't need to be duplicated into the surface skill.

---

## 2. Deliverables

### D1. SKILL.md

**What it is:** the skill entry point. Agents read this first; it surfaces choices and points to references for depth.

**Section plan (not prose):**

| Section | Content | Notes |
|---|---|---|
| Frontmatter | `name: surface`, `version: 0.1.0-alpha.1`, description (evolved from poke's — covers multi-recipient, collaboration, third-party share cases in addition to existing triggers) | Description is the trigger — must cover the expanded v2 use cases |
| §1 What surface is | Defining property (ad-hoc structured input via distributable interface), autonomous draining requirement, useful consequences. Evolved from poke §1 with naming update and "task-shaped" replacing "ephemeral" in the characterization | |
| §2 When to use / when not to use | Use-when / don't-use-when table. Same structure as poke §2. Adds: multi-recipient surfaces, collaboration surfaces where trusted recipients submit instructions, surfaces delivered via reach or other outbound channels. Cross-reference to reach as one example of a delivery channel (constraint: "one instance of a broader category" framing per brief §D.Q4, explicit path `~/.claude/skills/reach/`, placed here not in §1) | Cross-reference constraints from brief §B.Q4 are pass/fail criteria |
| §3 The pattern | Five invariants summary with pointer to `references/pattern.md`. Same structure as poke §3; fifth invariant reworded to "task-shaped" | |
| §4 The wire example | Pointer to `references/wire-example.md`. Same structure as poke §4 | |
| §5 Lifecycle mechanisms | Pointer to `references/lifecycle.md`. Same structure as poke §5 | |
| §6 Working with the user | Setup vs interaction distinction. Interactive vs autonomous invocation. Affordance design rules (minimum-effort, escape hatch, one-affordance-one-intent, confirmation copy, surface-owns-result). Ported from poke §6 with naming updates | |
| §7 Environment and setup | New section. Points to `~/.surface/environment.md`. Names the setup-time discovery / execution-time recall split (brief §A.P3, §G). Preflight verification at session start. Does NOT contain the environment file shape — that's reference-level content (wire shape, per brief constraint) | |
| §8 Reference examples | Pointer to `examples/`. Same structure as poke §7 with naming update. Substrate-agnostic test language preserved | |
| §9 Security considerations | Pointer to `references/security.md`. Same structure as poke §8 but expanded headline: "defaults are low-risk; third-party shares and collaboration surfaces need explicit trust decisions" | |

**What SKILL.md does NOT contain:**

- Environment file shape (reference-level per brief constraint on wire shapes).
- Recipient descriptors (reach-side content).
- Exact cross-reference prose (constraints are in the brief; the drafter writes sentences satisfying them).
- Personal identifiers (brief §"Note on personal identifiers").
- Harness-specific branching (principle P8 / brief §A).

**Acceptance criteria:**

- [ ] Frontmatter has `version: 0.1.0-alpha.1`.
- [ ] All nine sections present per the table above.
- [ ] Cross-reference to reach satisfies all six constraints from brief §B.Q4: generic "one instance of a broader category" framing; explicit `~/.claude/skills/reach/` path; placed in §2 (when-to-use), not §1; reach not framed as URL-specific; in-session delivery notes browser-open option; reach preferred over direct send when available.
- [ ] Fifth invariant uses "task-shaped" not "ephemeral" (brief §B.Q6).
- [ ] §7 names the setup/execution split without containing the environment file schema.
- [ ] No personal identifiers, no harness-specific branching.
- [ ] Skill description in frontmatter triggers on multi-recipient, collaboration, and third-party-share cases (v2 scope) in addition to existing poke triggers.

### D2. references/pattern.md

**What it is:** the five invariants (the contract) plus the collaboration trust model.

**Content plan:**

- Five invariants: ported from poke's `pattern.md` with invariant 5 reworded ("task-shaped" replaces "ephemeral" — surfaces are generated for a task and discarded after, but "task" admits multi-hour collaboration canvases, not just single-shot approval gates).
- Terms section: ported. Add "recipient" (who the surface is shared with — an individual or team; may be the operator or a third party).
- Normative vs illustrative section: ported.
- Substrate examples: ported.
- Agent responsibilities ("beyond the pattern"): ported, with one addition — "collaboration trust decisions" listed alongside existing operational concerns. The agent decides who is trusted; the pattern names the question.
- **New section: collaboration trust model.** Concise statement of the v2 trust posture:
  - Default: submissions from non-operator recipients are untrusted free-text input.
  - Override: operator can declare specific recipients as trusted for instruction-bearing input.
  - Trusted recipients' structured affordance selections are instructions; their free-text CAN be instructions within the surface's scope.
  - The pattern names the default, the override, and the residual risk; mechanism is the agent's.
  - Points to `security.md` for the full threat model, attack walkthrough, and calibration examples.

**Acceptance criteria:**

- [ ] Five invariants present; invariant 5 uses "task-shaped."
- [ ] Collaboration trust model section present with default posture, override, and pointer to security.md.
- [ ] No personal identifiers.
- [ ] Normative/illustrative distinction preserved.

### D3. references/wire-example.md

**What it is:** the HTTP+JSON loopback wire illustration. Same content as poke's `wire-example.md` with naming updates.

**Changes from poke version:**

- `poke` → `surface` throughout.
- "poke session" → "surface session."
- No structural changes to routes, state shape, submission semantics, or SUBMIT line format.

**Acceptance criteria:**

- [ ] All `poke` references replaced with `surface`.
- [ ] State schema, routes, SUBMIT line format unchanged.
- [ ] No personal identifiers.

### D4. references/lifecycle.md

**What it is:** drain mechanism space. Same content as poke's `lifecycle.md` with naming updates.

**Changes from poke version:**

- `poke` → `surface` throughout.
- No structural changes to the four mechanism shapes or the Monitor worked example.

**Acceptance criteria:**

- [ ] All `poke` references replaced with `surface`.
- [ ] Four mechanism shapes preserved.
- [ ] No personal identifiers.

### D5. references/security.md

**What it is:** the most substantively changed reference. Evolves from poke's `security.md` to cover the v2 trust model for third-party shares and collaboration.

**Content plan (seven sections, per brief §F):**

| # | Section | Source | Notes |
|---|---|---|---|
| 1 | Submission envelope vs content trust boundary | Poke v0, sharpened | The foundation — structured envelope is trusted, free-text/file content is not |
| 2 | Third-party-share default rule | New (brief §F) | By default, any non-operator submission is untrusted free-text regardless of relationship, intent, or registry status |
| 3 | Operator-trust override and collaboration trust | New (brief §F) | Operator can declare recipients trusted; trusted recipients' free-text CAN be instructions within scope; residual risks named |
| 4 | Trusted free-text scope calibration | New (synthesis carry-forward #1) | **Carry-forward item.** One concrete example of a plausible-but-out-of-scope instruction (e.g., a collaborator on a design-review surface asking the agent to send project data to an external address). Exercises the double judgment call: is the recipient trusted? yes. Is the instruction within scope? no — the surface's purpose is design review, not data export. This calibrates agent inference on "within the surface's scope" |
| 5 | Collaboration trust + URL forwarding walkthrough | New (synthesis carry-forward #3) | **Carry-forward item.** Concrete walkthrough of the forwarding vector: operator sets up a per-surface-trust URL for a team review; a team member forwards the URL to an outsider; the outsider submits instructions; because trust is per-surface (not per-recipient), the outsider inherits the trust declaration. Contrasts with per-recipient URLs where forwarding does not transfer trust. Names the granularity choice and the risk tradeoff |
| 6 | Deployment posture | Poke v0, updated | Loopback default, LAN/tunnel/hosted concerns. Hosted provisioning generalized per brief §B.Q7 — the Cloudflare Worker is one illustration; the general rule is "any non-loopback substrate has a provisioning gate; setup records the gate and credential location in environment.md." The investigation note from brief §J.3 (direct-KV-write vs token-gated provisioning) is named as an open question, not resolved here |
| 7 | Cross-tool replay and submission attribution | Poke v0 (replay), new (attribution per brief §F item 6) | Attribution options: anonymous, sign-in (out of v2 scope), per-recipient URLs (v2-recommended for attributed multi-recipient). Naming avoidance: "attack surface" is rephrased to avoid collision with the skill name (synthesis round-1 authoring mitigation) |

**Carry-forward items addressed:**

1. **Trusted free-text scope calibration example** (synthesis item #1, security review Stance 1, cold-eye collaboration trust coherence check): section 4 above. One plausible-but-out-of-scope instruction, exercising both halves of the double judgment call.
2. **Double judgment call as high-attention area** (synthesis item #2): exercised in sections 4 and 5 — the scope calibration example exercises the "trusted but out of scope" case; the forwarding walkthrough exercises the "not actually trusted but treated as such due to per-surface granularity" case.
3. **Collaboration trust + URL forwarding walkthrough** (synthesis item #3, security review N2): section 5 above.

**Acceptance criteria:**

- [ ] All seven sections present.
- [ ] Third-party-share default rule states: non-operator submissions are untrusted by default regardless of relationship.
- [ ] Collaboration trust model names: default posture, operator-trust override, scope-bounded trusted free-text, residual risk.
- [ ] Scope calibration example present with a concrete plausible-but-out-of-scope instruction (carry-forward #1).
- [ ] URL forwarding walkthrough present contrasting per-surface vs per-recipient trust granularity (carry-forward #3).
- [ ] Double judgment call exercised across sections 4 and 5 (carry-forward #2).
- [ ] Hosted provisioning generalized — Cloudflare Worker is illustration, not canonical.
- [ ] "Attack surface" phrasing avoided per synthesis authoring mitigation.
- [ ] No personal identifiers.

### D6. references/hosted-example.md

**What it is:** the hosted substrate wire illustration. Evolves from poke's `hosted-example.md`.

**Changes from poke version:**

- `poke` → `surface` throughout.
- Provisioning section generalized: the headline is the general rule (non-loopback substrates have provisioning gates; setup records gate + credential location). The Cloudflare Worker is walked as one concrete realization.
- Personal deployment URLs removed; examples use generic placeholders.
- The investigation note from brief §J.3 (direct-KV-write vs token-gated /_provision) is stated as an open question — this reference does not bless either path.

**Acceptance criteria:**

- [ ] All `poke` references replaced with `surface`.
- [ ] Provisioning section leads with the general rule, not the Cloudflare-specific implementation.
- [ ] No personal identifiers or deployment URLs.
- [ ] Brief §J.3 investigation note present as open question.

### D7. examples/ (ported reference servers)

**What it is:** Go and Python reference server ports.

**Changes from poke versions:**

- Internal naming: variable names, comments, log messages that say `poke` become `surface`.
- No functional changes to the server logic, routes, state schema, or SUBMIT line format.
- Go test suite (`server_test.go`) ported with naming updates.

**Acceptance criteria:**

- [ ] `examples/server.go` compiles: `go build ./skills/surface/examples/`.
- [ ] `examples/server_test.go` passes: `go test ./skills/surface/examples/`.
- [ ] `examples/server.py` runs: `python3 skills/surface/examples/server.py --help` exits 0.
- [ ] All `poke` references in comments/logs replaced with `surface`.
- [ ] State schema unchanged (session_id, affordances, submissions).

### D8. Plugin manifest update

**What it is:** `.claude-plugin/plugin.json` updated to register the surface skill alongside poke.

**Changes:**

- Add `skills/surface/` entry pointing at `skills/surface/SKILL.md`.
- Version bumped to align with surface `0.1.0-alpha.1`.
- Existing `skills/poke/` entry preserved (both skills coexist during dogfood).

**Acceptance criteria:**

- [ ] `plugin.json` lists both `skills/poke/` and `skills/surface/`.
- [ ] Version field matches `0.1.0-alpha.1`.

### D9. Symlink setup documentation

**What it is:** a note (in this plan, not a separate file) on the symlink for dogfood.

`~/.claude/skills/surface` → `~/Workspace/poke/skills/surface`

The existing `~/.claude/skills/poke` symlink stays in place. Both skills are accessible during dogfood. Symlink creation is a manual step Andrew runs once, not an automated install.

---

## 3. Dependency graph

```
          D3 (wire-example)
         /
D2 (pattern) ─── D4 (lifecycle)
  \        \
   \        D6 (hosted-example)
    \
     D5 (security) ← depends on D2 for collaboration trust model section
      
D1 (SKILL.md) ← depends on D2, D3, D4, D5, D6 (references must exist for pointers to be valid)

D7 (examples) ← independent of all reference docs

D8 (plugin.json) ← depends on D1 (needs SKILL.md path)

D9 (symlink) ← depends on D8
```

### Parallelizable units

**Group A — independent, can run in parallel:**

- D2 (pattern.md)
- D3 (wire-example.md)
- D4 (lifecycle.md)
- D6 (hosted-example.md)
- D7 (examples/)

D3, D4, and D6 are mechanical ports (naming updates only). D2 and D7 have modest new content.

**Group B — depends on D2:**

- D5 (security.md) — references the collaboration trust model defined in D2's new section.

D5 is the largest deliverable and benefits from D2 being settled first so the trust model language is consistent.

**Group C — depends on Group A + B:**

- D1 (SKILL.md) — points to all five references. Must be written after references exist so section pointers, cross-references, and the description are grounded in real content.

**Group D — depends on D1:**

- D8 (plugin.json update)
- D9 (symlink setup)

### Sequencing summary

```
Pass 1 (parallel):  D2, D3, D4, D6, D7
Pass 2 (serial):    D5
Pass 3 (serial):    D1
Pass 4 (parallel):  D8, D9
```

Minimum serial depth: 4 passes. Passes 1 and 4 are internally parallel.

---

## 4. Constraints

- **Personal identifiers excluded.** No contributor-specific names, environments, handles, or deployment URLs in any skill content. Examples use generic placeholders.
- **Wire shapes are reference-level.** The environment file schema (`~/.surface/environment.md`) and recipient descriptor shape are documented in references, not in SKILL.md. SKILL.md names the concept; references carry the shape.
- **Cross-reference constraints, not prose.** Brief §B.Q4 pins six testable constraints for how surface references reach. The implementation satisfies the constraints; the exact sentences are the drafter's call.
- **Substrate-agnostic.** No canonical substrate. The Go and Python examples are illustrations; the pattern is the contract.
- **This plan lives in the poke repo.** Implementation also happens here, in `skills/surface/`. Implementation tickets are not filed by this plan — that's the orchestrator's job after plan review.

---

## 5. Carry-forward items from synthesis — disposition

| # | Item | Source | Disposition in this plan |
|---|---|---|---|
| 1 | Trusted free-text scope calibration example | Synthesis §1; security review Stance 1; cold-eye coherence check | Addressed in D5 section 4. Concrete plausible-but-out-of-scope instruction exercising both halves of the double judgment call. |
| 2 | Double judgment call as high-attention area | Synthesis §2; cold-eye review; security review N1 | Addressed across D5 sections 4 and 5. Section 4 exercises "trusted but out of scope"; section 5 exercises "treated as trusted due to granularity choice but actually untrusted." |
| 3 | Collaboration trust + URL forwarding walkthrough | Synthesis §3; security review N2 | Addressed in D5 section 5. Concrete walkthrough contrasting per-surface vs per-recipient trust granularity under forwarding. |
| 4 | Round-1 deferred items (unchanged) | Synthesis §4 | Remain deferred. These are reach-side (ephemeral recipient cleanup, urgency semantics), cross-skill (environment file portability, per-skill divergence), or follow-on arc scope (TTL exposure-window framework). None are surface-skill deliverables. |

---

## 6. Version frontmatter

Surface SKILL.md starts at `version: 0.1.0-alpha.1`. The `0.1.0` line reflects that surface is a new skill (not a patch release of poke). Alpha qualifier reflects pre-dogfood status. Each dogfood-incorporated change patch-bumps the alpha (`0.1.0-alpha.2`, etc.). Final release is `0.1.0`.

`.claude-plugin/plugin.json` version updates to `0.1.0-alpha.1` in lockstep per CLAUDE.md versioning rule.

---

## 7. Acceptance criteria — plan level

- [ ] All nine deliverables (D1–D9) have per-deliverable acceptance criteria.
- [ ] Dependency graph identifies four passes with parallelizable units.
- [ ] All three synthesis carry-forward items are explicitly addressed with specific deliverable and section references.
- [ ] Plan does not file implementation tickets (orchestrator responsibility).
- [ ] Plan does not contain personal identifiers.
- [ ] Plan does not prescribe exact prose for SKILL.md or cross-references (constraints, not sentences).
