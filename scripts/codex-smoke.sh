#!/usr/bin/env bash
# Usage:
#   ./scripts/codex-smoke.sh [--skip-install]
#
# Codex Phase 1 smoke test for the surface skill.
#
# What this script does automatically:
#   1. Confirms ~/.codex/ exists and Codex CLI is reachable.
#   2. Confirms or installs the skill at ~/.codex/skills/surface/.
#      Install mechanism: symlink from the repo checkout (preferred);
#      copy fallback for environments that reject symlinks.
#   3. Verifies SKILL.md and core references are readable from the
#      installed location and reports the version in place.
#   4. Runs the Go reference server against a minimal two-affordance
#      state file, submits both affordances via curl, and verifies the
#      SUBMIT lines land on stdout — exercising the wire end-to-end
#      without a Codex session.
#   5. Prints numbered manual-verification steps for the parts that
#      require a live Codex session.
#
# What it does NOT do:
#   - Start a Codex session or interact with the Codex TUI.
#   - Verify how Codex loads the skill (that's a manual step).
#   - Require network access (all verification is local).
#
# Prerequisites:
#   - ~/.codex/ must exist (Codex installed).
#   - go must be on PATH (for reference server smoke test).
#   - curl must be on PATH.
#   - Run from the repo root (or any directory; the script locates the
#     repo root from its own path).
#
# Flags:
#   --skip-install   Skip skill installation; verify against whatever
#                    is already at ~/.codex/skills/surface/.

set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

step_num=0

step() {
  step_num=$((step_num + 1))
  printf "\n${BOLD}[%d] %s${RESET}\n" "$step_num" "$*"
}

ok() {
  printf "    ${GREEN}ok:${RESET} %s\n" "$*"
}

warn() {
  printf "    ${YELLOW}warn:${RESET} %s\n" "$*"
}

fail() {
  printf "    ${RED}FAIL:${RESET} %s\n" "$*" >&2
  exit 1
}

manual() {
  printf "\n${BOLD}--- MANUAL STEP %s ---${RESET}\n" "$1"
  printf "%s\n" "$2"
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

SKIP_INSTALL=false

for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=true ;;
    -h|--help)
      sed -n '/^# Usage:/,/^[^#]/p' "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
    *) fail "unknown argument: $arg (try --help)" ;;
  esac
done

# ---------------------------------------------------------------------------
# Locate repo root
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Walk up from the script directory looking for skills/surface/SKILL.md
REPO_ROOT=""
dir="$SCRIPT_DIR"
while [[ "$dir" != "/" ]]; do
  if [[ -f "$dir/skills/surface/SKILL.md" ]]; then
    REPO_ROOT="$dir"
    break
  fi
  dir="$(dirname "$dir")"
done
[[ -n "$REPO_ROOT" ]] || fail "Could not locate repo root (skills/surface/SKILL.md not found walking up from $SCRIPT_DIR)"

SKILL_SOURCE="${REPO_ROOT}/skills/surface"

# ---------------------------------------------------------------------------
# Step 1: Confirm Codex is installed
# ---------------------------------------------------------------------------

step "Confirm Codex installation"

[[ -d "${HOME}/.codex" ]] \
  || fail "~/.codex/ does not exist. Install Codex first: https://openai.com/codex"
ok "~/.codex/ found"

if command -v codex &>/dev/null; then
  CODEX_VERSION="$(codex --version 2>/dev/null || echo "unknown")"
  ok "codex CLI found: $CODEX_VERSION"
else
  warn "codex CLI not on PATH; manual steps below will need it"
fi

# ---------------------------------------------------------------------------
# Step 2: Install or verify the skill
# ---------------------------------------------------------------------------

step "Skill installation at ~/.codex/skills/surface/"

SKILLS_DIR="${HOME}/.codex/skills"
INSTALL_DEST="${SKILLS_DIR}/surface"

if $SKIP_INSTALL; then
  ok "--skip-install: skipping install step"
