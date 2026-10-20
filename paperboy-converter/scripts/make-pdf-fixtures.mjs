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
  set(page, `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${contents} 0 R ${result.page ?? ""} >>`);
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

function text(value, x, y, size = 12, bold = false) {
  const escaped = value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)").replaceAll("•", "\\225");
  return `BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escaped}) Tj ET`;
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
  text("This paragraph carries informa-", 48, 702),
  text("tion across two printed lines.", 48, 686),
  text("A second paragraph keeps whole-file words intact.", 48, 648),
  text("S E C T I O N", 48, 602, 16, true),
  text("T W O", 162, 602, 16, true),
  text("A final paragraph follows the section heading.", 48, 572),
].join("\n") }));

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

mkdirSync(fixtureDirectory, { recursive: true });
for (const [name, bytes] of Object.entries({
  "pdf-untagged-two-column.pdf": twoColumn,
  "pdf-single-column.pdf": singleColumn,
  "pdf-tagged-lists.pdf": taggedLists,
})) {
  writeFileSync(resolve(fixtureDirectory, name), bytes);
}
