import { prepare, layout } from "./vendor/pretext.js";

const MIN_TEXT_WIDTH = 40;
const FALLBACK_LINE_HEIGHT = 22;

function parsePx(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTextareaMetrics(textarea) {
  const styles = window.getComputedStyle(textarea);
  const lineHeight =
    parsePx(styles.lineHeight) ||
    parsePx(styles.fontSize) * 1.6 ||
    FALLBACK_LINE_HEIGHT;
  const textWidth = Math.max(
    MIN_TEXT_WIDTH,
    textarea.clientWidth - parsePx(styles.paddingLeft) - parsePx(styles.paddingRight),
  );
  const font = `${styles.fontStyle} ${styles.fontVariant} ${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;

  return { lineHeight, textWidth, font };
}

function findSourceLineFromVisualLine(lineStarts, visualLine) {
  let low = 0;
  let high = lineStarts.length - 1;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= visualLine) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

export function createPretextScrollModel(textarea) {
  let cachedText = null;
  let cachedFont = "";
  let cachedWidth = 0;
  let cachedLineHeight = FALLBACK_LINE_HEIGHT;
  let lineStarts = [0];
  let totalVisualLines = 1;

  function rebuild(text) {
    const metrics = getTextareaMetrics(textarea);
    const sourceLines = text.split("\n");
    if (sourceLines.length === 0) {
      sourceLines.push("");
    }

    const starts = new Array(sourceLines.length);
    let visualCursor = 0;

    for (let i = 0; i < sourceLines.length; i += 1) {
      const sourceLine = sourceLines[i];
      const measurable = sourceLine.length === 0 ? " " : sourceLine;

      starts[i] = visualCursor;
      const prepared = prepare(measurable, metrics.font, { whiteSpace: "pre-wrap" });
      const { lineCount } = layout(prepared, metrics.textWidth, metrics.lineHeight);
      visualCursor += Math.max(1, lineCount);
    }

    cachedText = text;
    cachedFont = metrics.font;
    cachedWidth = metrics.textWidth;
    cachedLineHeight = metrics.lineHeight;
    lineStarts = starts;
    totalVisualLines = Math.max(1, visualCursor);
  }

  function ensure(text) {
    const metrics = getTextareaMetrics(textarea);
    if (
      text === cachedText &&
      metrics.font === cachedFont &&
      metrics.textWidth === cachedWidth &&
      metrics.lineHeight === cachedLineHeight
    ) {
      return;
    }

    try {
      rebuild(text);
    } catch {
      // If Pretext fails for any reason, fall back to one visual line per source line.
      const sourceLines = text.split("\n");
      cachedText = text;
      cachedFont = metrics.font;
      cachedWidth = metrics.textWidth;
      cachedLineHeight = metrics.lineHeight;
      lineStarts = sourceLines.map((_, index) => index);
      totalVisualLines = Math.max(1, sourceLines.length);
    }
  }

  return {
    invalidate() {
      cachedText = null;
    },
    getTopSourceLine(text, scrollTop) {
      ensure(text);
      const visualLine = Math.max(0, Math.floor(scrollTop / cachedLineHeight));
      return findSourceLineFromVisualLine(lineStarts, visualLine);
    },
    getScrollTopForSourceLine(text, sourceLine) {
      ensure(text);
      const clamped = Math.max(0, Math.min(sourceLine, lineStarts.length - 1));
      return lineStarts[clamped] * cachedLineHeight;
    },
    getEstimatedContentHeight(text) {
      ensure(text);
      return totalVisualLines * cachedLineHeight;
    },
  };
}
