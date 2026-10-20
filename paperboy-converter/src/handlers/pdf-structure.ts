export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
  markedId?: string;
}

export interface PdfStructureNode {
  role: string;
  children: readonly (PdfStructureNode | { kind: "content"; id: string })[];
}

export interface PdfHeadingContext {
  isFirstTextPage: boolean;
  largestFontSize: number;
}

interface Line {
  items: PdfTextItem[];
  x: number;
  y: number;
  right: number;
  size: number;
  text: string;
  tracked: boolean;
}

type Block =
  | { kind: "text"; items: readonly PdfTextItem[]; role: "flow" | "paragraph" | "heading" | "explicit-heading"; level?: number }
  | { kind: "markdown"; markdown: string };

const listStart = /^(?:([•◦▪\-–*·])|((?:\d+|[a-zA-Z])[.)]))\s+(.+)$/u;

function isLetterSpaced(text: string): boolean {
  const tokens = text.trim().split(/ +/);
  const letters = tokens.filter((token) => /^\p{L}$/u.test(token));
  return letters.length >= 3 && tokens.every((token) => /^\p{L}$/u.test(token) || /^[\p{P}\p{S}]$/u.test(token))
    && text.replace(/ /g, "").length <= 60;
}

export function collapseLetterSpacing(text: string): string {
  if (!isLetterSpaced(text)) return text;
  return text.replace(/(?<!\S)(\p{P})(?: \1)+(?!\S)/gu, (run) => run.replace(/ /g, ""))
    .replace(/(?<!\S)\p{L}(?: \p{L})+(?!\S)/gu, (run) => run.replace(/ /g, ""))
    .replace(/ {2,}/g, " ");
}

export function reflowLines(lines: readonly string[]): string {
  return lines.reduce((text, line) => {
    const next = line.trim();
    if (!text) return next;
    if (/\u00ad$/u.test(text)) return text.slice(0, -1) + next;
    if (/[\p{L}][\-\u2010]$/u.test(text) && /^\p{L}/u.test(next)) return text + next;
    return `${text} ${next}`;
  }, "");
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 10;
}

function itemSize(item: PdfTextItem): number {
  return item.height || 10;
}

function lineText(items: readonly PdfTextItem[], allowTracking = true): { text: string; tracked: boolean } {
  const visible = items.filter((item) => item.text.trim());
  const spacedPieces = visible.some((item) => isLetterSpaced(item.text));
  const allGlyphs = visible.length >= 3 && visible.every((item) => /^\p{L}$/u.test(item.text));
  const gaps = visible.slice(1).map((item, i) => item.x - (visible[i].x + visible[i].width));
  const typicalGap = median(gaps.filter((gap) => gap > 0));
  let text = "";
  visible.forEach((item, index) => {
    const previous = visible[index - 1];
    if (previous) {
      const gap = item.x - (previous.x + previous.width);
      if (allGlyphs) text += gap > Math.max(itemSize(item) * 0.35, typicalGap * 1.6) ? "  " : " ";
      else if (gap > itemSize(item) * 0.12 || /\s$/.test(previous.text) || /^\s/.test(item.text)) {
        text += spacedPieces ? "  " : " ";
      }
    }
    text += item.text.trim();
  });
  const tracked = allowTracking && isLetterSpaced(text);
  if (!tracked) {
    // Separate glyph items supply tracking evidence that a prose regex cannot.
    for (let start = 0; start < visible.length;) {
      let end = start;
      while (end < visible.length && /^\p{L}$/u.test(visible[end].text)
        && (end === start || visible[end].x - visible[end - 1].x - visible[end - 1].width < itemSize(visible[end]) * 0.8)) end++;
      if (end - start >= 3) {
        const glyphs = visible.slice(start, end).map((item) => item.text.trim());
        text = text.replace(glyphs.join(" "), glyphs.join(""));
      }
      start = Math.max(end, start + 1);
    }
  }
  return { text: (tracked ? collapseLetterSpacing(text) : text).replace(/ {2,}/g, " ").trim(), tracked };
}

