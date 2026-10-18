#!/usr/bin/env bash
# PostToolUse hook: run `tsc --noEmit` against paperboy-site when a TS/TSX
# file under paperboy-site/ is edited or written. Catches type errors at
# the moment of the edit instead of 60s into the next `npm run build`.
#
# Hook input arrives as JSON on stdin; we only care about tool_input.file_path.
set -e

input=$(cat)
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')
case "$file" in
  */paperboy-site/*.tsx|*/paperboy-site/*.ts)
    cd "$(dirname "$0")/../../paperboy-site" || exit 0
    out=$(npx --no-install tsc --noEmit -p tsconfig.json 2>&1)
    if [ $? -ne 0 ]; then
      echo "$out" | head -30
    fi
    ;;
esac
