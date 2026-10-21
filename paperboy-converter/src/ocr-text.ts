import type { OcrLine, OcrParagraph, OcrResult, OcrWord } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function lineBounds(value: unknown): OcrWord["bbox"] | undefined {
  if (!isRecord(value) || typeof value.x0 !== "number" || typeof value.y0 !== "number" ||
    typeof value.x1 !== "number" || typeof value.y1 !== "number") return undefined;
  return { x0: value.x0, y0: value.y0, x1: value.x1, y1: value.y1 };
}

export function collectParagraphsFromTesseractBlocks(blocks: unknown): OcrParagraph[] {
  return objectArray(blocks).flatMap((block) =>
    objectArray(block.paragraphs).map((paragraph) => ({
      lines: objectArray(paragraph.lines).map((line) => ({
        bbox: lineBounds(line.bbox),
        words: objectArray(line.words).map((word): OcrWord => {
          const bbox = isRecord(word.bbox) ? word.bbox : {};
          const x0 = typeof bbox.x0 === "number" ? bbox.x0 : 0;
          const y0 = typeof bbox.y0 === "number" ? bbox.y0 : 0;
          return {
            text: typeof word.text === "string" ? word.text : "",
            confidence: typeof word.confidence === "number" ? word.confidence : 0,
            bbox: {
              x0,
              y0,
              x1: typeof bbox.x1 === "number" ? bbox.x1 : x0,
              y1: typeof bbox.y1 === "number" ? bbox.y1 : y0,
            },
          };
        }),
      })).filter((line) => line.words.length > 0),
    })).filter((paragraph) => paragraph.lines.length > 0),
  );
}

const MIN_LINE_CONFIDENCE = 60;
const MIN_WORD_CONFIDENCE = 30;
const MIN_RESCUE_CONFIDENCE = 40;
const MIN_READABLE_FRACTION = 0.6;
const WRAP_EDGE_FRACTION = 0.85;
const IMAGE_OMITTED = "<!-- image omitted -->";

interface TextLine {
  words: OcrWord[];
  text: string;
  bounds: OcrWord["bbox"];
  charWidth: number;
  keep: boolean;
  code: boolean;
  columns: boolean;
  literal: boolean;
  top: number;
}

