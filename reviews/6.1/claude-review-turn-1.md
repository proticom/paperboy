# 6.1 - Review Turn 1

## Task Context
- Task id: 6.1
- Task title: Update paperboy-ext README (remove content.js refs)
- Dashboard implementation status: in_progress (queue auto-activated 6.1 when 5.7 closed; no builder commit yet — turn-1 spec route to builder)
- Review status: in_review → waiting_for_builder
- Spec section (verbatim from `/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md`):
  - **Plan line 143 (task 6.1):**
    > "Update stale docs in [paperboy-ext/README.md:73,88-89,100](paperboy-ext/README.md): remove references to `content.js` (file does not exist; logic moved to injected functions); correct the `storage` line (it IS used at [sidepanel.js:54-72](paperboy-ext/sidepanel.js))."
- Related context:
  - `paperboy-ext/` directory listing (verified, file actually missing):
    ```
    background.js
    build.js
    dist/
    icons/
    lib/
    manifest.json
    package-for-store.js
    package.json
    scripts/
    sidepanel.bundle.js
    sidepanel.html
    sidepanel.js
    styles.css
    README.md
    ```
    **`content.js` is not in this list** — plan claim verified.
  - `paperboy-ext/README.md` references to `content.js` (verbatim, line-numbered):
    - **Line 73** (inside the file-tree code-block):
      ```
        content.js
      ```
      Listed as a top-level file alongside `background.js`, `sidepanel.html`, etc. Misleading because the file doesn't exist.
    - **Lines 88-89** (inside the "File roles" list):
      ```
      - `content.js`  
        Runs inside the web page and captures HTML/title/url.
      ```
      Documents a file that doesn't exist. The actual capture mechanism is `chrome.scripting.executeScript({...function: ...})` calls in `background.js` (verified at lines 529 and 556) — i.e. inline functions injected at extract time, not a static `content.js` content script. Manifest also has no `content_scripts` array (verified: only `permissions`, `host_permissions`, `action`, `background`, `side_panel`, `icons`, `content_security_policy`, `web_accessible_resources`).
    - **Line 100** (inside "Remaining work" list, "Permissions cleanup" item):
      ```
      1. **Permissions cleanup** — `manifest.json` includes the `storage` permission, but the extension code does not use `chrome.storage`. Remove `storage` from the manifest after a quick grep confirms nothing needs it, so the permission prompt stays minimal.
      ```
      **Wrong** — `storage` IS used. `grep -n storage paperboy-ext/sidepanel.js` returns three hits inside the `loadPrefs`/`savePrefs` functions at lines 54-72:
      ```js
      const PREFS_KEY = "paperboy:prefs";
      async function loadPrefs() {
        try {
          const result = await chrome.storage.local.get(PREFS_KEY);  // line 58
          return result?.[PREFS_KEY] || {};
        } catch {
          return {};
        }
      }
      function savePrefs(updates) {
        chrome.storage.local.get(PREFS_KEY).then((result) => {        // line 66
          const current = result?.[PREFS_KEY] || {};
          chrome.storage.local                                         // line 68
            .set({ [PREFS_KEY]: { ...current, ...updates } })
            .catch(() => {});
        }, () => {});
      }
      ```
      The `storage` permission in `manifest.json` is therefore correctly declared, not a cleanup target. The README "Remaining work" item is the stale claim.
  - `paperboy-ext/manifest.json` `permissions` array (verified):
    ```json
    ["sidePanel","activeTab","scripting","storage"]
    ```
    All four are used: `sidePanel` (side_panel feature), `activeTab` (active tab access at click), `scripting` (executeScript in background.js), `storage` (prefs persistence in sidepanel.js).
  - `paperboy-ext/background.js` content-extraction mechanism (verified):
    ```js
    // background.js:529
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => { /* in-page capture: returns document.documentElement.outerHTML / title / url */ },
    });
    // background.js:556
    await chrome.scripting.executeScript({ ... });
    ```
    These programmatically-injected functions are the modern replacement for a static `content.js` content script. The capture logic lives inside `background.js` as inline arrow functions injected via `chrome.scripting.executeScript`, not in a separate file.
- Files inspected:
  - `paperboy-ext/README.md` (full file, 131 lines).
  - `paperboy-ext/manifest.json` (full file).
  - `paperboy-ext/sidepanel.js` (lines 50-75 — storage usage block).
  - `paperboy-ext/background.js` (lines 525-560 — executeScript blocks).
  - `paperboy-ext/` directory listing (confirms no `content.js`).
