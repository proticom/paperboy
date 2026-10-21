import type { PdfTextItem } from "./pdf-structure.js";

export type PageRegion =
  | { kind: "leaf"; items: readonly PdfTextItem[] }
  | { kind: "bands" | "columns"; children: readonly PageRegion[] };

interface Row {
  items: PdfTextItem[];
  y: number;
  bottom: number;
}
interface Span { left: number; right: number }
interface Strip extends Span { x: number; ink: number }

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 0;
}

function rowsOf(items: readonly PdfTextItem[]): Row[] {
  const rows: Row[] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row.y - item.y) <= Math.max(2, item.height * 0.25)) {
      row.items.push(item);
      row.bottom = Math.min(row.bottom, item.y - item.height);
    } else rows.push({ items: [item], y: item.y, bottom: item.y - item.height });
  }
  for (const row of rows) row.items.sort((a, b) => a.x - b.x);
  return rows;
}

function rowSpans(row: Row, bodySize: number): Span[] {
  const spans: Span[] = [];
  for (const item of row.items) {
    const last = spans[spans.length - 1];
    const right = item.x + item.width;
    if (last && item.x - last.right <= bodySize * 0.6) last.right = Math.max(last.right, right);
    else spans.push({ left: item.x, right });
  }
  return spans;
}

function horizontalBands(items: readonly PdfTextItem[], bodySize: number): PdfTextItem[][] {
  const rows = rowsOf(items);
  const spans = rows.map((row) => rowSpans(row, bodySize));
  const left = Math.min(...items.map((item) => item.x));
  const right = Math.max(...items.map((item) => item.x + item.width));
  const columnRows = spans.map((row) => row.filter((span) => span.right - span.left >= bodySize * 4).length >= 2);
  const hasColumns = columnRows.filter(Boolean).length >= 3;
  const gutters = spans.filter((row, index) => columnRows[index] && row.length === 2)
    .map((row) => (row[0].right + row[1].left) / 2);
  const gutter = gutters.length >= 3 ? median(gutters) : undefined;
  let spanning = false;
  const wide = spans.map((row, index) => {
    if (columnRows[index]) spanning = false;
    else if (hasColumns && row.some((span) => span.right - span.left > (right - left) * 0.7)) spanning = true;
    return spanning;
  });
  const hasSpanningBoundary = wide.some((value, index) => index > 0 && value !== wide[index - 1]);
  const gaps = rows.slice(1).map((row, index) => rows[index].bottom - row.y);
  const largestGap = Math.max(0, ...gaps);
  const bands: PdfTextItem[][] = [];
  for (let i = 0; i < rows.length; i++) {
    const previous = rows[i - 1];
    const gap = previous ? previous.bottom - rows[i].y : 0;
    const sectionStart = gutter !== undefined && gap > bodySize * 1.5
      && previous.items.some((item) => item.x >= gutter)
      && rows[i].items.every((item) => item.x + item.width <= gutter);
    // Spanning lines separate column bands. Ordinary line and paragraph spacing stays inside a region.
    if (!i || sectionStart || (!hasSpanningBoundary && gap > bodySize * 1.5 && gap >= largestGap - 0.01) || wide[i] !== wide[i - 1]) bands.push([]);
    bands[bands.length - 1].push(...rows[i].items);
  }
  return bands;
}

function verticalStrips(items: readonly PdfTextItem[], bodySize: number): Strip[] {
  const top = Math.max(...items.map((item) => item.y));
  const bottom = Math.min(...items.map((item) => item.y - item.height));
  const maximumInk = (top - bottom) * 0.12;
  const events = items.flatMap((item) => [
    { x: item.x, delta: item.height }, { x: item.x + item.width, delta: -item.height },
  ]).sort((a, b) => a.x - b.x);
  const strips: Strip[] = [];
  let ink = 0;
  let best: Strip | undefined;
  const flush = () => {
    if (best && best.right - best.left + 0.01 >= bodySize * 0.8) {
      strips.push({ ...best, x: (best.left + best.right) / 2 });
    }
    best = undefined;
  };
  for (let i = 0; i < events.length;) {
    const x = events[i].x;
    while (i < events.length && events[i].x === x) ink += events[i++].delta;
    const next = events[i]?.x;
    if (next === undefined) break;
    if (ink <= maximumInk + 0.01) {
      if (!best || ink < best.ink - 0.01) best = { left: x, right: next, x: 0, ink };
      else if (Math.abs(ink - best.ink) < 0.01 && Math.abs(best.right - x) < 0.01) best.right = next;
    } else flush();
  }
  flush();
  return strips;
}

