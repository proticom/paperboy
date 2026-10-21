// Synthetic one-page infographic brief (B30 / #31 regression fixture). No dependencies, no compression,
// so the bytes are identical on every Node version. Usage: node make-token-style-pdf.mjs <outdir>
import { mkdirSync, writeFileSync } from "node:fs"; import { resolve } from "node:path";
const out = resolve(process.argv[2] || "."); mkdirSync(out, { recursive: true });
const esc = (s) => s.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)").replaceAll("\u2022", "\\225");
const T = (s, x, y, size = 10, font = "F1") => `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${esc(s)}) Tj ET`;
const spaced = (s) => s.split(" ").map((w) => [...w].join(" ")).join("  "); // "WHERE WE" -> "W H E R E  W E"
const c = [];
c.push(T(spaced("// FIELD BRIEF"), 48, 752, 8, "F2"));
c.push(T("Smaller prompts, same answers", 48, 718, 26, "F2"));
c.push(T("418 to 233 tokens per request", 48, 688, 15, "F2"));
["A plain request often carries more context than the model needs. This brief lists the", "habits that already help, five practices to add, and a two-line way to measure", "the result without whole-file dumps or long tool descriptions."].forEach((l, i) => c.push(T(l, 48, 662 - i * 13)));
c.push(T(spaced("ALREADY IN PLAY"), 48, 610, 9, "F2"));
c.push(T("Three habits the team uses today.", 48, 594));
["\u2022 Short system notes", "\u2022 Cached shared context", "\u2022 Trimmed chat history"].forEach((l, i) => c.push(T(l, 48, 576 - i * 15)));
c.push(T(spaced("FIVE PRACTICES TO ADD"), 318, 610, 9, "F2"));
c.push(T("Each one is small and easy to check.", 318, 594));
["\u2022 Send diffs, not files", "\u2022 Name only the tools in use", "\u2022 Summarise old turns", "\u2022 Reuse stable prefixes", "\u2022 Cap the reply length"].forEach((l, i) => c.push(T(l, 318, 576 - i * 15)));
c.push(T(spaced("WHAT ONE REQUEST LOADS"), 48, 482, 9, "F2"));
[["41%", "system notes"], ["27%", "tool text"], ["22%", "history"], ["10%", "the question"]].forEach(([n, l], i) => { c.push(T(n, 48 + i * 130, 452, 20, "F2")); c.push(T(l, 48 + i * 130, 436, 8)); });
c.push(T(spaced("HOW TO MEASURE"), 48, 398, 9, "F2"));
["1. Log the prompt size", "2. Change one habit", "3. Run the same ten tasks", "4. Compare size and quality"].forEach((l, i) => c.push(T(l, 48, 382 - i * 20)));
c.push(T("same every time", 62, 371, 7, "F3"));
c.push(T(spaced("WHERE WE GO FROM HERE"), 48, 300, 9, "F2"));
["Start with the two cheapest practices this week, then repeat the measurement and", "keep only the changes that hold quality steady."].forEach((l, i) => c.push(T(l, 48, 284 - i * 13)));
const content = c.join("\n");
const objs = [
  "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>",
  `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`];
let pdf = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n"; const off = [];
objs.forEach((o, i) => { off.push(Buffer.byteLength(pdf, "latin1")); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
const x = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
writeFileSync(resolve(out, "pdf-token-style-brief.pdf"), Buffer.from(pdf, "latin1"));
