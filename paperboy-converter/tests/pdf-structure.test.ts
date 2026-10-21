import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDocumentProxy } from "unpdf";
import { describe, expect, it, vi } from "vitest";

import { convertToMarkdown } from "../src/index.js";
import {
  collapseLetterSpacing,
  reflowLines,
  renderPdfPage,
  type PdfStructureNode,
  type PdfTextItem,
} from "../src/handlers/pdf-structure.js";

const documentProxyMock = vi.hoisted(() => vi.fn());

vi.mock("unpdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("unpdf")>();
  return { ...actual, getDocumentProxy: documentProxyMock.mockImplementation(actual.getDocumentProxy) };
});

function textItem(text: string, y: number, markedId?: string): PdfTextItem {
  return {
    text,
    x: 40,
    y,
    width: text.length * 6,
    height: 12,
    fontName: "Helvetica",
    ...(markedId ? { markedId } : {}),
  };
}

function node(role: string, ...children: PdfStructureNode["children"]): PdfStructureNode {
  return { role, children };
}

function content(id: string): { kind: "content"; id: string } {
  return { kind: "content", id };
}

describe("PDF text cleanup", () => {
  it.each([
    ["A L R E A D Y  I N  P L A Y", "ALREADY IN PLAY"],
    ["S E C T I O N  T W O", "SECTION TWO"],
    ["a b", "a b"],
    ["1. 2. 3.", "1. 2. 3."],
    ["A normal sentence with a b pair.", "A normal sentence with a b pair."],
    ["A B C then a b", "A B C then a b"],
    ["/ / W H E R E  W E  G O  F R O M  H E R E", "// WHERE WE GO FROM HERE"],
    ["/ /", "/ /"],
    ["a / b", "a / b"],
    ["1. 2.", "1. 2."],
  ])("cleans %j without changing ordinary prose or labels", (input, expected) => {
    expect(collapseLetterSpacing(input)).toBe(expected);
  });

  it("joins wrapped lines and repairs a lowercase word split", () => {
    expect(reflowLines(["Useful informa\u00ad", "tion spans two lines."])).toBe(
      "Useful information spans two lines.",
    );
  });

  it("keeps whole-file compounds within a line", () => {
    expect(reflowLines(["A whole-file edit can", "stay readable."])).toBe(
      "A whole-file edit can stay readable.",
    );
  });

  it("keeps a hyphen before an uppercase continuation", () => {
    expect(reflowLines(["Use the North-", "South route."])).toBe(
      "Use the North-South route.",
    );
  });
});

