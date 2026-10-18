# Code block fixtures

These fixtures contain short excerpts from rendered page captures made on 2026-10-18. Code and relevant element wrappers are retained for conversion tests. Surrounding text is shortened or adapted for Readability. Personal data, scripts, tracking attributes, identifiers, and unrelated page chrome are omitted.

| Fixture | Source | License note |
| --- | --- | --- |
| `code-blocks/mdn-fetch.html` | [MDN, Using the Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) | MDN contributors, CC BY-SA. Short excerpt for testing; includes serialized open shadow DOM. |
| `code-blocks/react-learn.html` | [React documentation, Quick Start](https://react.dev/learn) | React documentation contributors, CC BY 4.0. Short excerpt for testing. |
| `code-blocks/stackoverflow-sorted.html` | [Stack Overflow question 11227809](https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array) | Stack Overflow contributors, CC BY-SA. Short excerpts for testing; source link provides contributor attribution. The C++ program is truncated after its array declaration. |
| `code-blocks/bash-manual.html` | [GNU Bash Reference Manual](https://www.gnu.org/software/bash/manual/bash.html) | Free Software Foundation, GNU Free Documentation License (GFDL). Short excerpts for testing. |

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
