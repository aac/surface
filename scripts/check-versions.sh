#!/usr/bin/env bash
# Single source of truth for surface's version-lockstep check.
#
# Verifies the version string is identical across all FOUR packaging
# manifests. Run by CI (.github/workflows/ci.yml) and the .githooks/pre-commit
# hook so drift can't land. See the "Versioning" section in AGENTS.md.
#
# The fourth manifest (.claude-plugin/marketplace.json) was historically
# unchecked and silently drifted to 0.8.0 while the other three stayed at
# 0.8.1 — this script exists so that can't recur.
#
# Exits non-zero (and prints the mismatches) if any version disagrees.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

skill=$(grep -m1 '^version:' skills/surface/SKILL.md | sed 's/version:[[:space:]]*//')
claude_plugin=$(python3 -c 'import json;print(json.load(open(".claude-plugin/plugin.json"))["version"])')
codex_plugin=$(python3 -c 'import json;print(json.load(open(".codex-plugin/plugin.json"))["version"])')
marketplace=$(python3 -c 'import json;d=json.load(open(".claude-plugin/marketplace.json"));print(d["plugins"][0]["version"])')

printf '  %-36s %s\n' "skills/surface/SKILL.md" "$skill"
printf '  %-36s %s\n' ".claude-plugin/plugin.json" "$claude_plugin"
printf '  %-36s %s\n' ".codex-plugin/plugin.json" "$codex_plugin"
printf '  %-36s %s\n' ".claude-plugin/marketplace.json" "$marketplace"

fail=0
for pair in ".claude-plugin/plugin.json:$claude_plugin" \
            ".codex-plugin/plugin.json:$codex_plugin" \
            ".claude-plugin/marketplace.json:$marketplace"; do
  name=${pair%:*}; val=${pair##*:}
  if [ "$val" != "$skill" ]; then
    echo "  MISMATCH: $name ($val) != skills/surface/SKILL.md ($skill)" >&2
    fail=1
  fi
done

if [ "$fail" -eq 0 ]; then
  echo "  all four version strings match: ok"
else
  echo "  fix with: scripts/bump-version.sh $skill   (or set the intended version)" >&2
  exit 1
fi