describe("PDF structure rendering", () => {
  it("caps a large heading after body text at level two", () => {
    expect(renderPdfPage([
      textItem("A longer body paragraph appears before the section heading.", 720),
      { ...textItem("A large section", 680), height: 30 },
    ])).toBe("A longer body paragraph appears before the section heading.\n\n## A large section");
  });

  it("uses level one for the first and largest heading", () => {
    expect(renderPdfPage([
      { ...textItem("A document title", 720), height: 30 },
      textItem("A longer body paragraph follows the document title.", 680),
    ])).toBe("# A document title\n\nA longer body paragraph follows the document title.");
  });

  it("keeps an explicit tagged H1 after body text", () => {
    const items = [
      textItem("A body paragraph appears first.", 720, "intro"),
      { ...textItem("An explicit heading", 680, "heading"), height: 30 },
    ];
    const tree = node("Document", node("P", content("intro")), node("H1", content("heading")));

    expect(renderPdfPage(items, tree)).toBe("A body paragraph appears first.\n\n# An explicit heading");
  });

  it("caps a generic tagged heading after body text at level two", () => {
    const items = [
      textItem("A body paragraph appears first.", 720, "intro"),
      { ...textItem("A generic heading", 680, "heading"), height: 30 },
    ];
    const tree = node("Document", node("P", content("intro")), node("H", content("heading")));

    expect(renderPdfPage(items, tree)).toBe("A body paragraph appears first.\n\n## A generic heading");
  });

  it("caps the first heading on a later text page at level two", () => {
    expect(renderPdfPage([
      { ...textItem("A later section", 720), height: 30 },
      textItem("A longer body paragraph follows the later section.", 680),
    ], null, { isFirstTextPage: false, largestFontSize: 30 })).toBe("## A later section\n\nA longer body paragraph follows the later section.");
  });

  it("caps a first-page heading below the document's largest font at level two", () => {
    expect(renderPdfPage([
      { ...textItem("A smaller heading", 720), height: 20 },
      textItem("A longer body paragraph follows the smaller heading.", 680),
    ], null, { isFirstTextPage: true, largestFontSize: 30 })).toBe("## A smaller heading\n\nA longer body paragraph follows the smaller heading.");
  });

  it.each([
    {
      lines: ["A uniform paragraph wraps", "onto another line and then one more line."],
      markdown: "A uniform paragraph wraps onto another line and then one more line.",
    },
    {
      lines: ["A uniform paragraph", "wraps onto another line", "and then one more line."],
      markdown: "A uniform paragraph wraps onto another line and then one more line.",
    },
  ])("reflows uniform wrapped prose without depending on line count ($lines.length lines)", ({ lines, markdown }) => {
    expect(renderPdfPage(lines.map((text, index) => textItem(text, 700 - index * 16)))).toBe(markdown);
  });

  it("starts a separate block when the font size changes", () => {
    expect(renderPdfPage([
      textItem("A body paragraph stays separate.", 700),
      { ...textItem("A larger heading", 684), height: 16 },
    ])).toBe("A body paragraph stays separate.\n\n## A larger heading");
  });

  it("starts a separate paragraph when a smaller font begins", () => {
    expect(renderPdfPage([
      textItem("A longer body paragraph ends before the font changes.", 700),
      { ...textItem("A smaller paragraph begins.", 684), height: 10 },
    ])).toBe("A longer body paragraph ends before the font changes.\n\nA smaller paragraph begins.");
  });

  it("starts a separate paragraph after an indent shift", () => {
    expect(renderPdfPage([
      textItem("A paragraph ends here.", 700),
      { ...textItem("An indented paragraph begins.", 684), x: 64 },
    ])).toBe("A paragraph ends here.\n\nAn indented paragraph begins.");
  });

  it("starts a separate paragraph after a large vertical gap", () => {
    expect(renderPdfPage([
      textItem("A paragraph ends here.", 700),
      textItem("Another paragraph begins.", 660),
    ])).toBe("A paragraph ends here.\n\nAnother paragraph begins.");
  });

  it("does not infer a heading inside an explicitly tagged list body", () => {
    const items = [textItem("1.", 700, "label"), { ...textItem("Read the note.", 700, "body"), fontName: "Helvetica-Bold" }];
    const tree = node("Document", node("L", node("LI", node("Lbl", content("label")), node("LBody", content("body")))));
    expect(renderPdfPage(items, tree)).toBe("1. Read the note.");
  });

  it("keeps numbered labels embedded in tagged list bodies", () => {
    const items = [textItem("3. Read the note.", 700, "body")];
    const tree = node("Document", node("L", node("LI", node("LBody", content("body")))));
    expect(renderPdfPage(items, tree)).toBe("3. Read the note.");
  });
  it("reflows an indented continuation of an untagged bullet", () => {
    expect(renderPdfPage([
      textItem("- A wrapped", 700),
      { ...textItem("list item.", 684), x: 52 },
    ])).toBe("- A wrapped list item.");
  });

  it("reads staggered columns separately even when their baselines do not align", () => {
    expect(renderPdfPage([
      textItem("First left paragraph.", 700),
      { ...textItem("First right paragraph.", 690), x: 330 },
      textItem("Second left paragraph.", 660),
      { ...textItem("Second right paragraph.", 650), x: 330 },
      textItem("Third left paragraph.", 620),
      { ...textItem("Third right paragraph.", 610), x: 330 },
    ])).toBe("First left paragraph.\n\nSecond left paragraph.\n\nThird left paragraph.\n\nFirst right paragraph.\n\nSecond right paragraph.\n\nThird right paragraph.");
  });

  it("retains indentation in untagged nested lists", () => {
    const items = [
      textItem("• Parent task", 700),
      { ...textItem("• Child task", 680), x: 64 },
      textItem("• Next task", 660),
    ];

    expect(renderPdfPage(items)).toBe("- Parent task\n  - Child task\n- Next task");
  });

  it("preserves numeric order and converts letter labels to ordered lists", () => {
    expect(renderPdfPage([
      textItem("3) Third task", 700),
      textItem("4) Fourth task", 680),
    ])).toBe("3. Third task\n4. Fourth task");
    expect(renderPdfPage([
      textItem("a. First task", 700),
      textItem("b. Second task", 680),
    ])).toBe("1. First task\n2. Second task");
  });

  it("follows structure order when the content stream draws a list first", () => {
    const items = [
      textItem("1.", 750, "label"),
      { ...textItem("First task", 750, "body"), x: 64 },
      textItem("A neutral heading", 720, "heading"),
      textItem("An introduction.", 690, "intro"),
    ];
    const tree = node(
      "Document",
      node("H1", content("heading")),
      node("P", content("intro")),
      node("L", node("LI", node("Lbl", content("label")), node("LBody", content("body")))),
    );

    expect(renderPdfPage(items, tree)).toBe(
      "# A neutral heading\n\nAn introduction.\n\n1. First task",
    );
  });

  it("keeps nested lists indented under their parent item", () => {
    const items = [
      textItem("1.", 700, "parent-label"),
      textItem("Parent task", 700, "parent"),
      textItem("•", 680, "child-label"),
      textItem("Child task", 680, "child"),
      textItem("2.", 660, "next-label"),
      textItem("Next task", 660, "next"),
    ];
    const tree = node("Document", node("L",
      node("LI", node("Lbl", content("parent-label")), node("LBody",
        node("P", content("parent")),
        node("L", node("LI", node("Lbl", content("child-label")), node("LBody", content("child")))),
      )),
      node("LI", node("Lbl", content("next-label")), node("LBody", content("next"))),
    ));

    expect(renderPdfPage(items, tree)).toBe("1. Parent task\n   - Child task\n2. Next task");
  });

  it("renders a rectangular tagged table as GFM", () => {
    const items = [
      textItem("Name", 700, "name"),
      textItem("Count", 700, "count"),
      textItem("Item", 680, "item"),
      textItem("3", 680, "three"),
    ];
    const tree = node("Document", node("Table",
      node("TR", node("TH", content("name")), node("TH", content("count"))),
      node("TR", node("TD", content("item")), node("TD", content("three"))),
    ));

    expect(renderPdfPage(items, tree)).toBe("| Name | Count |\n| --- | --- |\n| Item | 3 |");
  });

  it("retains text omitted from the structure tree", () => {
    const items = [textItem("A heading", 720, "heading"), textItem("A visible footer.", 40)];
    const tree = node("Document", node("H1", content("heading")));

    expect(renderPdfPage(items, tree)).toBe("# A heading\n\nA visible footer.");
  });

  it.each([
    undefined, null, node("Document"), node("Document", node("P", content("missing"))),
    node("Document", node("L", node("LI", node("LBody", content("missing"))))),
    node("Document", node("Table", node("TR", node("TH", content("missing"))))),
  ])(
    "uses visible text when structure is absent or maps no text (%j)",
    (tree) => {
      expect(renderPdfPage([textItem("Hello pdf world.", 700)], tree)).toBe("Hello pdf world.");
    },
  );

  it("puts an image placeholder at a tagged figure's position", () => {
    const items = [textItem("Before.", 720, "before"), textItem("After.", 650, "after")];
    const tree = node("Document", node("P", content("before")), node("Figure"), node("P", content("after")));

    expect(renderPdfPage(items, tree)).toBe("Before.\n\n<!-- image omitted -->\n\nAfter.");
  });

  it("retains an omitted-image marker on a figure-only page", () => {
    expect(renderPdfPage([], node("Document", node("Figure")))).toBe("<!-- image omitted -->");
  });
});

