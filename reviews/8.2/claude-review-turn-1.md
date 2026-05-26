# 8.2 — Review Turn 1

## Task Context
- Task id: 8.2
- Task title: Add CLI crawl command tests
- Phase: Phase 8 — Cross-cutting hardening
- Turn: 1 of 4
- Spec section (`/Users/edward/.cursor/plans/paperboy_production_readiness_02f05849.plan.md` line 158):
  > "**8.2** Add CLI tests for the **crawl** command (`paperboy-cli/src/crawl.ts`, ~630 lines, zero tests). Mock the HTTP layer."

- Related context (verified by reviewer):
  - Working tree: `paperboy-cli/` (npm workspace member, branch `main`). 8.1 just landed on `main` (commit `b86b45f`).
  - Module under test: `paperboy-cli/src/crawl.ts` (630 lines). Exports a single public function `crawlSite(startUrlRaw: string, options: CrawlOptions): Promise<CrawlResult>` (line 467) and two types: `CrawlOptions`, `CrawlResult`.
  - Existing test layout: `paperboy-cli/tests/` already has `cli.integration.test.ts`, `config.test.ts`, `converter.test.ts`, `doctor.test.ts`, `setup.test.ts`. Pattern: import from `../src/*.ts` directly (vitest is configured to transpile TS — see `vitest.config.ts`).
  - Vitest config: `environment: "node"`, `testTimeout: 30000`, `hookTimeout: 30000`. No special globals.
  - Test runner script: `paperboy-cli/package.json` `"test": "npm run build && vitest run"`. Already wired.
  - Existing tests use `node:fs/promises`, `os.tmpdir()`, `beforeEach`/`afterEach` for temp dirs — match that style.

