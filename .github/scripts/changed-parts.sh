#!/usr/bin/env bash
# Decides which parts of the repo need building/deploying for a change.
# Usage: changed-parts.sh <base-sha> <head-sha>
# Prints "backend=true|false", "frontend=true|false" and "e2e=true|false" (to $GITHUB_OUTPUT when set).
# The end-to-end tests run against both parts, so a change to either (or to the tests) runs them.
# Workflow changes count as both, so edits to CI/CD are always exercised.
# With no usable base (e.g. a manual run), everything counts as changed.
set -euo pipefail

base="${1:-}"
head="${2:-HEAD}"
backend=false
frontend=false
e2e=false

if [[ -z "$base" || "$base" =~ ^0+$ ]] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  echo "No base commit to compare against; treating everything as changed."
  backend=true
  frontend=true
  e2e=true
else
  changed=$(git diff --name-only "$base" "$head")
  echo "Changed files:"
  echo "$changed" | sed 's/^/  /'
  if grep -qE '^(backend/|\.github/workflows/|\.github/scripts/)' <<< "$changed"; then backend=true; fi
  if grep -qE '^(frontend/|\.github/workflows/|\.github/scripts/)' <<< "$changed"; then frontend=true; fi
  if grep -qE '^(backend/|frontend/|e2e/|\.github/workflows/|\.github/scripts/)' <<< "$changed"; then e2e=true; fi
fi

echo "backend=$backend"
echo "frontend=$frontend"
echo "e2e=$e2e"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "backend=$backend" >> "$GITHUB_OUTPUT"
  echo "frontend=$frontend" >> "$GITHUB_OUTPUT"
  echo "e2e=$e2e" >> "$GITHUB_OUTPUT"
fi