const fixtures = [
  {
    name: "pdf-two-column-gutter8-justified.pdf",
    markdown: `PARA-01 delta foxtrot juliet india lima november echo lima delta oscar delta hotel bravo mike echo delta delta kilo echo alpha golf hotel november oscar end.

PARA-02 lima golf mike echo bravo foxtrot november juliet india foxtrot charlie november echo bravo kilo oscar bravo india hotel juliet papa charlie delta hotel end.

PARA-03 charlie kilo india oscar alpha golf echo bravo juliet hotel bravo foxtrot alpha lima charlie alpha oscar golf papa bravo alpha india echo lima end.

PARA-04 golf juliet juliet papa kilo papa bravo papa golf foxtrot echo oscar papa echo kilo india bravo charlie india oscar alpha oscar india november end.

PARA-05 india kilo bravo oscar charlie kilo alpha hotel lima juliet golf juliet charlie delta golf alpha india november oscar juliet kilo lima alpha november end.

PARA-06 golf hotel mike golf hotel juliet bravo november mike papa november india kilo oscar hotel golf golf india oscar mike lima india alpha golf end.

PARA-07 hotel foxtrot hotel foxtrot bravo kilo alpha echo kilo mike kilo delta oscar oscar alpha alpha kilo bravo foxtrot lima foxtrot papa bravo foxtrot end.

PARA-08 november lima bravo juliet november delta foxtrot alpha lima mike hotel mike charlie alpha golf papa papa papa mike november delta kilo bravo mike end.

PARA-09 india mike echo lima india lima delta charlie golf november alpha echo charlie charlie lima alpha bravo bravo charlie delta foxtrot bravo juliet kilo end.

PARA-10 golf alpha delta kilo echo foxtrot charlie lima echo juliet november echo foxtrot alpha oscar charlie echo alpha papa bravo hotel oscar charlie alpha end.

PARA-11 oscar papa foxtrot golf oscar papa november alpha oscar lima mike charlie golf charlie kilo juliet echo alpha lima kilo lima alpha bravo kilo end.

PARA-12 mike november bravo bravo november kilo oscar juliet alpha delta delta kilo lima bravo echo golf india november kilo mike alpha mike bravo kilo end.

PARA-13 charlie foxtrot hotel lima alpha papa juliet kilo bravo bravo mike lima juliet echo golf november kilo delta november mike hotel charlie november oscar end.

PARA-14 charlie mike november bravo kilo kilo hotel charlie echo oscar oscar kilo juliet echo alpha oscar echo charlie golf alpha delta charlie india alpha end.

PARA-15 hotel juliet juliet alpha hotel lima echo india kilo echo kilo india charlie november alpha november charlie november juliet golf foxtrot foxtrot lima papa end.

PARA-16 juliet juliet india golf delta india juliet lima kilo india juliet echo kilo lima echo mike mike hotel delta kilo juliet alpha hotel juliet end.

PARA-17 bravo bravo kilo echo november oscar bravo alpha oscar juliet juliet charlie kilo bravo alpha juliet lima foxtrot india oscar oscar alpha bravo delta end.

PARA-18 golf november alpha alpha bravo india lima kilo india lima november bravo hotel mike bravo foxtrot foxtrot india echo hotel hotel delta lima november end.

PARA-19 november bravo india mike india oscar bravo papa delta echo hotel charlie charlie echo alpha foxtrot hotel golf echo echo echo oscar lima india end.

PARA-20 mike echo golf mike alpha papa november lima golf november hotel delta mike hotel foxtrot alpha oscar bravo papa kilo golf oscar papa india end.`,
  },
  {
    name: "pdf-two-column-gutter18.pdf",
    markdown: `PARA-01 delta lima delta november lima foxtrot hotel delta alpha november bravo charlie hotel kilo charlie november hotel golf oscar bravo papa foxtrot mike juliet end.

PARA-02 juliet hotel papa hotel india delta echo mike charlie golf papa delta oscar echo hotel echo oscar india golf juliet bravo charlie bravo charlie end.

PARA-03 mike echo bravo hotel charlie foxtrot alpha kilo delta echo juliet lima golf kilo charlie delta bravo juliet oscar papa bravo hotel charlie hotel end.

PARA-04 bravo kilo mike mike echo juliet oscar alpha kilo oscar alpha juliet papa foxtrot papa echo delta papa delta bravo lima juliet juliet mike end.

PARA-05 charlie bravo november golf foxtrot foxtrot kilo echo charlie india juliet delta charlie echo kilo golf juliet delta delta echo echo oscar charlie juliet end.

PARA-06 golf echo delta oscar kilo bravo bravo charlie india kilo golf foxtrot mike echo delta alpha november papa india golf golf foxtrot oscar delta end.

PARA-07 kilo bravo alpha mike papa lima charlie hotel alpha delta echo echo november india alpha bravo papa kilo golf bravo india kilo golf juliet end.

PARA-08 golf mike oscar kilo echo charlie bravo hotel papa alpha oscar mike alpha hotel mike foxtrot lima charlie kilo echo lima oscar echo india end.

PARA-09 delta echo foxtrot bravo papa oscar oscar hotel echo charlie echo foxtrot kilo lima charlie india hotel foxtrot charlie echo hotel november charlie delta end.

PARA-10 foxtrot kilo papa november bravo lima india hotel oscar india oscar golf foxtrot hotel india november echo kilo oscar hotel alpha india papa lima end.

PARA-11 lima charlie charlie lima hotel hotel hotel papa bravo hotel foxtrot mike hotel alpha bravo delta echo bravo india foxtrot charlie november india hotel end.

PARA-12 india oscar echo bravo echo kilo papa india golf echo charlie november echo charlie echo oscar india november echo mike oscar foxtrot charlie bravo end.

PARA-13 juliet golf mike lima mike hotel bravo oscar hotel oscar hotel charlie alpha juliet foxtrot lima lima foxtrot foxtrot oscar bravo juliet bravo papa end.

PARA-14 juliet alpha oscar india papa kilo golf india oscar mike alpha juliet papa november mike bravo papa papa papa golf india golf papa bravo end.

PARA-15 alpha lima oscar india foxtrot hotel oscar papa golf mike juliet hotel november india foxtrot delta alpha delta lima juliet echo golf echo november end.

PARA-16 bravo india kilo juliet hotel kilo foxtrot india delta kilo oscar kilo hotel juliet lima bravo india oscar foxtrot alpha golf charlie bravo oscar end.

PARA-17 juliet india charlie kilo hotel mike juliet india foxtrot golf bravo echo bravo hotel november bravo delta oscar hotel juliet papa mike november echo end.

PARA-18 november juliet hotel hotel papa alpha kilo hotel delta delta kilo papa foxtrot golf lima bravo golf lima papa alpha golf foxtrot golf charlie end.

PARA-19 juliet echo juliet delta india lima lima charlie juliet echo mike alpha hotel delta hotel papa charlie juliet india foxtrot mike oscar bravo echo end.

PARA-20 hotel lima juliet alpha mike india lima papa papa charlie echo juliet lima foxtrot papa oscar delta kilo juliet kilo golf hotel papa kilo end.`,
  },
  {
    name: "pdf-four-column-newsletter.pdf",
    markdown: `PARA-01 delta bravo alpha november alpha mike lima alpha echo foxtrot november papa oscar golf bravo papa hotel mike end.

PARA-02 kilo charlie papa papa charlie hotel kilo papa juliet golf india echo india november delta charlie echo delta end.

PARA-03 charlie kilo november bravo oscar kilo papa bravo mike charlie golf golf india hotel bravo november hotel kilo end.

PARA-04 juliet foxtrot foxtrot papa india hotel delta charlie charlie echo india kilo mike oscar delta oscar lima november end.

PARA-05 delta oscar lima hotel foxtrot mike charlie juliet hotel papa foxtrot oscar bravo mike mike golf papa india end.

PARA-06 bravo echo kilo echo papa golf india foxtrot november kilo charlie mike foxtrot foxtrot kilo india papa juliet end.

PARA-07 papa echo lima kilo india foxtrot foxtrot india delta bravo alpha charlie alpha mike echo kilo lima foxtrot end.

PARA-08 charlie bravo kilo echo mike golf charlie bravo alpha papa bravo november echo echo juliet kilo foxtrot juliet end.

PARA-09 kilo delta golf mike foxtrot papa delta foxtrot echo juliet juliet papa charlie echo juliet alpha charlie bravo end.

PARA-10 charlie oscar kilo echo india golf papa oscar juliet alpha papa alpha bravo echo oscar india lima mike end.

PARA-11 delta golf foxtrot oscar delta papa papa echo echo papa papa hotel foxtrot india foxtrot bravo delta golf end.

PARA-12 mike golf papa oscar juliet lima kilo mike november bravo foxtrot lima kilo juliet lima charlie oscar delta end.

PARA-13 india juliet delta alpha charlie kilo oscar lima foxtrot bravo bravo oscar juliet echo charlie echo india mike end.

PARA-14 hotel oscar mike golf foxtrot foxtrot oscar hotel india india bravo hotel juliet lima india bravo hotel bravo end.

PARA-15 india india lima india hotel echo alpha charlie november delta delta golf delta foxtrot papa hotel bravo hotel end.

PARA-16 charlie delta golf papa november juliet kilo foxtrot golf echo oscar charlie juliet alpha november bravo lima mike end.

PARA-17 mike foxtrot papa mike charlie foxtrot alpha hotel foxtrot golf golf oscar echo kilo juliet foxtrot november kilo end.

PARA-18 charlie alpha oscar echo november alpha lima bravo papa mike echo oscar mike mike echo kilo lima mike end.

PARA-19 oscar delta november golf hotel india mike foxtrot juliet papa oscar hotel oscar hotel charlie alpha juliet kilo end.

PARA-20 juliet delta lima echo india november lima kilo oscar mike charlie bravo delta bravo kilo delta golf golf end.

PARA-21 kilo echo india charlie papa foxtrot charlie oscar foxtrot mike hotel november mike delta lima hotel oscar oscar end.

PARA-22 november foxtrot mike delta mike november echo oscar hotel kilo foxtrot delta india bravo india bravo mike golf end.

PARA-23 alpha alpha bravo lima papa echo papa juliet india india india kilo mike charlie bravo mike juliet india end.

PARA-24 oscar juliet kilo mike india hotel november november juliet bravo papa delta delta lima delta delta india mike end.

PARA-25 golf alpha india kilo delta mike november oscar echo papa november delta echo lima juliet kilo bravo lima end.

PARA-26 juliet india hotel foxtrot delta hotel hotel oscar alpha bravo juliet hotel oscar november delta india alpha echo end.

PARA-27 hotel kilo kilo lima november delta india delta golf charlie alpha delta india delta oscar oscar juliet india end.

PARA-28 foxtrot hotel papa charlie bravo charlie papa foxtrot juliet delta alpha juliet india juliet papa lima echo juliet end.

PARA-29 golf lima oscar november golf bravo foxtrot golf lima papa lima juliet november oscar delta lima mike alpha end.

PARA-30 lima alpha mike india lima bravo foxtrot juliet bravo bravo lima alpha golf juliet delta charlie golf lima end.

PARA-31 golf delta delta alpha golf echo hotel juliet alpha lima india alpha kilo golf papa delta delta oscar end.

PARA-32 foxtrot hotel kilo bravo papa oscar papa delta charlie oscar charlie bravo bravo alpha charlie bravo foxtrot juliet end.`,
  },
  {
    name: "pdf-table-in-one-column.pdf",
    markdown: `PARA-01 echo papa oscar charlie lima echo alpha delta foxtrot oscar golf november kilo oscar foxtrot juliet papa oscar kilo alpha november juliet oscar charlie november golf india alpha kilo hotel golf golf november delta echo hotel lima november november juliet end.

PARA-02 echo india india kilo november charlie foxtrot november india alpha alpha golf papa hotel india hotel papa kilo juliet oscar lima mike charlie november mike echo bravo delta oscar kilo hotel papa mike juliet foxtrot charlie alpha foxtrot delta november end.

| Code | Qty | Price |
| --- | --- | --- |
| T-1 | 4 | $1.25 |
| T-2 | 8 | $2.25 |
| T-3 | 12 | $3.25 |
| T-4 | 16 | $4.25 |
| T-5 | 20 | $5.25 |
| T-6 | 24 | $6.25 |

PARA-03 bravo lima juliet delta alpha delta foxtrot mike alpha echo november lima foxtrot echo india oscar november delta foxtrot golf oscar papa golf kilo foxtrot lima delta alpha charlie charlie bravo kilo hotel hotel kilo papa papa india november bravo end.

PARA-04 hotel kilo golf oscar echo bravo alpha hotel alpha delta echo lima india india lima lima papa charlie echo charlie bravo mike charlie kilo echo juliet oscar november charlie juliet papa charlie foxtrot foxtrot papa charlie papa delta alpha papa end.

PARA-05 echo india foxtrot golf bravo foxtrot november charlie echo kilo echo india golf echo india india golf india bravo mike echo kilo alpha juliet echo lima papa golf kilo foxtrot oscar bravo mike echo delta foxtrot alpha india india mike end.

PARA-06 hotel india november echo juliet juliet echo juliet lima november delta charlie delta echo alpha bravo hotel hotel hotel hotel hotel papa november oscar lima kilo lima charlie golf juliet delta hotel echo hotel bravo kilo oscar echo foxtrot foxtrot end.

PARA-07 bravo november hotel bravo foxtrot golf delta bravo mike oscar echo india foxtrot echo charlie papa delta oscar papa papa echo delta kilo november alpha mike papa charlie hotel kilo mike kilo kilo bravo echo hotel delta bravo foxtrot oscar end.`,
  },
  {
    name: "pdf-two-column-gutter14.pdf",
    markdown: "# Two columns with a narrow gutter\n\nPARA-01 Clear records support careful reading. The plain draft gives each reader useful context. Small steps keep the final result easy to check.\n\nPARA-02 Clear records support careful reading. The plain draft gives each reader useful context. Small steps keep the final result easy to check.\n\nPARA-03 Clear records support careful reading. The plain draft gives each reader useful context. Small steps keep the final result easy to check.\n\nPARA-04 Clear records support careful reading. The plain draft gives each reader useful context. Small steps keep the final result easy to check.\n\nPARA-05 Clear records support careful reading. The plain draft gives each reader useful context. Small steps keep the final result easy to check.\n\nPARA-06 Clear records support careful reading. The plain draft gives each reader useful context. Small steps keep the final result easy to check.",
  },
  {
    name: "pdf-table-in-column.pdf",
    markdown: "# A table within one column\n\nPARA-01 A short note starts the column. The local draft uses plain words. Each reader can check the final result.\n\n| Key | Count | Total |\n| --- | --- | --- |\n| T-1 | 4 | $1.25 |\n| T-2 | 8 | $2.50 |\n\nPARA-02 A short note follows the table. The local draft uses plain words. Each reader can check the final result.\n\nPARA-03 A short note starts the right column. The local draft uses plain words. Each reader can check the final result.\n\nPARA-04 A short note continues the right column. The local draft uses plain words. Each reader can check the final result.\n\nPARA-05 A short note ends the right column. The local draft uses plain words. Each reader can check the final result.",
  },
  {
    name: "pdf-poem-code.pdf",
    markdown: "# Lines and code\n\nRain rests on the quiet lane.\nLeaves turn beside the gate.\nA small bird waits.\n\nMorning fills the empty square.\nSoft light finds the window.\nThe street wakes slowly.\n\n```\ndef add(a, b):\n    return a + b\nx = add(2, 3)\ny = x * 2\n```",
  },
  {
    name: "pdf-two-column-bold.pdf",
    markdown: "# Two columns with inline emphasis\n\nPARA-01 A clear note records the local draft with simple words. Each reader can check the result.\n\nPARA-02 A clear note records the local draft with simple words. Each reader can check the result.\n\nPARA-03 A clear note records the local draft with simple words. Each reader can check the result.\n\nPARA-04 A clear note records the local draft with simple words. Each reader can check the result.\n\nPARA-05 A clear note records the local draft with simple words. Each reader can check the result.\n\nPARA-06 A clear note records the local draft with simple words. Each reader can check the result.",
  },
  {
    name: "pdf-three-column-prose.pdf",
    markdown: "# Three columns with inline emphasis\n\nPARA-01 A clear note records the local draft with simple words. Each reader can check the result.\n\nPARA-02 A clear note records the local draft with simple words. Each reader can check the result.\n\nPARA-03 A clear note records the local draft with simple words. Each reader can check the result.\n\nPARA-04 A clear note records the local draft with simple words. Each reader can check the result.\n\nPARA-05 A clear note records the local draft with simple words. Each reader can check the result.\n\nPARA-06 A clear note records the local draft with simple words. Each reader can check the result.\n\nPARA-07 A clear note records the local draft with simple words. Each reader can check the result.\n\nPARA-08 A clear note records the local draft with simple words. Each reader can check the result.\n\nPARA-09 A clear note records the local draft with simple words. Each reader can check the result.",
  },
  {
    name: "pdf-untagged-table.pdf",
    markdown: "# A neutral inventory table\n\n| Code | Item | Count | Total |\n| --- | --- | --- | --- |\n| ITEM-001 | Plain notebooks | 12 | $18.00 |\n| ITEM-002 | Blue folders | 7 | $14.25 |\n| ITEM-003 | Index cards | 105 | $9.50 |\n| ITEM-004 | Paper clips | 1 | $3.75 |\n| ITEM-005 | Blank labels | 28 | $21.00 |\n| ITEM-006 | Draft sheets | 64 | $32.50 |",
  },
  {
    name: "pdf-untagged-two-column.pdf",
    markdown: "# A neutral guide to reading columns\n\n## Left column\n\nThe first column contains a short paragraph with two wrapped lines.\n\n- First left item\n- Second left item\n\n## Right column\n\nThe second column contains another paragraph with two wrapped lines.\n\n- First right item\n- Second right item",
  },
  {
    name: "pdf-single-column.pdf",
    markdown: "# A simple document\n\nThis paragraph carries a well-known phrase across two printed lines.\n\nA second paragraph keeps whole-file words intact.\n\n## SECTION TWO\n\nA final paragraph follows the section heading.",
  },
  {
    name: "pdf-tagged-lists.pdf",
    markdown: "# A tagged reading guide\n\nRead these groups in their logical order.\n\n1. Prepare a clean page.\n2. Write a short note.\n3. Read the note aloud.\n4. Save the final draft.\n\n- Use clear words.\n- Keep each sentence short.\n- Check the final result.",
  },
];

