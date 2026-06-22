#!/usr/bin/env python3
"""Lint the repo's skill: enforce Codex's 1024-char frontmatter description limit.

Codex silently rejects any skill whose frontmatter `description:` exceeds 1024
characters. This linter (stdlib-only, no deps) finds skills/*/SKILL.md, parses
the `---` frontmatter, and fails if `description` is too long or required keys
are missing. Run from the repo root: python3 scripts/lint-skill.py
"""
import glob
import sys

LIMIT = 1024


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def parse_frontmatter(lines):
    """Return {key: value} from the leading --- block. A value may span
    multiple lines until the next `key:` line or the closing ---."""
    if not lines or lines[0].strip() != "---":
        fail("no frontmatter '---' block at top of SKILL.md")
    fields, key = {}, None
    for line in lines[1:]:
        if line.strip() == "---":
            return fields
        head = line.split(":", 1)
        if len(head) == 2 and head[0].strip() and not head[0].startswith((" ", "\t")):
            key = head[0].strip()
            fields[key] = head[1].strip()
        elif key is not None:
            fields[key] = (fields[key] + " " + line.strip()).strip()
    fail("frontmatter '---' block was never closed")


def main():
    matches = glob.glob("skills/*/SKILL.md")
    if not matches:
        fail("no skill found at skills/*/SKILL.md")
    if len(matches) > 1:
        fail(f"expected one skill, found {len(matches)}: {matches}")
    path = matches[0]
    with open(path, encoding="utf-8") as f:
        fields = parse_frontmatter(f.read().splitlines())
    for required in ("name", "description"):
        if not fields.get(required):
            fail(f"{path}: missing frontmatter key '{required}'")
    # Agent Skills spec (agentskills.io): only these top-level frontmatter keys
    # are allowed. This is the in-repo equivalent of `skills-ref validate` so CI
    # doesn't depend on that external demo-only tool; `version` lives under
    # `metadata`, not at the top level.
    allowed = {"name", "description", "license", "compatibility", "metadata", "allowed-tools"}
    unexpected = sorted(set(fields) - allowed)
    if unexpected:
        fail(f"{path}: unexpected frontmatter field(s) {unexpected}; spec allows "
             f"only {sorted(allowed)} (put version under metadata)")
    n = len(fields["description"])
    if n > LIMIT:
        fail(f"{path}: description is {n} chars, exceeds Codex limit of {LIMIT}")
    print(f"OK: {path} description is {n}/{LIMIT} chars")


if __name__ == "__main__":
    main()
