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

interface Line {
  items: PdfTextItem[];
  x: number;
  y: number;
  right: number;
  size: number;
  text: string;
}

type Block =
  | { kind: "text"; items: readonly PdfTextItem[]; role: "flow" | "paragraph" | "heading"; level?: number }
  | { kind: "markdown"; markdown: string };

const spacedRun = /(?<![\p{L}\p{N}])\p{L}(?: \p{L}){2,}(?![\p{L}\p{N}])/u;
const listStart = /^(?:([•◦▪\-–*·])|((?:\d+|[a-zA-Z])[.)]))\s+(.+)$/u;

export function collapseLetterSpacing(text: string): string {
  text = text.replace(/(?<!\S)[\p{P}\p{S}](?: [\p{P}\p{S}])+(?!\S)/gu, (run) => run.replace(/ /g, ""));
  if (!spacedRun.test(text)) return text;
  const letters = text.replace(/^[^\p{L}]+/u, "").trim().split(/\s+/);
  const pattern = letters.every((word) => /^\p{L}$/u.test(word))
    ? /(?<![\p{L}\p{N}])\p{L}(?: +\p{L})+(?![\p{L}\p{N}])/gu
    : /(?<![\p{L}\p{N}])\p{L}(?: +\p{L}){2,}(?![\p{L}\p{N}])/gu;
  return text.replace(pattern,
    (run) => run.split(/ {2,}/).map((word) => word.replace(/ /g, "")).join(" "));
}

