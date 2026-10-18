import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

function cellToMarkdown(
  cell: HTMLElement,
  service: TurndownService,
): string {
  const clone = cell.ownerDocument.createElement("td");
  clone.innerHTML = cell.innerHTML;
  for (const part of Array.from(clone.querySelectorAll("sup, br, address, article, aside, blockquote, dd, details, dialog, div, dl, dt, fieldset, figcaption, figure, footer, form, h1, h2, h3, h4, h5, h6, header, hgroup, hr, li, main, nav, ol, p, pre, section, summary, ul"))) {
    part.before(clone.ownerDocument.createTextNode(" "));
    part.after(clone.ownerDocument.createTextNode(" "));
  }
  for (const nested of Array.from(clone.querySelectorAll("table")).reverse()) {
    const parts = Array.from(nested.querySelectorAll("caption, th, td"))
      .filter((part) => part.closest("table") === nested)
      .map((part) => (part.textContent ?? "").replace(/\s+/g, " ").trim());
    nested.replaceWith(clone.ownerDocument.createTextNode(` ${parts.join(" · ")} `));
  }
  const html = service.turndown(clone.innerHTML);
  return html
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\|/g, "\\|");
}

function tableToMarkdown(
  table: HTMLTableElement,
  service: TurndownService,
): string {
  const rows = Array.from(table.rows).filter((row) => row.closest("table") === table);
  const matrix: (string | undefined)[][] = rows.map(() => []);
  const originatingColumns = new Set<number>();
  const originatingRows = new Set<number>();
  const originatingCells = rows.map(() => new Set<number>());
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    let column = 0;
    let groupEnd = r + 1;
    while (groupEnd < rows.length && rows[groupEnd]!.parentElement === row.parentElement) groupEnd++;
    Array.from(row.cells).filter((cell) => cell.closest("tr") === row).forEach((cell) => {
      while (matrix[r]![column] !== undefined) column++;
      const rowEnd = cell.rowSpan === 0 ? groupEnd : Math.min(groupEnd, r + cell.rowSpan);
      for (let y = r; y < rowEnd; y++) {
        for (let x = column; x < column + cell.colSpan; x++) matrix[y]![x] = "";
      }
      originatingColumns.add(column);
      originatingRows.add(r);
      originatingCells[r]!.add(column);
      matrix[r]![column] = cellToMarkdown(cell, service);
      column += cell.colSpan;
    });
  }
  if (matrix.length === 0 || matrix.every((row) => row.length === 0)) return "";

  const columns: number[] = [];
  const headerRow = rows.findIndex((_, row) => originatingRows.has(row));
  for (const column of Array.from(originatingColumns).sort((a, b) => a - b)) {
    const left = columns.at(-1);
    if (left !== undefined) {
      const matches = (row: number) => originatingCells[row]!.has(left) && originatingCells[row]!.has(column) &&
        Boolean(matrix[row]![column]) && matrix[row]![column] === matrix[row]![left];
      if (matches(headerRow) && rows.some((row, r) => r > headerRow && row.parentElement?.tagName !== "THEAD" && row.parentElement?.tagName !== "TFOOT" && matches(r)) &&
        matrix.every((row, r) => !originatingCells[r]!.has(column) || row[column] === (row[left] ?? ""))) continue;
    }
    columns.push(column);
  }
  let colCount = columns.length;
  const padded = matrix.map((row) => columns.map((column) => row[column] ?? "")).filter((_, row) => originatingRows.has(row));

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

export function wrapTableFragment(html: string): string {
  const orphan = html.match(/^\s*(?:<!--[\s\S]*?-->\s*)*<(tbody|thead|tfoot|tr|td|th|caption|colgroup|col)\b/i)?.[1]?.toLowerCase();
  if (!orphan) return html;
  if (orphan === "td" || orphan === "th") html = `<tr>${html}</tr>`;
  return `<table>${html}</table>`;
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