function makeLine(items: PdfTextItem[], allowTracking = true): Line {
  return {
    items, x: items[0].x, y: Math.max(...items.map((item) => item.y)),
    right: Math.max(...items.map((item) => item.x + item.width)),
    size: median(items.map(itemSize)), ...lineText(items, allowTracking),
  };
}

function baselineRows(items: readonly PdfTextItem[]): PdfTextItem[][] {
  const rows: PdfTextItem[][] = [];
  for (const item of [...items].filter((item) => item.text.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - item.y) <= Math.max(2, Math.min(itemSize(row[0]), itemSize(item)) * 0.25)) row.push(item);
    else rows.push([item]);
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}

function splitRow(row: PdfTextItem[]): Line[] {
  const segments: PdfTextItem[][] = [];
  for (const item of row) {
    const segment = segments[segments.length - 1];
    const previous = segment?.[segment.length - 1];
    if (previous && item.x - (previous.x + previous.width) <= Math.max(12, itemSize(item) * 2)) segment.push(item);
    else segments.push([item]);
  }
  const allowTracking = isLetterSpaced(row.map((item) => item.text.trim()).join("  "));
  return segments.map((items) => makeLine(items, allowTracking));
}

function groupLines(items: readonly PdfTextItem[]): Line[] {
  return baselineRows(items).flatMap(splitRow);
}

function alignedStarts(left: readonly PdfTextItem[], right: readonly PdfTextItem[], tolerance: number): number {
  let i = 0, j = 0, count = 0;
  while (i < left.length && j < right.length) {
    const delta = left[i].x - right[j].x;
    if (Math.abs(delta) <= tolerance) { count++; i++; j++; }
    else if (delta < 0) i++;
    else j++;
  }
  return count;
}

function gridMarkdown(rows: PdfTextItem[][], bodySize: number): string | undefined {
  const template = rows.reduce((best, row) => row.length > best.length ? row : best, rows[0]);
  // Two prose columns contain sustained multi-word lines, rather than short cells.
  if (template.length === 2 && rows.every((row) => row.length === 2 && row.every((item) => item.text.trim().split(/\s+/).length >= 2))) return undefined;
  const boundaries = template.slice(1).map((item, i) => (template[i].x + template[i].width + item.x) / 2);
  const cells = rows.map((row) => {
    const columns: PdfTextItem[][] = Array.from({ length: template.length }, () => []);
    let column = 0;
    for (const item of row) {
      while (column < boundaries.length && item.x >= boundaries[column] - bodySize * 0.2) column++;
      columns[column].push(item);
    }
    return columns.map((items) => items.length ? lineText(items).text : "");
  });
  const clean = cells.every((row) => row.every(Boolean));
  if (!clean) return rows.map((row) => lineText(row).text).join("\n");
  const format = (row: string[]) => `| ${row.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`;
  return [format(cells[0]), format(cells[0].map(() => "---")), ...cells.slice(1).map(format)].join("\n");
}

