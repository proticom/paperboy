export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export function createPreviewController({
  container,
  loadButton,
  md,
  fetch: fetchImage,
  createObjectURL,
  revokeObjectURL,
  timeoutMs = 15000,
}) {
  let markdown = "";
  let visible = !container.hidden;
  let rendered = false;
  let loading = null;
  let generation = 0;
  const blobUrls = new Set();
  const requests = new Set();
  const placeholders = () => [...container.querySelectorAll("[data-image-url]")];
  const isRemoteImage = (placeholder) => /^(?:https?:)?\/\//i.test(placeholder.dataset.imageUrl);
  const escape = md.utils.escapeHtml;

  md.renderer.rules.image = (tokens, index, options, env) => {
    const token = tokens[index];
    const src = token.attrGet("src") || "";
    const alt = md.renderer.renderInlineAsText(token.children || [], options, env);
    if (/^(?:data|blob):/i.test(src)) {
      return `<img src="${escape(src)}" alt="${escape(alt)}">`;
    }
    return `<span class="deferred-image" data-image-url="${escape(src)}" data-image-alt="${escape(alt)}">${escape(alt || "image")} <a href="${escape(src)}">${escape(src)}</a></span>`;
  };

  function updateButton() {
    const available = visible && placeholders().some(isRemoteImage);
    loadButton.hidden = !available;
    loadButton.disabled = !available || loading !== null;
  }

  function render() {
    container.innerHTML = md.render(markdown);
    rendered = true;
    updateButton();
  }

  function reset() {
    generation += 1;
    for (const request of requests) request.abort();
    requests.clear();
    container.replaceChildren();
    for (const url of blobUrls) revokeObjectURL(url);
    blobUrls.clear();
    markdown = "";
    rendered = false;
    loading = null;
    updateButton();
  }

  function setMarkdown(value) {
    reset();
    markdown = value;
    if (visible) render();
  }

  function show() {
    visible = true;
    container.hidden = false;
    if (!rendered) render();
    updateButton();
  }

  function hide() {
    visible = false;
    container.hidden = true;
    updateButton();
  }

  async function loadImages() {
    if (!visible || loading !== null) return;
    const currentGeneration = generation;
    loading = currentGeneration;
    updateButton();
    try {
      await Promise.all(placeholders().map(async (placeholder) => {
        const request = new AbortController();
        requests.add(request);
        const aborted = new Promise((resolve, reject) => {
          request.signal.addEventListener("abort", () => reject(new Error("Image load aborted")), { once: true });
        });
        const timer = setTimeout(() => request.abort(), timeoutMs);
        try {
          const src = placeholder.dataset.imageUrl;
          const normalized = src.startsWith("//") ? `https:${src}` : src;
          if (!isRemoteImage(placeholder)) throw new Error("Unsupported image URL");
          const url = new URL(normalized);
          const response = await Promise.race([
            fetchImage(url.href, { credentials: "omit", signal: request.signal }), aborted,
          ]);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          if (!/^image\//i.test(response.headers?.get("content-type") || "")) throw new Error("Unsupported image type");
          if (Number(response.headers?.get("content-length")) > MAX_IMAGE_BYTES) throw new Error("Image too large");
          const blob = await Promise.race([response.blob(), aborted]);
          if (blob.size > MAX_IMAGE_BYTES) throw new Error("Image too large");
          if (generation !== currentGeneration) return;
          const blobUrl = createObjectURL(blob);
          blobUrls.add(blobUrl);
          const image = container.ownerDocument.createElement("img");
          image.src = blobUrl;
          image.alt = placeholder.dataset.imageAlt;
          placeholder.replaceWith(image);
        } catch {
          if (generation === currentGeneration) placeholder.dataset.imageState = "failed";
        } finally {
          clearTimeout(timer);
          requests.delete(request);
        }
      }));
    } finally {
      if (loading === currentGeneration) loading = null;
      updateButton();
    }
  }

  loadButton.addEventListener("click", () => { void loadImages(); });
  updateButton();
  return { setMarkdown, show, hide, reset, loadImages };
}
