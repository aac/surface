#!/usr/bin/env bash
# Bump surface's version across all FOUR packaging manifests in lockstep:
#   - skills/surface/SKILL.md      (yaml `version:` frontmatter)
#   - .claude-plugin/plugin.json
#   - .codex-plugin/plugin.json
#   - .claude-plugin/marketplace.json   (per-plugin `version`)
#
# Usage: scripts/bump-version.sh <new-version>      e.g. scripts/bump-version.sh 0.8.2
#
# Edits only the version *value* in each file, preserving formatting. Does NOT
# touch CHANGELOG.md — add the matching '## [<version>]' section yourself; CI
# enforces its presence. Run scripts/check-versions.sh afterward to confirm.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

new="${1:?usage: scripts/bump-version.sh <new-version>}"

# SKILL.md frontmatter: replace the `version:` value under the `metadata:` key.
# Scoped to the frontmatter block so a `  version:` in the body can't match.
python3 - "$new" <<'PY'
import re, sys
new = sys.argv[1]
p = "skills/surface/SKILL.md"
s = open(p).read()
parts = s.split("---\n", 2)          # ["", frontmatter, body]
assert len(parts) == 3, f"{p}: could not isolate frontmatter block"
fm, n = re.subn(r'(?m)^(\s+)version:.*$', rf'\g<1>version: "{new}"', parts[1], count=1)
assert n == 1, f"expected exactly one indented 'version:' under metadata in {p}, found {n}"
open(p, "w").write(parts[0] + "---\n" + fm + "---\n" + parts[2])
PY

# JSON manifests: replace the version value in place, leaving all other
# formatting untouched. Each file has exactly one `"version": "..."`.
python3 - "$new" <<'PY'
import re, sys
new = sys.argv[1]
for p in (".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".claude-plugin/marketplace.json"):
    s = open(p).read()
    s, n = re.subn(r'("version"\s*:\s*")[^"]*(")', rf'\g<1>{new}\g<2>', s, count=1)
    assert n == 1, f"expected exactly one '\"version\"' in {p}, found {n}"
    open(p, "w").write(s)
PY

echo "Bumped all four manifests to $new."
echo "Next: add a '## [$new]' section to CHANGELOG.md, then run scripts/check-versions.sh"
