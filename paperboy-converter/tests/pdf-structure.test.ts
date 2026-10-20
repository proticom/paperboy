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

  it.each(fixtures)("converts $name with readable blocks in order", async ({ name, markdown }) => {
    const bytes = new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
    const result = await convertToMarkdown(name, bytes);

    expect(result.markdown).toBe(markdown);
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
