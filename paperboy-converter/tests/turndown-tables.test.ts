import { describe, expect, it } from "vitest";
import { createTurndownService, wrapTableFragment } from "../src/turndown.js";

const convert = (html: string) => createTurndownService().turndown(html);

describe("table output", () => {
  it("expands header and body spans without shifting later values", () => {
    expect(convert('<table><tr><th rowspan="2">Name</th><th colspan="2">Height</th><th rowspan="2">Year</th></tr><tr><th>m</th><th>ft</th></tr><tr><td rowspan="2">Twin towers</td><td>452</td><td>1483</td><td rowspan="2">1998</td></tr><tr><td colspan="2">Same height</td></tr></table>'))
      .toBe('| Name | Height |  | Year |\n| --- | --- | --- | --- |\n|  | m | ft |  |\n| Twin towers | 452 | 1483 | 1998 |\n|  | Same height |  |  |');
  });

  it("drops internal columns made only of span placeholders", () => {
    expect(convert('<table><tr><th colspan="2">Name</th><th>Name</th><th>Last commit message</th><th>Last commit date</th></tr><tr><td colspan="2">docs</td><td>docs</td><td>Update docs</td><td>Sep 3, 2026</td></tr></table>'))
      .toBe('| Name | Last commit message | Last commit date |\n| --- | --- | --- |\n| docs | Update docs | Sep 3, 2026 |');
  });

  it("drops adjacent duplicate columns including repeated runs", () => {
    expect(convert('<table><tr><th>Name</th><th>Name</th><th>Name</th><th>Value</th></tr><tr><td>A</td><td>A</td><td>A</td><td>1</td></tr></table>'))
      .toBe('| Name | Value |\n| --- | --- |\n| A | 1 |');
  });

  it("keeps columns with different headers or any different body cell", () => {
    expect(convert('<table><tr><th>Name</th><th>Name</th><th>Other</th></tr><tr><td>A</td><td>A</td><td>A</td></tr><tr><td>B</td><td>C</td><td>C</td></tr></table>'))
      .toBe('| Name | Name | Other |\n| --- | --- | --- |\n| A | A | A |\n| B | C | C |');
  });

  it("drops duplicate columns when a full-width spanning row covers them", () => {
    expect(convert('<table><tr><th>Name</th><th>Name</th><th>Value</th></tr><tr><td>A</td><td>A</td><td>1</td></tr><tr><td colspan="3">View all files</td></tr></table>'))
      .toBe('| Name | Value |\n| --- | --- |\n| A | 1 |\n| View all files |  |');
  });

  it("keeps a real right cell that differs from a left rowspan placeholder", () => {
    expect(convert('<table><tr><th>Name</th><th>Name</th><th>Value</th></tr><tr><td rowspan="2">A</td><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr></table>'))
      .toBe('| Name | Name | Value |\n| --- | --- | --- |\n| A | A | 1 |\n|  | B | 2 |');
  });

  it("compares duplicates against the kept column to the left", () => {
    expect(convert('<table><tr><th>Name</th><th>Name</th><th>Name</th></tr><tr><td>A</td><td>A</td><td>A</td></tr><tr><td colspan="2">B</td><td></td></tr></table>'))
      .toBe('| Name | Name |\n| --- | --- |\n| A | A |\n| B |  |');
  });

  it.each(['<table><tr><th>Name</th><th>Name</th></tr></table>', '<table><tr><th>Name</th><th>Name</th></tr><tr><td></td><td></td></tr></table>'])("requires matching non-empty originating body cells: %s", (html) => {
    expect(convert(html)).toBe(html.includes("<td>") ? '| Name | Name |\n| --- | --- |\n|  |  |' : '| Name | Name |\n| --- | --- |');
  });

  it("requires matching body origins rather than additional header rows", () => {
    expect(convert('<table><thead><tr><th>Name</th><th>Name</th></tr><tr><th>Label</th><th>Label</th></tr></thead><tbody><tr><td colspan="2">A</td></tr></tbody></table>'))
      .toBe('| Name | Name |\n| --- | --- |\n| Label | Label |\n| A |  |');
  });

  it("keeps adjacent empty columns where real cells originate", () => {
    expect(convert('<table><tr><th>Name</th><th></th><th></th><th>Value</th></tr><tr><td>A</td><td></td><td></td><td>1</td></tr></table>'))
      .toBe('| Name |  |  | Value |\n| --- | --- | --- | --- |\n| A |  |  | 1 |');
  });

  it("drops empty rows after accounting for rowspans", () => {
    expect(convert('<table><tr></tr><tr><th>Name</th><th>Value</th></tr><tr><td rowspan="3">A</td><td>1</td></tr><tr></tr><tr><td>3</td></tr><tr><td>B</td><td>4</td></tr><tr></tr></table>'))
      .toBe('| Name | Value |\n| --- | --- |\n| A | 1 |\n|  | 3 |\n| B | 4 |');
  });

  it("keeps an empty row where a real cell originates", () => {
    expect(convert('<table><tr><th>Name</th></tr><tr><td></td></tr></table>'))
      .toBe('| Name |\n| --- |\n|  |');
  });

  it("keeps a column with real content below a spanning header", () => {
    expect(convert('<table><tr><th colspan="2">Group</th><th>End</th></tr><tr><td>A</td><td>B</td><td>C</td></tr></table>'))
      .toBe('| Group |  | End |\n| --- | --- | --- |\n| A | B | C |');
  });

  it("keeps an internal column where an empty cell originates", () => {
    expect(convert('<table><tr><th colspan="2">Group</th><th>End</th></tr><tr><td>A</td><td></td><td>C</td></tr></table>'))
      .toBe('| Group |  | End |\n| --- | --- | --- |\n| A |  | C |');
  });

  it.each(['<table></table>', '<table><tr></tr></table>', '<table><caption>Caption</caption><colgroup><col></colgroup></table>'])("omits a table with no cells: %s", (html) => {
    expect(convert(html)).toBe("");
  });

  it("drops trailing columns empty in every row, including span placeholders", () => {
    expect(convert('<table><tr><th colspan="3">Group</th></tr><tr><td>A</td></tr></table>'))
      .toBe('| Group |\n| --- |\n| A |');
    expect(convert('<table><tr><th>Name</th><th></th><th rowspan="2"></th></tr><tr></tr><tr><td>A</td></tr></table>'))
      .toBe('| Name |\n| --- |\n| A |');
  });

  it("keeps trailing columns with real content under a spanning header", () => {
    expect(convert('<table><tr><th colspan="3">Group</th></tr><tr><td>A</td><td>B</td><td>C</td></tr></table>'))
      .toBe('| Group |  |  |\n| --- | --- | --- |\n| A | B | C |');
  });

  it("keeps trailing header content carried by a rowspan", () => {
    expect(convert('<table><tr><th>Name</th><th rowspan="2">Value</th></tr><tr><td>A</td></tr></table>'))
      .toBe('| Name | Value |\n| --- | --- |\n| A |  |');
  });

  it("limits rowspans to their row group, including rowspan zero", () => {
    expect(convert('<table><thead><tr><th rowspan="0">Name</th><th>Value</th></tr><tr><th>Units</th></tr></thead><tbody><tr><td rowspan="99">A</td><td>1</td></tr></tbody><tbody><tr><td>B</td><td>2</td></tr></tbody></table>'))
      .toBe('| Name | Value |\n| --- | --- |\n|  | Units |\n| A | 1 |\n| B | 2 |');
  });

  it("separates nested cells and keeps them out of the outer row grid", () => {
    expect(convert('<table><tr><th>Name</th><th>Details</th></tr><tr><td>Outer</td><td>Before<table><tr><td>North<br>wing</td><td>South</td></tr><tr><td colspan="2">Inner<table><tr><td>East</td><td>West</td></tr></table>end</td></tr></table>After</td></tr></table>'))
      .toBe('| Name | Details |\n| --- | --- |\n| Outer | Before North wing · South · Inner East · West end After |');
  });

  it("separates breaks, blocks, footnotes and escapes pipes", () => {
    expect(convert('<table><tr><th>Parts</th></tr><tr><td>Height<sup>[1]</sup><sup>[2]</sup><br>m<div>North</div><div>South</div><p>A | B</p><a href="/more">More</a></td></tr></table>'))
      .toBe('| Parts |\n| --- |\n| Height \\[1\\] \\[2\\] m North South A \\| B [More](/more) |');
  });

  it("retains nested captions and separates nested blocks and footnotes", () => {
    expect(convert('<table><tr><th>Details</th></tr><tr><td>Before<table><caption>Important caption</caption><tr><td><section>North</section><section>South<sup>[1]</sup></section></td><td><dl><dt>East</dt><dd>West | wing</dd></dl></td></tr></table>After</td></tr></table>'))
      .toBe('| Details |\n| --- |\n| Before Important caption · North South \\[1\\] · East West \\| wing After |');
  });
});

