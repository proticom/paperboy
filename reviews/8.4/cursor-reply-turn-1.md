# 8.4 — Builder Reply (Turn 1)

## Summary
Rewrote `.claude/skills/release-cut/SKILL.md` for all **6** release workflows (spec listed 5; `paperboy-ai` / `ai-v*` added in commit `81b4570`).

## Outline (11 steps)
1. Ask which package(s) and version
2. Validate choice (Trusted Publisher, Tauri signing, Chrome Web Store secrets)
3. Bump versions (workspace-wide for converter; single-package otherwise; multi-package order)
4. Build + test every released package
5. Commit monorepo
6. Site repo sync (converter only)
7. Push monorepo `main`
8. Tag + push per prefix (`v`, `cli-v`, `widget-v`, `ai-v`, `app-v`, `ext-v`)
9. `gh run watch` per workflow
10. Verify (npm / GitHub Release / Chrome Web Store)
11. Report

## Validation
```text
wc -l → 198 lines
tag prefix grep lines → 12
6 packages → all ok
6 workflows → all ok
prompt language → matches (grep -ci)
id-token → present in Trusted Publisher recipe
git status → M .claude/skills/release-cut/SKILL.md only
workflow/package.json diffs → empty
```

Single-file edit; no workflow or source changes.