- Commands run (turn 1, read-only):
  ```bash
  $ ls paperboy-ext/content.js
  ls: paperboy-ext/content.js: No such file or directory

  $ grep -n "content.js" paperboy-ext/README.md
  73:  content.js
  88:- `content.js`
  100:  # (Note: line 100 is the storage paragraph; "content.js" is NOT on line 100. Plan line ref "100" is to the storage claim, not a content.js ref. README line 100 ref check below.)

  $ grep -n "storage" paperboy-ext/README.md
  100:1. **Permissions cleanup** — `manifest.json` includes the `storage` permission, but the extension code does not use `chrome.storage`. Remove `storage` from the manifest after a quick grep confirms nothing needs it, so the permission prompt stays minimal.

  $ grep -n "chrome.storage\|storage" paperboy-ext/sidepanel.js
  58:    const result = await chrome.storage.local.get(PREFS_KEY);
  66:  chrome.storage.local.get(PREFS_KEY).then((result) => {
  68:    chrome.storage.local

  $ grep -n "chrome.scripting\|executeScript" paperboy-ext/background.js
  529:    const [injection] = await chrome.scripting.executeScript({
  556:    await chrome.scripting.executeScript({

  $ ls paperboy-ext/ | sort
  README.md background.js build.js dist icons lib manifest.json package-for-store.js package.json scripts sidepanel.bundle.js sidepanel.html sidepanel.js styles.css

  $ jq '.permissions' paperboy-ext/manifest.json
  ["sidePanel","activeTab","scripting","storage"]
  ```
- Current claim being verified: 6.1 turn 1, queue token `6.1-0001`. Spec review only — fresh task, no builder commit yet.

## Findings

### Finding 1: Remove `content.js` references from `paperboy-ext/README.md` and rewrite the "Permissions cleanup" item to acknowledge `storage` is in use.
- Severity: required
- Location: `paperboy-ext/README.md` — lines 73, 88-89, 100 (three distinct locations; plan calls them out individually).
- Problem:
  - **Line 73 (file-tree code-block):** lists `content.js` as a top-level file. The file doesn't exist on disk. Developers loading the unpacked extension or reading the README to understand the codebase get a wrong mental model.
  - **Lines 88-89 (File roles list):** documents `content.js` with the role "Runs inside the web page and captures HTML/title/url." Misleading on two axes: (1) the file doesn't exist; (2) the capture mechanism is `chrome.scripting.executeScript` calls injecting inline functions from `background.js` (verified at lines 529 + 556). A reader looking for "where the page is captured" should be directed to the executeScript blocks in `background.js`, not to a nonexistent `content.js`.
  - **Line 100 ("Remaining work" → "Permissions cleanup"):** claims `chrome.storage` is unused and `storage` should be removed from `manifest.json`. Both halves are wrong:
    1. `chrome.storage.local` IS used at `sidepanel.js:58, 66, 68` inside `loadPrefs`/`savePrefs` for prefs persistence (`PREFS_KEY = "paperboy:prefs"`).
    2. Removing `storage` from `manifest.json` would BREAK the side panel's prefs persistence (loadPrefs would throw `TypeError: Cannot read properties of undefined (reading 'local')` at extension load).
    This item is not a "remaining cleanup" — it's stale and actively misleading. A future contributor reading this could remove the permission and break the extension.
