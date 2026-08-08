#!/bin/sh
# Rebuild TB20-Performance.html from the parts in src/.
#
# The app ships as a single self-contained file so it works with no network of
# any kind. src/ holds it split up for editing; this script concatenates the
# parts back into that one file and syntax-checks the script block.
#
#   ./build.sh
#
set -e
cd "$(dirname "$0")"

OUT=TB20-Performance.html

{
  cat src/head.html
  cat src/body.html
  echo '<script>'
  echo '"use strict";'
  cat src/data_block.js   # POH tables, transcribed from Section 5
  cat src/helpers.js      # interpolation, units, formatting
  cat src/logic.js        # factoring bases, W&B, rendering
  echo '</script>'
} > "$OUT.tmp"

# Syntax-check before replacing a working file.
if command -v node >/dev/null 2>&1; then
  sed -n '/^<script>$/,/^<\/script>$/p' "$OUT.tmp" | sed '1d;$d' > .check.js
  node --check .check.js
  rm -f .check.js
  echo "JavaScript syntax OK"
else
  echo "node not found — skipping syntax check"
fi

mv "$OUT.tmp" "$OUT"
# index.html is what GitHub Pages serves at the site root; identical content.
cp "$OUT" index.html
echo "Built $OUT and index.html ($(wc -c < "$OUT" | tr -d ' ') bytes)"
