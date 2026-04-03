import { createPretextScrollModel } from "./pretext-sync.js";

export function initEditor(textarea, toolbar) {
  let onChange = () => {};
  const emit = () => onChange(textarea.value);
  const scrollModel = createPretextScrollModel(textarea);
  const placeholders = {
    link: "[link text](url)",
    image: "![alt text](image-url)"
  };

  textarea.addEventListener("input", emit);
  textarea.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "Tab") return indentSelection(textarea, event.shiftKey ? -2 : 2, emit, event);
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (["s", "o", "n", "w"].includes(key)) return;
    const shift = event.shiftKey;
    const map = {
      b: () => formatAction(textarea, "wrap", { before: "**", after: "**", placeholder: "bold" }),
      i: () => formatAction(textarea, "wrap", { before: "*", after: "*", placeholder: "italic" }),
      k: () => formatAction(textarea, shift ? "image" : "link", {}),
      "`": () => formatAction(textarea, shift ? "blockWrap" : "wrap", shift ? { before: "```\n", after: "\n```", placeholder: "code block" } : { before: "`", after: "`", placeholder: "code" }),
      x: () => shift && formatAction(textarea, "wrap", { before: "~~", after: "~~", placeholder: "strike" }),
      "]": () => formatAction(textarea, "indent", { amount: 2 }),
      "[": () => formatAction(textarea, "indent", { amount: -2 })
    };
    if (!map[key]) return;
    event.preventDefault();
    map[key]();
    emit();
  });

  toolbar.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    formatAction(textarea, button.dataset.action, normalizeOptions(button.dataset));
    textarea.focus();
    emit();
  });

  return {
    getContent: () => textarea.value,
    getLineCount: () => textarea.value.split("\n").length,
    getTopSourceLine: () => scrollModel.getTopSourceLine(textarea.value, textarea.scrollTop),
    onChange(callback) { onChange = callback; },
    onScroll(callback) { textarea.addEventListener("scroll", callback); },
    invalidateScrollLayout() {
      scrollModel.invalidate();
    },
    scrollToSourceLine(line) {
      const target = scrollModel.getScrollTopForSourceLine(textarea.value, line);
      const max = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
      textarea.scrollTop = Math.min(max, Math.max(0, target));
    },
    setContent(value, { silent = false } = {}) {
      textarea.value = value;
      textarea.scrollTop = 0;
      scrollModel.invalidate();
      if (!silent) emit();
    }
  };
}

function normalizeOptions(options) {
  return {
    ...options,
    before: decodeEscapes(options.before),
    after: decodeEscapes(options.after),
    syntax: decodeEscapes(options.syntax),
    amount: options.amount ? Number(options.amount) : undefined
  };
}

export function formatAction(textarea, actionType, options = {}) {
  const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  if (actionType === "wrap" || actionType === "blockWrap") return wrapSelection(textarea, options.before, options.after, options.placeholder);
  if (actionType === "prefix") return prefixLines(textarea, options.syntax, false);
  if (actionType === "prefixToggle") return prefixLines(textarea, options.syntax, true);
  if (actionType === "insert") return replaceRange(textarea, options.syntax, false);
  if (actionType === "indent") return indentLines(textarea, options.amount);
  if (actionType === "link") return replaceRange(textarea, `[${selected || "link text"}](url)`, !selected, selected ? selected.length + 3 : 1, selected ? selected.length + 3 : 10);
  if (actionType === "image") return replaceRange(textarea, "![alt text](image-url)", true, 2, 10);
  if (actionType === "headingId") return appendHeadingId(textarea);
  if (actionType === "footnote") return insertFootnote(textarea);
}

function wrapSelection(textarea, before, after, placeholder = "") {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end);
  const text = selected || placeholder;
  textarea.value = `${value.slice(0, start)}${before}${text}${after}${value.slice(end)}`;
  const innerStart = start + before.length;
  const innerEnd = innerStart + text.length;
  textarea.setSelectionRange(selected ? innerEnd + after.length : innerStart, selected ? innerEnd + after.length : innerEnd);
}

function prefixLines(textarea, prefix, toggle) {
  const [lineStart, lineEnd] = lineRange(textarea);
  const block = textarea.value.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const next = lines.map((line) => toggle && line.startsWith(prefix) ? line.slice(prefix.length) : `${prefix}${line}`).join("\n");
  textarea.value = `${textarea.value.slice(0, lineStart)}${next}${textarea.value.slice(lineEnd)}`;
  textarea.setSelectionRange(lineStart, lineStart + next.length);
}

function indentLines(textarea, amount) {
  const [lineStart, lineEnd] = lineRange(textarea);
  const next = textarea.value.slice(lineStart, lineEnd).split("\n").map((line) => amount > 0 ? `${" ".repeat(amount)}${line}` : line.replace(new RegExp(`^ {1,${Math.abs(amount)}}`), "")).join("\n");
  textarea.value = `${textarea.value.slice(0, lineStart)}${next}${textarea.value.slice(lineEnd)}`;
  textarea.setSelectionRange(lineStart, lineStart + next.length);
}

function appendHeadingId(textarea) {
  const [lineStart, lineEnd] = lineRange(textarea);
  const line = textarea.value.slice(lineStart, lineEnd).replace(/\s*\{#custom-id\}$/, "");
  const next = `${line} {#custom-id}`;
  textarea.value = `${textarea.value.slice(0, lineStart)}${next}${textarea.value.slice(lineEnd)}`;
  textarea.setSelectionRange(lineStart + next.length - 10, lineStart + next.length - 1);
}

function insertFootnote(textarea) {
  const refs = [...textarea.value.matchAll(/\[\^(\d+)\]/g)].map((match) => Number(match[1]));
  const nextId = (refs.sort((a, b) => b - a)[0] || 0) + 1;
  const ref = `[^${nextId}]`;
  const append = `${textarea.value.trimEnd() ? "\n\n" : ""}${ref}: footnote text`;
  replaceRange(textarea, ref, true, 2, ref.length - 1);
  textarea.value = `${textarea.value}${append}`;
}

function replaceRange(textarea, snippet, select = false, offsetStart = 0, offsetEnd = snippet.length) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  textarea.value = `${value.slice(0, start)}${snippet}${value.slice(end)}`;
  const selStart = start + offsetStart;
  const selEnd = start + offsetEnd;
  textarea.setSelectionRange(select ? selStart : selEnd, selEnd);
}

function lineRange(textarea) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEndIndex = value.indexOf("\n", end);
  return [lineStart, lineEndIndex === -1 ? value.length : lineEndIndex];
}

function indentSelection(textarea, amount, emit, event) {
  event.preventDefault();
  formatAction(textarea, "indent", { amount });
  emit();
}

function decodeEscapes(value) {
  return typeof value === "string" ? value.replace(/\\n/g, "\n").replace(/\\t/g, "\t") : value;
}