function orderLines(lines: Line[], bodySize: number): Line[] {
  const gaps: { left: number; right: number }[] = [];
  const columns: Line[][] = [];
  for (const line of [...lines].sort((a, b) => a.x - b.x || b.y - a.y)) {
    const column = columns[columns.length - 1];
    if (column && line.x - column[0].x < bodySize * 0.5) column.push(line);
    else columns.push([line]);
  }
  for (const column of columns) column.sort((a, b) => b.y - a.y);
  for (let column = 1; column < columns.length; column++) {
    const left = columns[column - 1], right = columns[column];
    let i = 0, j = 0;
    while (i < left.length && j < right.length) {
      const delta = left[i].y - right[j].y;
      if (Math.abs(delta) >= bodySize * 2) { if (delta > 0) i++; else j++; continue; }
      if (right[j].x - left[i].right > bodySize * 2
        && left[i].text.split(/\s+/).length >= 2 && right[j].text.split(/\s+/).length >= 2) {
        gaps.push({ left: left[i].right, right: right[j].x });
      }
      i++; j++;
    }
  }
  const events = gaps.flatMap((gap) => [{ x: gap.left, delta: 1 }, { x: gap.right, delta: -1 }]).sort((a, b) => a.x - b.x || a.delta - b.delta);
  let count = 0, bestCount = 0, gutter = 0;
  for (let i = 0; i < events.length - 1; i++) {
    count += events[i].delta;
    if (count > bestCount && events[i + 1].x > events[i].x) { bestCount = count; gutter = (events[i].x + events[i + 1].x) / 2; }
  }
  if (bestCount < 3) {
    const rows: PdfTextItem[][] = [];
    for (const line of lines) {
      const row = rows[rows.length - 1];
      if (row && Math.abs(row[0].y - line.y) <= Math.max(2, Math.min(itemSize(row[0]), line.size) * 0.25)) row.push(...line.items);
      else rows.push([...line.items]);
    }
    return rows.map((row) => makeLine(row));
  }
  const leftY = lines.filter((line) => line.x < gutter).map((line) => line.y);
  const rightY = lines.filter((line) => line.x >= gutter).map((line) => line.y);
  const peer = (ys: number[], y: number): boolean => {
    let low = 0, high = ys.length;
    while (low < high) { const mid = (low + high) >>> 1; if (ys[mid] > y) low = mid + 1; else high = mid; }
    return (low < ys.length && Math.abs(ys[low] - y) < bodySize) || (low > 0 && Math.abs(ys[low - 1] - y) < bodySize);
  };
  const result: Line[] = [], left: Line[] = [], right: Line[] = [];
  const flush = () => { result.push(...left, ...right); left.length = right.length = 0; };
  for (const line of lines) {
    if ((line.x < gutter && line.right > gutter)
      || (line.size > bodySize * 1.6 && !peer(line.x < gutter ? rightY : leftY, line.y))) {
      flush(); result.push(line);
    } else (line.x < gutter ? left : right).push(line);
  }
  flush();
  return result;
}

function headingLevel(items: readonly PdfTextItem[], bodySize: number, sizes: readonly number[], lines = groupLines(items)): number | undefined {
  const text = reflowLines(lines.map((line) => line.text));
  if (!text || text.length > 180 || /^\d+[+%]?$/.test(text) || listStart.test(text)) return undefined;
  if (lines.length === 1 && lines[0].tracked) return 2;
  const size = median(items.filter((item) => item.text.trim()).map(itemSize));
  if (size > bodySize * 1.2) return Math.min(3, sizes.findIndex((value) => Math.abs(value - size) < 0.5) + 1 || 3);
  if (lines.length === 1 && text.length < 100 && items.every((item) => /bold|black|heavy/i.test(item.fontName))) return 3;
  return undefined;
}

function markerNumber(text: string): number | undefined {
  const label = listStart.exec(text)?.[2];
  return label ? /^\d/.test(label) ? parseInt(label, 10) : label.toLowerCase().charCodeAt(0) - 96 : undefined;
}

function isListLine(line: Line, previous?: number, next?: Line): boolean {
  const match = listStart.exec(line.text);
  if (!match) return false;
  if (match[1]) return true;
  const number = markerNumber(line.text);
  const hangingContinuation = next && !listStart.test(next.text) && next.x > line.x + line.size * 0.5
    && next.x < line.x + line.size * 4 && line.y - next.y > 0 && line.y - next.y <= line.size * 1.5;
  const hanging = line.items.length > 1 && /^[\da-zA-Z]+[.)]$/.test(line.items[0].text.trim())
    && line.items[1].x > line.items[0].x + line.items[0].width;
  return number === 1 || (previous !== undefined && number === previous + 1)
    || (number !== undefined && next !== undefined && markerNumber(next.text) === number + 1) || hanging || !!hangingContinuation;
}

