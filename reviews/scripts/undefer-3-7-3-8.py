#!/usr/bin/env python3
"""Un-defer 3.7 and 3.8 now that 3.4-3.6 are live on npm.

Both are cursor-doable code/config changes that were only deferred because they
were gated on the converter/cli/widget publishes (3.4/3.5/3.6, verified live):
- 3.7 swaps the site's vendored .tgz for `@proticom/paperboy-converter: ^0.2.2`
- 3.8 flips the install-copy on a4/a5 to live

Uses the orchestrator's own locked_path so we don't race the active reviewer
worker on 4.7. Idempotent.

Run as a file (no heredoc):
    python3 reviews/scripts/undefer-3-7-3-8.py
    node reviews/scripts/sync-dashboard-embed.mjs
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKILL_SCRIPTS = Path("/Users/edward/.claude/skills/two-agent-review-orchestrator/scripts")
sys.path.insert(0, str(SKILL_SCRIPTS))
from orchestrator import locked_path, load_json, atomic_write_json  # type: ignore

QUEUE = ROOT / "reviews" / "paperboy-review-queue.json"
TASKS = ROOT / "paperboy-spec-tasks.json"
TARGETS = {"3.7", "3.8"}

NOTES = {
    "3.7": "Unblocked — converter v0.2.2 live on npm. Replace paperboy-site `proticom-paperboy-converter-0.2.1.tgz` with `\"@proticom/paperboy-converter\": \"^0.2.2\"` in package.json; delete the .tgz; update the sync-widget skill to stop assuming a vendored tarball.",
    "3.8": "Unblocked — publishes live. Flip the 'in final review' copy in `lib/distribution.ts` (cascades to a4 widget jsDelivr + a5 CLI install) so the install snippets read as live.",
}


def main() -> None:
    # Queue: deferred -> pending so activate_next_pending_task picks them.
    with locked_path(QUEUE):
        queue = load_json(QUEUE) or {"tasks": []}
        flipped_queue = []
        for task in queue.get("tasks", []):
            if task.get("id") in TARGETS and task.get("status") == "deferred":
                task["status"] = "pending"
                flipped_queue.append(task["id"])
        atomic_write_json(QUEUE, queue)

    # Tasks JSON (dashboard): deferred -> todo + refreshed notes/evidence.
    with locked_path(TASKS):
        doc = load_json(TASKS) or {"groups": [], "meta": {}}
        flipped_tasks = []
        for group in doc.get("groups", []):
            for task in group.get("tasks", []):
                if task.get("id") in TARGETS:
                    if task.get("status") == "deferred":
                        task["status"] = "todo"
                        flipped_tasks.append(task["id"])
                    note = NOTES[task["id"]]
                    task["evidence"] = note
                    task["notes"] = note  # new first-class dashboard column
        # Recompute meta counts.
        counts = {"done": 0, "partial": 0, "in_progress": 0, "todo": 0, "deferred": 0}
        all_tasks = [t for g in doc.get("groups", []) for t in g.get("tasks", [])]
        for t in all_tasks:
            s = t.get("status", "todo")
            counts[s] = counts.get(s, 0) + 1
        meta = doc.setdefault("meta", {})
        meta["completed"] = counts["done"]
        meta["partial"] = counts["partial"]
        meta["in_progress"] = counts["in_progress"]
        meta["todo"] = counts["todo"]
        meta["deferred"] = counts["deferred"]
        meta["total_atomic_tasks"] = len(all_tasks)
        atomic_write_json(TASKS, doc)

    print(f"queue: flipped to pending → {', '.join(flipped_queue) or '(no change)'}")
    print(f"tasks: flipped to todo  → {', '.join(flipped_tasks) or '(no change)'}")
    print(f"meta counts: {counts}")


if __name__ == "__main__":
    main()
