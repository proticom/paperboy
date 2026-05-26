#!/usr/bin/env python3
"""One-off (re-runnable) operator action, 2026-05-25:

1. Backfill the dashboard **Evidence** column (`task.evidence`) of paperboy-spec-tasks.json
   with the reviewer's per-task justification (for passed tasks), the human runbook
   (for needs_human 3.4), or the deferral reason (for operational tasks). Until now every
   task showed only a thin "reviews/<id>/ — review_passed" pointer or nothing.
2. Defer the operational/live-release tasks IN PLACE so the queue's activator skips them
   (queue status -> "deferred"; activate_next_pending_task only picks status=="pending"),
   then activate the first remaining buildable task so the review loop continues on code.

Run as a file (no heredoc) per the orchestrator skill's read-only/exec guidance:
    python3 reviews/scripts/reviewer-dashboard-sync.py
Then re-embed the dashboard snapshot:
    node reviews/scripts/sync-dashboard-embed.mjs
"""
import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TASKS = ROOT / "paperboy-spec-tasks.json"
QUEUE = ROOT / "reviews" / "paperboy-review-queue.json"
REVIEWER = "claude"

# Per-task Evidence text (findings + ultimate justification / runbook / deferral reason).
NOTES = {
    "1.1": "PASS — CLI pkg/cmd already correct via lib/distribution.ts (@proticom/paperboy-cli, paperboy-cli); 0 wrong refs repo-wide; 'final review / install from source' caveat shown on a5 + help. [reviews/1.1/claude-review-turn-1.md]",
    "1.2": "PASS — ship-status contradictions resolved; single source lib/distribution.ts consumed by page/a2/a3. Optional nit logged: help/page.tsx hardcodes 2 (consistent) status sentences. [reviews/1.2/]",
    "1.3": "PASS — BrandConfig requires support.docs, so it can't be deleted; repointed /docs -> /help (real route). No dangling /docs; tsc clean. See reviews/1.3/claude-correction-note.md.",
    "1.4": "PASS — 'Three sharp tools' gone; count reads 'four' everywhere (page-metadata.ts, page.tsx, help); 0 'three' refs. [reviews/1.4/]",
    "1.5": "PASS — public/llms.txt is valid (H1 + blockquote + sectioned links); every linked route resolves; naming consistent with four-tools / scoped pkgs. [reviews/1.5/]",
    "1.6": "PASS (turn 2) — builder added default app/opengraph-image.tsx + metadataBase; title/desc/canonical per-route across 11 routes; tsc clean. Investigation also surfaced the BrandConfig.docs required-field fix. [reviews/1.6/]",
    "1.7": "PASS (turn 2) — privacy copy now discloses the automatic Open-Meteo request + IP on page load (vs opt-in geolocation) AND both localStorage keys (edition + paperboy-convert-output); behavior files unchanged; tsc clean. [reviews/1.7/]",
    "1.8": "PASS — dead code removed (ClassifiedAd, BackPageAbout* exports, 5 default Next svgs); 0 dangling refs; tsc clean. [reviews/1.8/]",
    "1.9": "PASS — README route tree matches real routes; no /classifieds. [reviews/1.9/]",
    "2.1": "PASS (turn 2) — .github/workflows/ci.yml (PR + push main, Node 24, root lockfile cache). Ran build+test --workspaces --if-present locally: exit 0 (cli 19, widget 12, converter 9 tests). [reviews/2.1/]",
    "2.2": "PASS (turn 2) — both publish workflows now cache + npm ci at the ROOT lockfile; build/test/publish stay per-package; 0 residual per-package lockfile refs. [reviews/2.2/]",
    "2.3": "PASS (turn 2) — monorepo ci.yml typecheck step (converter+cli, exit 0) + NEW paperboy-site CI workflow with a typecheck script (site tsc --noEmit exit 0). [reviews/2.3/]",
    "2.4": "PASS (turn 2) — site mobile-render.yml path-filtered gate + headless Playwright check (blank/overflow/runaway-pill/console + screenshot artifact). Builder corrected my selector bug: check .pbw-toggle-pill (50%-of-parent), not the outer .pbw-toggle. [reviews/2.4/]",
    "3.1": "PASS (turn 2) — CLI package.json metadata complete (license MIT, homepage, repository, keywords, expanded desc) + LICENSE added; npm pack ships README + LICENSE. [reviews/3.1/]",
    "3.2": "PASS (turn 2) — publish-paperboy-widget.yml (widget-v* trigger, root install, OIDC) + prepublishOnly + homepage + LICENSE + files; npm pack ships README + LICENSE. [reviews/3.2/]",
    "3.3": "PASS — .claude/skills/npm-trusted-publisher/SKILL.md documents OIDC setup for all 3 pkgs (pkg<->workflow<->tag map, first-publish caveat, registry-url gotcha, npm view verify). OUTSTANDING USER PREREQ: the actual npm.com Trusted Publisher config (gates 3.4-3.6). [reviews/3.3/]",
    "3.4": "NEEDS HUMAN (live release). RUNBOOK: 1) do npm Trusted Publisher setup (.claude/skills/npm-trusted-publisher/SKILL.md); 2) bump all pkgs to 0.2.2 (bump-version skill) + commit; 3) git tag v0.2.2 && git push origin v0.2.2; 4) watch publish-paperboy-converter.yml to green; 5) GATE: npm view @proticom/paperboy-converter@0.2.2 shows 0.2.2. Then resume orchestrator. [reviews/3.4/claude-review-turn-1.md]",
    # Deferred operational/live-release tasks:
    "3.5": "DEFERRED (operational) — cli publish: dep switch to ^0.2.2 + cut cli-v0.2.2 tag; gated on 3.4 converter publish + npm setup.",
    "3.6": "DEFERRED (operational) — widget publish: cut widget-v0.2.2 tag; gated on npm Trusted Publisher setup.",
    "3.7": "DEFERRED (gated) — replace site vendored .tgz with @proticom/paperboy-converter ^0.2.2; needs converter published (3.4).",
    "3.8": "DEFERRED (gated) — flip site install snippets to live; needs the npm publishes (3.4-3.6).",
    "5.3": "DEFERRED (manual) — acquire Windows code-signing cert + add GitHub secret; user procurement.",
    "5.8": "DEFERRED (operational) — cut app-v0.2.2 tag + end-to-end installer test; live release.",
    "5.9": "DEFERRED (gated) — flip site a2 distribution to live GitHub Release assets; needs desktop release.",
    "6.4": "DEFERRED (operational) — cut ext-v0.2.2 tag; live release.",
}

