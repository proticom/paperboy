#!/usr/bin/env python3
"""Generate paperboy-spec-tasks.json from the production readiness plan shape."""
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "paperboy-spec-tasks.json"

PHASES = [
    (
        "phase-1",
        "Phase 1 — Site truth & content fixes",
        [
            ("1.1", "Fix CLI package and command names on a5 and help pages"),
            ("1.2", "Resolve distribution copy contradictions via lib/distribution.ts"),
            ("1.3", "Remove brand.support.docs (no /docs route for v1)"),
            ("1.4", "Fix root layout metadata (four tools, not three)"),
            ("1.5", "Add public/llms.txt for AI/GEO crawlers"),
            ("1.6", "Add per-page metadata layouts for all 11 routes"),
            ("1.7", "Fix privacy policy for weather fetch and localStorage edition"),
            ("1.8", "Delete dead code and unused Next public assets"),
            ("1.9", "Update paperboy-site README route list"),
        ],
    ),
    (
        "phase-2",
        "Phase 2 — CI safety net",
        [
            ("2.1", "Add .github/workflows/ci.yml (build + test on PR)"),
            ("2.2", "Fix publish workflow lockfile paths to root package-lock.json"),
            ("2.3", "Add typecheck step to CI for converter, CLI, site"),
            ("2.4", "Add site repo CI with mobile-renderer on render paths"),
        ],
    ),
    (
        "phase-3",
        "Phase 3 — Publish npm packages",
        [
            ("3.1", "Complete CLI package.json metadata for npm publish"),
            ("3.2", "Add publish-paperboy-widget.yml workflow and prepublishOnly"),
            ("3.3", "Document npm Trusted Publisher setup skill"),
            ("3.4", "Cut converter v0.2.2 tag and verify npm publish"),
            ("3.5", "Pin CLI converter dep and cut cli-v0.2.2 tag"),
            ("3.6", "Cut widget-v0.2.2 tag and verify npm publish"),
            ("3.7", "Switch site from vendored tarball to registry converter"),
            ("3.8", "Flip site install copy to live npm/jsDelivr snippets"),
        ],
    ),
    (
        "phase-4",
        "Phase 4 — Desktop app feature completeness",
        [
            ("4.1", "Extract @proticom/paperboy-ai shared package from CLI"),
            ("4.2", "Wire desktop AI image description during conversion"),
            ("4.3", "Clean dead Rust commands; wire list_configured_providers"),
            ("4.4", "Add tauri-plugin-window-state persistence"),
            ("4.5", "Add recent files menu (last 10, tauri-plugin-store)"),
            ("4.6", "Add in-window drag-and-drop file import"),
            ("4.7", "Expand file associations for converter formats"),
            ("4.8", "Replace alert() with toast notifications"),
            ("4.9", "Add Find/Replace overlay (Cmd+F)"),
            ("4.10", "Add Export submenu (HTML and PDF)"),
            ("4.11", "Add status bar (word count, cursor position)"),
            ("4.12", "Wire or remove unused headingId editor action"),
            ("4.13", "Add desktop smoke tests for import flows"),
        ],
    ),
    (
        "phase-5",
        "Phase 5 — Desktop distribution (mac/win/linux)",
        [
            ("5.1", "Change tauri bundle targets to dmg/nsis/deb/appimage"),
            ("5.2", "Add macOS signing and notarization config"),
            ("5.3", "Document Windows code-signing cert options"),
            ("5.4", "Add Linux maintainer and AppImage/deb config"),
            ("5.5", "Add tauri-plugin-updater and latest.json endpoint"),
            ("5.6", "Write release-desktop.yml CI workflow"),
            ("5.7", "Add missing platform icon sizes"),
            ("5.8", "Cut app-v0.2.2 tag and verify release pipeline"),
            ("5.9", "Wire site a2 page to live GitHub Release downloads"),
        ],
    ),
    (
        "phase-6",
        "Phase 6 — Extension sideload release",
        [
            ("6.1", "Update paperboy-ext README (remove content.js refs)"),
            ("6.2", "Add homepage_url to extension manifest"),
            ("6.3", "Write release-ext.yml CI workflow"),
            ("6.4", "Cut ext-v0.2.2 tag and verify release zip"),
            ("6.5", "Update site a3 page with sideload walkthrough"),
        ],
    ),
    (
        "phase-7",
        "Phase 7 — Site backend & polish",
        [
            ("7.1", "Wire Ask The Editor contact (API or mailto)"),
            ("7.2", "Add dynamic OG images per route"),
            ("7.3", "End-to-end smoke pass on all routes"),
        ],
    ),
    (
        "phase-8",
        "Phase 8 — Cross-cutting hardening",
        [
            ("8.1", "Add converter tests for docx, pdf, epub, xlsx"),
            ("8.2", "Add CLI crawl command tests"),
            ("8.3", "Add widget integration tests"),
            ("8.4", "Update release-cut skill for five tag types"),
            ("8.5", "Add CHANGELOG.md files to each package"),
        ],
    ),
]

GUIDANCE = (
    "Read the referenced plan section, inspect listed files, run named validation "
    "commands, and verify observable behavior matches the spec."
)

groups = []
total = 0
for gid, title, tasks in PHASES:
    entries = []
    for tid, ttitle in tasks:
        total += 1
        entries.append(
            {
                "id": tid,
                "title": ttitle,
                "status": "todo",
                "evidence": "",
                "reviewer_guidance": GUIDANCE,
                "review_status": "not_started",
            }
        )
    groups.append(
        {
            "id": gid,
            "title": title,
            "status": "todo",
            "progress": f"0/{len(entries)}",
            "tasks": entries,
        }
    )

payload = {
    "meta": {
        "project": "Paperboy — Production Readiness",
        "spec": ".cursor/plans/paperboy_production_readiness_02f05849.plan.md",
        "dashboard_version": "1.1.0",
        "last_updated": date.today().isoformat(),
        "total_atomic_tasks": total,
        "completed": 0,
        "partial": 0,
        "in_progress": 0,
        "todo": total,
        "deferred": 0,
        "notes": "Generated from the production readiness plan. Task JSON is source of truth for dashboard and review queue.",
        "review_status_legend": "not_started | in_review | waiting_for_builder | waiting_for_reviewer | review_passed | review_failed | needs_human | blocked",
    },
    "groups": groups,
}

OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {OUT} ({total} tasks)")
