export const PAPERBOY_WIDGET_STYLE = `
/* Paperboy widget — paper-aesthetic theme.
 *
 * All colors are exposed as CSS custom properties scoped to the
 * widget's root elements (.pbw-toggle, .pbw-overlay, .pbw-restore-btn,
 * .pbw-inline). Host pages can override any of them by re-declaring
 * the variable on a higher-specificity rule, e.g. setting --pbw-bg to
 * transparent so the widget inherits the host's own paper texture.
 */
.pbw-toggle,
.pbw-overlay,
.pbw-restore-btn,
.pbw-inline {
  --pbw-bg: #e9e5db;
  --pbw-surface: transparent;
  --pbw-border: #1a1a1a;
  --pbw-ink: #1a1a1a;
  --pbw-muted: #595959;
  --pbw-font-ui:
    "IM Fell English", "Times New Roman", Times, serif;
  --pbw-font-mono:
    "Courier Prime", "Courier New", ui-monospace, SFMono-Regular,
    Menlo, monospace;
  /* Markdown panel can override font/colors independently. Defaults to
     the same palette as the toggle. */
  --pbw-md-font: var(--pbw-font-mono);
  --pbw-md-color: var(--pbw-ink);
  --pbw-md-bg: var(--pbw-surface);
  /* Toggle + copy placement (overlay mode). Set to a single keyword
     via the JS, which writes the appropriate top/bottom/left/right
     custom property at runtime. */
  --pbw-toggle-top: auto;
  --pbw-toggle-bottom: 16px;
  --pbw-toggle-left: auto;
  --pbw-toggle-right: 16px;
}

@media (prefers-color-scheme: dark) {
  .pbw-toggle,
  .pbw-overlay,
  .pbw-restore-btn,
  .pbw-inline {
    --pbw-bg: #1a1a1a;
    --pbw-surface: transparent;
    --pbw-border: #ffffff;
    --pbw-ink: #ffffff;
    --pbw-muted: #a0a0a0;
  }
}

/* --- Toggle (always present) --------------------------------------- */

.pbw-toggle {
  position: fixed;
  top: var(--pbw-toggle-top);
  bottom: var(--pbw-toggle-bottom);
  left: var(--pbw-toggle-left);
  right: var(--pbw-toggle-right);
  z-index: 2147483646;
  /* Flex (not grid) so the toggle handles any number of children inline:
     two toggle cells + a minimize chevron. Grid-template-columns: auto
     auto would wrap the third child onto a new row, making the toggle
     two rows tall. */
  display: inline-flex;
  align-items: stretch;
  padding: 4px;
  border: 1px solid var(--pbw-border);
  background: var(--pbw-surface);
  color: var(--pbw-ink);
  font-family: var(--pbw-font-ui);
  transition: opacity 0.2s ease-out, transform 0.2s ease-out;
}

.pbw-toggle * {
  box-sizing: border-box;
}

.pbw-toggle.pbw-collapsed {
  opacity: 0;
  transform: scale(0.85);
  pointer-events: none;
}

/* When data-toggle-mount-target embeds the toggle into a host container
   instead of floating it on body, switch out of position: fixed. Use
   position: relative (not static) so the absolutely-positioned sliding
   pill inside the toggle still anchors to the toggle itself rather than
   walking up to the nearest positioned ancestor (which on most sites
   is <body>, drawing a giant rectangle across the page). */
.pbw-toggle.pbw-scoped,
.pbw-restore-btn.pbw-scoped {
  position: relative;
  top: auto;
  bottom: auto;
  left: auto;
  right: auto;
}

.pbw-toggle-cells {
  position: relative;
  display: inline-flex;
  align-items: stretch;
}

.pbw-toggle-pill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 50%;
  border: 1px solid var(--pbw-border);
  background: var(--pbw-surface);
  transition: transform 180ms ease-out;
  pointer-events: none;
}

.pbw-toggle[data-active="1"] .pbw-toggle-pill {
  transform: translateX(0);
}

.pbw-toggle[data-active="2"] .pbw-toggle-pill {
  transform: translateX(100%);
}

.pbw-toggle-btn {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--pbw-muted);
  cursor: pointer;
  padding: 4px 8px;
  transition: opacity 160ms;
  opacity: 0.4;
}

.pbw-toggle-btn.pbw-active {
  color: var(--pbw-ink);
  opacity: 1;
}

.pbw-toggle-btn:hover:not(.pbw-active) {
  opacity: 0.75;
}

.pbw-toggle-btn:focus-visible {
  outline: 1px solid var(--pbw-ink);
  outline-offset: -2px;
}

.pbw-toggle-btn svg {
  width: 11px;
  height: 11px;
}

/* Label override: when data-labels=A,B is set on the script tag, the
   toggle cells contain text instead of icons. Sized to match the rest
   of the masthead's toggle controls (e.g. EditionToggle) — bold
   uppercase 10-12px Inter-fell, wide tracking, breathing room on the
   button padding. */
.pbw-toggle.pbw-labels .pbw-toggle-btn {
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  line-height: 1;
}

@media (min-width: 640px) {
  .pbw-toggle.pbw-labels .pbw-toggle-btn { font-size: 12px; }
}

.pbw-toggle.pbw-labels .pbw-toggle-btn svg {
  display: none;
}

/* Compact variant — opt-in via data-compact="on" on the script tag.
   Used by in-page demo cards/panels where the toggle needs to be
   visually subordinate to the demo content. The masthead instance
   does NOT set data-compact. */
.pbw-toggle.pbw-compact {
  padding: 1px;
}

.pbw-toggle.pbw-compact .pbw-toggle-btn {
  padding: 2px 6px;
}

.pbw-toggle.pbw-compact .pbw-toggle-btn svg {
  width: 11px;
  height: 11px;
}

.pbw-toggle.pbw-compact.pbw-labels .pbw-toggle-btn {
  padding: 3px 8px;
  font-size: 11px;
}

/* When data-show-collapse="off", hide the minimize chevron entirely.
   Used by hosts that don't want the user to be able to dismiss the
   toggle (e.g. the paperboy site masthead, where the toggle is part
   of the page chrome). */
.pbw-toggle.pbw-no-collapse .pbw-minimize-btn {
  display: none;
}

/* Minimize chevron tucked to the right of the toggle */
.pbw-minimize-btn {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  border: 0;
  border-left: 1px solid var(--pbw-border);
  background: transparent;
  color: var(--pbw-muted);
  cursor: pointer;
  padding: 0 2px;
  margin-left: 2px;
}

.pbw-minimize-btn svg {
  width: 8px;
  height: 8px;
}

.pbw-minimize-btn:hover {
  color: var(--pbw-ink);
}

.pbw-minimize-btn:focus-visible {
  outline: 1px solid var(--pbw-ink);
  outline-offset: -2px;
}

/* --- Restore button (collapsed state) ------------------------------- */

.pbw-restore-btn {
  position: fixed;
  top: var(--pbw-toggle-top);
  bottom: var(--pbw-toggle-bottom);
  left: var(--pbw-toggle-left);
  right: var(--pbw-toggle-right);
  z-index: 2147483646;
  width: 28px;
  height: 22px;
  border: 1px solid var(--pbw-border);
  background: var(--pbw-surface);
  color: var(--pbw-muted);
  display: none;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  font-family: var(--pbw-font-ui);
}

.pbw-restore-btn svg {
  width: 11px;
  height: 11px;
}

.pbw-restore-btn:hover {
  color: var(--pbw-ink);
}

.pbw-restore-btn:focus-visible {
  outline: 1px solid var(--pbw-ink);
  outline-offset: -2px;
}

.pbw-restore-btn.pbw-visible {
  display: inline-flex;
}

/* --- Overlay rendering (default render mode) ----------------------- */

.pbw-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483645;
  display: none;
  overflow: auto;
  background: var(--pbw-bg);
  padding: 28px 20px 92px;
  font-family: var(--pbw-font-ui);
  color: var(--pbw-ink);
}

.pbw-panel {
  max-width: 1000px;
  margin: 0 auto;
  position: relative;
}

.pbw-output {
  margin: 0;
  background: var(--pbw-md-bg);
  color: var(--pbw-md-color);
  border: 1px solid var(--pbw-border);
  padding: 16px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--pbw-md-font);
  font-size: 12px;
  line-height: 1.55;
}

.pbw-msg {
  margin: 0 auto 10px;
  max-width: 1000px;
  padding: 6px 10px;
  border: 1px solid var(--pbw-border);
  background: var(--pbw-surface);
  color: var(--pbw-muted);
  font-family: var(--pbw-font-ui);
  font-size: 11px;
}

/* Copy button — bare icon, no background. Position is set per-instance
   via data-copy-position (top-right by default; corners + "none" all
   supported). */
.pbw-copy-btn {
  position: absolute;
  border: 0;
  background: transparent;
  color: var(--pbw-muted);
  cursor: pointer;
  padding: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.pbw-copy-btn[data-position="top-right"] { top: 4px; right: 4px; }
.pbw-copy-btn[data-position="top-left"] { top: 4px; left: 4px; }
.pbw-copy-btn[data-position="bottom-right"] { bottom: 4px; right: 4px; }
.pbw-copy-btn[data-position="bottom-left"] { bottom: 4px; left: 4px; }
.pbw-copy-btn[data-position="none"] { display: none; }

.pbw-copy-btn:hover,
.pbw-copy-btn:focus-visible {
  color: var(--pbw-ink);
  outline: none;
}

.pbw-copy-btn svg {
  width: 14px;
  height: 14px;
}

.pbw-copy-label {
  display: none;
}

/* Optional syntax coloring for the markdown source. Activated when
   the script tag has data-md-syntax="on" — the widget wraps detected
   tokens in spans that pick up these styles. All colors fall back to
   the standard ink/muted colors so the host page can override them.
   Off by default; the plain <pre> just shows monochrome markdown. */
.pbw-output .pbw-md-heading { color: var(--pbw-md-heading, var(--pbw-ink)); font-weight: 700; }
.pbw-output .pbw-md-blockquote { color: var(--pbw-md-blockquote, var(--pbw-muted)); font-style: italic; }
.pbw-output .pbw-md-bullet { color: var(--pbw-md-bullet, var(--pbw-muted)); }
.pbw-output .pbw-md-fence { color: var(--pbw-md-fence, var(--pbw-muted)); }
.pbw-output .pbw-md-code { color: var(--pbw-md-code, var(--pbw-ink)); background: rgba(0, 0, 0, 0.06); }
.pbw-output .pbw-md-link { color: var(--pbw-md-link, var(--pbw-ink)); text-decoration: underline; }

@media (max-width: 600px) {
  .pbw-overlay {
    padding: 16px 12px 72px;
  }
  .pbw-output {
    font-size: 11px;
    padding: 12px;
  }
}

/* --- Inline rendering (data-render="inline") ----------------------- */
/*
 * In inline mode the widget hides the target nodes and inserts an
 * inline output panel in their place — no overlay covers the viewport.
 * Background is transparent by default so it inherits the host page's
 * paper texture; the host can override the variables to taste.
 */
.pbw-inline {
  position: relative;
  display: none;
  background: var(--pbw-surface);
  color: var(--pbw-ink);
  border: 1px solid var(--pbw-border);
  padding: 8px;
  font-family: var(--pbw-font-mono);
}

.pbw-inline.pbw-visible {
  display: block;
}

.pbw-inline .pbw-output {
  border: 0;
  padding: 0;
  padding-right: 28px;
}
`;
