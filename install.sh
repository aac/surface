#!/usr/bin/env bash
# Usage:
#   ./install.sh [--target claude|codex] [--uninstall]
#
# Install or remove the surface skill for Claude Code or Codex.
#
# Harness detection (in order):
#   1. --target flag overrides everything.
#   2. If both ~/.claude/ and ~/.codex/ exist, defaults to Claude Code.
#      Override with --target codex if needed.
#   3. If only one config dir is present, that harness is used.
#
# Install location:
#   Claude Code : ~/.claude/skills/surface/
#   Codex       : ~/.codex/skills/surface/
#
# Install mechanism:
#   Symlink preferred (ln -s); copy fallback for filesystems that reject symlinks.
#   The symlink points at skills/surface/ in the repo checkout.
#
# Repo source:
#   When run from inside a clone of this repo (REPO_ROOT auto-detected by the
#   presence of skills/surface/SKILL.md), that checkout is used as-is.
#   When piped via curl (no local checkout), the repo is cloned to
#   $XDG_DATA_HOME/surface or ~/.local/share/surface/ and used from there.
#
# Idempotency:
#   Running install.sh twice is safe. If the target symlink or directory
#   already exists and points at the right source, the script exits cleanly
#   with a "already installed" message. Re-running after a copy-install
#   replaces the copy with a fresh copy.
#
# Uninstall:
#   --uninstall removes ~/.{claude,codex}/skills/surface/ (symlink or directory).
#   The repo checkout at ~/.local/share/surface/ is NOT removed — you may have
#   other things using it. Remove manually if desired.

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REPO_URL="https://github.com/aac/surface.git"
SKILL_SUBDIR="skills/surface"
SKILL_NAME="surface"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '%s\n' "$*"
}

# Resolve XDG_DATA_HOME; fall back to ~/.local/share
xdg_data_home() {
  echo "${XDG_DATA_HOME:-${HOME}/.local/share}"
}

# Detect repository root: walk up from $0's directory looking for the sentinel
find_repo_root() {
  local dir
  dir="$(cd "$(dirname "$0")" && pwd)"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/$SKILL_SUBDIR/SKILL.md" ]]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

TARGET=""
UNINSTALL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      [[ $# -ge 2 ]] || die "--target requires an argument (claude or codex)"
      TARGET="$2"
      shift 2
      ;;
    --target=*)
      TARGET="${1#--target=}"
      shift
      ;;
    --uninstall)
      UNINSTALL=true
      shift
      ;;
    -h|--help)
      # -E (extended regex) so '?' is portable; BSD/macOS sed does not honor
      # the GNU '\?' form, which left the leading '# ' unstripped on macOS.
      sed -n '/^# Usage:/,/^[^#]/p' "$0" | grep '^#' | sed -E 's/^# ?//'
      exit 0
      ;;
    *)
      die "unknown argument: $1 (try --help)"
      ;;
  esac
done

# Validate --target value
if [[ -n "$TARGET" ]]; then
  case "$TARGET" in
    claude|codex) ;;
    *) die "--target must be 'claude' or 'codex', got: $TARGET" ;;
  esac
fi

# ---------------------------------------------------------------------------
# Harness detection
# ---------------------------------------------------------------------------

if [[ -z "$TARGET" ]]; then
  HAS_CLAUDE=false
  HAS_CODEX=false
  [[ -d "${HOME}/.claude" ]] && HAS_CLAUDE=true
  [[ -d "${HOME}/.codex"  ]] && HAS_CODEX=true

  if $HAS_CLAUDE && $HAS_CODEX; then
    info "Both ~/.claude/ and ~/.codex/ detected; defaulting to Claude Code."
    info "Use --target codex to install for Codex instead."
    TARGET="claude"
  elif $HAS_CLAUDE; then
    TARGET="claude"
  elif $HAS_CODEX; then
    TARGET="codex"
  else
    die "Neither ~/.claude/ nor ~/.codex/ found. Use --target {claude|codex} to specify the harness, or create the config directory first."
  fi
fi

