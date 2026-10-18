import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const copyLabel = /^(?:copy|copied|copy code|copy to clipboard|copied to clipboard)[.!]?$/i;
const lineWrapper = /^(?:DIV|P|LI|PRE)$/;
const toolbarSelector = "button, label, [role=button], [role=status], [aria-live], [hidden], .sr-only, .visually-hidden, [class*=copy-button]";

function isCopyControl(node: HTMLElement): boolean {
  if (node.tagName.toLowerCase().endsWith("-copy-button") || node.matches("[class*=copy-button]")) return true;
  const text = node.textContent?.trim() ?? "";
  const label = node.getAttribute("aria-label") || node.getAttribute("title") || text;
  return node.matches(toolbarSelector) && (copyLabel.test(text) || copyLabel.test(label));
}

function isCodeToolbar(node: HTMLElement): boolean {
  const adjacentPre = [node.previousElementSibling, node.nextElementSibling]
    .find((sibling) => sibling?.nodeName === "PRE");
  if (adjacentPre && Array.from(node.querySelectorAll<HTMLElement>("*")).some(isCopyControl)) {
    const header = node.ownerDocument.createElement("div");
    header.innerHTML = node.innerHTML;
    for (const control of Array.from(header.querySelectorAll<HTMLElement>("*"))) {
      if (isCopyControl(control)) control.remove();
    }
    const language = header.textContent?.trim() ?? "";
    const authoredLabel = header.querySelector(".language-name")?.textContent?.trim();
    if (language && (language === authoredLabel || language === codeLanguage(adjacentPre))) return true;
  }
  if (!isCopyControl(node)) return false;
  if (node.closest("pre")) return true;
  const ownsPre = (element: Element) => Array.from(element.children)
    .some((child) => child.nodeName === "PRE");
  for (const sibling of [node.previousElementSibling, node.nextElementSibling]) {
    if (sibling && (sibling.nodeName === "PRE" || ownsPre(sibling))) return true;
  }
  // A wrapper owns its immediate pre, rather than every pre in a page subtree.
  let wrapper = node.parentElement;
  while (wrapper && !wrapper.matches("body, main, article, section, p")) {
    if (ownsPre(wrapper)) return true;
    wrapper = wrapper.parentElement;
  }
  return false;
}

