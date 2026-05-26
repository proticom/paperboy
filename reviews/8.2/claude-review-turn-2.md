# 8.2 — Review Turn 2 (Decision)

## Task Context
- Task id: 8.2
- Task title: Add CLI crawl command tests
- Phase: Phase 8 — Cross-cutting hardening
- Turn: 2 of 4
- Builder reply: `reviews/8.2/cursor-reply-turn-1.md`

## Findings

No findings. All consensus checklist items satisfied.

### Verification log (reviewer turn 2)

Independent reviewer verification, all commands run locally:

```bash
$ cat paperboy-cli/tests/crawl.test.ts
# 331-line file. Single describe("crawlSite") block.
# - Imports: vitest, node:fs/promises, node:http, node:net, node:os, node:path
#   + crawlSite & CrawlOptions from ../src/crawl.ts.
# - startTestServer(routes) helper: http.createServer on 127.0.0.1:0 with
#   { status, contentType, body } per pathname; 404 fallback.
# - defaultOptions(overrides) factory matches the reference impl.
# - htmlPage / leafPage helpers keep fixtures small.

$ grep -c 'it("' paperboy-cli/tests/crawl.test.ts
# 8

$ grep 'it("' paperboy-cli/tests/crawl.test.ts
# it("crawls the seed page and follows internal links", async () => {
# it("respects the maxPages cap", async () => {
# it("respects the maxDepth cap", async () => {
# it("filters by includePatterns", async () => {
# it("filters by excludePatterns", async () => {
# it("returns a map when mapOnly is true", async () => {
# it("discovers URLs via /sitemap.xml", async () => {
# it("ignores external links", async () => {

$ cd paperboy-cli && npm test 2>&1 | tail -10
# Test Files  6 passed (6)
# Tests  27 passed (27)
# (8 new tests in tests/crawl.test.ts; total CLI suite now 27, up from 19)

$ cd paperboy-cli && npm run typecheck
# exit 0, clean

$ git diff paperboy-cli/src/
# (empty)

$ git diff paperboy-cli/package.json
# (empty)

$ ls paperboy-cli/*.crawl.md paperboy-cli/*.crawl.jsonl 2>&1
# (no matches — no working-tree pollution)

$ git status --short
#  M .claude/settings.json       (unrelated, leave for separate PR)
#  M paperboy-spec-tasks.json    (orchestrator state)
#  M reviews/paperboy-review-queue.json (orchestrator state)
# ?? paperboy-cli/tests/crawl.test.ts
# ?? reviews/8.2/cursor-reply-turn-1.md
# (no other workspace touched)
```

Validation: all commands exit 0 with expected outputs.

### Deviation evaluation (builder's reply, line 17)

Builder swapped sitemap path names from `/sitemap-discovered-*` to `/discovered-*` because `looksLikeSitemap()` (line 207 of `src/crawl.ts`) treats *any* URL containing `sitemap` as a nested sitemap file and re-queues it into the sitemap traversal — it never enters the page queue. Reviewer verified by re-reading `looksLikeSitemap`:

```ts
function looksLikeSitemap(url: string): boolean {
  return /sitemap/i.test(url) || /\.xml(\?|$)/i.test(url);
}
```

The deviation is correct and necessary. The original contract name would have produced `discoveredUrls.length === 1` (root only) instead of `3`. Accept.

## Builder Prompt

No further builder action. Closing 8.2 as `review_passed`.

## Consensus Checklist (final, all checked)
- [x] `paperboy-cli/tests/crawl.test.ts` exists (331 lines)
- [x] Imports `crawlSite` and `CrawlOptions` from `../src/crawl.ts`
- [x] In-process HTTP server helper (`startTestServer`, no third-party mock library)
- [x] `defaultOptions(overrides)` factory present
- [x] Exactly 8 `it(...)` cases in a single `describe("crawlSite", ...)` block
- [x] Test #1: seed + 2 internal links → `crawledCount === 3`
- [x] Test #2: `maxPages` cap with 5 reachable pages → `crawledCount === 2`
- [x] Test #3: `maxDepth` cap blocks the depth-2 page (`/level2` absent, `/level1` present)
- [x] Test #4: `includePatterns: ["blog"]` → only `/blog/` URLs in `discoveredUrls`
- [x] Test #5: `excludePatterns: ["admin"]` → no `/admin` URL, at least one non-admin URL
- [x] Test #6: `mapOnly: true` → `result.mode === "map"`, `crawledCount === 0`, map file is URL list (no `# Page:` markers)
- [x] Test #7: `/sitemap.xml` URLs end up in `discoveredUrls` with `source: "sitemap"` (2 sitemap + 1 seed = 3)
- [x] Test #8: `https://example.com/...` link never appears in `discoveredUrls`
- [x] Every non-mapOnly test passes `outputPath` into the per-test temp dir
- [x] No `*.crawl.md` / `*.crawl.jsonl` left in `paperboy-cli/` after `npm test`
- [x] No edits to `paperboy-cli/src/**`
- [x] No edits to `paperboy-cli/package.json` (no new deps)
- [x] `npm test` exits 0 with all 27 tests passing (8 new + 19 existing)
- [x] `npm run typecheck` clean
- [x] Substring / value-equality assertions only (no snapshots)

## Decision

**review_passed.** 8.2 closes Phase 8 task #2 of 5. The zero-coverage gap on `src/crawl.ts` (630 lines, the heart of the CLI crawl subcommand) is closed with 8 focused tests against the public `crawlSite` API. Mocking is via in-process `http.createServer` on a loopback port (no new dependencies). All assertions are substring / value-equality — robust to crawler internal refactors. Builder's deviation on sitemap path naming was the correct call; reviewer verified by re-reading `looksLikeSitemap`.

## Notes
- 27/27 CLI tests green, typecheck clean, no working-tree pollution, no `src/` or `package.json` edits.
- After 8.2 closes, activator picks 8.3 (widget integration tests).
- The unrelated `.claude/settings.json` change in the working tree (allowlist additions) stays uncommitted — out of scope for 8.2.
