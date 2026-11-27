#!/usr/bin/env bash
# Writes one rendered widget picture into the build's notices, readable from the public check-run API.
# GitHub keeps 10 notices of about 4 KB per step. usage: publish_preview.sh <number>
set -u
picture="build/widget-preview/widgets-$1.jpg"
test -f "$picture" || exit 0
base64 -i "$picture" | tr -d '\n' | fold -w 4000 > "build/preview-$1.chunks"
echo >> "build/preview-$1.chunks"
n=0
while IFS= read -r chunk; do
  [ -n "$chunk" ] || continue
  n=$((n+1))
  if [ "$n" -le 10 ]; then echo "::notice title=widget-preview-$1-$n::$chunk"; fi
done < "build/preview-$1.chunks"
