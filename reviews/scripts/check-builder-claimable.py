#!/usr/bin/env python3
"""Print AGENT_LOOP_WAKE when cursor can claim the active builder task.

Exits 0 and prints one wake line when the builder should act.
Exits 1 silently when nothing to do (reviewer turn, already claimed, etc.).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
QUEUE_PATH = ROOT / "reviews" / "paperboy-review-queue.json"
STATE_PATH = ROOT / "reviews" / ".builder-loop-state.json"
AGENT = "cursor"
SENTINEL = "AGENT_LOOP_WAKE_paperboy_builder"

PHASE_TO_ROLE = {
    "review": "reviewer",
    "reply": "builder",
    "build": "builder",
    "revision": "builder",
    "decision": "decider",
}


def load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def resolve_agent(queue: dict, task: dict, role: str) -> str | None:
    roles = task.get("roles") or queue.get("meta", {}).get("roles") or {}
    return roles.get(role)


def find_claimable(queue: dict) -> dict | None:
    for task in queue.get("tasks", []):
        if task.get("status") != "active":
            continue
        role = PHASE_TO_ROLE.get(task.get("phase") or "")
        if role != "builder":
            continue
        if resolve_agent(queue, task, role) != AGENT:
            continue
        if task.get("claimed_by") == AGENT:
            return None
        claimed_token = task.get("claimed_token")
        handoff = task.get("handoff_token")
        if claimed_token is None or claimed_token == handoff:
            return task
    return None


def main() -> int:
    if not QUEUE_PATH.exists():
        return 1

    queue = load_json(QUEUE_PATH)
    task = find_claimable(queue)
    if not task:
        return 1

    handoff = task.get("handoff_token") or task["id"]
    state = load_json(STATE_PATH) if STATE_PATH.exists() else {}
    if state.get("last_wake_token") == handoff:
        return 1

    state["last_wake_token"] = handoff
    state["last_wake_task"] = task["id"]
    save_json(STATE_PATH, state)

    payload = {
        "prompt": (
            f"Builder loop: task {task['id']} is ready. "
            "Run reviews/scripts/builder-resume.sh, implement the review contract, "
            "write reviews/{id}/cursor-reply-turn-N.md, advance to reviewer, "
            "then python3 reviews/scripts/sync-task-status.py."
        ).replace("{id}", task["id"]),
        "task_id": task["id"],
        "phase": task.get("phase"),
        "handoff_token": handoff,
    }
    print(f"{SENTINEL} {json.dumps(payload)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