function isReadableWord(word: OcrWord): boolean {
  if (word.confidence < MIN_WORD_CONFIDENCE) return false;
  const text = word.text.trim();
  const alphanumeric = /^[\p{P}\p{Sc}]*[\p{L}\p{N}][\p{L}\p{N}\-_.@/:$%#+]*[\p{P}\p{Sc}]*$/u.test(text);
  const alphabetic = /^[\p{P}]*\p{L}{2,}(?:['’\-]\p{L}+)*[\p{P}]*$/u.test(text);
  if (/^[\p{Sc}]?\d{2,}(?:[.,:]\d+)*%?$|^[\p{Sc}]?\d+[.,:]\d+%?$|^\d+%$/u.test(text)) return true;
  if (word.confidence >= MIN_LINE_CONFIDENCE) return alphanumeric || alphabetic;
  return (alphanumeric || alphabetic) && text.replace(/[^\p{L}\p{N}]/gu, "").length >= 3;
}

function analyzeLine(line: OcrLine): TextLine {
  const words = line.words;
  const tokens = words.map((word) => word.text.trim());
  const text = tokens.join(" ");
  const mean = words.reduce((sum, word) => sum + word.confidence, 0) / words.length;
  const content = hasListPrefix(text) ? words.slice(1) : words;
  const confidence = content.reduce((sum, word) => sum + word.confidence, 0);
  const readableConfidence = content.filter(isReadableWord).reduce((sum, word) => sum + word.confidence, 0);
  const readableFraction = readableConfidence / Math.max(1, confidence);
  const code = /[{}()]|=>|[;=]\s*$/.test(text);
  const codeStatement = code && words[0].confidence >= MIN_LINE_CONFIDENCE &&
    /^(?:const|let|var|function|return|for|if|while|class|import|export)\b/.test(text);
  const charWidth = words.reduce((sum, word) => sum + word.bbox.x1 - word.bbox.x0, 0) /
    tokens.reduce((sum, token) => sum + token.length, 0);
  return {
    words,
    text,
    bounds: {
      x0: Math.min(...words.map((word) => word.bbox.x0)),
      y0: Math.min(...words.map((word) => word.bbox.y0)),
      x1: Math.max(...words.map((word) => word.bbox.x1)),
      y1: Math.max(...words.map((word) => word.bbox.y1)),
    },
    charWidth,
    top: line.bbox?.y0 ?? Math.min(...words.map((word) => word.bbox.y0)),
    keep: mean >= MIN_LINE_CONFIDENCE || (
      mean >= MIN_RESCUE_CONFIDENCE && readableFraction >= MIN_READABLE_FRACTION
    ) || codeStatement,
    code,
    columns: words.some((word, index) => index > 0 && word.bbox.x0 - words[index - 1].bbox.x1 > charWidth * 4),
    literal: text.startsWith("|") || text.endsWith("|") || tokens.filter((token) => token === "|").length >= 2 ||
      (words.length === 1 && /[\p{N}@_/$%#+]/u.test(text)),
  };
}

function hasListPrefix(text: string): boolean {
  return /^(?:[•·«»*–—-](?:\s|$)|\d+[.)]\s|[a-zA-Z][.)]\s|\[[ xX]?\](?:\s|$))/.test(text);
}

function isCodeFragment(line: TextLine): boolean {
  return /^[{}\[\]();,]+$/.test(line.text.replace(/\s/g, "")) ||
    (line.words.length === 1 && [...line.text].length === 1);
}

function keepCodeFragments(lines: TextLine[]): void {
  const adjacent = (left: TextLine, right: TextLine) =>
    Math.abs(right.bounds.y0 - left.bounds.y1) <= Math.max(
      left.bounds.y1 - left.bounds.y0, right.bounds.y1 - right.bounds.y0,
    ) * 2;
  for (let start = 0; start < lines.length; start++) {
    if (!isCodeFragment(lines[start])) continue;
    let end = start + 1;
    while (end < lines.length && isCodeFragment(lines[end])) end++;
    const before = lines[start - 1];
    const after = lines[end];
    if ((before?.keep && before.code && adjacent(before, lines[start])) ||
      (after?.keep && after.code && adjacent(lines[end - 1], after))) {
      for (let index = start; index < end; index++) {
        lines[index].keep = true;
        lines[index].code = true;
      }
    }
    start = end - 1;
  }
}

function aligned(previous: TextLine, next: TextLine): boolean {
  return Math.abs(previous.bounds.x0 - next.bounds.x0) <= Math.max(previous.charWidth, next.charWidth) * 1.5;
}

function reachesEdge(line: TextLine, bounds: { left: number; right: number }): boolean {
  return line.bounds.x1 - bounds.left >= (bounds.right - bounds.left) * WRAP_EDGE_FRACTION;
}

function fontChange(previous: TextLine, next: TextLine): boolean {
  return Math.max(previous.charWidth, next.charWidth) > Math.min(previous.charWidth, next.charWidth) * 1.25;
}

function wrapBoundary(previous: TextLine, next: TextLine, bounds: { left: number; right: number }): "line" | "space" | "paragraph" {
  const canWrap = previous.keep && next.keep && !previous.code && !next.code && !previous.columns && !next.columns &&
    !previous.literal && !next.literal &&
    !hasListPrefix(previous.text) && !hasListPrefix(next.text) && !previous.text.endsWith(":") &&
    reachesEdge(previous, bounds) && aligned(previous, next) &&
    (/^\p{Ll}/u.test(next.text) || !/[.!?:]$/.test(previous.text));
  if (!canWrap) return "line";
  return fontChange(previous, next) ? "paragraph" : "space";
}

function lineText(line: TextLine): string {
  if (line.code) return line.text;
  const tokens = line.words.map((word) => word.text.trim());
  if (tokens.filter((token) => token === "|").length !== 1) return line.text;
  return tokens.map((token, index) => token === "|" &&
    /^\p{Ll}/u.test(tokens[index - 1] ?? "") && /^\p{Ll}/u.test(tokens[index + 1] ?? "")
    ? "I" : token).join(" ");
}

export function cleanOcrText(result: OcrResult): { text: string; hasText: boolean } {
  // Legacy backends can supply partial word lists, so text remains authoritative without structure.
  if (!result.paragraphs?.length) {
    const text = result.text.trim();
    return { text, hasText: text.length > 0 };
  }

  const sections: string[] = [];
  let hasText = false;
  const paragraphs = result.paragraphs.map((paragraph) =>
    paragraph.lines.map((line) => ({ ...line, words: line.words.filter((word) => word.text.trim()) }))
      .filter((line) => line.words.length > 0).map(analyzeLine),
  );
  keepCodeFragments(paragraphs.flat());
  for (const lines of paragraphs) {
    const kept = lines.filter((line) => line.keep);
    const bounds = {
      left: Math.min(...kept.map((line) => line.bounds.x0)),
      right: Math.max(...kept.map((line) => line.bounds.x1)),
    };
    const hasWraps = lines.some((line, index) => index > 0 && wrapBoundary(lines[index - 1], line, bounds) === "space");
    const pitches = kept.slice(1).map((line, index) => line.top - kept[index].top)
      .filter((pitch) => pitch > 0).sort((a, b) => a - b);
    const middle = Math.floor(pitches.length / 2);
    const normalPitch = pitches.length
      ? (pitches[middle] + pitches[Math.floor((pitches.length - 1) / 2)]) / 2
      : 0;
    let text = "";
    let previous: TextLine | undefined;
    const flush = () => {
      if (text) sections.push(text);
      text = "";
      previous = undefined;
    };
    for (const line of lines) {
      if (!line.keep) {
        flush();
        if (sections.at(-1) !== IMAGE_OMITTED) sections.push(IMAGE_OMITTED);
        continue;
      }
      if (previous) {
        const largeGap = line.bounds.y0 - previous.bounds.y1 > Math.max(
          line.bounds.y1 - line.bounds.y0, previous.bounds.y1 - previous.bounds.y0,
        ) || (normalPitch > 0 && line.top - previous.top > normalPitch * 1.5);
        const boundary = wrapBoundary(previous, line, bounds);
        const paragraphEnd = hasWraps && !previous.code && !line.code && !previous.columns && !line.columns &&
          !hasListPrefix(previous.text) && !hasListPrefix(line.text) && aligned(previous, line) &&
          !reachesEdge(previous, bounds) && /^\p{Lu}/u.test(line.text) && (
            /[.!?]$/.test(previous.text) || previous.charWidth > line.charWidth * 1.25
          );
        if (largeGap || boundary === "paragraph" || paragraphEnd) flush();
        else if (boundary === "space") {
          if (/\p{L}-$/u.test(previous.text) && /^\p{Ll}/u.test(line.text)) {
            text = text.replace(/(\p{L})-$/u, "$1");
          } else text += " ";
        } else text += "\n";
      }
      text += lineText(line);
      previous = line;
      hasText = true;
    }
    flush();
  }
  return { text: sections.join("\n\n"), hasText };
}