else
  # Ensure skills directory exists
  if [[ ! -d "$SKILLS_DIR" ]]; then
    mkdir -p "$SKILLS_DIR" || fail "Could not create $SKILLS_DIR"
    ok "Created $SKILLS_DIR"
  fi

  if [[ -L "$INSTALL_DEST" ]]; then
    EXISTING_TARGET="$(readlink "$INSTALL_DEST")"
    if [[ "$EXISTING_TARGET" == "$SKILL_SOURCE" ]]; then
      ok "Already installed (symlink): $INSTALL_DEST -> $SKILL_SOURCE"
    else
      warn "Symlink points elsewhere ($EXISTING_TARGET); replacing with $SKILL_SOURCE"
      rm "$INSTALL_DEST"
      ln -s "$SKILL_SOURCE" "$INSTALL_DEST" \
        || fail "Could not create symlink $INSTALL_DEST -> $SKILL_SOURCE"
      ok "Replaced symlink: $INSTALL_DEST -> $SKILL_SOURCE"
    fi
  elif [[ -d "$INSTALL_DEST" ]]; then
    warn "Directory install found (not a symlink) at $INSTALL_DEST; leaving as-is."
    warn "To upgrade to a live symlink: rm -rf $INSTALL_DEST && ln -s $SKILL_SOURCE $INSTALL_DEST"
  else
    # Attempt symlink; fall back to copy
    if ln -s "$SKILL_SOURCE" "$INSTALL_DEST" 2>/dev/null; then
      ok "Installed (symlink): $INSTALL_DEST -> $SKILL_SOURCE"
    else
      warn "Symlink failed; falling back to copy"
      cp -r "$SKILL_SOURCE" "$INSTALL_DEST" \
        || fail "Copy also failed. Check permissions on $SKILLS_DIR"
      ok "Installed (copy): $INSTALL_DEST"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Step 3: Verify skill content is readable
# ---------------------------------------------------------------------------

step "Verify skill content at install location"

[[ -f "${INSTALL_DEST}/SKILL.md" ]] \
  || fail "SKILL.md not found at $INSTALL_DEST/SKILL.md"
ok "SKILL.md present"

for ref in pattern.md lifecycle.md wire-example.md security.md; do
  [[ -f "${INSTALL_DEST}/references/${ref}" ]] \
    || fail "references/$ref not found at $INSTALL_DEST/references/$ref"
  ok "references/$ref present"
done

# Extract and report version
SKILL_VERSION="$(grep '^version:' "${INSTALL_DEST}/SKILL.md" | head -1 | awk '{print $2}')"
ok "Skill version in place: ${SKILL_VERSION:-unknown}"

PLUGIN_VERSION="$(python3 -c "
import json
with open('${REPO_ROOT}/.codex-plugin/plugin.json') as f:
    d = json.load(f)
print(d.get('version','unknown'))
" 2>/dev/null || echo "unknown")"
ok "plugin.json version: $PLUGIN_VERSION"

if [[ "$SKILL_VERSION" != "$PLUGIN_VERSION" ]]; then
  warn "Version mismatch: SKILL.md=$SKILL_VERSION vs .codex-plugin/plugin.json=$PLUGIN_VERSION"
  warn "These should be in lockstep per AGENTS.md versioning rule."
fi

# ---------------------------------------------------------------------------
# Step 4: Wire smoke test (reference server + curl)
# ---------------------------------------------------------------------------

step "Wire smoke test: reference server + curl submission"

if ! command -v go &>/dev/null; then
  warn "go not found on PATH; skipping wire smoke test"
  warn "To run manually: install Go and re-run without --skip-install"
else
  TMPDIR_SMOKE="$(mktemp -d /tmp/surface-smoke.XXXXXX)"
  trap 'rm -rf "$TMPDIR_SMOKE"; kill "$SERVER_PID" 2>/dev/null || true' EXIT

  STATE_FILE="${TMPDIR_SMOKE}/state.json"
  HTML_FILE="${TMPDIR_SMOKE}/surface.html"
  LOG_FILE="${TMPDIR_SMOKE}/server.log"
  SMOKE_PORT=15173

  # Write minimal two-affordance state
  cat > "$STATE_FILE" <<'EOF'
{
  "session_id": "smoke-test-session",
  "affordances": {
    "aff-approve": { "label": "Approve", "intent": "approve_smoke" },
    "aff-reject":  { "label": "Reject",  "intent": "reject_smoke"  }
  },
  "submissions": []
}
EOF

  # Write minimal HTML surface
  cat > "$HTML_FILE" <<'EOF'
