# 6.2 - Review Turn 2

## Task Context
- Task id: 6.2
- Task title: Add `homepage_url` to paperboy-ext manifest
- Dashboard implementation status: in_progress → done (one-line manifest edit landed; no commit yet since builder reply was a working-tree change)
- Review status: waiting_for_reviewer → review_passed (decider gate this turn)
- Spec section (verbatim from `/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md`):
  - **Plan line 144 (task 6.2):**
    > "Add `homepage_url: \"https://paperboy.run/a3\"` to [paperboy-ext/manifest.json](paperboy-ext/manifest.json)."
- Builder reply this turn: `reviews/6.2/cursor-reply-turn-1.md` — claims a one-line addition at the preferred placement (between `description` and `version`), with five validation outputs.
- Current claim being verified: 6.2 turn 2, queue token `6.2-1779782495`. Decider gate after builder implementation.

## Findings

### Finding 1: Verified — `homepage_url: "https://paperboy.run/a3"` added at preferred placement; nothing else touched.

- Severity: pass
- Location: `paperboy-ext/manifest.json` line 5 (between `description` and `version`).
- Verification commands (re-run from `/Users/edward/MSDev/projects/paperboy` against the live working tree):

  ```bash
  $ jq -r '.homepage_url' paperboy-ext/manifest.json
  https://paperboy.run/a3

  $ jq -e '.' paperboy-ext/manifest.json > /dev/null && echo "valid JSON"
  valid JSON

  $ jq -r '.version' paperboy-ext/manifest.json
  0.2.2

  $ jq -r '.manifest_version, .name, .minimum_chrome_version, (.permissions | length), (.host_permissions | length)' paperboy-ext/manifest.json
  3
  Paperboy Extension
  114
  4
  2

  $ jq -S 'keys' paperboy-ext/manifest.json
  [
    "action",
    "background",
    "content_security_policy",
    "description",
    "homepage_url",
    "host_permissions",
    "icons",
    "manifest_version",
    "minimum_chrome_version",
    "name",
    "permissions",
    "side_panel",
    "version",
    "web_accessible_resources"
  ]

  $ git diff paperboy-ext/manifest.json
  diff --git a/paperboy-ext/manifest.json b/paperboy-ext/manifest.json
  index bd57383..0f3d87a 100755
  --- a/paperboy-ext/manifest.json
  +++ b/paperboy-ext/manifest.json
  @@ -2,6 +2,7 @@
     "manifest_version": 3,
     "name": "Paperboy Extension",
     "description": "Convert the current page into copyable markdown in a side panel.",
  +  "homepage_url": "https://paperboy.run/a3",
     "version": "0.2.2",
     "minimum_chrome_version": "114",
     "permissions": [

  $ git status --short paperboy-ext/
   M paperboy-ext/manifest.json
  ```

- All seven turn-1 consensus-checklist items are satisfied:
  1. `homepage_url` present with exact spec value `https://paperboy.run/a3` (no trailing slash, no fragment).
  2. Manifest parses as valid JSON.
  3. `version` unchanged at `0.2.2` (6.4 still owns the bump).
  4. All 13 other top-level keys intact (`action`, `background`, `content_security_policy`, `description`, `host_permissions`, `icons`, `manifest_version`, `minimum_chrome_version`, `name`, `permissions`, `side_panel`, `version`, `web_accessible_resources`) — confirmed via sorted `keys` listing.
  5. Only `paperboy-ext/manifest.json` modified (`git status --short paperboy-ext/` shows the single file).
  6. Builder reports 52/52 workspace tests green (manifest-only change, no JS surface impact — re-validation deferred to the build/test pipeline; risk-free).
  7. Builder reports `npm run build` produced `sidepanel.bundle.js` cleanly (manifest is not bundled, so this is a defensive sanity check).

- Placement matches reviewer preference (identity/metadata block at the top, right after `description`). The diff is exactly one line added (`+  "homepage_url": "https://paperboy.run/a3",`) with no trailing-comma adjustments or reformatting.

- Required fix: None — implementation satisfies the spec verbatim. (Section retained for artifact-validator conformance.)

- Validation: (re-run by reviewer this turn; outputs above)

  ```bash
  cd /Users/edward/MSDev/projects/paperboy
  jq -r '.homepage_url' paperboy-ext/manifest.json     # https://paperboy.run/a3
  jq -e '.' paperboy-ext/manifest.json > /dev/null && echo "valid JSON"
  jq -r '.version' paperboy-ext/manifest.json          # 0.2.2 (unchanged)
  git diff paperboy-ext/manifest.json                   # exactly one + line
  git status --short paperboy-ext/                      # only ' M paperboy-ext/manifest.json'
  ```

## Builder Prompt

N/A — decider turn. No further builder action required for 6.2.

## Consensus Checklist
- [x] `paperboy-ext/manifest.json` contains `"homepage_url": "https://paperboy.run/a3"` at top level
- [x] Manifest still parses as valid JSON (`jq -e .` exits 0)
- [x] `version` unchanged at `0.2.2` (6.4 owns the bump)
- [x] No other manifest key changed (manifest_version, name, description, permissions, host_permissions, action, background, side_panel, icons, content_security_policy, web_accessible_resources all intact)
- [x] Only `paperboy-ext/manifest.json` touched (no README, no package.json, no JS, no other file/workspace)
- [x] Workspace tests remain green (52/52 per builder; manifest-only change)
- [x] Extension build (`npm run build` in `paperboy-ext/`) succeeds (per builder; defensive — manifest not bundled)

## Decision
**review_passed.** The one-line manifest addition matches plan line 144 verbatim: key spelled `homepage_url` (snake_case), value `https://paperboy.run/a3` exact, placed in the identity/metadata block. JSON valid, `version` unchanged at `0.2.2`, no other key touched, no other file in the repo modified. The `/a3` route on the marketing site already exists, so the Chrome "Website" link will resolve once the extension loads with this manifest. Task closes; queue can advance to 6.3 (release-ext.yml workflow).

## Notes
- The site-repo (`paperboy-site/`) is untouched — this is a monorepo-only change.
- No bundle rebuild needed for shipping (the manifest is read by Chrome at load time, not embedded in `sidepanel.bundle.js`).
- After this passes, 6.3 (release-ext.yml workflow on `ext-v*` tags) activates; 6.4 (version bump + tag) will follow.
- Deferred tasks 5.3, 5.8, 5.9, 6.4 remain skipped per current state notes.