function codeLanguage(pre: Element): string {
  for (const node of [pre, pre.querySelector("code"), pre.parentElement]) {
    if (!node) continue;
    const data = node.getAttribute("data-language");
    const classes = node.getAttribute("class") ?? "";
    const explicit = classes.match(/(?:^|\s)(?:lang-|highlight-source-|brush:\s*)([\w#+.-]+)/i)?.[1];
    const language = node.matches("code.hljs") ? "" : classes.match(/(?:^|\s)language-([\w#+.-]+)/i)?.[1];
    const sandpack = node === pre ? classes.match(/(?:^|\s)sp-(javascript|typescript|jsx|tsx|css|html|json|python|bash|shell|vue|svelte|markdown|yaml)(?=\s|$)/i)?.[1] : "";
    const hint = data || explicit || language || sandpack || (node === pre && /(?:^|\s)default(?:\s|$)/i.test(classes) ? "default" : "");
    if (hint && /^[\w#+.-]+$/.test(hint)) return /^(?:none|default)$/i.test(hint) ? "" : hint;
  }
  return "";
}

function codeText(node: Node): string {
  if (node.nodeType === 3) return node.nodeValue ?? "";
  if (node.nodeType !== 1) return "";
  if (!("tagName" in node) || !("getAttribute" in node)) return "";
  // DOMs used by the CLI and browsers have different HTMLElement constructors.
  const element = node as HTMLElement;
  if (element.matches("script, style, noscript") || isCodeToolbar(element)) return "";
  if (element.tagName === "BR") return "\n";
  let text = "";
  for (const child of Array.from(element.childNodes)) {
    const part = codeText(child);
    const childElement = child.nodeType === 1 ? child as HTMLElement : null;
    const isLine = childElement && (lineWrapper.test(childElement.nodeName)
      || childElement.matches(".line, .cm-line, .token-line, .code-line, .view-line, .shiki-line, [data-line], [style*=\"display: block\"], [style*=\"display:block\"]"));
    if (isLine && !part && Array.from(childElement.querySelectorAll<HTMLElement>(toolbarSelector)).some(isCodeToolbar)) continue;
    if (isLine && text && !text.endsWith("\n")) text += "\n";
    text += part;
    if (isLine && (!part || !text.endsWith("\n"))) text += "\n";
  }
  return text;
}

function fencedCode(pre: HTMLElement): string {
  const code = codeText(pre).replace(/\r\n?/g, "\n").replace(/\n$/, "");
  if (!code.trim()) return "";
  if (pre.closest("td, th")) {
    return code.split("\n").map((line) => {
      if (!line) return "";
      const ticks = "`".repeat(Math.max(0, ...Array.from(line.matchAll(/`+/g), (match) => match[0].length)) + 1);
      const pad = /^`|`$|^ .* $/.test(line) ? " " : "";
      return `${ticks}${pad}${line}${pad}${ticks}`;
    }).join("<br>");
  }
  const longest = Math.max(2, ...Array.from(code.matchAll(/`+/g), (match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  return `\n\n${fence}${codeLanguage(pre)}\n${code}\n${fence}\n\n`;
}

/** Preserve code before article extraction can discard highlighter markup. */
export function prepareCodeBlocks(root: ParentNode): void {
  for (const pre of Array.from(root.querySelectorAll<HTMLElement>("pre"))) {
    const language = codeLanguage(pre);
    const text = codeText(pre);
    if (language) pre.setAttribute("data-language", language);
    pre.textContent = text;
  }
  const toolbars = Array.from(root.querySelectorAll<HTMLElement>("*")).filter(isCodeToolbar);
  toolbars.forEach((node) => node.remove());
}

function cellToMarkdown(
  cell: HTMLElement,
  service: TurndownService,
): string {
  // Avoid recursing into nested tables; flatten them to plain text.
  const html = cell.querySelector("table")
    ? (cell.textContent ?? "")
    : service.turndown(cell);
  return html
    .replace(cell.querySelector("pre") ? /\r?\n/g : /\s+/g, " ")
    .trim()
    .replace(/\|/g, "\\|");
}

function tableToMarkdown(
  table: HTMLTableElement,
  service: TurndownService,
): string {
  const matrix: string[][] = [];
  for (let r = 0; r < table.rows.length; r++) {
    const row = table.rows[r]!;
    const cells = Array.from(row.cells).map((cell) =>
      cellToMarkdown(cell as HTMLElement, service),
    );
    if (cells.length > 0) matrix.push(cells);
  }
  if (matrix.length === 0) return "";

  let colCount = Math.max(...matrix.map((row) => row.length));
  const padded = matrix.map((row) => {
    const next = [...row];
    while (next.length < colCount) next.push("");
    return next;
  });

  // Drop trailing columns that are entirely empty across every row.
  while (colCount > 1 && padded.every((row) => row[colCount - 1] === "")) {
    padded.forEach((row) => row.pop());
    colCount -= 1;
  }

  const header = padded[0]!;
  const sep = Array.from({ length: colCount }, () => "---");
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...padded.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ];
  return `\n\n${lines.join("\n")}\n\n`;
}

export function createTurndownService(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    blankReplacement(content, node) {
      if (node.nodeName === "PRE") return fencedCode(node);
      if (node.querySelector("pre")) return content;
      return "isBlock" in node && node.isBlock ? "\n\n" : "";
    },
  });

  service.use(gfm);
  service.addRule("unwrapHighlightedCode", {
    filter(node) {
      return node.nodeName === "DIV" && /highlight-(?:text|source)-[a-z0-9]+/.test(node.className)
        && node.firstChild?.nodeName === "PRE";
    },
    replacement(content) {
      return content;
    },
  });
  service.addRule("preToFencedCode", {
    filter: "pre",
    replacement(_content, node) {
      return fencedCode(node);
    },
  });
  service.addRule("removeCodeToolbar", {
    filter(node) {
      return isCodeToolbar(node);
    },
    replacement() {
      return "";
    },
  });
  service.addRule("removeScriptLikeTags", {
    filter(node) {
      const tag = node.nodeName;
      return tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT";
    },
    replacement() {
      return "";
    },
  });

  // Permalink anchors inside headings (docs sites wrap heading text in a self-link).
  // Drop the link, keep the text.
  service.addRule("stripHeadingAnchor", {
    filter(node) {
      if (node.nodeName !== "A") return false;
      const parent = node.parentNode as HTMLElement | null;
      if (!parent || !/^H[1-6]$/.test(parent.nodeName)) return false;
      const href = (node as HTMLElement).getAttribute("href") ?? "";
      if (href.startsWith("#")) return true;
      const hashIndex = href.indexOf("#");
      if (hashIndex < 0) return false;
      const fragment = href.slice(hashIndex + 1);
      const headingId = parent.id || "";
      return Boolean(headingId) && fragment === headingId;
    },
    replacement(content) {
      return content;
    },
  });

  // Replace turndown-plugin-gfm's table handler. Cell content is converted via the
  // service so links/bold/italic survive, then whitespace is collapsed so cells
  // never span multiple lines (which would break Markdown table syntax).
  service.addRule("tableToMarkdown", {
    filter(node) {
      return node.nodeName === "TABLE";
    },
    replacement(_content, node) {
      return tableToMarkdown(node as HTMLTableElement, service);
    },
  });

  // Drop cart / CSRF forms so compare widgets do not emit raw <form> HTML.
  service.addRule("unwrapForm", {
    filter: ["form"],
    replacement(content) {
      return content ? `\n\n${content}\n\n` : "";
    },
  });

  return service;
}