function proseSupport(items: readonly PdfTextItem[], bodySize: number): boolean {
  const rows = rowsOf(items);
  if (rows.length < 3) return false;
  const widths = rows.map((row) => Math.max(...row.items.map((item) => item.x + item.width)) - row.items[0].x);
  const wordCounts = rows.map((row) => row.items.map((item) => item.text.trim()).join(" ").split(/\s+/).length);
  // Table cells can create excellent whitespace strips. They do not establish prose columns.
  return widths.filter((width) => width >= bodySize * 8).length >= 2 && median(wordCounts) >= 2;
}

function splitColumns(items: readonly PdfTextItem[], strips: readonly Strip[]): PdfTextItem[][] {
  const columns: PdfTextItem[][] = Array.from({ length: strips.length + 1 }, () => []);
  for (const item of items) {
    let low = 0, high = strips.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (strips[middle].x <= item.x) low = middle + 1;
      else high = middle;
    }
    columns[low].push(item);
  }
  return columns;
}

export function segmentPage(items: readonly PdfTextItem[], bodySize: number): {
  region: PageRegion; confident: boolean; reasons: readonly string[];
} {
  const visible = items.filter((item) => item.text.trim());
  const reasons: string[] = [];
  const visit = (part: readonly PdfTextItem[], depth: number): PageRegion => {
    if (!part.length) return { kind: "leaf", items: part };
    if (depth > 12) {
      reasons.push("Layout subdivision did not converge.");
      return { kind: "leaf", items: part };
    }
    const candidates = verticalStrips(part, bodySize);
    const strips = candidates.filter((strip) => strip.ink <= 0.01);
    if (strips.length) {
      const columns = splitColumns(part, strips);
      // A page-height gutter survives paragraph gaps and keeps each column's blocks together.
      if (columns.every((column) => proseSupport(column, bodySize))) {
        return { kind: "columns", children: columns.map((column) => visit(column, depth + 1)) };
      }
    }
    const crossed = candidates.filter((strip) => strip.ink > 0.01)
      .sort((a, b) => (b.right - b.left) - (a.right - a.left))[0];
    if (crossed) {
      const crosses = (item: PdfTextItem) => item.x < crossed.x && item.x + item.width > crossed.x;
      const beside = part.filter((item) => !crosses(item));
      if (splitColumns(beside, [crossed]).every((column) => proseSupport(column, bodySize))) {
        const bands: PdfTextItem[][] = [];
        let previous: boolean | undefined;
        for (const row of rowsOf(part)) {
          const spanning = row.items.some(crosses);
          if (spanning !== previous) bands.push([]);
          bands[bands.length - 1].push(...row.items);
          previous = spanning;
        }
        if (bands.length > 1) return { kind: "bands", children: bands.map((band) => {
          const columns = splitColumns(band, [crossed]);
          const multiline = columns.every((column) => {
            const rows = rowsOf(column);
            const prose = rows.filter((row) =>
              (row.items.map((item) => item.text).join(" ").match(/\p{L}{2,}/gu) ?? []).length >= 2);
            return prose.length > rows.length / 2
              && prose.some((row, index) => index > 0 && prose[index - 1].bottom - row.y <= bodySize * 1.5);
          });
          const atMostTwoWideSpans = rowsOf(band).every((row) => rowSpans(row, bodySize)
            .filter((span) => span.right - span.left >= bodySize * 4).length <= 2);
          return !band.some(crosses) && atMostTwoWideSpans && multiline
            ? { kind: "columns", children: columns.map((column) => visit(column, depth + 2)) }
            : visit(band, depth + 1);
        }) };
      }
    }
    const bands = horizontalBands(part, bodySize);
    if (bands.length > 1) return { kind: "bands", children: bands.map((band) => visit(band, depth + 1)) };
    if (!strips.length) {
      const widest = candidates.reduce<Strip | undefined>((best, strip) =>
        !best || strip.right - strip.left > best.right - best.left ? strip : best, undefined);
      if (widest && splitColumns(part, [widest]).every((column) => proseSupport(column, bodySize))) {
        reasons.push("Text crosses a proposed column strip.");
      }
    }
    return { kind: "leaf", items: part };
  };
  const region = visit(visible, 0);
  const rows = rowsOf(visible);
  if (visible.length >= 2 && rows.length < 4
    && rows.every((row, i) => !i || Math.abs(row.items[0].x - rows[i - 1].items[0].x) > bodySize)) {
    reasons.push("Too few aligned lines to establish reading order.");
  }
  return { region, confident: reasons.length === 0, reasons };
}
