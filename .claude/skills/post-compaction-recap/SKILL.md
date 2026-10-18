---
name: post-compaction-recap
description: Re-orient quickly after a session compaction or a long context gap. Pulls recent state from Gnosys (working set + project memories + the last several decisions), checks both repos' git statuses, confirms cwd, and surfaces any queued/in-progress work items. Use whenever the session feels like it just woke up from a nap.
---

# Post-compaction recap

When the conversation gets compacted (or after a `/clear`, a long break, or a session resume), context that was load-bearing for a few turns ago disappears. This skill rebuilds the minimum viable picture by querying Gnosys (the persistent memory layer) and reading current repo state. No code changes — just a focused situation report.

## Why Gnosys

Gnosys (the `mcp__gnosys__*` tools) is already wired as the project's memory store. It holds:

- **Decisions** the user has made across sessions ("data-render=inline", "no AutoFS", "demo blocks use ScopedMarkdownView").
- **Architecture** snapshots (the workspaces conversion, the dogfooding refactor).
- **Open questions** that were parked.
- **Per-project landscape** of which repos / packages exist.

It's the right tool here because conversation summaries lose nuance; Gnosys retains the structured why behind decisions.

## Procedure

Run all steps. Keep the report tight — this is a recap, not an audit.

1. **Confirm cwd.** `pwd` — note whether we're in `paperboy/` (monorepo root), `paperboy/paperboy-site/` (separate repo), or somewhere else. A surprising cwd is the #1 cause of "git push went to the wrong repo" errors.

2. **Pull recent Gnosys state for this project:**
   - `mcp__gnosys__gnosys_working_set` with `projectRoot` set to the monorepo root — surfaces the 5-10 most recently touched memories.
   - `mcp__gnosys__gnosys_recall` with `query: "session start"` and same `projectRoot` — pulls the same context the SessionStart hook would have loaded.
   - `mcp__gnosys__gnosys_list` with `category: decisions` and `limit: 8`, same `projectRoot` — the latest decisions.
   - `mcp__gnosys__gnosys_list` with `category: open-questions` and `limit: 5`, same `projectRoot` — anything parked.

3. **Both repos' git state:**
   ```bash
   echo "=== monorepo ==="
   git status --short --branch
   git log --oneline -5
   echo "=== site ==="
   git -C paperboy-site status --short --branch
   git -C paperboy-site log --oneline -5
   ```

4. **Any uncommitted work?** If `git status` shows modified files, list which files and group them by package (paperboy-converter / paperboy-cli / paperboy-ext / paperboy-site).

5. **Background processes.** Quickly check if any long-running build/dev process is still alive that we should know about:
   ```bash
   ps -ef | grep -E "(next build|tsc.*--watch|vitest)" | grep -v grep | head -5
   ```

## Report format

```
## Where we are

**cwd**: paperboy-site

**Recent decisions (Gnosys):**
- 2026-05-17 — data-render=inline mode for widget; site uses it
- 2026-05-16 — no AutoFS for NAS mount
- ...

**Open questions:**
- Should the demo blocks use the widget bundle too (multi-instance)?

**Monorepo (main):** clean, latest commit `<hash> <subject>`
**Site (master):** 1 modified file (app/globals.css), latest commit `<hash> <subject>`

**Running:** `next dev` (paperboy-site, pid 12345)

**Suggested next action:** [based on what's modified + what was queued before]
```

End with a single suggested next action. Don't ask the user a question; if they want to redirect, they will.

## What NOT to do

- Don't run any build or test. Read-only recap.
- Don't write to Gnosys here — that's for substantive work, not orientation.
- Don't summarize Gnosys memories verbosely. Headlines only; the user can ask for detail on any specific one.
- Don't pull `mcp__gnosys__gnosys_dashboard` or similar wide views — too much noise. Stick to working_set + recall + the two `list` calls above.
