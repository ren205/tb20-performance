#!/bin/sh
# Build, commit and push in one step.
#   ./publish.sh "what changed"
set -e
cd "$(dirname "$0")"
./build.sh
if git diff --quiet && git diff --cached --quiet; then
  echo "Nothing to publish — working tree is clean."
  exit 0
fi
git add -A
git commit -m "${1:-Update TB20 performance tool}"
git push
echo
echo "Published. Live in a minute or so at:"
echo "  https://ren205.github.io/tb20-performance/"
