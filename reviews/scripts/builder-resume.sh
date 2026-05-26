#!/usr/bin/env bash
# Builder loop step: sync dashboard JSON, then claim next task if eligible.
# Run at the start of each Cursor builder session (or after user says "continue").
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ORCH="$HOME/.claude/skills/two-agent-review-orchestrator/scripts/orchestrator.py"
CONFIG="reviews/orchestrator-config.json"

python3 "$ROOT/reviews/scripts/sync-task-status.py"
python3 "$ORCH" --project-root "$ROOT" --config "$CONFIG" --agent cursor claim-next