- Spec mismatch / risk:
  - Plan line 143 explicitly identifies these three locations and the corrective action: "remove references to `content.js`; correct the `storage` line". Direct doc-only edit.
  - **In scope (6.1):**
    1. Remove `content.js` line from the file-tree code-block (line 73).
    2. Remove the `content.js` entry from the "File roles" list (lines 88-89).
    3. Replace the "Permissions cleanup" item (line 100, item #1 of "Remaining work") with copy that accurately reflects the manifest: either delete the item entirely (since `storage` is correctly declared and used) OR rewrite it to acknowledge `storage` is in use for prefs persistence. **Preferred: delete the item** — it's not actually remaining work. (Builder choice; either landing is acceptable as long as the misinformation is removed.)
    4. **Bonus, in scope because it improves the same file roles list while we're touching it:** add a sentence to the `background.js` File-roles entry explaining that page capture happens via `chrome.scripting.executeScript` injected functions (so the doc still tells the reader "where capture lives" after `content.js` is removed). Without this addition, the README loses information; a developer looking for "where do we capture HTML?" no longer has a clear answer.
  - **Out of scope (6.1):**
    - Touching `manifest.json` — `storage` is correctly declared and used; no permission change needed.
    - Touching `sidepanel.js`, `background.js`, `build.js`, `package.json`, or any non-README file in `paperboy-ext/`.
    - Touching other workspaces (`paperboy-cli`, `paperboy-converter`, `paperboy-widget`, `paperboy-app`, `paperboy-ai`) or `paperboy-site/`.
    - Adding new "Remaining work" items.
    - Renumbering the remaining "Remaining work" items if item #1 is deleted (the surviving items can either renumber 1-4 or stay numbered with item #1 deleted — Markdown ordered-list rendering doesn't care; preference for renumbering is a cosmetic preference, not required).
    - Updating the in-paragraph reference `[paperboy-ext/README.md:73,88-89,100]` from the plan file (the plan markdown is read-only context, not in scope).
    - Bumping the extension version in `manifest.json` (docs-only change; no functional behavior change).
- Required fix: Builder edits `paperboy-ext/README.md` only. Three concrete changes:

  **Change 1 — File-tree code-block (around lines 67-81):** Remove the `content.js` line.

  Before:
  ```
  paperboy-ext/
    manifest.json
    package.json
    build.js
    background.js
    content.js
    sidepanel.html
    sidepanel.js
    sidepanel.bundle.js
    styles.css
    lib/
      readability.js
    icons/
  ```

  After:
  ```
  paperboy-ext/
    manifest.json
    package.json
    build.js
    background.js
    sidepanel.html
    sidepanel.js
    sidepanel.bundle.js
    styles.css
    lib/
      readability.js
    icons/
  ```

  **Change 2 — File roles list (around lines 83-93):** Delete the `content.js` bullet and amend the `background.js` bullet to mention the injected-capture pattern.

  Before:
  ```
  ### File roles (simple explanation)

  - `background.js`  
    Handles extension-level events and requests data from the active tab.

  - `content.js`  
    Runs inside the web page and captures HTML/title/url.

  - `sidepanel.js`  
    Converts HTML to Markdown, renders output, and handles copy/re-extract buttons.
  ```

  After:
  ```
  ### File roles (simple explanation)

  - `background.js`  
    Handles extension-level events and captures page HTML/title/url by injecting a function into the active tab with `chrome.scripting.executeScript` (the modern replacement for a static content script).

  - `sidepanel.js`  
    Converts HTML to Markdown, renders output, persists side-panel prefs via `chrome.storage.local`, and handles copy/re-extract buttons.
  ```

  Notes on the amended bullets:
  - The `background.js` bullet now answers "where does page capture happen?" so the README still tells that story after `content.js` is gone.
  - The `sidepanel.js` bullet now also acknowledges `chrome.storage.local` usage in passing — paying off the "storage IS used" correction directly in the file-roles list, where a reader will look first.

  **Change 3 — "Remaining work" item #1 (around line 100):** Delete the entire "Permissions cleanup" item. The remaining items renumber to 1-4 (Converter dependency, Chrome Web Store, Quality gates, Other browsers).

  Before:
  ```
  1. **Permissions cleanup** — `manifest.json` includes the `storage` permission, but the extension code does not use `chrome.storage`. Remove `storage` from the manifest after a quick grep confirms nothing needs it, so the permission prompt stays minimal.

  2. **Converter dependency** — ...
  ```

  After:
  ```
  1. **Converter dependency** — ...
  ```
  (i.e. items 2-5 shift up to 1-4; the "Permissions cleanup" misinformation is gone entirely.)

  Field-by-field rationale:
  - **Delete `content.js` from file tree + file roles:** matches plan line 143 literal. The file doesn't exist; documenting it as if it does is the bug.
  - **Amend `background.js` roles entry to mention `executeScript`:** preserves the README's value (a developer can still find "where is page capture?"). Without this, removing the `content.js` entry creates a documentation gap.
  - **Amend `sidepanel.js` roles entry to mention `chrome.storage.local`:** explains the surviving `storage` permission without resorting to a "Permissions cleanup" stub. One-liner addition.
  - **Delete the "Permissions cleanup" item entirely (vs. rewrite):** the cleanest correction. The item is fundamentally wrong (storage IS used; the manifest is correct), and an "actually, storage is in use" stub would just be empty noise. Deletion is the proper fix; the file-roles `sidepanel.js` amendment carries the explanatory weight.

  **Builder rules:**
  - Only touch `paperboy-ext/README.md`. No other file.
  - Preserve EXACTLY the unaffected README content (intro, install steps, "How to Use It", "Pages That Will Not Work", "Updating Vendored Libraries", trailing `npm install && npm run build` block). Diff should be confined to lines 67-81 (file tree), 83-93 (file roles), 100 (the deleted item) and any subsequent line-shift from the deletion.
  - Don't introduce new top-level sections.
  - Don't bump version, don't touch frontmatter (there is none), don't add a CHANGELOG (none exists in `paperboy-ext/`).
  - Don't reflow paragraphs unrelated to the changed lines.
  - Don't change the heading levels.
  - Markdown formatting: the file currently uses `  ` (two trailing spaces) for soft line breaks inside the File roles list and `---` rules between sections; preserve both conventions.

- Validation:

  ```bash
  cd /Users/edward/MSDev/projects/paperboy

  # 1. content.js fully removed from README
  grep -c "content.js" paperboy-ext/README.md
  # expected: 0

  # 2. "Permissions cleanup" / "does not use chrome.storage" misinformation gone
  grep -c "Permissions cleanup" paperboy-ext/README.md
  # expected: 0
  grep -c "does not use \`chrome.storage\`\|does not use chrome.storage" paperboy-ext/README.md
  # expected: 0

  # 3. background.js role bullet now mentions the injection pattern (proves the doc still answers "where is capture?")
  grep -c "chrome.scripting.executeScript" paperboy-ext/README.md
  # expected: >= 1

  # 4. sidepanel.js role bullet acknowledges storage usage
  grep -c "chrome.storage.local" paperboy-ext/README.md
  # expected: >= 1

  # 5. No other file modified
  git status --short paperboy-ext/ paperboy-cli/ paperboy-converter/ paperboy-widget/ paperboy-app/ paperboy-ai/ paperboy-site/ .github/ .claude/ package.json
  # expected: only paperboy-ext/README.md (M) in the output; nothing else

  # 6. README still parses (no broken Markdown). Quick sanity by ensuring fenced code blocks are balanced.
  awk '/^```/ {count++} END {if (count % 2 != 0) {print "UNBALANCED FENCE"; exit 1} else print "Fenced blocks balanced ("count")"}' paperboy-ext/README.md
  # expected: "Fenced blocks balanced (N)" with N even

  # 7. The reality check (re-verify, post-edit) — storage IS used, content.js is NOT present.
  grep -n "chrome.storage" paperboy-ext/sidepanel.js | head
  # expected: lines 58/66/68 (or equivalent) — unchanged.
  ls paperboy-ext/content.js 2>&1
  # expected: "No such file or directory" — unchanged.

  # 8. JS workspace tests still green (defensive — docs change should not break anything)
  npm test --workspaces --if-present 2>&1 | grep -E "Tests " | tail
  # expected: 52/52 across 5 workspaces

  # 9. Workspace builds still green (defensive)
  npm run build --workspaces --if-present 2>&1 | tail -3
  # expected: all green
  ```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 6.1.

Objective: Correct three stale references in `paperboy-ext/README.md`: remove the two `content.js` mentions (the file doesn't exist; capture lives in `background.js` `chrome.scripting.executeScript` calls) and delete the wrong "Permissions cleanup" item (`storage` IS in use at `sidepanel.js:54-72`). Add one-line amendments to the `background.js` and `sidepanel.js` file-roles bullets so the README still explains where capture and prefs persistence live after the deletions.

Files to edit:

1. **`paperboy-ext/README.md`** — three changes, all confined to the file:

   **Edit A — File-tree code-block.** Remove the `content.js` line. The block currently contains:
   ```
   paperboy-ext/
     manifest.json
     package.json
     build.js
     background.js
     content.js
     sidepanel.html
     sidepanel.js
     sidepanel.bundle.js
     styles.css
     lib/
       readability.js
     icons/
   ```
   After the edit, the `content.js` line is gone; all other lines unchanged. Preserve the 2-space indentation.

   **Edit B — File roles list.** Two substitutions:

   1. Delete the `content.js` bullet entirely (the bullet currently reads "Runs inside the web page and captures HTML/title/url.").
   2. Amend the `background.js` bullet from "Handles extension-level events and requests data from the active tab." to "Handles extension-level events and captures page HTML/title/url by injecting a function into the active tab with `chrome.scripting.executeScript` (the modern replacement for a static content script)." Preserve the trailing two spaces for the soft line break.
   3. Amend the `sidepanel.js` bullet from "Converts HTML to Markdown, renders output, and handles copy/re-extract buttons." to "Converts HTML to Markdown, renders output, persists side-panel prefs via `chrome.storage.local`, and handles copy/re-extract buttons." Preserve the trailing two spaces for the soft line break.

   Final list (verbatim):
   ```
   ### File roles (simple explanation)

   - `background.js`  
     Handles extension-level events and captures page HTML/title/url by injecting a function into the active tab with `chrome.scripting.executeScript` (the modern replacement for a static content script).

   - `sidepanel.js`  
     Converts HTML to Markdown, renders output, persists side-panel prefs via `chrome.storage.local`, and handles copy/re-extract buttons.
   ```

   **Edit C — "Remaining work" list, item #1 "Permissions cleanup".** Delete the entire item (everything from the leading `1. **Permissions cleanup**` through the end of that paragraph). The subsequent items (`2. Converter dependency`, `3. Chrome Web Store`, `4. Quality gates`, `5. Other browsers`) shift up to be `1.`-`4.` Renumber them. Keep all their body text exactly the same.

   Important rules:
   - Preserve every other character in `paperboy-ext/README.md` unchanged. The diff should be confined to the three edit zones above plus the renumbering shift.
   - Do not reflow paragraphs in the install steps, "How to Use It", "Pages That Will Not Work", or "Updating Vendored Libraries" sections — they are untouched.
   - Do not add new headings, do not change heading levels.
   - Do not introduce trailing whitespace or change the existing trailing-whitespace convention (`  ` two spaces at end of file-role bullet first lines is the existing soft-break convention).
   - Do not add a "What changed" section or any meta-doc commentary.

Files NOT to edit:
- `paperboy-ext/manifest.json` — `storage` permission stays (it's used).
- `paperboy-ext/sidepanel.js`, `paperboy-ext/background.js`, `paperboy-ext/build.js`, `paperboy-ext/sidepanel.bundle.js`, `paperboy-ext/sidepanel.html`, `paperboy-ext/styles.css`, `paperboy-ext/package.json`, `paperboy-ext/package-for-store.js`, `paperboy-ext/lib/**`, `paperboy-ext/icons/**`, `paperboy-ext/dist/**`, `paperboy-ext/scripts/**` — no code change; this is a docs-only PR.
- Any other workspace (`paperboy-cli`, `paperboy-converter`, `paperboy-widget`, `paperboy-app`, `paperboy-ai`) — out of scope.
- `paperboy-site/**` — out of scope.
- `.github/workflows/**` — out of scope.
- `.claude/**`, `.cursor/**` — out of scope.
- `package.json` at monorepo root — out of scope.

Implementation notes:
- The original README is 131 lines. After Edit C deletes the "Permissions cleanup" item, the file shortens by roughly 2 lines (the item is a single numbered paragraph). Edits A and B are pure line removals/substitutions with a small additive amendment to background.js + sidepanel.js bullets; net file length change is small but not zero.
- Markdown ordered-list rendering with `1. 2. 3.` versus `1. 1. 1. 1.` is a stylistic choice. The existing README uses explicit `1. 2. 3. 4. 5.` for the "Remaining work" list. Preserve that style — renumber as `1. 2. 3. 4.` after deletion.
- `npm` and `chrome.storage.local` should be left as inline code (backticks) where they appear in the amended bullets. They are inline code in the existing README and need to stay that way for visual consistency.
- The README closes with a fenced code block (lines 119-121 + 125-128) and a final paragraph at line 130. Don't touch those.

Tests to add: none. This is a documentation-only change; no test surface is affected. The validation block above covers `grep`-based correctness checks for the doc content and `npm test` + `npm run build --workspaces` as defensive smoke tests.

Commands to run (capture exit codes in your reply):

```bash
cd /Users/edward/MSDev/projects/paperboy

# 1. Pre-state snapshot (baseline)
grep -n "content.js\|Permissions cleanup\|does not use" paperboy-ext/README.md
# baseline: 4-5 matches across lines ~73, 88, 100

# 2. Edit paperboy-ext/README.md per Edits A, B, C above (your editor of choice).

# 3. Post-edit correctness checks
grep -c "content.js" paperboy-ext/README.md
# expected: 0
grep -c "Permissions cleanup" paperboy-ext/README.md
# expected: 0
grep -c "does not use \`chrome.storage\`\|does not use chrome.storage" paperboy-ext/README.md
# expected: 0
grep -c "chrome.scripting.executeScript" paperboy-ext/README.md
# expected: >= 1
grep -c "chrome.storage.local" paperboy-ext/README.md
# expected: >= 1

# 4. Scope guard
git status --short
# expected: only paperboy-ext/README.md (M); plus orchestrator JSON files (expected churn)

# 5. Fenced-block balance sanity (catches accidental fence removal)
awk '/^```/ {count++} END {if (count % 2 != 0) {print "UNBALANCED FENCE"; exit 1} else print "Fenced blocks balanced ("count")"}' paperboy-ext/README.md
# expected: even count, no UNBALANCED FENCE

# 6. Source code unchanged — `storage` still used, `content.js` still missing
grep -n "chrome.storage" paperboy-ext/sidepanel.js | head
ls paperboy-ext/content.js 2>&1
# expected: lines 58/66/68 in sidepanel.js; "No such file or directory" for content.js

# 7. Workspace tests (defensive)
npm test --workspaces --if-present 2>&1 | grep -E "Tests " | tail
# expected: 52/52

# 8. Workspace builds (defensive)
npm run build --workspaces --if-present 2>&1 | tail -3
# expected: green
```

Definition of done (turn 1):
- `paperboy-ext/README.md` contains 0 mentions of `content.js`.
- `paperboy-ext/README.md` contains 0 mentions of "Permissions cleanup" and 0 claims that storage is unused.
- `paperboy-ext/README.md` contains at least one mention of `chrome.scripting.executeScript` (in the `background.js` File-role bullet) and at least one mention of `chrome.storage.local` (in the `sidepanel.js` File-role bullet).
- "Remaining work" list is renumbered `1. 2. 3. 4.` (Converter dependency / Chrome Web Store / Quality gates / Other browsers).
- No other file in the monorepo changes (besides orchestrator JSON).
- Workspace tests + builds still green.

## Consensus Checklist
- [x] Every blocker finding has a concrete fix
- [x] Every required finding has a validation command
- [x] Code samples or exact data/CLI examples are included where useful
- [x] Open questions are listed below, or "No open questions"

Open questions:
- **Should we keep a stub "Permissions cleanup" item that says "(none — all permissions are used)" instead of deleting?** **Decision: NO, delete entirely.** A stub "all permissions used" item is empty noise. The amended `sidepanel.js` file-roles bullet now mentions `chrome.storage.local` directly, paying off the "storage is in use" correction in a more useful location (where the reader is actually asking "what does this file do?"). Deletion is cleaner.
- **Should we add a fresh "Remaining work" item for "Document the scripting injection pattern"?** **Decision: NO.** The amended `background.js` File-roles bullet already mentions `chrome.scripting.executeScript`. Adding a "Remaining work" item to document something already documented would defeat itself.
- **Should we update the linked plan file `/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md` line 143 to reflect the post-fix state?** **Decision: NO.** The plan file is the spec; it captures task intent, not post-fix state. Updating it would be revisionist. Out of scope.
- **Should we change anything else in the README while we're here (e.g. typos, section ordering)?** **Decision: NO.** Scope discipline — 6.1 is "remove content.js refs + correct storage line". Other README polish is a separate task if anyone wants it.
- **Should we bump `paperboy-ext/package.json` version (0.2.2)?** **Decision: NO.** Docs-only change; no functional or shipped-artifact diff. Version bumps follow `/bump-version` workflow, not per-task.
- **Should we delete the `Updating Vendored Libraries` section (lines 112-128)?** **Decision: NO.** Out of scope; that section is accurate (`lib/readability.js` is vendored).

## Decision
send_to_builder

## Notes (becomes the dashboard `--note`)
6.1 turn 1: spec routed to builder. Docs-only edit to `paperboy-ext/README.md` only. Three changes verified against repo: (1) remove `content.js` from file-tree code-block (line 73) — file doesn't exist; (2) remove `content.js` bullet from File-roles list (lines 88-89), amend `background.js` bullet to mention `chrome.scripting.executeScript` injection (capture lives there, verified at background.js:529,556), amend `sidepanel.js` bullet to mention `chrome.storage.local` (used at sidepanel.js:58,66,68); (3) delete "Permissions cleanup" item #1 from "Remaining work" (line 100) — claim that storage is unused is wrong. Renumber remaining items 1-4. No other file touched. Validation: 0 `content.js`/`Permissions cleanup`/`does not use chrome.storage` matches; >=1 `chrome.scripting.executeScript` + `chrome.storage.local` matches; 52/52 tests + builds green defensively.
