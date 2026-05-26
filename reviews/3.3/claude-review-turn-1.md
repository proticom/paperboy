# 3.3 - Review Turn 1

## Task Context
- Task id: 3.3
- Task title: npm Trusted Publisher setup for the 3 scoped packages + document in a new SKILL.md
- Dashboard implementation status: todo (in spec) — doc deliverable NOT done; npm.com setup is a manual user step
- Review status: in_review → waiting_for_builder
- Spec sections: Phase 3 item **3.3** (explicitly: "manual step the user does on npm.com, the
  agent cannot do it" + "the agent will document the exact steps in a new
  `.claude/skills/npm-trusted-publisher/SKILL.md`")
- Files inspected:
  - `.claude/skills/` (existing skills for format; no `npm-trusted-publisher`)
  - `.github/workflows/publish-paperboy-{converter,,widget}.yml` (OIDC, "DO NOT set registry-url")
  - `.claude/skills/release-cut/SKILL.md` (references the publish flow)
- Commands run:
  - `ls .claude/skills/npm-trusted-publisher/SKILL.md` → absent
  - `ls .claude/skills/` ; `grep -rln "Trusted Publisher|OIDC" .github .claude`
- Current claim being verified: the agent-owned deliverable (the documentation skill) exists and is
  accurate; the manual npm.com action is correctly scoped to the user.

## Findings

### Finding 1: the npm-trusted-publisher documentation skill does not exist
- Severity: required (this is the agent-owned deliverable of 3.3)
- Location: `.claude/skills/npm-trusted-publisher/SKILL.md` (absent)
- Problem: 3.3's agent deliverable is a SKILL.md documenting the exact npm Trusted Publisher
  (OIDC) setup for the three scoped packages. It isn't written. (The npm.com configuration itself
  is a manual user action and is NOT in scope for the builder — see the Decision/handoff note.)
- Spec mismatch / risk: without documented steps, the manual setup is error-prone, and the
  OIDC-based publish workflows (2.2, 3.2) will 404 until npm.com trusts the repo/workflows.
- Required fix: write `.claude/skills/npm-trusted-publisher/SKILL.md`, modeled on the existing
  skills' format and the "same flow as the existing Gnosys setup" reference.
- Code sample / exact change — the doc must cover:
```md
# npm Trusted Publisher Setup (OIDC)  — manual, one-time, on npmjs.com

Packages: @proticom/paperboy-converter, @proticom/paperboy-cli, @proticom/paperboy-widget
Repo: proticom/paperboy   Publish workflows (the "trusted" workflow filenames):
  - publish-paperboy-converter.yml   (tag v*)
  - publish-paperboy.yml             (tag cli-v*)  -> @proticom/paperboy-cli
  - publish-paperboy-widget.yml      (tag widget-v*)

## Why
The publish workflows authenticate to npm via GitHub OIDC (no NPM_TOKEN). npm.com must be told
which GitHub repo + workflow file is allowed to publish each package.

## Steps (per package, on npmjs.com, as a @proticom org member with publish rights)
1. npmjs.com -> the package (or, for a first-ever publish, the @proticom org's package settings).
2. Settings -> "Trusted Publisher" -> "GitHub Actions".
3. Organization or user: proticom ; Repository: paperboy ;
   Workflow filename: <the matching publish-*.yml> ; Environment: (leave blank unless used).
4. Save.

## First-publish caveat
Document npm's current behavior for a package that has NEVER been published: if trusted publishing
cannot be configured before the first publish, perform ONE initial `npm publish` with a granular
automation token, then switch to OIDC. Verify npm's docs at publish time and record the chosen path.

## Gotcha (from the workflow comments)
Do NOT set `registry-url` in actions/setup-node — it writes an .npmrc with an empty token that
overrides OIDC and causes 404 on publish.

## Verify
After setup + cutting the tag, the workflow publishes; confirm with:
  npm view @proticom/paperboy-converter@<version>
```
- Validation:
```
test -f .claude/skills/npm-trusted-publisher/SKILL.md
grep -ni "trusted publisher\|OIDC\|registry-url\|npm view" .claude/skills/npm-trusted-publisher/SKILL.md
```

## Builder Prompt

Developer/Builder, execute this as a standalone task.

Objective: write the documentation skill that tells the user exactly how to configure npm Trusted
Publisher (OIDC) for the three scoped packages. Do NOT attempt the npm.com configuration itself —
that is a manual user action and is out of scope.

Files to edit:
- create `.claude/skills/npm-trusted-publisher/SKILL.md`

Files not to edit:
- the publish workflows (done) — but DO reference their filenames accurately in the doc.

Exact changes: author the SKILL.md covering: purpose, per-package steps on npmjs.com (repo
`proticom/paperboy`, the three workflow filenames + their tag triggers + target package names),
the first-ever-publish caveat, the `registry-url` gotcha, and a `npm view` verification step.
Model the file's frontmatter/format on an existing skill (e.g. `.claude/skills/release-cut/SKILL.md`).

Data shapes / CLI examples: package↔workflow↔tag mapping —
- `@proticom/paperboy-converter` ← `publish-paperboy-converter.yml` ← tag `v*`
- `@proticom/paperboy-cli` ← `publish-paperboy.yml` ← tag `cli-v*`
- `@proticom/paperboy-widget` ← `publish-paperboy-widget.yml` ← tag `widget-v*`

Tests to add or update: none (documentation).

Commands to run:
- `test -f .claude/skills/npm-trusted-publisher/SKILL.md`
- `grep -ni "trusted publisher\|registry-url\|npm view" .claude/skills/npm-trusted-publisher/SKILL.md`

Definition of done:
- `.claude/skills/npm-trusted-publisher/SKILL.md` exists, with accurate per-package steps, the
  three correct workflow filenames + tag triggers, the first-publish caveat, the `registry-url`
  gotcha, and a verification step.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix — N/A blockers; the required finding has a fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- Scope boundary: the builder writes the doc only. The actual npm.com Trusted Publisher
  configuration for all three packages is a manual action only Edward can perform, and it gates the
  3.4/3.5/3.6 publishes. At review turn 2 I expect to mark 3.3 `needs_human` (not auto-advance) so
  the queue pauses for that manual setup — unless the doc-only deliverable should be treated as
  `review_passed` and the manual setup tracked out-of-band. Builder: just deliver the doc; I'll
  carry the decision.

## Decision
send_to_builder
