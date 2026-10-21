import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const directory = resolve(process.argv[2] || ".");
mkdirSync(directory, { recursive: true });
const escape = (value) => value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
const text = (value, x, y, size = 10, font = "F1") =>
  `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escape(value)}) Tj ET`;
const section = [
  text("A field guide to local projects", 48, 750, 24, "F2"),
  text("This neutral example describes small projects and the notes that help teams", 48, 710),
  text("compare their progress before they choose the next simple task to complete.", 48, 696),
  ...["The first team keeps a clear record.", "Their notes describe each small task.", "A short review closes the local work."].map((line, i) => text(line, 48, 650 - i * 14)),
  ...["The second team checks each record.", "Their list names the next plain step.", "A final check confirms the work done."].map((line, i) => text(line, 330, 650 - i * 14)),
];
const cards = [
  text("Project results", 48, 550, 9, "F2"),
  text("24", 48, 526, 20, "F2"),
  text("18", 330, 526, 20, "F2"),
  ...["Amber trials", "Notes stored", "Checks passed"].map((line, i) => text(line, 48, 500 - i * 14)),
  ...["Blue trials", "Files sorted", "Tasks closed"].map((line, i) => text(line, 330, 500 - i * 14)),
  text("H O W", 48, 390, 9, "F2"),
  text("W E", 90, 390, 9, "F2"),
  text("S T A R T", 122, 390, 9, "F2"),
  text("ONE SMALL LOCAL WORKFLOW", 330, 390, 9, "F2"),
];

function makePdf(lines) {
  const content = lines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
  const offsets = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

writeFileSync(resolve(directory, "pdf-card-gutters.pdf"), makePdf([...section, ...cards]));
const summary = text("A shared summary across the local project groups", 48, 574, 12, "F2");
writeFileSync(resolve(directory, "pdf-card-bands.pdf"), makePdf([...section, summary, ...cards]));

const table = [
  text("Group", 48, 550),
  text("Cycle", 330, 550), text("Budget", 405, 550), text("Rate", 490, 550),
  text("(units)", 405, 536),
  ...[
    ["All teams", "14%", "$240K", "3%", 516],
    ["Cedar group", "12%", "$110K", "4%", 496],
    ["Birch (early, late", "16%", "$80K", "5%", 476],
    ["Other crews", "18%", "$50K", "6%", 440],
  ].flatMap(([label, cycle, budget, rate, y]) => [
    text(label, 48, y), text(cycle, 330, y), text(budget, 405, y), text(rate, 490, y),
  ]),
  text("and winter crews)", 48, 462),
];
writeFileSync(resolve(directory, "pdf-card-table.pdf"), makePdf([...section, summary, ...table]));
