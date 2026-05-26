#!/usr/bin/env bash
# Poll the review queue; emit AGENT_LOOP_WAKE when cursor can claim builder work.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INTERVAL="${BUILDER_LOOP_INTERVAL:-120}"
PID_FILE="$ROOT/reviews/.builder-loop.pid"

cd "$ROOT"
echo "$$" > "$PID_FILE"
echo "[builder-loop] started pid=$$ interval=${INTERVAL}s queue=reviews/paperboy-review-queue.json"

while true; do
  sleep "$INTERVAL"
  python3 "$ROOT/reviews/scripts/check-builder-claimable.py" || true
done