describe("PDF fixture conversion", () => {
  it("extracts an untagged page without decoding image operators", async () => {
    documentProxyMock.mockResolvedValueOnce({
      numPages: 1,
      getPage: async () => ({
        getStructTree: async () => null,
        getTextContent: async () => ({
          styles: { Helvetica: { fontFamily: "Helvetica" } },
          items: [{
            str: "An untagged page.", transform: [12, 0, 0, 12, 40, 700],
            width: 102, height: 12, fontName: "Helvetica",
          }],
        }),
        getOperatorList: async () => { throw new Error("Text extraction needs no image operator decoding"); },
      }),
      destroy: async () => undefined,
    });
    const bytes = new Uint8Array(readFileSync(new URL("./fixtures/sample.pdf", import.meta.url)));
    const result = await convertToMarkdown("untagged.pdf", bytes);

    expect(result.markdown).toBe("An untagged page.");
    expect(result.title).toBe("untagged");
    expect(result.warnings).toEqual([]);
  });

  it("handles public marked-content events and non-text structure leaves without losing text", async () => {
    const item = (str: string, y: number) => ({
      str, transform: [12, 0, 0, 12, 40, y], width: str.length * 6, height: 12, fontName: "Helvetica",
    });
    const page = {
      getStructTree: async () => ({
        role: "Document",
        children: [
          { role: "H1", children: [{ type: "content", id: "p1_mc1" }] },
          { role: "P", children: [{ type: "content", id: "p1_mc2" }] },
          { type: "object", id: "p1_mc2" },
          { type: "annotation", id: "p1_mc1" },
          { type: "content", id: null },
        ],
      }),
      getTextContent: async () => ({
        styles: { Helvetica: { fontFamily: "Helvetica" } },
        items: [
          { type: "beginMarkedContent" },
          item("Loose prefix.", 500),
          { type: "beginMarkedContentProps", id: "p1_mc2" },
          item("Second paragraph.", 600),
          { type: "beginMarkedContent" },
          item("Nested continuation.", 584),
          { type: "beginMarkedContentProps", id: null },
          item("Another continuation.", 568),
          { type: "beginMarkedContentProps", id: "p1_mc1" },
          item("A tagged heading", 700),
          { type: "endMarkedContent" },
          item("Final continuation.", 552),
          { type: "endMarkedContent" },
          { type: "endMarkedContent" },
          { type: "endMarkedContent" },
          { type: "endMarkedContent" },
          item("Loose suffix.", 470),
        ],
      }),
      getOperatorList: async () => { throw new Error("Tagged text needs no image operator decoding"); },
    };
    documentProxyMock.mockResolvedValueOnce({
      numPages: 1,
      getPage: async () => page,
      destroy: async () => undefined,
    });
    const bytes = new Uint8Array(readFileSync(new URL("./fixtures/sample.pdf", import.meta.url)));
    const result = await convertToMarkdown("public-api.pdf", bytes);

    expect(result.markdown).toBe("# A tagged heading\n\nSecond paragraph. Nested continuation. Another continuation. Final continuation.\n\nLoose prefix.\n\nLoose suffix.");
    expect(result.title).toBe("public-api");
    expect(result.warnings).toEqual([]);
  });

  it("uses the existing text extractor when structure extraction fails", async () => {
    vi.mocked(getDocumentProxy).mockRejectedValueOnce(new Error("Structure extraction failed"));
    const bytes = new Uint8Array(readFileSync(new URL("./fixtures/sample.pdf", import.meta.url)));
    const result = await convertToMarkdown("sample.pdf", bytes);

    expect(result.markdown).toBe("Hello pdf world.");
    expect(result.title).toBe("sample");
    expect(result.warnings).toEqual([]);
  });

  it("keeps infographic columns, stats, steps, and closing paragraph in reading order", async () => {
    const directory = mkdtempSync(join(tmpdir(), "paperboy-infographic-fixture-"));
    const script = fileURLToPath(new URL("./fixtures/make-token-style-pdf.mjs", import.meta.url));
    const bytes = new Uint8Array(readFileSync(new URL("./fixtures/pdf-token-style-brief.pdf", import.meta.url)));
    try {
      execFileSync(process.execPath, [script, directory]);
      expect(new Uint8Array(readFileSync(join(directory, "pdf-token-style-brief.pdf")))).toEqual(bytes);
      execFileSync(process.execPath, [script, directory]);
      expect(new Uint8Array(readFileSync(join(directory, "pdf-token-style-brief.pdf")))).toEqual(bytes);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    const { markdown } = await convertToMarkdown("pdf-token-style-brief.pdf", bytes);
    const anchors = [
      "Smaller prompts", "A plain request", "Three habits", "Trimmed chat history",
      "Each one is small", "Cap the reply length", "41%", "27%", "22%", "10%",
      "Log the prompt size", "Compare size and quality", "Start with the two cheapest",
    ];
    const positions = anchors.map((anchor) => markdown.indexOf(anchor));
    for (const position of positions) expect(position).toBeGreaterThanOrEqual(0);
    const inversions = positions.reduce((count, position, index) =>
      count + positions.slice(index + 1).filter((next) => position > next).length, 0);
    expect(inversions).toBe(0);

    const rightStart = markdown.indexOf("Each one is small and easy to check.");
    for (const text of [
      "Three habits the team uses today.", "Short system notes", "Cached shared context", "Trimmed chat history",
    ]) {
      expect(markdown.indexOf(text)).toBeGreaterThanOrEqual(0);
      expect(markdown.indexOf(text)).toBeLessThan(rightStart);
    }
    expect(markdown).toContain([
      "Each one is small and easy to check.", "", "- Send diffs, not files", "- Name only the tools in use",
      "- Summarise old turns", "- Reuse stable prefixes", "- Cap the reply length",
    ].join("\n"));
    expect(markdown.match(/\b\d+%/g)).toEqual(["41%", "27%", "22%", "10%"]);
    expect(markdown.split("\n\n").at(-1)).toBe(
      "Start with the two cheapest practices this week, then repeat the measurement and keep only the changes that hold quality steady.",
    );
  });

  const cardFixtures = ["pdf-card-gutters.pdf", "pdf-card-bands.pdf"];

  it.each(cardFixtures)("keeps each multi-line card contiguous in %s", async (name) => {
    const bytes = new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
    const { markdown } = await convertToMarkdown(name, bytes);
    const plain = markdown.replace(/[#*`|\n]+/g, " ").replace(/\s+/g, " ");

    expect(plain).toContain("24 Amber trials Notes stored Checks passed");
    expect(plain).toContain("18 Blue trials Files sorted Tasks closed");
    expect(plain.indexOf("Checks passed")).toBeLessThan(plain.indexOf("Blue trials"));
  });

  it.each(cardFixtures)("recovers spaced heading words beside a distant label in %s", async (name) => {
    const bytes = new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
    const { markdown } = await convertToMarkdown(name, bytes);

    expect(markdown.split("\n").filter((line) => line.includes("HOW WE START"))).toEqual(["## HOW WE START"]);
    expect(markdown).toContain("\n\nONE SMALL LOCAL WORKFLOW");
  });

  it("keeps wrapped table labels beside all three numeric values", async () => {
    const bytes = new Uint8Array(readFileSync(new URL("./fixtures/pdf-card-table.pdf", import.meta.url)));
    const { markdown } = await convertToMarkdown("pdf-card-table.pdf", bytes);

    expect(markdown.split("\n").filter((line) => /All teams|Cedar group|Birch \(early|Other crews/.test(line))).toEqual([
      "| All teams | 14% | $240K | 3% |",
      "| Cedar group | 12% | $110K | 4% |",
      "| Birch (early, late | 16% | $80K | 5% |",
      "Other crews 18% $50K 6%",
    ]);
    expect(markdown).toContain("Group Cycle Budget Rate");
    expect(markdown).toContain("and winter crews)");
  });

  it("regenerates card and table fixtures with identical bytes on consecutive runs", () => {
    const directory = mkdtempSync(join(tmpdir(), "paperboy-card-fixtures-"));
    const script = fileURLToPath(new URL("./fixtures/make-card-bands-pdf.mjs", import.meta.url));
    try {
      for (let run = 0; run < 2; run++) {
        execFileSync(process.execPath, [script, directory]);
        for (const name of [...cardFixtures, "pdf-card-table.pdf"]) {
          expect(readFileSync(join(directory, name))).toEqual(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(fixtures)("converts $name with readable blocks in order", async ({ name, markdown }) => {
    const bytes = new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
    const result = await convertToMarkdown(name, bytes);

    expect(result.markdown).toBe(markdown);
    const paragraphs = [...result.markdown.matchAll(/PARA-(\d+)/g)].map((match) => Number(match[1]));
    for (let index = 1; index < paragraphs.length; index++) {
      expect(paragraphs[index]).toBeGreaterThan(paragraphs[index - 1]);
    }
    for (const line of result.markdown.split("\n")) {
      expect((line.match(/PARA-\d+/g) ?? []).length).toBeLessThanOrEqual(1);
    }
    expect(result.warnings).toEqual([]);
    expect(result.title).toBe(name.replace(/\.pdf$/, ""));
  });

  it("generates identical fixture bytes on consecutive runs", () => {
    const directory = mkdtempSync(join(tmpdir(), "paperboy-pdf-fixtures-"));
    const script = fileURLToPath(new URL("../scripts/make-pdf-fixtures.mjs", import.meta.url));
    try {
      execFileSync(process.execPath, [script, directory]);
      const first = fixtures.map(({ name }) => readFileSync(join(directory, name)));
      execFileSync(process.execPath, [script, directory]);
      fixtures.forEach(({ name }, index) => {
        const generated = readFileSync(join(directory, name));
        expect(generated.equals(first[index])).toBe(true);
        expect(generated.equals(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))).toBe(true);
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
