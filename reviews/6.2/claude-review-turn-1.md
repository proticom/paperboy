# 6.2 - Review Turn 1

## Task Context
- Task id: 6.2
- Task title: Add `homepage_url` to paperboy-ext manifest
- Dashboard implementation status: in_progress (queue auto-activated 6.2 when 6.1 closed; no builder commit yet — turn-1 spec route to builder)
- Review status: in_review → waiting_for_builder
- Spec section (verbatim from `/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md`):
  - **Plan line 144 (task 6.2):**
    > "Add `homepage_url: \"https://paperboy.run/a3\"` to [paperboy-ext/manifest.json](paperboy-ext/manifest.json)."
- Related context:
  - Current `paperboy-ext/manifest.json` (verified, 45 lines, no `homepage_url` field):
    ```json
    {
      "manifest_version": 3,
      "name": "Paperboy Extension",
      "description": "Convert the current page into copyable markdown in a side panel.",
      "version": "0.2.2",
      "minimum_chrome_version": "114",
      "permissions": ["sidePanel","activeTab","scripting","storage"],
      "host_permissions": ["http://*/*","https://*/*"],
      "action": {"default_title": "Open Paperboy side panel"},
      "background": {"service_worker": "background.js","type": "module"},
      "side_panel": {"default_path": "sidepanel.html"},
      "icons": {"16": "icons/icon-16.png","48": "icons/icon-48.png","128": "icons/icon-128.png"},
      "content_security_policy": {"extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"},
      "web_accessible_resources": [{"resources": ["lib/tesseract/*"],"matches": ["<all_urls>"]}]
    }
    ```
  - `/a3` route on the marketing site EXISTS (`paperboy-site/app/a3/layout.tsx` + `page.tsx` verified) — the spec URL `https://paperboy.run/a3` resolves to the extension landing page. Spec correctness confirmed.
  - `homepage_url` is a [documented MV3 manifest key](https://developer.chrome.com/docs/extensions/reference/manifest/homepage-url) (top-level string). It surfaces as the "Website" link on the chrome://extensions detail card and in the Chrome Web Store listing. No permission impact, no behavior change.
- Files inspected:
  - `paperboy-ext/manifest.json` (full file, 45 lines).
  - `paperboy-ext/package.json` (no `homepage` field either — checked for consistency, but `package.json` is npm-scoped and unrelated to Chrome's `homepage_url`).
  - `paperboy-site/app/a3/` directory listing (confirms `layout.tsx`, `page.tsx`).
- Commands run (turn 1, read-only):
  ```bash
  $ grep -n "homepage_url\|homepage" paperboy-ext/manifest.json paperboy-ext/package.json
  # (no matches — field absent)

  $ ls paperboy-site/app/a3/
  layout.tsx
  page.tsx

  $ jq -e '.homepage_url // empty' paperboy-ext/manifest.json
  # exit 1 (key missing — confirmed)
  ```
- Current claim being verified: 6.2 turn 1, queue token `6.2-0001`. Spec route, no builder commit yet.

## Findings

### Finding 1: Add `homepage_url: "https://paperboy.run/a3"` to `paperboy-ext/manifest.json`.
- Severity: required
- Location: `paperboy-ext/manifest.json` — top-level JSON object, one new key.
- Problem: The MV3 manifest currently has no `homepage_url`. The `chrome://extensions` detail card shows no "Website" link, and once the extension is distributed (sideload zip via task 6.4 + future Web Store), users have no canonical destination tying the installed binary back to its marketing/docs page (`/a3`). Plan line 144 mandates the field; this is a one-line manifest addition required before tagging `ext-v0.2.2` (task 6.4) and serving the sideload zip from the site copy (task 6.5).
- Spec mismatch / risk:
  - Plan line 144 is verbatim: `homepage_url: "https://paperboy.run/a3"`. URL is canonical (the site already serves `/a3`); no need to invent a different URL.
  - **In scope (6.2):**
    1. Add exactly one top-level field to `paperboy-ext/manifest.json`: `"homepage_url": "https://paperboy.run/a3"`.
  - **Out of scope (6.2):**
    - Touching any other manifest field (no version bump for a metadata-only addition; 6.4 will own the version-bump-and-tag step).
    - Touching `paperboy-ext/package.json` (npm `homepage` field is unrelated and not required; do not "mirror" the value there).
    - Touching `paperboy-ext/README.md`, `sidepanel.html`, `sidepanel.js`, `background.js`, `build.js`, `package-for-store.js`, or any other file in `paperboy-ext/`.
    - Touching other workspaces (`paperboy-cli`, `paperboy-converter`, `paperboy-widget`, `paperboy-app`, `paperboy-ai`) or `paperboy-site/`.
    - Adding a homepage URL in any code (e.g. an "About" link in the side panel).
    - Building or rebundling — JSON-only change, doesn't propagate into `sidepanel.bundle.js`.
- Required fix: Builder edits `paperboy-ext/manifest.json` only. Add the key once.

  **Preferred placement (per Chrome's documented manifest-key ordering convention):** insert `homepage_url` right after the `description` field — `homepage_url` is alphabetical-adjacent to the other top-level identity/metadata keys (`name`, `description`, `version`, `minimum_chrome_version`) and Chrome's manifest reference groups it among "basic information about the extension". This keeps the diff legible (one line added immediately under `description`).

  Before:
  ```json
  {
    "manifest_version": 3,
    "name": "Paperboy Extension",
    "description": "Convert the current page into copyable markdown in a side panel.",
    "version": "0.2.2",
  ```

  After:
  ```json
  {
    "manifest_version": 3,
    "name": "Paperboy Extension",
    "description": "Convert the current page into copyable markdown in a side panel.",
    "homepage_url": "https://paperboy.run/a3",
    "version": "0.2.2",
  ```

  (Alternative placement — bottom of the object, just before the trailing `}` — is also acceptable to Chrome; the manifest spec doesn't enforce key order. Reviewer preference: keep it with the identity/metadata block at the top. Either placement passes the validation greps below.)

  **Builder rules:**
  - Only touch `paperboy-ext/manifest.json`. No other file.
  - URL value verbatim: `https://paperboy.run/a3` (no trailing slash, no query string, no fragment).
  - Key name verbatim: `homepage_url` (snake_case, lowercase — Chrome's required spelling).
  - Preserve the existing JSON formatting (2-space indent, no trailing newline change beyond the existing one).
  - Don't reformat unrelated keys.
  - Don't bump `version` (6.4 owns that).
  - Don't touch `package-for-store.js` (the packager will pick up the new manifest automatically on next 6.3/6.4 build).

- Validation:

  ```bash
  cd /Users/edward/MSDev/projects/paperboy

  # 1. homepage_url present with the exact spec value
  jq -r '.homepage_url' paperboy-ext/manifest.json
  # expected: https://paperboy.run/a3

  # 2. Manifest still parses as valid JSON
  jq -e '.' paperboy-ext/manifest.json > /dev/null && echo "valid JSON"
  # expected: valid JSON  (exit 0)

  # 3. No other manifest keys changed
  jq -S '.' paperboy-ext/manifest.json | head -40
  # expected: same keys as before plus the single homepage_url addition; sorted view should
  #           include "homepage_url": "https://paperboy.run/a3"

  # 4. Version NOT bumped (6.4 owns the version bump + tag)
  jq -r '.version' paperboy-ext/manifest.json
  # expected: 0.2.2  (unchanged)

  # 5. Other manifest values intact
  jq -r '.manifest_version, .name, .minimum_chrome_version, (.permissions | length), (.host_permissions | length)' paperboy-ext/manifest.json
  # expected: 3, "Paperboy Extension", "114", 4, 2  (unchanged)

  # 6. Only manifest.json modified
  git status --short paperboy-ext/
  # expected: M paperboy-ext/manifest.json  (nothing else)

  # 7. JS workspace tests still green (defensive — manifest-only change, no JS impact)
  npm test --workspaces --if-present 2>&1 | grep -E "Tests" | head
  # expected: 52/52 across 5 workspaces (no regression)

  # 8. Extension build still produces a valid bundle (defensive)
  cd paperboy-ext && npm run build 2>&1 | tail -5
  # expected: successful build, no error referencing the manifest
  ```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 6.2.

**Objective:** Add a single top-level field `"homepage_url": "https://paperboy.run/a3"` to `paperboy-ext/manifest.json`. Plan line 144 verbatim. The `/a3` route exists on the marketing site (`paperboy-site/app/a3/page.tsx` verified), so the URL resolves. This is a one-line metadata addition — no behavior change, no version bump, no other file touched.

**Files to edit:**

1. **`paperboy-ext/manifest.json`** — one change:
   - Insert `"homepage_url": "https://paperboy.run/a3",` immediately after the `"description"` line and before `"version"`.

   Resulting diff should be exactly one line added (or, if you choose end-of-object placement, one line added plus a trailing-comma adjustment on the prior key — still single-effect).

**Do not edit:** anything else in `paperboy-ext/` (no README, no `package.json`, no JS, no build script, no packager). Do not touch other workspaces or the site repo. Do not bump `version` (still `0.2.2`).

**Validate (run these exact commands and report back the outputs):**

```bash
cd /Users/edward/MSDev/projects/paperboy

jq -r '.homepage_url' paperboy-ext/manifest.json
# expected: https://paperboy.run/a3

jq -e '.' paperboy-ext/manifest.json > /dev/null && echo "valid JSON"
# expected: valid JSON

jq -r '.version' paperboy-ext/manifest.json
# expected: 0.2.2  (unchanged)

git status --short paperboy-ext/
# expected: only ' M paperboy-ext/manifest.json'

npm test --workspaces --if-present 2>&1 | grep -E "Tests" | head
# expected: 52/52 across 5 workspaces

cd paperboy-ext && npm run build 2>&1 | tail -3
# expected: clean build
```

When you reply, write `reviews/6.2/cursor-reply-turn-1.md` with: (a) the diff hunk for `paperboy-ext/manifest.json`; (b) the output of each validation command; (c) a one-line confirmation that no other file was touched.

## Consensus Checklist
- [ ] `paperboy-ext/manifest.json` contains `"homepage_url": "https://paperboy.run/a3"` at top level
- [ ] Manifest still parses as valid JSON (`jq -e .` exits 0)
- [ ] `version` unchanged at `0.2.2` (6.4 owns the bump)
- [ ] No other manifest key changed (manifest_version, name, description, permissions, host_permissions, action, background, side_panel, icons, content_security_policy, web_accessible_resources all intact)
- [ ] Only `paperboy-ext/manifest.json` touched (no README, no package.json, no JS, no other file/workspace)
- [ ] Workspace tests remain green (52/52)
- [ ] Extension build (`npm run build` in `paperboy-ext/`) succeeds

## Decision
**send_to_builder.** Fresh task, no builder commit yet. Routing the single-line manifest addition (`homepage_url`) to the builder with verbatim spec value, placement guidance, and validation commands.

## Notes
- This is a metadata-only manifest change. No bundle rebuild required for shipping (the manifest is consumed by Chrome at load time, not bundled into `sidepanel.bundle.js`), but the defensive `npm run build` is included as a sanity check.
- The URL `https://paperboy.run/a3` resolves to the live marketing landing page; no need to invent a different URL or wait on a redirect.
- Version stays `0.2.2`; task 6.4 will own the version bump + tag step.
- Plan line 144 is the only line that mentions `homepage_url`; no cross-task entanglement.