describe("table fragment wrapping", () => {
  it.each(["tbody", "thead", "tfoot", "tr", "caption", "colgroup", "col"])("wraps %s in a table", (tag) => {
    const html = `<${tag}>Content</${tag}>`;
    expect(wrapTableFragment(html)).toBe(`<table>${html}</table>`);
  });

  it.each(["td", "th"])("wraps %s in a row and table", (tag) => {
    const html = `<${tag}>A</${tag}><${tag}>B</${tag}>`;
    expect(wrapTableFragment(html)).toBe(`<table><tr>${html}</tr></table>`);
    expect(convert(wrapTableFragment(html))).toBe("| A | B |\n| --- | --- |");
  });

  it("allows leading comments, whitespace and uppercase tags", () => {
    const html = ' \n<!-- picked --> \n<!-- table --> <TBODY><tr><td>A</td><td>B</td></tr></TBODY>';
    expect(wrapTableFragment(html)).toBe(`<table>${html}</table>`);
    expect(convert(wrapTableFragment(html))).toBe("| A | B |\n| --- | --- |");
  });

  it.each(["", "<table><tr><td>A</td></tr></table>", "<div><table></table></div>", "Text <td>A</td>"])("leaves other HTML unchanged: %s", (html) => {
    expect(wrapTableFragment(html)).toBe(html);
    expect(wrapTableFragment(wrapTableFragment(html))).toBe(html);
  });
});
