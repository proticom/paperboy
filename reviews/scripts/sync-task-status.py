#!/usr/bin/env python3
"""Sync paperboy-spec-tasks.json implementation status from the review queue.

The orchestrator updates review_status only. This script marks tasks done when
the queue shows review_passed, updates group progress, and refreshes meta counts.
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TASKS_PATH = ROOT / "paperboy-spec-tasks.json"
QUEUE_PATH = ROOT / "reviews" / "paperboy-review-queue.json"


def load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def sync() -> int:
    if not TASKS_PATH.exists() or not QUEUE_PATH.exists():
        print(f"[sync] Missing {TASKS_PATH} or {QUEUE_PATH}", file=sys.stderr)
        return 1

    tasks_doc = load_json(TASKS_PATH)
    queue = load_json(QUEUE_PATH)

    queue_by_id = {t["id"]: t for t in queue.get("tasks", []) if t.get("id")}

    passed_ids = {
        tid
        for tid, qt in queue_by_id.items()
        if qt.get("review_status") == "review_passed" or qt.get("status") == "review_passed"
    }

    active_id = next(
        (tid for tid, qt in queue_by_id.items() if qt.get("status") == "active"),
        None,
    )

    updated = 0
    review_synced = 0
    for group in tasks_doc.get("groups", []):
        done_in_group = 0
        total_in_group = len(group.get("tasks", []))
        for task in group.get("tasks", []):
            tid = task.get("id")
            qt = queue_by_id.get(tid)
            if qt:
                q_review = qt.get("review_status")
                if q_review and task.get("review_status") != q_review:
                    task["review_status"] = q_review
                    review_synced += 1
            if tid in passed_ids and task.get("status") != "done":
                task["status"] = "done"
                if not task.get("evidence"):
                    task["evidence"] = f"reviews/{tid}/ — review_passed"
                updated += 1
            if task.get("status") == "done":
                done_in_group += 1
            elif tid == active_id and task.get("status") != "done":
                task["status"] = "in_progress"
        group["progress"] = f"{done_in_group}/{total_in_group}"
        if done_in_group == total_in_group:
            group["status"] = "done"
        elif done_in_group > 0 or any(t.get("id") == active_id for t in group.get("tasks", [])):
            group["status"] = "in_progress"
        else:
            group["status"] = "todo"

    all_tasks = [t for g in tasks_doc.get("groups", []) for t in g.get("tasks", [])]
    meta = tasks_doc.setdefault("meta", {})
    meta["last_updated"] = date.today().isoformat()
    meta["completed"] = sum(1 for t in all_tasks if t.get("status") == "done")
    meta["partial"] = sum(1 for t in all_tasks if t.get("status") == "partial")
    meta["in_progress"] = sum(1 for t in all_tasks if t.get("status") == "in_progress")
    meta["todo"] = sum(1 for t in all_tasks if t.get("status") == "todo")
    meta["deferred"] = sum(1 for t in all_tasks if t.get("status") == "deferred")

    save_json(TASKS_PATH, tasks_doc)
    print(
        f"[sync] Marked {updated} task(s) done, synced {review_synced} review_status field(s). "
        f"Meta: {meta['completed']} done, {meta['in_progress']} in progress, {meta['todo']} todo."
    )
    if active_id:
        print(f"[sync] Active queue task: {active_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(sync())
