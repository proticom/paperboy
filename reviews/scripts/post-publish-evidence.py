#!/usr/bin/env python3
"""Refresh 3.4-3.6 dashboard evidence after the live npm publishes succeeded
(verified via `npm view @proticom/<pkg>@0.2.2`). Replaces the stale
"NEEDS HUMAN"/"DEFERRED" notes I wrote when those tasks were paused
on the operational boundary.

Run as a file (no heredoc) and then re-embed:
    python3 reviews/scripts/post-publish-evidence.py
    node reviews/scripts/sync-dashboard-embed.mjs
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TASKS = ROOT / "paperboy-spec-tasks.json"

UPDATES = {
    "3.4": "PASS — converter v0.2.2 published. Verified: `npm view @proticom/paperboy-converter@0.2.2` → 0.2.2 live on npm. Operator (Edward) completed npm Trusted Publisher setup + tag cut with cursor's assistance.",
    "3.5": "PASS — CLI v0.2.2 published with converter dep pinned to ^0.2.2. Verified: `npm view @proticom/paperboy-cli@0.2.2` → 0.2.2 live on npm. Cut via cli-v0.2.2 tag through the corrected publish workflow.",
    "3.6": "PASS — widget v0.2.2 published. Verified: `npm view @proticom/paperboy-widget@0.2.2` → 0.2.2 live on npm. Cut via widget-v0.2.2 tag through the publish-paperboy-widget.yml workflow from 3.2.",
}


def main() -> None:
    doc = json.loads(TASKS.read_text(encoding="utf-8"))
    for group in doc.get("groups", []):
        for task in group.get("tasks", []):
            if task.get("id") in UPDATES:
                task["evidence"] = UPDATES[task["id"]]
    TASKS.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"updated evidence for: {', '.join(sorted(UPDATES))}")


if __name__ == "__main__":
    main()
