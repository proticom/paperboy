---
name: screenshot-route
description: Take a single Playwright screenshot of a paperboy-site route at a given viewport + edition. Use when you want a quick visual without running the full mobile-renderer agent across every page. Args - route (default /), viewport (default mobile), edition (default morning).
disable-model-invocation: true
---

# Screenshot a single route

One-shot capture via the Playwright MCP. Faster than the `mobile-renderer` agent when you just want eyes on a single change.

## Arguments (parse from user invocation)

- **route** — path including leading slash. Default `/`. Examples: `/a4`, `/viewer`, `/help`.
- **viewport** — one of:
  - `mobile` (default) → 390 × 844, iOS Safari UA
  - `tablet` → 768 × 1024, iOS Safari UA
  - `desktop` → 1440 × 900, macOS Chrome UA
  - `narrow` → 320 × 568, iOS Safari UA (smallest realistic phone)
- **edition** — `morning` (default) or `late`.
- **target** — `local` (default, `http://localhost:3000`) or `prod` (`https://paperboy.run`).

## Steps

1. **Confirm the target is reachable.**
   - `local`: assume the user has `npm run dev` running in `paperboy-site/`. If `mcp__playwright__browser_navigate` to `http://localhost:3000` fails, tell them to start it; don't try to start it yourself.
   - `prod`: just go.

2. **Apply viewport.** `mcp__playwright__browser_resize` to the dimensions in the table above. If the Playwright MCP exposes a user-agent override, set it to a current iOS Safari string for mobile/tablet/narrow.

3. **Navigate** to `<base>/<route>`.

4. **Set the edition.** If `late`, evaluate:
   ```js
   document.documentElement.classList.add('late-edition');
   localStorage.setItem('edition', 'late');
   ```
   If `morning`, evaluate the inverse — remove the class + set the storage key. Allow a brief tick for repaints.

5. **Capture.** Take ONE screenshot (`mcp__playwright__browser_take_screenshot`). Full-page is fine for routes that fit; for very tall pages prefer viewport-only.

6. **Report.** Save path of the screenshot + a one-sentence visual description (rendered text length, anything obvious that looks broken). Don't analyse style choices — that's the human's call. Just confirm the page rendered.

## What to bail on

- Page returns a 4xx/5xx — report and stop.
- `document.body.innerText.length < 50` — flag as "blank or near-blank, look at the screenshot before trusting anything else".

## What NOT to do

- Don't iterate. One route, one screenshot, done. For multi-route sweeps use the `mobile-renderer` agent.
- Don't navigate around the site after the initial route load. The user wanted a snapshot, not a walkthrough.
- Don't kill or start dev servers.