<!doctype html>
<html><body>
  <p>Smoke test surface</p>
  <button id="approve" onclick="
    fetch('/submit',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id:'aff-approve',payload:null})})
    .then(()=>document.getElementById('approve').innerText='Approved')
  ">Approve</button>
  <button id="reject" onclick="
    fetch('/submit',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id:'aff-reject',payload:null})})
    .then(()=>document.getElementById('reject').innerText='Rejected')
  ">Reject</button>
</body></html>
EOF

  # Build the reference server to a temp binary (avoids go-run orphan hazard)
  SERVER_BIN="${TMPDIR_SMOKE}/surface-serve"
  ok "Building reference server..."
  if ! go build -o "$SERVER_BIN" "${SKILL_SOURCE}/examples/server.go" 2>"${TMPDIR_SMOKE}/build.log"; then
    # server.go may need the go.mod context; try with the examples dir as context
    if ! go build -C "${SKILL_SOURCE}/examples" -o "$SERVER_BIN" . 2>>"${TMPDIR_SMOKE}/build.log"; then
      warn "go build failed; server.go may require module context"
      cat "${TMPDIR_SMOKE}/build.log" >&2
      warn "Skipping wire smoke test; build error above"
      SERVER_BIN=""
    fi
  fi

  if [[ -n "$SERVER_BIN" ]]; then
    ok "Reference server built: $SERVER_BIN"

    # Start server in background, capturing stdout
    "$SERVER_BIN" \
      --state "$STATE_FILE" \
      --html  "$HTML_FILE" \
      --port  "$SMOKE_PORT" \
      > "$LOG_FILE" 2>&1 &
    SERVER_PID=$!

    # Wait for server to be ready (up to 5s)
    READY=false
    for i in $(seq 1 10); do
      if curl -sf "http://127.0.0.1:${SMOKE_PORT}/" -o /dev/null 2>/dev/null; then
        READY=true
        break
      fi
      sleep 0.5
    done

    if ! $READY; then
      warn "Server did not become ready within 5s"
      warn "Server log:"
      cat "$LOG_FILE" >&2
    else
      ok "Server is ready on port $SMOKE_PORT"

      # Submit affordance 1
      RESP1="$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "http://127.0.0.1:${SMOKE_PORT}/submit" \
        -H "Content-Type: application/json" \
        -d '{"id":"aff-approve","payload":null}')"
      [[ "$RESP1" == "200" ]] \
        || fail "Expected 200 from /submit for aff-approve, got $RESP1"
      ok "aff-approve submitted (HTTP $RESP1)"

      # Submit affordance 2
      RESP2="$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "http://127.0.0.1:${SMOKE_PORT}/submit" \
        -H "Content-Type: application/json" \
        -d '{"id":"aff-reject","payload":null}')"
      [[ "$RESP2" == "200" ]] \
        || fail "Expected 200 from /submit for aff-reject, got $RESP2"
      ok "aff-reject submitted (HTTP $RESP2)"

      # Verify SUBMIT lines landed in server stdout
      SUBMIT_COUNT="$(grep -c '^SUBMIT ' "$LOG_FILE" 2>/dev/null || echo 0)"
      [[ "$SUBMIT_COUNT" -ge 2 ]] \
        || fail "Expected >=2 SUBMIT lines in server stdout, got $SUBMIT_COUNT. Log: $LOG_FILE"
      ok "SUBMIT lines in server stdout: $SUBMIT_COUNT"

      grep '^SUBMIT ' "$LOG_FILE" | while IFS= read -r line; do
        ok "  $line"
      done

      # Verify state file was updated
      SUBMISSION_COUNT="$(python3 -c "
import json
with open('${STATE_FILE}') as f:
    d = json.load(f)
print(len(d.get('submissions', [])))
" 2>/dev/null || echo 0)"
      [[ "$SUBMISSION_COUNT" -ge 2 ]] \
        || fail "Expected >=2 submissions in state file, got $SUBMISSION_COUNT"
      ok "State file updated with $SUBMISSION_COUNT submission(s)"

      # Kill server
      kill "$SERVER_PID" 2>/dev/null || true
      trap - EXIT
      rm -rf "$TMPDIR_SMOKE"

      ok "Wire smoke test passed."
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Manual verification steps
# ---------------------------------------------------------------------------

printf "\n${BOLD}======================================================${RESET}\n"
printf "${BOLD}  MANUAL VERIFICATION STEPS (requires Codex session)  ${RESET}\n"
printf "${BOLD}======================================================${RESET}\n"

