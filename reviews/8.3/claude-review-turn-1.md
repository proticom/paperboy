# 8.3 — Review Turn 1

## Task Context
- Task id: 8.3
- Task title: Add widget integration tests
- Phase: Phase 8 — Cross-cutting hardening
- Turn: 1 of 4
- Spec section (`/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md` line 159):
  > "**8.3** Add widget integration test (jsdom + the built `dist/paperboy-widget.min.js`) covering selector resolution, overlay vs inline rendering, copy-to-clipboard, and the toggle's `localStorage` persistence."

- Related context (verified by reviewer):
  - Working tree: `paperboy-widget/` (npm workspace member, branch `main`, commit `a49eb70`).
  - Existing test layout: `paperboy-widget/tests/turndown-config.test.js` (unit test for the turndown service only, runs in Node env).
  - Vitest config: `paperboy-widget/vitest.config.js` — `environment: "node"`, `include: ["tests/**/*.test.js"]`, `testTimeout: 10000`. We MUST switch the environment for integration tests (either via a per-file `// @vitest-environment jsdom` pragma or by adding an `environmentMatchGlobs` entry in the vitest config).
  - Build: `paperboy-widget/build.js` runs esbuild → `dist/paperboy-widget.min.js` (IIFE, browser target, ES2020). Built file exists at HEAD (`dist/paperboy-widget.min.js`, ~62 KB).
  - Test runner script: `"test": "vitest run"`. **Important:** the script does NOT run `npm run build` first. Integration tests need `dist/paperboy-widget.min.js` to exist. Either (a) extend the test script to `"test": "npm run build && vitest run"` to keep dist fresh, or (b) document in the test file that the test reads `dist/paperboy-widget.min.js` and skips with a clear error if absent. Recommendation: option (a), to match `paperboy-converter` and `paperboy-cli` test scripts.

