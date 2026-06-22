#!/usr/bin/env python3
"""Print skills/surface/SKILL.md's version (frontmatter `metadata.version`).

Single stdlib-only extractor (no pyyaml — CI has no YAML lib) so the version
lives spec-compliantly under `metadata` rather than as a top-level frontmatter
key, while check-versions.sh and CI still have one robust way to read it.
Exits non-zero if the frontmatter or metadata.version is missing.
"""
import sys

PATH = "skills/surface/SKILL.md"


def main():
    lines = open(PATH, encoding="utf-8").read().splitlines()
    if not lines or lines[0].strip() != "---":
        sys.exit(f"{PATH}: no frontmatter '---' block")
    in_meta = False
    for line in lines[1:]:
        if line.strip() == "---":
            break
        indented = line.startswith((" ", "\t"))
        if not indented:
            # a new top-level key; we're inside metadata only between it and the next top-level key
            in_meta = line.split(":", 1)[0].strip() == "metadata"
            continue
        if in_meta and line.strip().startswith("version:"):
            val = line.split(":", 1)[1].strip().strip('"').strip("'")
            if not val:
                sys.exit(f"{PATH}: metadata.version is empty")
            print(val)
            return
    sys.exit(f"{PATH}: no metadata.version found in frontmatter")


if __name__ == "__main__":
    main()
