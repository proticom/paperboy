export const PAPERBOY_WIDGET_STYLE = `
.pbw-toggle,
.pbw-overlay {
  --pbw-bg: rgba(245, 245, 243, 0.98);
  --pbw-surface: #ffffff;
  --pbw-border: #d8d8d5;
  --pbw-ink: #111111;
  --pbw-muted: #5e5e5a;
  --pbw-pill: #e9ebf1;
  --pbw-accent: #1f4fd6;
}

@media (prefers-color-scheme: dark) {
  .pbw-toggle,
  .pbw-overlay {
    --pbw-bg: rgba(18, 18, 18, 0.98);
    --pbw-surface: #1d1d1d;
    --pbw-border: #363636;
    --pbw-ink: #f4f4f4;
    --pbw-muted: #b6b6b6;
    --pbw-pill: #2f3342;
    --pbw-accent: #78a3ff;
  }
}

.pbw-toggle {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--pbw-border);
  background: var(--pbw-surface);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  transition: opacity 0.2s ease-out, transform 0.2s ease-out;
}

.pbw-toggle * {
  box-sizing: border-box;
}

.pbw-toggle.pbw-collapsed {
  opacity: 0;
  transform: scale(0.8);
  pointer-events: none;
}

.pbw-toggle-pill {
  position: absolute;
  left: 4px;
  top: 4px;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: var(--pbw-pill);
  transition: transform 0.18s ease-out;
  pointer-events: none;
}

.pbw-toggle[data-active="1"] .pbw-toggle-pill {
  transform: translateX(0);
}

.pbw-toggle[data-active="2"] .pbw-toggle-pill {
  transform: translateX(36px);
}

.pbw-toggle-btn {
  position: relative;
  z-index: 1;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--pbw-muted);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}

.pbw-toggle-btn svg {
  width: 16px;
  height: 16px;
}

.pbw-toggle-btn.pbw-active {
  color: var(--pbw-ink);
}

.pbw-toggle-btn:focus-visible {
  outline: 2px solid var(--pbw-accent);
  outline-offset: -2px;
}

.pbw-minimize-btn {
  position: relative;
  z-index: 1;
  width: 20px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--pbw-muted);
  border-radius: 0 999px 999px 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0 4px 0 0;
  margin-left: -2px;
}

.pbw-minimize-btn svg {
  width: 10px;
  height: 10px;
}

.pbw-minimize-btn:hover {
  color: var(--pbw-ink);
}

.pbw-minimize-btn:focus-visible {
  outline: 2px solid var(--pbw-accent);
  outline-offset: -2px;
}

.pbw-restore-btn {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 2147483646;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid var(--pbw-border);
  background: var(--pbw-surface);
  color: var(--pbw-muted);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
  display: none;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.pbw-restore-btn svg {
  width: 16px;
  height: 16px;
}

.pbw-restore-btn:hover {
  color: var(--pbw-ink);
  border-color: var(--pbw-accent);
}

.pbw-restore-btn:focus-visible {
  outline: 2px solid var(--pbw-accent);
  outline-offset: -2px;
}

.pbw-restore-btn.pbw-visible {
  display: inline-flex;
}

.pbw-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483645;
  display: none;
  overflow: auto;
  background: var(--pbw-bg);
  padding: 28px 20px 92px;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.pbw-panel {
  max-width: 1000px;
  margin: 0 auto;
  position: relative;
}

.pbw-copy-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  border: 1px solid var(--pbw-border);
  background: var(--pbw-surface);
  color: var(--pbw-muted);
  border-radius: 8px;
  padding: 6px 10px;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
}

.pbw-copy-btn svg {
  width: 14px;
  height: 14px;
}

.pbw-copy-btn:hover {
  border-color: var(--pbw-accent);
  color: var(--pbw-ink);
}

.pbw-copy-btn:focus-visible {
  outline: 2px solid var(--pbw-accent);
  outline-offset: 2px;
}

.pbw-output {
  margin: 0;
  background: var(--pbw-surface);
  color: var(--pbw-ink);
  border: 1px solid var(--pbw-border);
  border-radius: 12px;
  min-height: 260px;
  padding: 24px;
  padding-right: 92px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family:
    "Courier Prime",
    "Courier New",
    ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  font-size: 12px;
  line-height: 1.55;
}

.pbw-msg {
  margin: 0 auto 12px;
  max-width: 1000px;
  padding: 10px 12px;
  border: 1px solid var(--pbw-border);
  border-radius: 8px;
  background: var(--pbw-surface);
  color: var(--pbw-muted);
  font-size: 12px;
}

@media (max-width: 600px) {
  .pbw-overlay {
    padding: 16px 12px 80px;
  }

  .pbw-output {
    font-size: 11px;
    padding: 16px;
    padding-right: 80px;
  }
}
`;