- Widget specifics (verified by reading `paperboy-widget/src/widget.js`):
  - The widget initializes IMMEDIATELY on script execution via the `window.__paperboyWidgetLoaded` guard at lines 16-21. There is no exported `init()` function — it runs as soon as the bundle evaluates.
  - Config is read from `document.currentScript.dataset` (line 27 → `readConfig` at line 116). If `document.currentScript` is null, the widget falls back to `document.querySelectorAll("script[src*='paperboy-widget']")` (lines 110-113) and uses the LAST match's dataset.
  - Selectors: `data-selector` is the primary hook (line 127 → `findTargetNodes` at line 296). Without it, the widget falls back to `<main>`, then `<article>`, then between-header-footer siblings, then `document.body.children`.
  - Render modes: `data-render="inline"` mounts the inline panel before the first target node (line 53). Default is `"overlay"` (lines 130-131) which adds a fixed-position overlay element with `display: block` when active.
  - localStorage keys (lines 6-7): `paperboy-view` ("web" | "md") and `paperboy-collapsed` ("1" | "0"). The widget reads them on init (lines 91-95) and writes them on state changes (lines 478-495).
  - Copy: `ui.copyButton` and `ui.inlineCopyButton` both call an async `copyHandler` (lines 64-75) that calls `navigator.clipboard.writeText(state.markdown)`. **jsdom does NOT polyfill `navigator.clipboard` by default** — the test must stub it (Object.defineProperty on `navigator`, or use vitest's `vi.stubGlobal`).

- Files inspected:
  - `paperboy-widget/src/widget.js` (lines 1-555)
  - `paperboy-widget/src/turndown-config.js`, `src/styles.js`
  - `paperboy-widget/tests/turndown-config.test.js`
  - `paperboy-widget/vitest.config.js`
  - `paperboy-widget/package.json`
  - `paperboy-widget/dist/paperboy-widget.min.js` (first ~5 KB — confirmed IIFE shape)

- Files NOT to touch:
  - `paperboy-widget/src/**` — pure test addition; no production changes.
  - `paperboy-widget/build.js` — leave alone.
  - Anything outside `paperboy-widget/`.

- Dependency change required (and contemplated by the spec): the integration tests need `jsdom`. No other widget tests need it; the existing turndown unit test stays in Node env. Add `jsdom` as a devDependency in `paperboy-widget/package.json` ONLY (do NOT add it at the workspace root). Pin to `^25.0.0` (current major; vitest 3 supports it).

- Current claim: 8.3 turn 1, queue activator picked it after 8.2 closed. Fresh task.

## Findings

### Finding 1 (REQUIRED): Add `tests/widget.integration.test.js` plus jsdom devDep + per-file environment pragma covering the four behaviors named in the spec

- Severity: required (this is the entire body of work for 8.3)
- Location:
  - **New file:** `paperboy-widget/tests/widget.integration.test.js`.
  - **Modify:** `paperboy-widget/package.json` — add `"jsdom": "^25.0.0"` to `devDependencies` (and ONLY this; no other deps).
  - **Modify:** `paperboy-widget/package.json` — update the `test` script from `"vitest run"` to `"npm run build && vitest run"` so `dist/paperboy-widget.min.js` is always fresh when tests run (matches `paperboy-converter` and `paperboy-cli` patterns). Builder may skip this script change IF they instead make the test file fail loudly when `dist/paperboy-widget.min.js` is missing; preference is to update the script.
  - **No edits** to `paperboy-widget/src/**`. If a test surfaces a real widget bug, STOP and report in the reply — do not patch.
  - **No edits** to `paperboy-widget/vitest.config.js` — use a per-file `// @vitest-environment jsdom` pragma at the top of the new test file. This keeps the existing Node-env unit test untouched.

- Problem (current state): the widget has unit coverage only for `createTurndownService` (a thin re-export). The actual integration surface — selector resolution, overlay/inline rendering, copy-to-clipboard, localStorage persistence — has zero coverage despite being the entire user-facing surface.

- Required fix: create `paperboy-widget/tests/widget.integration.test.js` with the following structure:

  1. **File header** (top, exact pragma):
     ```js
     // @vitest-environment jsdom
     import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
     import { readFileSync } from "node:fs";
     import { fileURLToPath } from "node:url";
     import path from "node:path";

     const bundlePath = path.resolve(
       path.dirname(fileURLToPath(import.meta.url)),
       "../dist/paperboy-widget.min.js",
     );
     const bundleSource = readFileSync(bundlePath, "utf8");
     ```

  2. **Setup helper** that:
     - Resets `document.head`/`document.body` per test.
     - Resets `window.__paperboyWidgetLoaded` (the widget's single-init guard).
     - Clears `localStorage` (jsdom provides this).
     - Stubs `navigator.clipboard` with a writable spy: `vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })` OR `Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })`. Pick whichever vitest jsdom env accepts.
     - Provides a `mountFixture(html, dataset)` function that:
       - Sets `document.body.innerHTML = html`.
       - Creates a `<script src="paperboy-widget.min.js" data-*>` element (sets each key in `dataset` as a `data-*` attribute via `script.dataset[k] = v`).
       - Appends it to `document.head` so `document.querySelectorAll("script[src*='paperboy-widget']")` finds it (the `currentScript` fallback path).
       - Calls `window.eval(bundleSource)` to execute the bundle in the jsdom window. (Direct `eval` works because the IIFE bundles all its dependencies; no module loading needed.)
       - Returns nothing — the widget builds its own UI in `document.body`.

  3. **Test cases (exactly 5 `it()`)** under a single `describe("paperboy widget integration", ...)`:
     ```js
     // 1. Selector resolution: data-selector="#content" — toggle appears; clicking md button converts only #content
     it("resolves the data-selector target and converts only that content")

     // 2. Overlay render: clicking md button shows the overlay panel; clicking web hides it
     it("uses an overlay panel by default and toggles visibility")

     // 3. Inline render: data-render="inline" — markdown panel mounts inline; no overlay used
     it("renders inline when data-render=inline")

     // 4. Copy-to-clipboard: clicking copy after switching to md calls navigator.clipboard.writeText
     it("writes the markdown to the clipboard when the copy button is clicked")

     // 5. localStorage persistence: switching to md persists "md" in paperboy-view; reload re-applies it
     it("persists the view selection in localStorage and restores it on next init")
     ```

  4. **Assertions per test** (no snapshots; use querySelector + textContent / classList / visibility checks):
     - **#1**: After mount with `{ selector: "#content" }`, `document.querySelector(".pbw-toggle")` is non-null. Click `.pbw-toggle .pbw-toggle-btn:nth-of-type(2)` (md button). Wait for the click handler to flush (no async / no microtask needed in this codepath but allow a `await Promise.resolve()` for safety). Assert `document.querySelector(".pbw-output").textContent.includes("content text marker")` (where the fixture's `#content` has a paragraph with "content text marker"). Assert the OUT-of-selector text (e.g., a paragraph in a sibling `<div id="noise">` with text "noise marker") is NOT in `.pbw-output`.
     - **#2**: Default `render: "overlay"`. Initially `getComputedStyle(document.querySelector(".pbw-overlay")).display === "none"` OR the inline-style check `overlay.style.display === ""` (the bundle sets `style.display = "block"` only on view switch). Click md button. Assert `overlay.style.display === "block"`. Click web button. Assert `overlay.style.display === "none"`.
     - **#3**: With `{ render: "inline" }`, click md. Assert there is a `.pbw-inline.pbw-visible` element in the DOM next to the target. Assert `.pbw-overlay` does NOT have `display: block` (i.e., the overlay codepath wasn't taken).
     - **#4**: Set up clipboard stub before mount. Click md, then click the overlay copy button (`.pbw-overlay .pbw-copy-btn`). Use `await new Promise(r => setTimeout(r, 0))` to flush microtasks. Assert `navigator.clipboard.writeText` was called once. Assert the argument starts with `"# "` (the markdown title header line written by `generateMarkdown`).
     - **#5**: After clicking md, `localStorage.getItem("paperboy-view") === "md"`. Then run the helper that resets DOM + `__paperboyWidgetLoaded` and re-mounts WITHOUT clicking anything — the bundle's `readSavedView()` should put the widget into markdown view immediately. Assert `overlay.style.display === "block"` (or, for the inline variant, `.pbw-inline.pbw-visible` is present) right after the second mount completes.

  5. **Fixture HTML** (kept inline in tests, deterministic, small):
     ```html
     <main id="content">
       <h1>Test page</h1>
       <p>content text marker</p>
     </main>
     <div id="noise">
       <p>noise marker — must not be in the output</p>
     </div>
     ```

- Builder rules:
  - **`paperboy-widget/` only.** No edits to `src/**`. No edits to `build.js` or `vitest.config.js`.
  - **Files to create (1 total):**
    1. `paperboy-widget/tests/widget.integration.test.js`
  - **Files to modify (1 total):**
    1. `paperboy-widget/package.json` — add ONLY `jsdom` to `devDependencies` AND change `scripts.test` from `"vitest run"` to `"npm run build && vitest run"`.
  - 5 `it()` cases in a single `describe("paperboy widget integration", ...)` block.
  - The test file MUST start with the `// @vitest-environment jsdom` pragma on line 1 so vitest switches per-file. Do NOT change `vitest.config.js`.
  - The test file MUST NOT import from `../src/*` — the spec explicitly says "the built `dist/paperboy-widget.min.js`". This guards against integration tests passing while the bundled output is broken.
  - Each test must run in ≤ 200 ms; whole suite under 3 seconds (bundle eval is ~50 ms in jsdom).
  - Existing `tests/turndown-config.test.js` MUST still pass (it stays in Node env — the per-file pragma only affects the new file).
  - No `setTimeout > 0` waits longer than 0 ms. Use `await Promise.resolve()` or `await new Promise(r => setTimeout(r, 0))` to flush microtasks where async clipboard handler is involved.
  - Substring / value-equality assertions only — no `toMatchSnapshot`.

- Validation:

  ```bash
  cd /Users/edward/MSDev/projects/paperboy/paperboy-widget

  # 1. New test file exists
  ls tests/widget.integration.test.js

  # 2. jsdom devDep added
  grep -A 2 '"devDependencies"' package.json | grep jsdom
  # expect: "jsdom": "^25.0.0",

  # 3. Test script updated
  grep '"test":' package.json
  # expect: "test": "npm run build && vitest run",

  # 4. No src/ edits
  git diff src/
  # expect: empty

  # 5. No vitest.config.js edits
  git diff vitest.config.js
  # expect: empty

  # 6. Bundle is fresh
  ls -la dist/paperboy-widget.min.js
  # expect: file exists with recent mtime

  # 7. Install the new dep
  cd /Users/edward/MSDev/projects/paperboy && npm install 2>&1 | tail -5
  # expect: "added X packages" with no errors

  # 8. All tests pass
  cd paperboy-widget && npm test 2>&1 | tail -25
  # expect: 2 files (turndown-config.test.js + widget.integration.test.js)
  # expect: 5 new tests passing in widget.integration.test.js
  # expect: existing 12-ish tests in turndown-config.test.js still pass
  # expect: exit code 0

  # 9. No other workspace or monorepo changes
  cd /Users/edward/MSDev/projects/paperboy && git status --short
  # expect: only paperboy-widget/tests/widget.integration.test.js, paperboy-widget/package.json, package-lock.json, reviews/8.3/, dashboard JSONs
  ```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 8.3.

**Objective:** Close the integration-coverage gap on `paperboy-widget` by adding 5 jsdom-driven tests that exercise the **built bundle** (`dist/paperboy-widget.min.js`). Cover the four behaviors named in the spec: selector resolution, overlay vs inline rendering, copy-to-clipboard, and `localStorage` persistence (5th test verifies persistence-on-reload as a strengthening of the localStorage case).

**Files to create / modify (paperboy-widget/ only):**

1. **`paperboy-widget/tests/widget.integration.test.js`** — single new file containing:
   - `// @vitest-environment jsdom` pragma on line 1.
   - Imports: vitest globals, `node:fs`, `node:path`, `node:url`.
   - Reads `dist/paperboy-widget.min.js` once at module scope.
   - Helper `mountFixture(html, dataset)` that resets DOM + `__paperboyWidgetLoaded` + `localStorage`, stubs `navigator.clipboard.writeText`, injects fixture HTML, plants a `<script src="paperboy-widget.min.js" data-*>` in `document.head`, then `eval`s the bundle source in the window context.
   - `describe("paperboy widget integration", ...)` with **exactly 5 `it()` cases** in the order listed in Finding 1 #3.
   - `beforeEach` / `afterEach` for jsdom global cleanup.

2. **`paperboy-widget/package.json`** — TWO surgical edits:
   - Add `"jsdom": "^25.0.0"` to `devDependencies` (no other new deps).
   - Change `scripts.test` from `"vitest run"` to `"npm run build && vitest run"`.

**Do not edit:**
- `paperboy-widget/src/**` (if a test surfaces a real widget bug, STOP and report — do not patch).
- `paperboy-widget/vitest.config.js` (per-file pragma is the right tool here).
- `paperboy-widget/build.js`.
- Any other workspace, the monorepo root, or `paperboy-site/`.

**Validate (run all from project root unless noted, paste outputs into the reply):**

```bash
cd /Users/edward/MSDev/projects/paperboy

# 1. Install the new dep
npm install 2>&1 | tail -5

cd paperboy-widget

# 2. Files in place
ls tests/widget.integration.test.js
head -1 tests/widget.integration.test.js
# expect: // @vitest-environment jsdom

grep -c "it(" tests/widget.integration.test.js
# expect: 5

grep '"jsdom"' package.json
# expect: "jsdom": "^25.0.0",

grep '"test":' package.json
# expect: "test": "npm run build && vitest run",

# 3. Diff scope
cd /Users/edward/MSDev/projects/paperboy
git diff paperboy-widget/src/
# expect: empty

git diff paperboy-widget/vitest.config.js
# expect: empty

git diff paperboy-widget/build.js
# expect: empty

# 4. Test run
cd paperboy-widget && npm test 2>&1 | tail -25
# expect: Test Files 2 passed (2); Tests N passed where N >= 17 (12 existing + 5 new)
# expect: exit 0
```

When you reply, write `reviews/8.3/cursor-reply-turn-1.md` with:
(a) the 5 `it(...)` headers,
(b) the new test file's `mountFixture` helper signature (just the function head + comment, not the whole function),
(c) outputs of all validation commands above,
(d) any deviations from the reference approach (with rationale).

## Consensus Checklist
- [ ] `paperboy-widget/tests/widget.integration.test.js` exists
- [ ] First line of the file is exactly `// @vitest-environment jsdom`
- [ ] Reads `dist/paperboy-widget.min.js` via `readFileSync`; does NOT import from `../src/*`
- [ ] `mountFixture(html, dataset)` helper present and resets DOM + `__paperboyWidgetLoaded` + `localStorage` between mounts
- [ ] `navigator.clipboard.writeText` stubbed with a vitest spy
- [ ] Exactly 5 `it(...)` cases in a single `describe("paperboy widget integration", ...)` block
- [ ] Test #1: `data-selector="#content"` — markdown output includes "content text marker" and NOT "noise marker"
- [ ] Test #2: overlay default — `style.display` toggles `"block"` ↔ `"none"` on web/md clicks
- [ ] Test #3: `data-render="inline"` — `.pbw-inline.pbw-visible` present; overlay not shown
- [ ] Test #4: copy button click → `navigator.clipboard.writeText` called once with markdown
- [ ] Test #5: switching to md persists `"md"` in `localStorage.paperboy-view`; remount auto-applies it
- [ ] `paperboy-widget/package.json` `devDependencies.jsdom` added (`^25.0.0` or current major)
- [ ] `paperboy-widget/package.json` `scripts.test` changed to `"npm run build && vitest run"`
- [ ] No other `paperboy-widget/package.json` changes (no other new deps, no scripts removed)
- [ ] No edits to `paperboy-widget/src/**`
- [ ] No edits to `paperboy-widget/vitest.config.js` or `paperboy-widget/build.js`
- [ ] `npm install` clean after the devDep change
- [ ] `cd paperboy-widget && npm test` exits 0
- [ ] Existing `tests/turndown-config.test.js` still passes (Node env, unchanged)
- [ ] Substring / value-equality assertions only (no snapshots)

## Decision

**send_to_builder.** Fresh task, no builder commit yet. Scope: 1 new test file with 5 jsdom-driven integration tests, plus a single approved devDep (`jsdom`) addition that the spec explicitly contemplates, plus a one-line `test` script update to keep `dist/` fresh. The test file uses a per-file `// @vitest-environment jsdom` pragma so the existing Node-env unit test is undisturbed. 20-item validation checklist.

## Notes
- Why `window.eval(bundleSource)` instead of a real `<script>` tag with `runScripts: "dangerously"`: vitest's jsdom integration runs in Node, and pushing the bundle into a fresh jsdom Window via vitest's globals is more reliable than configuring vitest's jsdom resource loader. `eval` is acceptable here because we OWN the source (it's our build output) and the test is intentionally executing it.
- Why test the **built bundle** and not `import` `src/widget.js` directly: the spec explicitly says "the built `dist/paperboy-widget.min.js`" — this is intentional, so that bundler bugs (mis-export, dead-code-elimination, target downlevel issues) are caught.
- Why add `jsdom` (the "no new deps" rule of 8.1/8.2 doesn't apply here): the spec line literally names jsdom; this is a contemplated infra addition.
- Why 5 tests, not exhaustive: the spec calls out 4 behaviors; the 5th (persistence-on-reload) is the strengthening that turns a write-only localStorage assertion into a round-trip behavior assertion. Other widget surfaces (collapse/restore, focus trap, mdSyntax highlighting, mdFont/mdColor/mdBg style overrides) are intentionally out of scope.
- Why we change `scripts.test` to include `npm run build`: integration tests that consume `dist/` will silently test stale bytes otherwise. This change matches `paperboy-converter` (`"test": "npm run build && vitest run"`) and `paperboy-cli` (`"test": "npm run build && vitest run"`) — the only outlier here is `paperboy-widget`.
- After 8.3 closes, activator picks 8.4 (release-cut skill update).
