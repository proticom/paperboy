---
name: find-dead-css
description: Find CSS classes defined in paperboy-site/app/globals.css that aren't referenced anywhere in the React tree. Helps prune accumulated dead rules (.markdown-view, .paperboy-widget-scope, .ask-editor-inline) left behind by feature pivots. Read-only — reports candidates, doesn't delete.
user-invocable: false
---

# Find dead CSS in paperboy-site

The site has gone through several pivots (WidgetDemo → ScopedMarkdownView → masthead widget; PageMarkdownView with its own toolbar → stripped wrapper). Each pivot leaves CSS behind. This skill finds the orphans so a human can decide whether they're really safe to delete.

## Procedure

Run from the monorepo root.

1. **Extract class selectors from globals.css.**
   ```bash
   grep -oE '^\s*\.[a-zA-Z][a-zA-Z0-9_-]*' paperboy-site/app/globals.css \
     | sed -E 's/^\s*\.//' \
     | sort -u > /tmp/css-classes.txt
   ```
   Filter out classes that are obviously utility-driven via Tailwind (`-mt-`, `bg-`, etc.) — those aren't in globals.css anyway, but be ready to skip Tailwind plugin output.

2. **Extract class usages from the React tree.**
   ```bash
   rg -oh 'className=["`][^"`]+["`]' paperboy-site/{app,components,lib} \
     | grep -oE '[a-zA-Z][a-zA-Z0-9_-]+' \
     | sort -u > /tmp/used-classes.txt
   ```
   Also include any string-template uses (`cn("foo bar")`):
   ```bash
   rg -oh "cn\([^)]+\)" paperboy-site/{app,components,lib} \
     | grep -oE '[a-zA-Z][a-zA-Z0-9_-]+' \
     | sort -u >> /tmp/used-classes.txt
   ```

3. **Diff.** Classes defined in globals.css but not appearing anywhere in the React tree are candidates.
   ```bash
   comm -23 /tmp/css-classes.txt /tmp/used-classes.txt > /tmp/dead-css-candidates.txt
   ```

4. **For each candidate, double-check** by grepping the entire site repo (CSS rules can be referenced from other CSS via descendant selectors, or set dynamically by JS). False positives are common:
   ```bash
   while read -r cls; do
     hits=$(rg -c -t tsx -t ts -t jsx -t js -t css -- "\\b$cls\\b" paperboy-site/ 2>/dev/null \
       | grep -v ":0$" | wc -l | tr -d ' ')
     echo "$cls    $hits non-zero-hit files"
   done < /tmp/dead-css-candidates.txt
   ```

## Report format

A markdown table sorted by confidence (zero hits first → almost certainly dead; one or two hits → likely dead but inspect; three+ → false positive, skip):

| Class | Files referencing it | Verdict |
|-------|---------------------|---------|
| `.paperboy-widget-scope` | 0 | 🟢 Safe to delete |
| `.viewer-rendered` | 1 (viewer/page.tsx) | 🟡 Keep — used by /viewer |
| `.dither-image` | 4 | 🔴 In use, skip |

End with a one-line summary: "N classes found dead — X lines / ~Y bytes if removed." Don't delete anything; the human picks.

## What NOT to do

- Don't auto-delete. Some classes are referenced via dynamic strings (template literals, classnames coming from a config object) that grep misses. Always let the human do the final delete.
- Don't scan Tailwind utility classes — they're generated, not defined in globals.css.
- Don't include classes from third-party packages under node_modules. Scope to `app/`, `components/`, `lib/`, `public/`.