# Derive install path from target
case "$TARGET" in
  claude)
    SKILLS_DIR="${HOME}/.claude/skills"
    HARNESS_CONFIG_DIR="${HOME}/.claude"
    ;;
  codex)
    SKILLS_DIR="${HOME}/.codex/skills"
    HARNESS_CONFIG_DIR="${HOME}/.codex"
    ;;
esac

INSTALL_DEST="${SKILLS_DIR}/${SKILL_NAME}"

# ---------------------------------------------------------------------------
# Uninstall path
# ---------------------------------------------------------------------------

if $UNINSTALL; then
  if [[ ! -e "$INSTALL_DEST" && ! -L "$INSTALL_DEST" ]]; then
    info "Nothing to uninstall: $INSTALL_DEST does not exist."
    exit 0
  fi
  if [[ -L "$INSTALL_DEST" ]]; then
    rm "$INSTALL_DEST"
    info "Removed symlink: $INSTALL_DEST"
  elif [[ -d "$INSTALL_DEST" ]]; then
    rm -rf "$INSTALL_DEST"
    info "Removed directory: $INSTALL_DEST"
  fi
  info "surface uninstalled from $TARGET."
  exit 0
fi

# ---------------------------------------------------------------------------
# Locate (or fetch) the skill source
# ---------------------------------------------------------------------------

if REPO_ROOT="$(find_repo_root 2>/dev/null)"; then
  info "Using local checkout: $REPO_ROOT"
else
  # Curl/remote invocation — clone to XDG data dir
  CLONE_DEST="$(xdg_data_home)/surface"
  if [[ -d "$CLONE_DEST/.git" ]]; then
    info "Updating existing clone at $CLONE_DEST …"
    git -C "$CLONE_DEST" pull --ff-only --quiet \
      || info "Warning: git pull failed; using existing clone."
  else
    info "Cloning surface to $CLONE_DEST …"
    git clone --depth=1 --quiet "$REPO_URL" "$CLONE_DEST" \
      || die "Clone failed. Check your network connection and try again."
  fi
  REPO_ROOT="$CLONE_DEST"
fi

SKILL_SOURCE="${REPO_ROOT}/${SKILL_SUBDIR}"
[[ -d "$SKILL_SOURCE" ]] || die "Skill source not found at $SKILL_SOURCE"

# ---------------------------------------------------------------------------
# Ensure skills directory exists
# ---------------------------------------------------------------------------

[[ -d "$HARNESS_CONFIG_DIR" ]] \
  || die "Harness config directory not found: $HARNESS_CONFIG_DIR"

if [[ ! -d "$SKILLS_DIR" ]]; then
  mkdir -p "$SKILLS_DIR" \
    || die "Could not create skills directory: $SKILLS_DIR"
  info "Created $SKILLS_DIR"
fi

# ---------------------------------------------------------------------------
# Idempotency check (symlink case)
# ---------------------------------------------------------------------------

if [[ -L "$INSTALL_DEST" ]]; then
  EXISTING_TARGET="$(readlink "$INSTALL_DEST")"
  if [[ "$EXISTING_TARGET" == "$SKILL_SOURCE" ]]; then
    info "Already installed (symlink): $INSTALL_DEST -> $SKILL_SOURCE"
    exit 0
  else
    info "Replacing existing symlink ($EXISTING_TARGET -> $SKILL_SOURCE) …"
    rm "$INSTALL_DEST"
  fi
elif [[ -d "$INSTALL_DEST" ]]; then
  info "Existing directory install found at $INSTALL_DEST; refreshing …"
  rm -rf "$INSTALL_DEST"
fi

# ---------------------------------------------------------------------------
# Install: symlink preferred, copy fallback
# ---------------------------------------------------------------------------

if ln -s "$SKILL_SOURCE" "$INSTALL_DEST" 2>/dev/null; then
  info "Installed (symlink): $INSTALL_DEST -> $SKILL_SOURCE"
else
  info "Symlink failed; falling back to copy …"
  cp -r "$SKILL_SOURCE" "$INSTALL_DEST" \
    || die "Copy also failed. Check permissions on $SKILLS_DIR"
  info "Installed (copy): $INSTALL_DEST"
fi

info ""
info "surface ${TARGET} install complete."
info "Restart your ${TARGET} session if it is currently running."
