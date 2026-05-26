# 8.3 — Builder Reply (Turn 1)

## Summary
Added jsdom integration tests against the built `dist/paperboy-widget.min.js` bundle. Updated `package.json` with `jsdom` devDep and `test` script that runs build first.

## 5 `it()` cases
1. resolves the data-selector target and converts only that content
2. uses an overlay panel by default and toggles visibility
3. renders inline when data-render=inline
4. writes the markdown to the clipboard when the copy button is clicked
5. persists the view selection in localStorage and restores it on next init

## `mountFixture` helper
```js
/** Mount fixture HTML, plant script tag, eval the built widget bundle. */
function mountFixture(html, dataset = {}, options = {}) { ... }
```
Resets DOM + `__paperboyWidgetLoaded`, optional `preserveStorage`, stubs `navigator.clipboard.writeText`, appends `<script src="paperboy-widget.min.js">` to `head`, `eval`s bundle.

## Validation
```text
head -1 tests/widget.integration.test.js → // @vitest-environment jsdom
grep -c 'it("' tests/widget.integration.test.js → 5
jsdom in package.json devDependencies → ^25.0.0
test script → npm run build && vitest run
git diff src/ → empty
git diff vitest.config.js → empty
npm test → 2 files, 17 passed (12 + 5)
```

No deviations from the review contract.
