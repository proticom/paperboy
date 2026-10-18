# Code block fixtures

These fixtures contain short excerpts from rendered page captures made on 2026-10-18. Code and relevant element wrappers are retained for conversion tests. Surrounding text is shortened or adapted for Readability. Personal data, scripts, tracking attributes, identifiers, and unrelated page chrome are omitted.

| Fixture | Source | License note |
| --- | --- | --- |
| `code-blocks/mdn-fetch.html` | [MDN, Using the Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) | MDN contributors, CC BY-SA 2.5. Short excerpt for testing; includes serialized open shadow DOM. |
| `code-blocks/mdn-fetch-live.html` | [MDN, Using the Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) | MDN contributors, CC BY-SA 2.5. Two examples from the live capture, with nested open shadow DOM and slotted copy controls. |
| `code-blocks/react-learn.html` | [React documentation, Quick Start](https://react.dev/learn) | React documentation contributors, CC BY 4.0. Short excerpt for testing. |
| `code-blocks/stackoverflow-sorted.html` | [Stack Overflow question 11227809](https://stackoverflow.com/q/11227809) and [answer 11227902](https://stackoverflow.com/a/11227902) | Stack Overflow posts, CC BY-SA 3.0/4.0 per post revision. Author attribution is on the linked post pages. Short excerpts for testing; the C++ program is truncated after its array declaration. |
| `code-blocks/bash-manual.html` | [GNU Bash Reference Manual](https://www.gnu.org/software/bash/manual/bash.html) | Free Software Foundation, GNU Free Documentation License (GFDL) 1.3. Short excerpts for testing. |
| `code-blocks/blog-comment-pre.html` | Synthetic blog regression input, https://blog.example/post | Synthetic test markup; reader names replaced with generic labels. |

## Full capture measurements

The baseline used fb30f62. Extraction alone matched the original pipeline in all ten comparisons across the five captures and both conversion paths. The tables below compare the original pipeline with the fixed pipeline on the same saved HTML. MDN uses the supplied shadow capture, which represents the new capture serializer's input to conversion. Its light-DOM-only capture has zero pre elements and produces zero fences in both versions.

| Capture | Input pre | Fences before / after | Copy lines before / after | Collapsed blocks before / after | Lines in fences before / after | Output characters before / after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MDN Fetch (shadow) | 23 | 0 / 23 | 0 / 0 | 0 / 0 | 0 / 316 | 17189 / 29253 |
| React Learn | 24 | 19 / 24 | 0 / 0 | 17 / 0 | 19 / 256 | 17660 / 17782 |
| Stack Overflow | 61 | 6 / 59 | 53 / 0 | 47 / 0 | 28 / 516 | 142716 / 142972 |
| Bash manual | 178 | 8 / 178 | 0 / 0 | 0 / 0 | 10 / 595 | 617962 / 618698 |

Stack Overflow includes two empty, aria-hidden editor pre elements. The 59 content blocks survive conversion. MDN's first example sits in a header container beside the article; the code-preservation fallback retains it.

Collapsed blocks are a diagnostic heuristic. A source pre with multiple nonempty lines or line wrappers counts when its complete code, ignoring whitespace, appears on one output line. The code must exceed 20 non-whitespace characters. Missing blocks do not count as collapsed blocks. Copy lines match only a standalone Copy, Copied, Copy code, or Copy to clipboard label, ignoring case.

Run after building the converter:

```sh
node paperboy-ext/scripts/measure-output.mjs <capture.html> <pageUrl>
node paperboy-ext/scripts/measure-output.mjs <capture.html> <pageUrl> --pick 'mdn-code-example'
```

The script reports counts, total lines inside fences, and output character length as JSON. Raw captures stay outside the public repository.

## PR 17 QA measurements

Measured before at 739062a and after these fixes on the same six saved captures. R means readability, R+1 means readability+reinserted 1, and F means fallback. Link columns show relative/absolute counts and omit fragments and special schemes. Standalone Copy lines are zero before and after on every capture.

| Capture | Fences before/after | copyNearFence before/after | Path before/after | Links relative/absolute before/after | Junk phrases before/after |
| --- | ---: | ---: | --- | --- | --- |
| MDN live | 23/23 | 23/0 | F/R+1 | 92/3 → 0/80 | Was this page helpful; View this page on GitHub → none |
| MDN shadow | 23/23 | 0/0 | F/R+1 | 92/3 → 0/80 | Was this page helpful; View this page on GitHub → none |
| Stack Overflow | 59/59 | 0/0 | F/F | 308/84 → 0/392 | none → none |
| Bash | 178/178 | 4/4 | R/R | 0/8 → 0/2873 | none → none |
| React | 24/24 | 0/0 | F/R | 20/20 → 0/15 | none → none |
| Synthetic blog | 2/1 | 0/0 | F/R | 5/0 → 0/0 | Subscribe; Related posts; Advertise; newsletter; Privacy policy → newsletter |

copyNearFence counts output lines containing the word Copy, ignoring case, outside fenced blocks and within two lines of an opening or closing fence. Bash's four matches are ordinary prose and remain intact. MDN restores only its missing introductory pre rather than replacing the article. The blog excludes the reader comment's pre. Its newsletter paragraph is pre-existing Readability output and remains in scope only as a measured phrase, not a regression.