manual "M1" "Verify skill loads in a Codex session.

  Start a fresh Codex session in any project directory:
    codex

  Ask: 'What skills do you have available? Do you have a skill called surface?'

  Pass criteria:
    - Codex confirms it has the surface skill.
    - Codex can describe what surface does (ad-hoc input collection via
      distributable interfaces, autonomous draining of submissions).
    - Codex does NOT describe surface as Claude Code-specific; its
      description should be substrate-agnostic.

  What to look for (friction signals):
    - Any mention of 'Claude Code', 'Monitor tool', or 'ScheduleWakeup'
      as *required* primitives (not as options among others) would
      indicate Claude-Code-specific language leaked into the skill.
    - If Codex says it doesn't have the skill, check ~/.codex/skills/
      and restart the session."

manual "M2" "Verify skill trigger: agent identifies when to use surface.

  In the same Codex session, describe a scenario without naming surface:
    'I need to send an approval request to a colleague who isn't in chat.
     They need to pick one of three options and I need to react to their
     choice automatically. What would you use?'

  Pass criteria:
    - Codex identifies the surface skill as the right tool.
    - Codex explains the pattern in substrate-neutral terms (a URL that
      delivers a structured form, autonomous draining of the submission).
    - Codex does not mention Claude Code, Monitor, or ScheduleWakeup as
      *requirements* — these may appear as one option among others, but
      should not be framed as mandatory.

  What to look for (friction signals):
    - If Codex says 'I can't run a local server' and stops, that's
      friction worth noting — the skill should be guiding Codex toward
      substrate alternatives (hosted, Cloudflare Worker, etc.)."

manual "M3" "Verify one end-to-end surface flow (no Claude-specific primitives).

  Ask Codex to build a minimal surface:
    'Using the surface skill, build a two-choice approval surface with
     Approve and Reject buttons. Start a local HTTP server on any free port,
     deliver the URL to me in chat, and when I submit a choice tell me what
     you received.'

  Expected Codex behavior:
    1. Codex mints opaque affordance IDs (won't be 'approve'/'reject' — they
       will be random hex or similar).
    2. Codex writes state.json and surface.html, starts a server (any
       language, any mechanism — it should pick what's available in Codex's
       environment, not assume Go is present).
    3. Codex delivers the URL in chat.
    4. You open the URL in your browser; click one button.
    5. Codex reacts and reports back what you clicked, without any prompting.

  Pass criteria:
    - Codex completes the flow end-to-end.
    - The drain mechanism is whatever Codex chose for its environment
      (polling, callback, any mechanism) — NOT necessarily Monitor.
    - The affordance IDs in state.json are opaque (random-looking), not
      the human-readable labels.
    - Codex reports the correct affordance intent when you click.

  What to look for (friction signals):
    - Codex stalls waiting for you to 'tell it you clicked' instead of
      draining autonomously — that's an autonomous-draining failure.
    - Codex tries to use Monitor or KillShell and fails — those are
      Claude Code primitives, not Codex primitives.
    - Codex produces code with 'claude_code_monitor' or similar harness-
      specific calls in the implementation.
    - Codex says it can't run a server at all and gives up — the skill
      should be guiding it toward alternatives."

manual "M4" "Verify existing Claude Code behavior is unchanged.

  In a Claude Code session (not Codex), trigger the surface skill on a
  similar scenario:
    'I need to send a two-option approval to someone not in chat.
     What would you use?'

  Pass criteria:
    - Claude Code still identifies surface and describes it correctly.
    - Claude Code's suggested mechanism for draining is Monitor + Bash
      run_in_background (the Claude-Code-native path).
    - No behavioral regression from prior usage.

  This step confirms the Codex install didn't disturb the Claude Code
  install at ~/.claude/skills/surface/."

printf "\n${BOLD}======================================================${RESET}\n"
printf "${BOLD}  AUTOMATED STEPS COMPLETE                            ${RESET}\n"
printf "${BOLD}======================================================${RESET}\n\n"
printf "Skill installed at: %s\n" "${INSTALL_DEST}"
printf "Skill version:      %s\n" "${SKILL_VERSION:-unknown}"
printf "Repo source:        %s\n" "${SKILL_SOURCE}"
printf "\nWork through manual steps M1–M4 above to complete Codex Phase 1 verification.\n"
printf "See scripts/codex-smoke.md for expected outputs and friction-signal details.\n\n"
