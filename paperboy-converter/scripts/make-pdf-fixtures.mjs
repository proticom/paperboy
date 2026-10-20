import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDirectory = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL("../tests/fixtures/", import.meta.url));

function makePdf(build) {
  const objects = [];
  const reserve = () => objects.push("");
  const set = (id, value) => { objects[id - 1] = value; };
  const add = (value) => { const id = reserve(); set(id, value); return id; };
  const stream = (value) => `<< /Length ${Buffer.byteLength(value, "latin1")} >>\nstream\n${value}\nendstream`;
  const catalog = reserve();
  const pages = reserve();
  const page = reserve();
  const regular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const result = build({ add, set, reserve, page, stream });
  const contents = add(stream(result.content));
  set(catalog, `<< /Type /Catalog /Pages ${pages} 0 R ${result.catalog ?? ""} >>`);
  set(pages, `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`);
  set(page, `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R${result.fonts ? ` ${result.fonts}` : ""} >> >> /Contents ${contents} 0 R ${result.page ?? ""} >>`);
  let output = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(output, "latin1"));
    output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
}

function text(value, x, y, size = 12, bold = false, font = bold ? "F2" : "F1") {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)").replaceAll("•", "\\225");
  return `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escaped}) Tj ET`;
}

const twoColumn = makePdf(() => ({ content: [
  text("A neutral guide to reading columns", 48, 744, 24, true),
  text("Left column", 48, 690, 16, true),
  text("The first column contains a short", 48, 664),
  text("paragraph with two wrapped lines.", 48, 648),
  text("• First left item", 48, 620),
  text("• Second left item", 48, 600),
  text("Right column", 330, 690, 16, true),
  text("The second column contains another", 330, 664),
  text("paragraph with two wrapped lines.", 330, 648),
  text("• First right item", 330, 620),
  text("• Second right item", 330, 600),
].join("\n") }));

const singleColumn = makePdf(() => ({ content: [
  text("A simple document", 48, 744, 24, true),
  text("This paragraph carries a well-", 48, 702),
  text("known phrase across two printed lines.", 48, 686),
  text("A second paragraph keeps whole-file words intact.", 48, 648),
  text("S E C T I O N", 48, 602, 16, true),
  text("T W O", 162, 602, 16, true),
  text("A final paragraph follows the section heading.", 48, 572),
].join("\n") }));

const untaggedTable = makePdf(() => {
  const rows = [
    ["ITEM-001", "Plain notebooks", "12", "$18.00"],
    ["ITEM-002", "Blue folders", "7", "$14.25"],
    ["ITEM-003", "Index cards", "105", "$9.50"],
    ["ITEM-004", "Paper clips", "1", "$3.75"],
    ["ITEM-005", "Blank labels", "28", "$21.00"],
    ["ITEM-006", "Draft sheets", "64", "$32.50"],
  ];
  const numericX = (value, right) => right - [...value].reduce((width, character) => width + (character === "." ? 3.336 : 6.672), 0);
  return { content: [
    text("A neutral inventory table", 48, 744, 24, true),
    text("Code", 48, 700, 12, true), text("Item", 170, 700, 12, true),
    text("Count", 396, 700, 12, true), text("Total", 532, 700, 12, true),
    ...rows.flatMap(([code, item, count, total], index) => {
      const y = 674 - index * 26;
      return [text(code, 48, y), text(item, 170, y), text(count, numericX(count, 430), y), text(total, numericX(total, 560), y)];
    }),
  ].join("\n") };
});

const taggedLists = makePdf(({ set, reserve, page }) => {
  const root = reserve();
  const parents = reserve();
  const parentByMcid = [];
  let nextMcid = 0;
  const marked = (role, parent, drawing) => {
    const id = reserve();
    const mcid = nextMcid++;
    parentByMcid[mcid] = id;
    set(id, `<< /Type /StructElem /S /${role} /P ${parent} 0 R /Pg ${page} 0 R /K ${mcid} >>`);
    return { id, drawing: `/${role} << /MCID ${mcid} >> BDC\n${drawing}\nEMC` };
  };
  const heading = marked("H1", root, text("A tagged reading guide", 48, 744, 24, true));
  const paragraph = marked("P", root, text("Read these groups in their logical order.", 48, 710));
  const ordered = reserve();
  const bullets = reserve();
  const drawList = (parent, labels, bodies, y) => {
    const children = [];
    const drawings = [];
    bodies.forEach((body, index) => {
      const item = reserve();
      children.push(item);
      const label = marked("Lbl", item, text(labels[index], 48, y - index * 28));
      const content = marked("LBody", item, text(body, 72, y - index * 28));
      set(item, `<< /Type /StructElem /S /LI /P ${parent} 0 R /K [${label.id} 0 R ${content.id} 0 R] >>`);
      drawings.push(label.drawing, content.drawing);
    });
    set(parent, `<< /Type /StructElem /S /L /P ${root} 0 R /K [${children.map(id => `${id} 0 R`).join(" ")}] >>`);
    return drawings;
  };
  const orderedDrawings = drawList(ordered, ["1.", "2.", "3.", "4."], ["Prepare a clean page.", "Write a short note.", "Read the note aloud.", "Save the final draft."], 666);
  const bulletDrawings = drawList(bullets, ["•", "•", "•"], ["Use clear words.", "Keep each sentence short.", "Check the final result."], 526);
  set(root, `<< /Type /StructTreeRoot /K [${heading.id} 0 R ${paragraph.id} 0 R ${ordered} 0 R ${bullets} 0 R] /ParentTree ${parents} 0 R /ParentTreeNextKey 1 >>`);
  set(parents, `<< /Nums [0 [${parentByMcid.map(id => `${id} 0 R`).join(" ")}]] >>`);
  return {
    content: [...orderedDrawings, ...bulletDrawings, heading.drawing, paragraph.drawing].join("\n"),
    catalog: `/StructTreeRoot ${root} 0 R /MarkInfo << /Marked true >> /Lang (en-US)`,
    page: "/StructParents 0",
  };
});