- Module specifics (verified by reviewer; reading `src/crawl.ts`):
  - HTTP via `node:http` and `node:https` (`http.request` / `https.request`) — NOT global `fetch`. The "mock the HTTP layer" requirement is best satisfied by a **real localhost HTTP server** spun up inside the test (Node's `http.createServer`). Stubbing `http.request` via `vi.spyOn` is possible but brittle; an in-process loopback server is the standard pattern, runs in ~5 ms, and exercises the real `fetchTextWithRedirects` code path (including content-type sniffing).
  - The crawler ALWAYS fetches `${origin}/sitemap.xml` first (line 487, `discoverSitemapUrls`). Tests must handle this — either:
    - Return `404` for `/sitemap.xml` (sitemap discovery yields nothing → falls through to seed link crawl), or
    - Return a real sitemap for the sitemap-specific test.
  - URL normalization (line 96, `normalizeUrl`): strips trailing slash, drops tracking query params, drops hash, drops protocol other than http/https.
  - URL filtering (line 116, `isInternalUrl`): same-origin only. Test server origin must match throughout.
  - Pattern filtering: `includePatterns` & `excludePatterns` are regex strings (case-insensitive). Each `--include`/`--exclude` value can be comma-separated.
  - Output modes: `"single"` (one .md), `"mirror"` (directory tree), `"jsonl"` (one JSON-per-line). Default output filename for `single` mode is `${host}.crawl.md` written to `process.cwd()`. Tests MUST pass `outputPath` to redirect into a temp dir — otherwise they pollute `paperboy-cli/`.
  - `mapOnly: true` short-circuits: no markdown conversion, no output write unless `outputPath` is set. Returns `discoveredUrls`.
  - `rateLimitMs`: applied between fetches *after* the first one. Set to `0` in tests to keep them fast.
  - `minContentWords`: filter for "real" pages. Set to `1` in tests so the trivial fixtures count.
  - `maxSitemaps`: must be ≥1 (or `discoverSitemapUrls` won't even try). Use `5` in tests.

- Files inspected:
  - `paperboy-cli/src/crawl.ts` (lines 1-630)
  - `paperboy-cli/tests/cli.integration.test.ts`, `converter.test.ts` (existing patterns)
  - `paperboy-cli/vitest.config.ts`
  - `paperboy-cli/package.json` (scripts + deps; nothing additional needed)

- Files NOT to touch:
  - `paperboy-cli/src/**` — pure test addition; no production changes.
  - `paperboy-cli/package.json` — no new deps. Node's built-in `http` + `node:fs/promises` are enough.
  - Anything outside `paperboy-cli/`.
- Current claim: 8.2 turn 1, queue activator picked it after 8.1 closed. Fresh task, no builder commit yet.

## Findings

### Finding 1 (REQUIRED): Add `tests/crawl.test.ts` covering the seven core code paths in `src/crawl.ts`

- Severity: required (this is the entire body of work for 8.2)
- Location:
  - **New file** `paperboy-cli/tests/crawl.test.ts`.
  - **No edits** to `src/**`. If a test surfaces a real handler bug, STOP and report in the reply — do not patch.

- Problem (current state): zero tests for `src/crawl.ts` (630 lines, the heart of the CLI's `crawl` subcommand).

- Required fix: create `paperboy-cli/tests/crawl.test.ts` with the following:

  1. **Test scaffolding** (top of file):
     - In-process HTTP server helper that takes a map of `pathname → { status, contentType, body }` and returns `{ baseUrl, close() }`. Server listens on `127.0.0.1` with `port: 0` (OS-assigned).
     - `defaultOptions()` factory that returns a complete `CrawlOptions` with safe defaults (rateLimitMs: 0, timeoutMs: 5000, minContentWords: 1, maxSitemaps: 5, etc.) so individual tests only override what they care about.
     - `tempDir` setup via `beforeEach`/`afterEach`, written into `os.tmpdir()` under prefix `paperboy-cli-crawl-`.

  2. **Test cases (8 `it()`)** — exact list below. Each test:
     - Starts a fresh server with only the routes it needs.
     - Calls `crawlSite(baseUrl, options)` with `outputPath` always pointing into the temp dir.
     - Asserts on the returned `CrawlResult` AND on the file(s) actually written (when applicable).
     - Closes the server in a `finally` or `afterEach` block.

     ```ts
     // 1. Seed + simple links: crawls home + 2 linked pages (sitemap is 404)
     it("crawls the seed page and follows internal links")

     // 2. maxPages cap: 5 pages linked, maxPages=2 → exactly 2 crawled
     it("respects the maxPages cap")

     // 3. maxDepth cap: A → B → C → D, maxDepth=1 → only A and B crawled
     it("respects the maxDepth cap")

     // 4. includePatterns: server has /blog/x and /about/y, include "blog"
     //    → only /blog/x ends up in discoveredUrls
     it("filters by includePatterns")

     // 5. excludePatterns: exclude "admin" → /admin/secret never crawled
     it("filters by excludePatterns")

     // 6. mapOnly: returns discoveredUrls + crawledCount=0, no markdown file
     //    written unless outputPath is set, and even then the file is the URL list
     it("returns a map when mapOnly is true")

     // 7. Sitemap discovery: /sitemap.xml lists 2 pages, root home links to none.
     //    Both sitemap URLs end up crawled.
     it("discovers URLs via /sitemap.xml")

     // 8. External link skipped: <a href="https://example.com/foo"> in the body
     //    of the seed page does NOT end up in discoveredUrls.
     it("ignores external links")
     ```

  3. **Assertions per test** (substring / value checks, NOT snapshots):
     - **#1**: `result.crawledCount === 3`; `result.discoveredUrls.length === 3`; the resolved output `.md` file exists and contains `# Page: <baseUrl>/about`.
     - **#2**: `result.crawledCount === 2` even though links to 5 pages exist; `result.discoveredUrls.length === 2`.
     - **#3**: `result.discoveredUrls.map((d) => d.url)` contains the root and the depth-1 page but NOT the depth-2 page; `result.discoveredUrls.length === 2`.
     - **#4**: every entry in `result.discoveredUrls` has a URL matching `/blog/`; the `/about/` URL is absent.
     - **#5**: no entry in `result.discoveredUrls` matches `/admin`; root + at-least-one-non-admin URL is present.
     - **#6**: `result.mode === "map"`; `result.crawledCount === 0`; `result.discoveredCount >= 1`. If you pass `outputPath`, assert the file exists and contains the URL list (one per line, not Markdown). Do NOT assert any `.md` file was written.
     - **#7**: `result.discoveredUrls.length === 3` (root + 2 sitemap-discovered). The two sitemap URLs have `source: "sitemap"`. Root has `source: "seed"`.
     - **#8**: `result.discoveredUrls.every((d) => d.url.startsWith(baseUrl))` is true; `example.com` does not appear in `discoveredUrls`.

  4. **Server helper** (concrete reference impl the builder can paste verbatim if desired):

     ```ts
     import http from "node:http";
     import type { AddressInfo } from "node:net";

     type Route = { status: number; contentType: string; body: string };

     async function startTestServer(
       routes: Record<string, Route>,
     ): Promise<{ baseUrl: string; close: () => Promise<void> }> {
       const server = http.createServer((req, res) => {
         const url = new URL(req.url ?? "/", "http://127.0.0.1");
         const route = routes[url.pathname];
         if (!route) {
           res.statusCode = 404;
           res.setHeader("content-type", "text/plain");
           res.end("not found");
           return;
         }
         res.statusCode = route.status;
         res.setHeader("content-type", route.contentType);
         res.end(route.body);
       });
       await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
       const { port } = server.address() as AddressInfo;
       return {
         baseUrl: `http://127.0.0.1:${port}`,
         close: () =>
           new Promise<void>((resolve, reject) => {
             server.close((err) => (err ? reject(err) : resolve()));
           }),
       };
     }
     ```

  5. **defaultOptions factory** (concrete reference):

     ```ts
     import type { CrawlOptions } from "../src/crawl.ts";

     function defaultOptions(overrides: Partial<CrawlOptions> = {}): CrawlOptions {
       return {
         maxPages: 50,
         maxDepth: 5,
         minContentWords: 1,
         outputMode: "single",
         json: false,
         mapOnly: false,
         rateLimitMs: 0,
         timeoutMs: 5000,
         maxSitemaps: 5,
         userAgent: "paperboy-cli-test/0.0.0",
         ...overrides,
       };
     }
     ```

  6. **Concrete fixture content** (HTML strings inline in tests; deterministic and small):
     - Home page that links to `/about` and `/contact`:
       ```html
       <!doctype html><html><head><title>Home</title></head><body>
       <h1>Home page</h1><p>Welcome to the test site with at least a few words of content.</p>
       <a href="/about">About</a> <a href="/contact">Contact</a>
       </body></html>
       ```
     - `/about` and similar leaf pages: keep them ~30+ words so `minContentWords: 1` is never the limiter, but they don't need to be elaborate.
     - For sitemap test, `/sitemap.xml` returns:
       ```xml
       <?xml version="1.0" encoding="UTF-8"?>
       <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
         <url><loc>{baseUrl}/sitemap-discovered-1</loc></url>
         <url><loc>{baseUrl}/sitemap-discovered-2</loc></url>
       </urlset>
       ```
       with `content-type: application/xml`.
     - For non-sitemap tests, `/sitemap.xml` returns `404` (server returns 404 by default for unmapped routes, which is what we want — the crawler treats it as "no sitemap found").

  7. **outputPath redirection**: every test that runs in the default (non-mapOnly) mode MUST pass `outputPath` pointing at a file in the per-test temp dir. Otherwise the crawler writes `${host}.crawl.md` to `process.cwd()` (= `paperboy-cli/`) and pollutes the working tree.

- Builder rules:
  - **`paperboy-cli/` only.** No edits to `src/**`. No edits to `package.json`. No new deps.
  - **Files to create (1 total):**
    1. `paperboy-cli/tests/crawl.test.ts`
  - No fixture files needed (HTML/XML payloads are inline strings).
  - 8 `it()` cases, organized under a single `describe("crawlSite", ...)` block.
  - Each test must close its server (use `afterEach` or a `try { ... } finally { await close() }` per test) — leaking a port across tests will cause confusing failures.
  - Substring / value-equality assertions only. No `toMatchSnapshot`. No deep equality on the full `discoveredUrls` array (URLs include a randomly assigned port).
  - Each test must run in ≤ 1 second on a normal laptop. With `rateLimitMs: 0`, the whole file should run in well under 5 seconds.
  - No flaky retries; no global state between tests.
  - Existing tests must still pass after the addition.

- Validation:

  ```bash
  cd /Users/edward/MSDev/projects/paperboy/paperboy-cli

  # 1. New test file exists
  ls tests/crawl.test.ts
  # expect: tests/crawl.test.ts

  # 2. No src/ edits
  git diff src/
  # expect: empty

  # 3. No package.json edits (no new deps)
  git diff package.json
  # expect: empty

  # 4. All tests pass
  npm test 2>&1 | tail -20
  # expect: "Test Files  6 passed (6)" or similar, with the new crawl.test.ts among them
  # expect 8 new tests passing in the crawl.test.ts file
  # expect exit code 0

  # 5. TypeScript still clean
  npm run typecheck
  # expect: no output, exit 0

  # 6. Working tree hygiene — no stray crawl artifacts
  ls *.crawl.md *.crawl.jsonl 2>&1 | head
  # expect: ls error (no matches)

  # 7. No other workspace or monorepo changes
  cd /Users/edward/MSDev/projects/paperboy && git status --short
  # expect: only reviews/8.2/ artifacts + dashboard JSONs + tests/crawl.test.ts
  ```

## Builder Prompt

Developer/Builder, execute this as a standalone turn-1 task for 8.2.

**Objective:** Close the zero-coverage gap on `paperboy-cli/src/crawl.ts` by adding 8 focused tests that exercise the core code paths: seed+links, `maxPages` cap, `maxDepth` cap, `includePatterns`, `excludePatterns`, `mapOnly`, sitemap discovery, and external-link skipping. Use an in-process HTTP server (`http.createServer`) on a loopback port — no third-party HTTP-mock libraries, no edits to `src/`.

**Files to create (paperboy-cli/ only):**

1. **`paperboy-cli/tests/crawl.test.ts`** — single new file containing:
   - Top-level imports from `vitest`, `node:fs/promises`, `node:http`, `node:os`, `node:path`, `node:net`, and `../src/crawl.ts`.
   - `startTestServer(routes)` helper (see Finding 1 #4).
   - `defaultOptions(overrides)` factory (see Finding 1 #5).
   - `describe("crawlSite", ...)` block with **exactly 8 `it()` cases** in the order listed in Finding 1 #2.
   - `beforeEach`/`afterEach` for per-test temp dirs under `os.tmpdir()` prefix `paperboy-cli-crawl-`.

**Do not edit:**
- `paperboy-cli/src/**` (if a test surfaces a real bug, STOP and report — do not patch the crawler).
- `paperboy-cli/package.json` (no new deps).
- Any other workspace, the monorepo root, or `paperboy-site/`.

**Validate (run from `paperboy-cli/`, paste outputs into the reply):**

```bash
cd /Users/edward/MSDev/projects/paperboy/paperboy-cli

ls tests/crawl.test.ts

grep -c "it(" tests/crawl.test.ts
# expect: 8

git diff src/
# expect: empty

git diff package.json
# expect: empty

npm test 2>&1 | tail -25
# expect: all test files green, 8 new tests in crawl.test.ts

npm run typecheck
# expect: clean

ls *.crawl.md *.crawl.jsonl 2>&1 | head
# expect: no such file (no temp pollution in paperboy-cli/)
```

When you reply, write `reviews/8.2/cursor-reply-turn-1.md` with:
(a) the 8 `it(...)` headers as a list,
(b) outputs of all validation commands above,
(c) confirmation that `git diff src/` and `git diff package.json` are both empty,
(d) any deviations from the reference helper/options code (with rationale).

## Consensus Checklist
- [ ] `paperboy-cli/tests/crawl.test.ts` exists
- [ ] Imports `crawlSite` and `CrawlOptions` from `../src/crawl.ts`
- [ ] In-process HTTP server helper (no third-party mock library)
- [ ] `defaultOptions(overrides)` factory present
- [ ] Exactly 8 `it(...)` cases in a single `describe("crawlSite", ...)` block
- [ ] Test #1: seed + 2 internal links → `crawledCount === 3`
- [ ] Test #2: `maxPages` cap with 5 reachable pages → `crawledCount === 2`
- [ ] Test #3: `maxDepth` cap blocks the depth-2 page
- [ ] Test #4: `includePatterns: ["blog"]` filters out `/about` URL
- [ ] Test #5: `excludePatterns: ["admin"]` filters out `/admin` URL
- [ ] Test #6: `mapOnly: true` → `result.mode === "map"`, `crawledCount === 0`
- [ ] Test #7: `/sitemap.xml` URLs end up in `discoveredUrls` with `source: "sitemap"`
- [ ] Test #8: `https://example.com/...` link in body never appears in `discoveredUrls`
- [ ] Every non-mapOnly test passes `outputPath` into a temp dir
- [ ] No `*.crawl.md` / `*.crawl.jsonl` left in `paperboy-cli/` after `npm test`
- [ ] No edits to `paperboy-cli/src/**`
- [ ] No edits to `paperboy-cli/package.json` (no new deps)
- [ ] `npm test` exits 0 with all tests passing
- [ ] `npm run typecheck` clean
- [ ] Substring / value-equality assertions only (no snapshots)

## Decision

**send_to_builder.** Fresh task, no builder commit yet. Scope: 1 new test file with 8 focused tests against the `crawlSite` public API. HTTP mocking via in-process `http.createServer` (no new deps). All output redirected into per-test temp dirs to keep `paperboy-cli/` clean. 19-item validation checklist.

## Notes
- Why an in-process HTTP server, not `vi.spyOn(http, "request", ...)`: `crawl.ts` uses `client.request(parsedUrl, opts, callback)` (3-arg form) — stubbing this is fragile. A localhost loopback server exercises the real `fetchTextWithRedirects` code path including content-type handling and is the dominant pattern in Node test suites. Speed is fine (~5 ms per request on loopback).
- Why 8 tests, not branch-exhaustive: the module has roughly 15 distinct branches, but 8 covers the user-visible behaviors users would notice if any one regressed. We're not chasing 100% line coverage at this milestone; this is "guard the contract" coverage.
- Why no test for output mode `mirror` / `jsonl` specifically: `single` is covered in test #1, and the other modes share 90% of their code path with `single` (only the writer differs). If 8.2 leaves coverage gaps, follow-up tickets can add `mirror` / `jsonl` writer tests in a future pass without disturbing this PR.
- Why no test for `rateLimitMs > 0`: rate limiting is `await sleep(ms)` — testing it requires either fake timers or a real wait, both of which would slow the suite. Confirmed by reviewing `sleep()` (lines 79-82): single-line `setTimeout` wrapper. Trusted.
- Why no test for `timeoutMs`: the request-timeout path requires a server that intentionally never responds. Risk: leaked sockets if the test doesn't clean up correctly. Defer.
- After 8.2 closes, activator picks 8.3 (widget integration tests).
