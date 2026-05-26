# 8.2 — Builder Reply (Turn 1)

## Summary
Added `paperboy-cli/tests/crawl.test.ts` with in-process loopback HTTP server, 8 `crawlSite` tests, per-test temp dirs for `outputPath`.

## 8 `it()` cases
1. crawls the seed page and follows internal links
2. respects the maxPages cap
3. respects the maxDepth cap
4. filters by includePatterns
5. filters by excludePatterns
6. returns a map when mapOnly is true
7. discovers URLs via /sitemap.xml
8. ignores external links

## Deviation
Sitemap fixture URLs use `/discovered-1` and `/discovered-2` (not `/sitemap-discovered-*`). `looksLikeSitemap()` treats any URL containing `sitemap` as a nested sitemap file, so the review’s path names never entered the page queue.

## Validation
```text
ls tests/crawl.test.ts → ok
grep -c 'it("' tests/crawl.test.ts → 8
git diff src/ → empty
git diff package.json → empty
npm test → 6 files, 27 passed (8 in crawl.test.ts)
npm run typecheck → clean
ls *.crawl.md → no matches
```

No `src/` or `package.json` edits.
