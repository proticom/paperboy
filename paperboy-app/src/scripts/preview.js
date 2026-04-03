export function createPreview(previewPane) {
  const copyIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="9" y="9" width="10" height="10" rx="1.5"></rect>
      <path d="M6 15H5a1 1 0 0 1 -1 -1V5a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v1"></path>
    </svg>
  `;
  const checkIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 6L9 17l-5-5"></path>
    </svg>
  `;
  const md = window.markdownit({ html: false, linkify: true, typographer: true })
    .use(window.markdownitFootnote)
    .use(window.markdownitDeflist)
    .use(window.markdownitMark)
    .use(window.markdownitSub)
    .use(window.markdownitSup)
    .use(window.markdownitTaskLists, { enabled: true });
  md.core.ruler.push("source_line_attrs", (state) => {
    state.tokens.forEach((token) => {
      if (token.map && token.nesting === 1) {
        token.attrSet("data-source-line", String(token.map[0]));
        token.attrSet("data-source-end-line", String(token.map[1]));
      }
    });
  });

  let blocks = [];

  const maxScroll = () => Math.max(0, previewPane.scrollHeight - previewPane.clientHeight);
  const snapshot = (totalLines) => blocks.map((block, index) => ({
    start: block.start,
    end: block.end,
    top: block.el.offsetTop,
    nextTop: index < blocks.length - 1 ? blocks[index + 1].el.offsetTop : Math.max(block.el.offsetTop, maxScroll()),
    logicalEnd: index < blocks.length - 1 ? Math.max(block.end, blocks[index + 1].start) : Math.max(block.end, totalLines - 1)
  }));
  const scale = (ratio) => maxScroll() * Math.min(1, Math.max(0, ratio));

  function lineToScrollTop(line, totalLines) {
    const points = snapshot(totalLines);
    if (!points.length || totalLines <= 1) return scale(line / Math.max(1, totalLines - 1));
    if (line <= points[0].start) return 0;
    for (const point of points) {
      if (line < point.logicalEnd || point === points[points.length - 1]) {
        const span = Math.max(1, point.logicalEnd - point.start);
        const progress = Math.min(1, Math.max(0, (line - point.start) / span));
        return point.top + (point.nextTop - point.top) * progress;
      }
    }
    return maxScroll();
  }

  function scrollTopToLine(totalLines) {
    const points = snapshot(totalLines);
    const top = previewPane.scrollTop;
    if (!points.length || totalLines <= 1) return Math.round((top / Math.max(1, maxScroll())) * Math.max(0, totalLines - 1));
    if (top <= points[0].top) return points[0].start;
    for (const point of points) {
      if (top < point.nextTop || point === points[points.length - 1]) {
        const span = Math.max(1, point.nextTop - point.top);
        const progress = Math.min(1, Math.max(0, (top - point.top) / span));
        return Math.round(point.start + (point.logicalEnd - point.start) * progress);
      }
    }
    return totalLines - 1;
  }

  async function copyCodeBlockText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const scratch = document.createElement("textarea");
    scratch.value = text;
    scratch.setAttribute("readonly", "");
    scratch.style.position = "absolute";
    scratch.style.left = "-9999px";
    document.body.appendChild(scratch);
    scratch.select();
    document.execCommand("copy");
    scratch.remove();
  }

  function addCodeCopyButtons() {
    previewPane.querySelectorAll("pre").forEach((pre) => {
      const code = pre.querySelector("code");
      if (!code) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "code-copy-btn";
      button.setAttribute("aria-label", "Copy code");
      button.innerHTML = copyIcon;

      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        try {
          await copyCodeBlockText(code.textContent || "");
          button.innerHTML = checkIcon;
          button.classList.add("is-copied");
          setTimeout(() => {
            button.classList.remove("is-copied");
            button.innerHTML = copyIcon;
          }, 1400);
        } catch {
          button.classList.add("copy-failed");
          setTimeout(() => button.classList.remove("copy-failed"), 1400);
        }
      });

      pre.appendChild(button);
    });
  }

  return {
    getTopSourceLine(totalLines) {
      return scrollTopToLine(totalLines);
    },
    onScroll(callback) {
      previewPane.addEventListener("scroll", callback);
    },
    render(markdown, { anchorLine = 0, totalLines = 1, resetScroll = false } = {}) {
      previewPane.innerHTML = markdown.trim()
        ? md.render(markdown)
        : `<div class="empty-preview"><img src="./assets/paperboy-logo.svg" alt="" class="empty-preview-logo" aria-hidden="true" /><p>Open a file or type here to see a preview. Paperboy can import Markdown, PDF, HTML, and other formats.</p></div>`;
      addCodeCopyButtons();
      blocks = [...previewPane.querySelectorAll("[data-source-line]")].map((el) => ({
        el,
        start: Number(el.dataset.sourceLine) || 0,
        end: Number(el.dataset.sourceEndLine) || 0
      }));
      previewPane.scrollTop = resetScroll ? 0 : lineToScrollTop(anchorLine, totalLines);
    },
    scrollToSourceLine(line, totalLines) {
      previewPane.scrollTop = lineToScrollTop(line, totalLines);
    }
  };
}
