# 8.3 — Review Turn 2 (Decision)

## Task Context
- Task id: 8.3
- Task title: Add widget integration tests
- Phase: Phase 8 — Cross-cutting hardening
- Turn: 2 of 4
- Builder reply: `reviews/8.3/cursor-reply-turn-1.md`

## Findings

No findings. All consensus checklist items satisfied.

### Verification log (reviewer turn 2)

Independent reviewer verification, all commands run locally:

```bash
$ head -1 paperboy-widget/tests/widget.integration.test.js
# // @vitest-environment jsdom  (exact pragma)

$ grep -c 'it("' paperboy-widget/tests/widget.integration.test.js
# 5

$ grep -E '"jsdom"|"test":' paperboy-widget/package.json
# "test": "npm run build && vitest run",
# "jsdom": "^25.0.0",

$ git diff paperboy-widget/package.json
# Exactly two changes:
#  - scripts.test:  "vitest run" -> "npm run build && vitest run"
#  - devDependencies: + "jsdom": "^25.0.0"
# No other property changes.

$ git diff paperboy-widget/src/  paperboy-widget/vitest.config.js  paperboy-widget/build.js
# (empty for all three)

$ cd paperboy-widget && npm test 2>&1 | tail -15
# dist/paperboy-widget.min.js  35.7kb  -> "Built dist/paperboy-widget.min.js (v0.2.2)"
# Test Files  2 passed (2)
# Tests  17 passed (17)
# (12 in turndown-config.test.js (Node env) + 5 in widget.integration.test.js (jsdom env))

$ grep -c '"jsdom"' package-lock.json   # root lockfile
# 3

$ git diff --stat package-lock.json
# 1 file changed, 812 insertions(+), 28 deletions(-)
# (jsdom + transitive deps; no other workspace's deps disturbed)
```

Validation: all commands exit 0 with expected outputs.

### Inspection of `widget.integration.test.js` (key shape checks)

```js
// 1. Pragma on line 1 (required for per-file jsdom env)
// 2. Bundle read from ../dist/paperboy-widget.min.js (not ../src/*)
// 3. resetDom() clears head + body + window.__paperboyWidgetLoaded + localStorage
// 4. mountFixture plants <script src="paperboy-widget.min.js" data-*>; then globalThis.eval(bundleSource)
// 5. navigator.clipboard.writeText stubbed via Object.defineProperty in beforeEach,
//    restored via vi.restoreAllMocks() in afterEach
// 6. 5 it() cases match the contracted titles in order
// 7. Microtask flushing: `await Promise.resolve()` for sync handlers;
//    `await new Promise(r => setTimeout(r, 0))` for the async clipboard handler
// 8. preserveStorage: true on the second mount in test #5 — the persistence assertion
//    actually round-trips through localStorage.
```

All exactly as contracted.

## Builder Prompt

No further builder action. Closing 8.3 as `review_passed`.

## Consensus Checklist (final, all checked)
- [x] `paperboy-widget/tests/widget.integration.test.js` exists (135 lines)
- [x] First line of the file is exactly `// @vitest-environment jsdom`
- [x] Reads `dist/paperboy-widget.min.js` via `readFileSync`; does NOT import from `../src/*`
- [x] `mountFixture(html, dataset, options)` helper present; resets DOM + `__paperboyWidgetLoaded` + `localStorage` (unless `preserveStorage: true`)
- [x] `navigator.clipboard.writeText` stubbed with a `vi.fn().mockResolvedValue(undefined)` spy
- [x] Exactly 5 `it(...)` cases in a single `describe("paperboy widget integration", ...)` block
- [x] Test #1: `data-selector="#content"` — markdown output includes "content text marker" and NOT "noise marker"
- [x] Test #2: overlay default — `style.display` toggles `"block"` ↔ `"none"` on web/md clicks
- [x] Test #3: `data-render="inline"` — `.pbw-inline.pbw-visible` present; overlay not in `display: block`
- [x] Test #4: copy button click → `navigator.clipboard.writeText` called once with markdown starting with `# `
- [x] Test #5: switching to md persists `"md"` in `localStorage.paperboy-view`; remount with `preserveStorage: true` auto-applies it
- [x] `paperboy-widget/package.json` `devDependencies.jsdom` added (`^25.0.0`)
- [x] `paperboy-widget/package.json` `scripts.test` changed to `"npm run build && vitest run"`
- [x] No other `paperboy-widget/package.json` changes (only the two contracted edits)
- [x] No edits to `paperboy-widget/src/**`
- [x] No edits to `paperboy-widget/vitest.config.js` or `paperboy-widget/build.js`
- [x] `cd paperboy-widget && npm test` exits 0 — Build green, 17/17 tests green
- [x] Existing `tests/turndown-config.test.js` still passes (Node env, unchanged) — 12/12
- [x] Substring / value-equality assertions only (no snapshots)
- [x] Root `package-lock.json` updated (jsdom + transitive deps; no other workspace touched)

## Decision

**review_passed.** 8.3 closes Phase 8 task #3 of 5. The widget integration surface — selector resolution, overlay vs inline rendering, copy-to-clipboard, and `localStorage` view persistence with restore-on-reload — is now guarded by jsdom-driven tests against the BUILT bundle (`dist/paperboy-widget.min.js`). The single approved devDep addition (`jsdom`) is exactly what the spec contemplated. The `scripts.test` script now builds first, matching `paperboy-converter` and `paperboy-cli` patterns.

## Notes
- 17/17 widget tests green (12 turndown unit + 5 integration). No src/, vitest.config.js, or build.js edits. No other workspace disturbed.
- Per-file `// @vitest-environment jsdom` pragma keeps the Node-env unit test undisturbed — a cleaner choice than splitting vitest.config.js.
- The new test exercises the BUILT bundle (not src/), which is what the spec asked for; a bundler regression that mis-targets ES, mis-exports the IIFE, or strips required globals would now be caught.
- `package-lock.json` change (+812 insertions, -28 deletions) is consistent with adding jsdom (which has a large transitive dep tree). No other workspace's deps disturbed.
- After 8.3 closes, activator picks 8.4 (release-cut skill update).
