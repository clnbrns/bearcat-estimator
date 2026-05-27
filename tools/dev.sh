#!/usr/bin/env bash
# Boot the local dev stack (server :4000 + Vite client :5173).
# Refuses to run on main unless you pass --on-main, so you don't
# accidentally do "work on main" again. Pair with the branch workflow
# documented in CLAUDE.md.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
ALLOW_MAIN=0
NEW_BRANCH=""

for arg in "$@"; do
  case "$arg" in
    --on-main) ALLOW_MAIN=1 ;;
    --branch=*) NEW_BRANCH="${arg#--branch=}" ;;
    -h|--help)
      cat <<EOF
Usage: tools/dev.sh [--branch=<name>] [--on-main]

  --branch=NAME   Create + check out a feature branch first (e.g. feat/cage-fix)
  --on-main       Allow running while on main (default: refuse)

Examples:
  tools/dev.sh --branch=feat/cage-labor-fix
  tools/dev.sh                      # if already on a feature branch
EOF
      exit 0
      ;;
  esac
done

if [[ -n "$NEW_BRANCH" ]]; then
  echo "→ Creating + switching to branch: $NEW_BRANCH"
  git checkout -b "$NEW_BRANCH"
  BRANCH="$NEW_BRANCH"
fi

if [[ "$BRANCH" == "main" && "$ALLOW_MAIN" -ne 1 ]]; then
  echo "✗ You're on main. Don't work directly on main."
  echo "  Make a branch:  tools/dev.sh --branch=feat/<short-name>"
  echo "  Override:       tools/dev.sh --on-main"
  exit 1
fi

# Sanity-check the .env so dev doesn't silently use the prod key
if [[ ! -f "server/.env" ]]; then
  echo "⚠  No server/.env — Gemini calls will fail. Create one with GEMINI_API_KEY=..."
  echo "   Tip: use a SEPARATE Gemini key for dev so localhost calls don't bill the prod key."
  echo
fi

echo "→ Branch:    $BRANCH"
echo "→ Server:    http://localhost:4000"
echo "→ Client:    http://localhost:5173"
echo "→ Smoke-test before you merge to main. Ctrl-C to stop."
echo

exec npm run dev