export function reflowLines(lines: readonly string[]): string {
  return lines.reduce((text, line) => {
    const next = line.trim();
    if (!text) return next;
    if (/[\p{Ll}]-$/u.test(text) && /^\p{Ll}/u.test(next)) {
      return text.slice(0, -1) + next;
    }
    if (/\p{L}-$/u.test(text) && /^\p{Lu}/u.test(next)) return text + next;
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

function lineText(items: readonly PdfTextItem[]): string {
  const visible = items.filter((item) => item.text.trim());
  const spaced = visible.some((item) => spacedRun.test(item.text));
  const glyphs = visible.length >= 3 && visible.every((item) => /^\p{L}$/u.test(item.text));
  const gaps = visible.slice(1).map((item, i) => item.x - (visible[i].x + visible[i].width));
  const typicalGap = median(gaps.filter((gap) => gap > 0));
  let text = "";
  visible.forEach((item, index) => {
    const previous = visible[index - 1];
    if (previous) {
      const gap = item.x - (previous.x + previous.width);
      if (glyphs) text += gap > Math.max(itemSize(item) * 0.35, typicalGap * 1.6) ? "  " : " ";
      else if (gap > itemSize(item) * 0.12 || /\s$/.test(previous.text) || /^\s/.test(item.text)) {
        text += spaced ? "  " : " ";
      }
    }
    text += item.text.trim();
  });
  return collapseLetterSpacing(text).replace(/ {2,}/g, " ").trim();
}

function makeLine(items: PdfTextItem[]): Line {
  return {
    items, x: items[0].x, y: Math.max(...items.map((item) => item.y)),
    right: Math.max(...items.map((item) => item.x + item.width)),
    size: median(items.map(itemSize)), text: lineText(items),
  };
}

function groupLines(items: readonly PdfTextItem[]): Line[] {
  const rows: PdfTextItem[][] = [];
  for (const item of [...items].filter((item) => item.text.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - item.y) <= Math.max(2, Math.min(itemSize(row[0]), itemSize(item)) * 0.25)) row.push(item);
    else rows.push([item]);
  }
  return rows.flatMap((row) => {
    row.sort((a, b) => a.x - b.x);
    const segments: PdfTextItem[][] = [];
    for (const item of row) {
      const segment = segments[segments.length - 1];
      const previous = segment?.[segment.length - 1];
      if (previous && item.x - (previous.x + previous.width) <= Math.max(12, itemSize(item) * 2)) segment.push(item);
      else segments.push([item]);
    }
    return segments.map(makeLine);
  });
}

function orderLines(lines: Line[], bodySize: number): Line[] {
  const gaps: { left: number; right: number; y: number }[] = [];
  for (const left of lines) {
    const right = lines.find((line) => line.x - left.right > bodySize * 2 && Math.abs(line.y - left.y) < bodySize * 2);
    if (right) gaps.push({ left: left.right, right: right.x, y: left.y });
  }
  const candidates = gaps.map((gap) => {
    const x = (gap.left + gap.right) / 2;
    return { x, count: gaps.filter((other) => other.left < x && other.right > x).length };
  }).sort((a, b) => b.count - a.count);
  const gutter = candidates[0];
  if (!gutter || gutter.count < 3) return lines;
  const result: Line[] = [], band: Line[] = [];
  const flush = () => {
    result.push(...band.filter((line) => line.x < gutter.x), ...band.filter((line) => line.x >= gutter.x));
    band.length = 0;
  };
  for (const line of lines) {
    const columnPeer = lines.some((other) => other !== line && Math.abs(other.y - line.y) < bodySize
      && (other.x < gutter.x) !== (line.x < gutter.x));
    if ((line.x < gutter.x && line.right > gutter.x) || (line.size > bodySize * 1.6 && !columnPeer)) {
      flush(); result.push(line);
    } else band.push(line);
  }
  flush();
  return result;
}

function headingLevel(items: readonly PdfTextItem[], bodySize: number, sizes: readonly number[]): number | undefined {
  const lines = groupLines(items);
  const text = reflowLines(lines.map((line) => line.text));
  if (!text || text.length > 180 || /^\d+[+%]?$/.test(text) || listStart.test(text)) return undefined;
  if (items.some((item) => spacedRun.test(item.text))) return 2;
  const size = median(items.filter((item) => item.text.trim()).map(itemSize));
  if (size > bodySize * 1.2) return Math.min(3, sizes.findIndex((value) => Math.abs(value - size) < 0.5) + 1 || 3);
  if (lines.length === 1 && text.length < 100 && items.every((item) => /bold|black|heavy/i.test(item.fontName))) return 3;
  return undefined;
}

function layoutBlocks(items: readonly PdfTextItem[], bodySize: number, sizes: readonly number[]): Block[] {
  const lines = orderLines(groupLines(items), bodySize);
  const blocks: Block[] = [];
  let previous: Line | undefined;
  for (const line of lines) {
    const heading = headingLevel(line.items, bodySize, sizes);
    const last = blocks[blocks.length - 1];
    const listContinuation = last?.kind === "text" && listStart.test(groupLines(last.items)[0]?.text ?? "")
      && line.x >= last.items[0].x && line.x <= last.items[0].x + bodySize * 4;
    const continuation = previous && last?.kind === "text" && last.role === "flow" && !heading
      && !listStart.test(line.text)
      && (listContinuation || Math.abs(line.x - previous.x) < bodySize * 0.5)
      && Math.max(line.size, previous.size) <= Math.min(line.size, previous.size) * 1.1
      && previous.y - line.y > 0 && previous.y - line.y <= Math.min(line.size, previous.size) * 1.2 + 2;
    if (continuation) last.items = [...last.items, ...line.items];
    else blocks.push({ kind: "text", items: line.items, role: heading ? "heading" : "flow", level: heading });
    previous = line;
  }
  return blocks;
}

function renderBlocks(blocks: readonly Block[], bodySize: number, sizes: readonly number[], inferHeadings = true): string {
  const output: string[] = [];
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
    let items = [...block.items];
    // Adjacent content IDs can split a single visual line or a diagram caption.
    while (block.role === "flow") {
      const next = blocks[i + 1];
      if (next?.kind !== "text" || next.role !== "flow") break;
      const currentLines = groupLines(items), nextLines = groupLines(next.items);
      const lastLine = currentLines[currentLines.length - 1], firstLine = nextLines[0];
      if (!lastLine || !firstLine) break;
      const sameLine = Math.abs(lastLine.y - firstLine.y) < 2 && firstLine.x - lastLine.right < bodySize * 2;
      const caption = /^\d+[.)]\s/.test(currentLines[0].text)
        && Math.abs(firstLine.x - currentLines[0].x) < bodySize
        && lastLine.y - firstLine.y > 0 && lastLine.y - firstLine.y < bodySize * 1.6
        && !listStart.test(firstLine.text);
      if (!sameLine && !caption) break;
      items.push(...next.items); i++;
    }
    const lines = groupLines(items);
    let text = reflowLines(lines.map((line) => line.text));
    if (!text) continue;
    const next = blocks[i + 1];
    if (/^\d+[+%]?$/.test(text) && next?.kind === "text" && next.role === "flow") {
      const captionLines = groupLines(next.items);
      const first = lines[0], caption = captionLines[0];
      if (caption && Math.abs(first.x - caption.x) < bodySize && first.y - caption.y > 0 && first.y - caption.y < first.size * 1.6) {
        text = `- ${text} ${reflowLines(captionLines.map((line) => line.text))}`; i++;
      }
    }
    const level = block.role === "paragraph" ? undefined : block.level ?? (inferHeadings ? headingLevel(items, bodySize, sizes) : undefined);
    if (level) text = `${"#".repeat(level)} ${text}`;
    const list = listStart.exec(text);
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
    const isList = !!list;
    if (isList && previousList) output[output.length - 1] += `\n${text}`;
    else output.push(text);
    previousList = isList;
  }
  return output.join("\n\n");
}

export function renderPdfPage(items: readonly PdfTextItem[], tree?: PdfStructureNode | null): string {
  const visible = items.filter((item) => item.text.trim());
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
        let body = renderBlocks(walk({ role: "LBody", children }), bodySize, sizes, false).replace(/\n\n(?=[-*]|\d+\.)/g, "\n");
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
      return [{ kind: "text", items: text, role: node.role === "P" ? "paragraph" : "heading",
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
    return renderBlocks([...figures, ...layoutBlocks(visible, bodySize, sizes)], bodySize, sizes);
  }
  const remaining = visible.filter((item) => !used.has(item));
  return renderBlocks([...blocks, ...layoutBlocks(remaining, bodySize, sizes)], bodySize, sizes);
}
