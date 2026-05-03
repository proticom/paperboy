import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

function cellToMarkdown(
  cell: HTMLElement,
  service: TurndownService,
): string {
  // Avoid recursing into nested tables; flatten them to plain text.
  const html = cell.querySelector("table")
    ? (cell.textContent ?? "")
    : service.turndown(cell.innerHTML);
  return html
    .replace(/\s+/g, " ")
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
  });

  service.use(gfm);
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