const lowercase = "abcdefghijklmnopqrstuvwxyz";
const regularWidths = Object.fromEntries([...lowercase].map((letter, index) => [letter, [556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500][index]]));
const boldWidths = Object.fromEntries([...lowercase].map((letter, index) => [letter, [556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500][index]]));

function runWidth(value, size, bold) {
  return [...value].reduce((width, character) => {
    const units = (bold ? boldWidths : regularWidths)[character]
      ?? ({ " ": 278, ".": 278, "-": 333, A: 667, C: 722, E: 667, P: 667, R: 722, S: 667, T: 611 })[character]
      ?? (/\d/.test(character) ? 556 : undefined);
    if (units === undefined) throw new Error(`Missing Helvetica width for ${character}`);
    return width + units * size / 1000;
  }, 0);
}

function inlineProse(columns) {
  const size = columns === 2 ? 12 : 10;
  const starts = columns === 2 ? [48, 330] : [48, 230, 412];
  return makePdf(() => {
    const content = [text(`${columns === 2 ? "Two" : "Three"} columns with inline emphasis`, 48, 744, 24, true)];
    for (let paragraph = 0; paragraph < 3; paragraph++) {
      for (let line = 0; line < 3; line++) {
        for (let column = 0; column < columns; column++) {
          const number = String(column * 3 + paragraph + 1).padStart(2, "0");
          const runs = [
            [`PARA-${number} A `, "clear", " note records"],
            ["the ", "local", " draft with simple words."],
            ["Each ", "reader", " can check the result."],
          ][line];
          let x = starts[column];
          const y = 690 - paragraph * 70 - line * (columns === 2 ? 16 : 14);
          runs.forEach((run, index) => {
            const bold = index === 1;
            content.push(text(run, Number(x.toFixed(3)), y, size, bold));
            x += runWidth(run, size, bold);
          });
        }
      }
    }
    return { content: content.join("\n") };
  });
}

const twoColumnBold = inlineProse(2);
const threeColumnProse = inlineProse(3);

const gutter14 = makePdf(() => {
  const content = [text("Two columns with a narrow gutter", 48, 744, 24, true)];
  for (let column = 0; column < 2; column++) {
    for (let paragraph = 0; paragraph < 3; paragraph++) {
      const number = String(column * 3 + paragraph + 1).padStart(2, "0");
      const lines = [
        `PARA-${number} Clear records support careful reading.`,
        "The plain draft gives each reader useful context.",
        "Small steps keep the final result easy to check.",
      ];
      lines.forEach((line, index) => {
        const words = line.split(" ");
        const gap = (251 - words.reduce((sum, word) => sum + runWidth(word, 10, false), 0)) / (words.length - 1);
        let x = column === 0 ? 48 : 313;
        for (const word of words) {
          content.push(text(word, Number(x.toFixed(3)), 690 - paragraph * 70 - index * 14, 10));
          x += runWidth(word, 10, false) + gap;
        }
      });
    }
  }
  return { content: content.join("\n") };
});

const tableInColumn = makePdf(() => {
  const content = [text("A table within one column", 48, 744, 24, true)];
  const paragraph = (number, x, y, first) => [
    `PARA-${number} A short note ${first}.`,
    "The local draft uses plain words.",
    "Each reader can check the final result.",
  ].forEach((line, index) => content.push(text(line, x, y - index * 14, 10)));
  paragraph("01", 48, 690, "starts the column");
  [["Key", "Count", "Total"], ["T-1", "4", "$1.25"], ["T-2", "8", "$2.50"]].forEach((row, index) => {
    row.forEach((cell, column) => content.push(text(cell, [48, 150, 218][column], 620 - index * 14, 10, index === 0)));
  });
  paragraph("02", 48, 540, "follows the table");
  paragraph("03", 330, 690, "starts the right column");
  paragraph("04", 330, 620, "continues the right column");
  paragraph("05", 330, 550, "ends the right column");
  return { content: content.join("\n") };
});

const poemCode = makePdf(({ add }) => {
  const courier = add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
  return {
    fonts: `/F3 ${courier} 0 R`,
    content: [
      text("Lines and code", 48, 744, 24, true),
      ...["Rain rests on the quiet lane.", "Leaves turn beside the gate.", "A small bird waits."].map((line, index) => text(line, 48, 690 - index * 14, 10)),
      ...["Morning fills the empty square.", "Soft light finds the window.", "The street wakes slowly."].map((line, index) => text(line, 48, 620 - index * 14, 10)),
      ...["def add(a, b):", "    return a + b", "x = add(2, 3)", "y = x * 2"].map((line, index) => text(line, 48, 530 - index * 14, 10, false, "F3")),
    ].join("\n"),
  };
});

mkdirSync(fixtureDirectory, { recursive: true });
for (const [name, bytes] of Object.entries({
  "pdf-untagged-two-column.pdf": twoColumn,
  "pdf-single-column.pdf": singleColumn,
  "pdf-tagged-lists.pdf": taggedLists,
  "pdf-untagged-table.pdf": untaggedTable,
  "pdf-two-column-bold.pdf": twoColumnBold,
  "pdf-three-column-prose.pdf": threeColumnProse,
  "pdf-two-column-gutter14.pdf": gutter14,
  "pdf-table-in-column.pdf": tableInColumn,
  "pdf-poem-code.pdf": poemCode,
})) {
  writeFileSync(resolve(fixtureDirectory, name), bytes);
}