DEFER = ["3.5", "3.6", "3.7", "3.8", "5.3", "5.8", "5.9", "6.4"]


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def dump(p, data):
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    # --- 1. tasks JSON: evidence backfill + deferred impl status + meta recompute ---
    tasks_doc = load(TASKS)
    all_tasks = [t for g in tasks_doc.get("groups", []) for t in g.get("tasks", [])]
    by_id = {t["id"]: t for t in all_tasks}

    for tid, note in NOTES.items():
        if tid in by_id:
            by_id[tid]["evidence"] = note
    for tid in DEFER:
        if tid in by_id and by_id[tid].get("status") not in ("done",):
            by_id[tid]["status"] = "deferred"

    counts = {"done": 0, "partial": 0, "in_progress": 0, "todo": 0, "deferred": 0}
    for t in all_tasks:
        counts[t.get("status", "todo")] = counts.get(t.get("status", "todo"), 0) + 1
    meta = tasks_doc.setdefault("meta", {})
    meta["completed"] = counts["done"]
    meta["partial"] = counts["partial"]
    meta["in_progress"] = counts["in_progress"]
    meta["todo"] = counts["todo"]
    meta["deferred"] = counts["deferred"]
    meta["total_atomic_tasks"] = len(all_tasks)
    meta["last_updated"] = "2026-05-25"
    dump(TASKS, tasks_doc)

    # --- 2. queue: defer in place + activate first remaining pending task ---
    queue = load(QUEUE)
    qtasks = queue.get("tasks", [])
    qby = {t["id"]: t for t in qtasks}
    for tid in DEFER:
        if tid in qby and qby[tid].get("status") == "pending":
            qby[tid]["status"] = "deferred"

    active = [t for t in qtasks if t.get("status") == "active"]
    activated = None
    if not active:
        for t in qtasks:
            if t.get("status") != "pending":
                continue
            tid = t["id"]
            roles = t.get("roles") or queue.get("roles") or {"reviewer": REVIEWER}
            reviewer = roles.get("reviewer", REVIEWER)
            t.update({
                "status": "active",
                "phase": "review",
                "next_role": "reviewer",
                "next_agent": reviewer,
                "turn": 1,
                "max_turns": t.get("max_turns", 4),
                "handoff_token": f"{tid}-0001",
                "claimed_by": None,
                "claimed_at": None,
                "claimed_token": None,
                "last_updated": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()),
                "review_status": "in_review",
                "artifacts": {
                    "review": f"reviews/{tid}/{reviewer}-review-turn-1.md",
                    "reply": None,
                    "decision": None,
                },
            })
            activated = tid
            break
    dump(QUEUE, queue)

    print(f"evidence backfilled: {len(NOTES)} tasks")
    print(f"deferred (queue+dashboard): {', '.join(DEFER)}")
    print(f"activated next buildable task: {activated}")
    print(f"meta counts: {counts}")


if __name__ == "__main__":
    main()