function layoutBlocks(items: readonly PdfTextItem[], bodySize: number, sizes: readonly number[]): Block[] {
  const rows = baselineRows(items);
  const chunks: (Line[] | { markdown: string })[] = [];
  let prose: Line[] = [];
  for (let i = 0; i < rows.length;) {
    let end = i + 1;
    while (end < rows.length && rows[end - 1][0].y - rows[end][0].y <= bodySize * 3
      && alignedStarts(rows[end - 1], rows[end], Math.max(2, bodySize * 0.35)) >= 2) end++;
    const markdown = end - i >= 3 ? gridMarkdown(rows.slice(i, end), bodySize) : undefined;
    if (markdown) {
      if (prose.length) { chunks.push(prose); prose = []; }
      chunks.push({ markdown });
    } else for (let j = i; j < end; j++) prose.push(...splitRow(rows[j]));
    i = end;
  }
  if (prose.length) chunks.push(prose);
  const blocks: Block[] = [];
  for (const chunk of chunks) {
    if (!Array.isArray(chunk)) { blocks.push({ kind: "markdown", markdown: chunk.markdown }); continue; }
    const lines = orderLines(chunk, bodySize);
    let previous: Line | undefined, previousNumber: number | undefined;
    let currentList = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const heading = headingLevel(line.items, bodySize, sizes, [line]);
      const list = isListLine(line, previousNumber, lines[i + 1]);
      const last = blocks[blocks.length - 1];
      const listContinuation = currentList && last?.kind === "text"
        && line.x >= last.items[0].x && line.x <= last.items[0].x + bodySize * 4;
      const continuation = previous && last?.kind === "text" && last.role === "flow" && !heading && !list
        && (listContinuation || Math.abs(line.x - previous.x) < bodySize * 0.5)
        && Math.max(line.size, previous.size) <= Math.min(line.size, previous.size) * 1.1
        && previous.y - line.y > 0 && previous.y - line.y <= Math.min(line.size, previous.size) * 1.2 + 2;
      if (continuation) last.items = [...last.items, ...line.items];
      else { blocks.push({ kind: "text", items: line.items, role: heading ? "heading" : "flow", level: heading }); currentList = list; }
      previousNumber = list ? markerNumber(line.text) : continuation && currentList ? previousNumber : undefined;
      previous = line;
    }
  }
  return blocks;
}

