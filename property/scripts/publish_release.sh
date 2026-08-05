#!/usr/bin/env bash
set -euo pipefail
manifest="${1:-property/CHANGED-FILES-v0.17.0.txt}"
message="${2:-Watchdog v0.17.0}"
root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$root" ]]; then echo "Run this from anywhere inside your cloned GitHub repository."; exit 1; fi
cd "$root"
if [[ ! -f "$manifest" ]]; then echo "Cannot find $manifest. Extract the release ZIP into the repository first."; exit 1; fi
mapfile -t files < <(sed '/^[[:space:]]*$/d;/^[[:space:]]*#/d' "$manifest")
echo "Files this release will stage:"
git status --short -- "${files[@]}"
read -r -p "Stage these release files, commit, and push? (y/N) " answer
[[ "$answer" =~ ^[Yy]$ ]] || { echo "Cancelled. Nothing was pushed."; exit 0; }
git add -- "${files[@]}"
git diff --cached --quiet || git commit -m "$message"
branch="$(git branch --show-current)"
git push origin "$branch"
echo "Done. Pushed $branch to origin."
