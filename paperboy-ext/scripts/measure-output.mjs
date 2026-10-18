import fs from "node:fs";
import { createRequire } from "node:module";
import { DOMParser } from "linkedom";
import MarkdownIt from "markdown-it";
import { convertHtmlToMarkdown } from "../lib/convert.mjs";

const require = createRequire(import.meta.url);
const Readability = require("../lib/readability.js");
const [file, url, flag, selector] = process.argv.slice(2);
if (!file || !url || (flag && (flag !== "--pick" || !selector))) {
  throw new Error("Usage: measure-output.mjs <file.html> <pageUrl> [--pick <css selector>]");
}
const html = fs.readFileSync(file, "utf8");
const document = new DOMParser().parseFromString(html, "text/html");
// Metrics count serialized shadow code too, independently of conversion behavior.
function flattenTemplates(root) {
  for (const template of root.querySelectorAll('template[shadowrootmode="open"]')) {
    flattenTemplates(template.content);
    template.replaceWith(template.content);
  }
}
const picked = selector ? document.querySelector(selector) : null;
if (selector && !picked) throw new Error(`No element matches ${selector}`);
const conversionHtml = picked ? picked.outerHTML : html;
flattenTemplates(document);
const input = picked || document;
const result = convertHtmlToMarkdown({
  html: conversionHtml,
  url,
  title: document.title,
  fromPicker: Boolean(selector),
}, { DOMParser, Readability });
const fences = new MarkdownIt().parse(result.markdown, {}).filter((token) => token.type === "fence");
const compact = (text) => text.replace(/\s+/g, "");
const outputLines = result.markdown.split("\n").map(compact);
const pres = [...input.querySelectorAll("pre")];
if (picked?.localName === "pre") pres.unshift(picked);
const collapsed = pres.filter((pre) => {
  const source = (pre.querySelector("code") || pre).textContent;
  const multiline = source.trim().split("\n").filter((line) => line.trim()).length > 1
    || pre.querySelectorAll(".cm-line, .line, [data-line], div, p").length > 1;
  const code = compact(source);
  return multiline && code.length > 20 && outputLines.some((line) => line.includes(code));
}).length;
console.log(JSON.stringify({
  inputPreCount: pres.length,
  fencedBlockCount: fences.length,
  linesInsideFences: fences.reduce((sum, token) => sum + token.content.replace(/\n$/, "").split("\n").length, 0),
  copyLines: result.markdown.split("\n").filter((line) => /^(?:Copy|Copied|Copy code|Copy to clipboard)$/i.test(line.trim())).length,
  collapsedBlocks: collapsed,
  outputLength: result.markdown.length,
}, null, 2));