function renderBlocks(blocks: readonly Block[], bodySize: number, sizes: readonly number[], titleItems: ReadonlySet<PdfTextItem>, inferHeadings = true): string {
  const lineCache = new Map<readonly PdfTextItem[], Line[]>();
  const linesOf = (items: readonly PdfTextItem[]): Line[] => {
    let lines = lineCache.get(items);
    if (!lines) { lines = groupLines(items); lineCache.set(items, lines); }
    return lines;
  };
  const output: string[] = [];
  let previousNumber: number | undefined;
  let previousList = false;
  let previousListY = Infinity;
  const indents: number[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.kind === "markdown") {
      if (block.markdown) output.push(block.markdown);
      previousList = false;
      continue;
    }
    let items = block.items;
    // Adjacent content IDs can split a single visual line or a diagram caption.
    while (block.role === "flow") {
      const next = blocks[i + 1];
      if (next?.kind !== "text" || next.role !== "flow") break;
      const currentLines = linesOf(items), nextLines = linesOf(next.items);
      const lastLine = currentLines[currentLines.length - 1], firstLine = nextLines[0];
      if (!lastLine || !firstLine) break;
      const sameLine = Math.abs(lastLine.y - firstLine.y) < 2 && firstLine.x - lastLine.right < bodySize * 2;
      const caption = /^\d+[.)]\s/.test(currentLines[0].text)
        && Math.abs(firstLine.x - currentLines[0].x) < bodySize
        && lastLine.y - firstLine.y > 0 && lastLine.y - firstLine.y < bodySize * 1.6
        && !listStart.test(firstLine.text);
      if (!sameLine && !caption) break;
      items = [...items, ...next.items]; i++;
    }
    const lines = linesOf(items);
    let text = reflowLines(lines.map((line) => line.text));
    if (!text) continue;
    const next = blocks[i + 1];
    if (/^\d+[+%]?$/.test(text) && next?.kind === "text" && next.role === "flow") {
      const captionLines = linesOf(next.items);
      const first = lines[0], caption = captionLines[0];
      if (caption && Math.abs(first.x - caption.x) < bodySize && first.y - caption.y > 0 && first.y - caption.y < first.size * 1.6) {
        text = `- ${text} ${reflowLines(captionLines.map((line) => line.text))}`; i++;
      }
    }
    let level = block.role === "paragraph" ? undefined : block.level ?? (inferHeadings ? headingLevel(items, bodySize, sizes, lines) : undefined);
    if (level === 1 && block.role !== "explicit-heading" && !items.every((item) => titleItems.has(item))) level = 2;
    if (level) text = `${"#".repeat(level)} ${text}`;
    const nextLines = next?.kind === "text" ? linesOf(next.items) : [];
    const list = !level && isListLine({ ...lines[0], text }, previousNumber, lines[1] ?? nextLines[0]) ? listStart.exec(text) : null;
    if (list) {
      const label = list[2];
      const marker = label ? (/^\d/.test(label) ? `${parseInt(label, 10)}.` : `${label.toLowerCase().charCodeAt(0) - 96}.`) : "-";
      const x = lines[0].x;
      if (!previousList || lines[0].y >= previousListY) indents.splice(0, indents.length, x);
      else {
        while (indents.length > 1 && x < indents[indents.length - 1] - bodySize / 2) indents.pop();
        if (x > indents[indents.length - 1] + bodySize && x - indents[indents.length - 1] < bodySize * 8) indents.push(x);
      }
      text = `${"  ".repeat(Math.max(0, indents.length - 1))}${marker} ${list[3]}`;
      previousListY = lines[0].y;
    }
    if (inferHeadings && !list && !level) text = text.replace(/^(\d+)([.)])(?=\s)/u, "$1\\$2");
    const isList = !!list;
    if (isList && previousList) output[output.length - 1] += `\n${text}`;
    else output.push(text);
    previousList = isList;
    previousNumber = isList ? markerNumber(text.trim()) : undefined;
  }
  return output.join("\n\n");
}

export function renderPdfPage(items: readonly PdfTextItem[], tree?: PdfStructureNode | null, context?: PdfHeadingContext): string {
  const visible = items.filter((item) => item.text.trim());
  const largestFontSize = context?.largestFontSize ?? visible.reduce((largest, item) => Math.max(largest, itemSize(item)), 0);
  const firstRow = context?.isFirstTextPage !== false ? baselineRows(visible)[0] : undefined;
  const firstLine = firstRow ? splitRow(firstRow)[0] : undefined;
  const titleItems = new Set(context?.isFirstTextPage !== false && firstLine && firstLine.size >= largestFontSize - 0.001 ? firstLine.items : []);
  const weightedSizes = visible.flatMap((item) => Array.from({ length: Math.min(item.text.length, 200) }, () => itemSize(item)));
  const bodySize = median(weightedSizes);
  const sizes = [...new Set(visible.map(itemSize).map((size) => Math.round(size * 2) / 2))].filter((size) => size > bodySize * 1.2).sort((a, b) => b - a);
  const marked = new Map<string, PdfTextItem[]>();
  for (const item of visible) {
    if (item.markedId) {
      const group = marked.get(item.markedId) ?? [];
      group.push(item); marked.set(item.markedId, group);
    }
  }
  const used = new Set<PdfTextItem>();
  function collect(node: PdfStructureNode): PdfTextItem[] {
    return node.children.flatMap((child) => "kind" in child ? marked.get(child.id) ?? [] : collect(child));
  }
  function consume(node: PdfStructureNode): PdfTextItem[] {
    const text = collect(node).filter((item) => !used.has(item));
    text.forEach((item) => used.add(item));
    return text;
  }
  function plain(node: PdfStructureNode): string {
    return reflowLines(groupLines(collect(node)).map((line) => line.text));
  }
  function walk(node: PdfStructureNode): Block[] {
    if (node.role === "L") {
      const entries = node.children.filter((child): child is PdfStructureNode => !("kind" in child));
      const markdown = entries.map((entry) => {
        const label = entry.children.find((child) => !("kind" in child) && child.role === "Lbl");
        const labelText = label && !("kind" in label) ? plain(label).trim() : "";
        if (label && !("kind" in label)) consume(label);
        const children = entry.children.filter((child) => child !== label);
        let body = renderBlocks(walk({ role: "LBody", children }), bodySize, sizes, titleItems, false).replace(/\n\n(?=[-*]|\d+\.)/g, "\n");
        const embeddedLabel = !labelText ? /^(\d+|[a-zA-Z])[.)]\s+/.exec(body) : null;
        const numeric = /^(\d+|[a-zA-Z])[.)]?$/.exec(labelText) ?? embeddedLabel;
        const marker = numeric ? (/^\d/.test(numeric[1]) ? `${numeric[1]}.` : `${numeric[1].toLowerCase().charCodeAt(0) - 96}.`) : "-";
        if (embeddedLabel) body = body.slice(embeddedLabel[0].length);
        return `${marker} ${body.replace(/\n/g, `\n${" ".repeat(marker.length + 1)}`)}`;
      }).join("\n");
      return [{ kind: "markdown", markdown }];
    }
    if (node.role === "Table") {
      function rowsOf(parent: PdfStructureNode): PdfStructureNode[] {
        if (parent.role === "TR") return [parent];
        return parent.children.flatMap((child) => "kind" in child ? [] : rowsOf(child));
      }
      const rows = rowsOf(node).map((row) => row.children.filter((child): child is PdfStructureNode => !("kind" in child) && /^(TH|TD)$/.test(child.role)).map(plain));
      if (rows.length && rows[0].length && rows.every((row) => row.length === rows[0].length)) {
        consume(node);
        const format = (row: string[]) => `| ${row.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`;
        return [{ kind: "markdown", markdown: [format(rows[0]), format(rows[0].map(() => "---")), ...rows.slice(1).map(format)].join("\n") }];
      }
    }
    if (node.role === "Figure") {
      const text = consume(node);
      return [{ kind: "markdown", markdown: "<!-- image omitted -->" }, ...layoutBlocks(text, bodySize, sizes)];
    }
    if (/^(P|H|H[1-6])$/.test(node.role)) {
      const text = consume(node);
      return [{ kind: "text", items: text, role: node.role === "P" ? "paragraph" : node.role === "H" ? "heading" : "explicit-heading",
        level: node.role === "H" ? headingLevel(text, bodySize, sizes) ?? 2 : /^H[1-6]$/.test(node.role) ? Number(node.role[1]) : undefined }];
    }
    return node.children.flatMap((child): Block[] => {
      if (!("kind" in child)) return walk(child);
      const text = (marked.get(child.id) ?? []).filter((item) => !used.has(item));
      text.forEach((item) => used.add(item));
      return text.length ? [{ kind: "text", items: text, role: "flow" }] : [];
    });
  }
  const blocks = tree ? walk(tree) : [];
  if (!used.size) {
    const figures = blocks.filter((block) => block.kind === "markdown" && block.markdown === "<!-- image omitted -->");
    return renderBlocks([...figures, ...layoutBlocks(visible, bodySize, sizes)], bodySize, sizes, titleItems);
  }
  const remaining = visible.filter((item) => !used.has(item));
  return renderBlocks([...blocks, ...layoutBlocks(remaining, bodySize, sizes)], bodySize, sizes, titleItems);
}
