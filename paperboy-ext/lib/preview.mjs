export function createPreviewController({
  container,
  loadButton,
  md,
  fetch: fetchImage,
  createObjectURL,
  revokeObjectURL,
}) {
  let markdown = "";
  let visible = !container.hidden;
  let rendered = false;
  let loading = false;
  let generation = 0;
  const blobUrls = new Set();
  const placeholders = () => [...container.querySelectorAll("[data-image-url]")];
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
    const available = visible && placeholders().length > 0;
    loadButton.hidden = !available;
    loadButton.disabled = !available || loading;
  }

  function render() {
    container.innerHTML = md.render(markdown);
    rendered = true;
    updateButton();
  }

  function reset() {
    generation += 1;
    container.replaceChildren();
    for (const url of blobUrls) revokeObjectURL(url);
    blobUrls.clear();
    markdown = "";
    rendered = false;
    loading = false;
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
    if (!visible || loading) return;
    const currentGeneration = generation;
    loading = true;
    updateButton();
    await Promise.all(placeholders().map(async (placeholder) => {
      try {
        const src = placeholder.dataset.imageUrl;
        const normalized = src.startsWith("//") ? `https:${src}` : src;
        if (!/^https?:\/\//i.test(normalized)) throw new Error("Unsupported image URL");
        const url = new URL(normalized);
        const response = await fetchImage(url.href, { credentials: "omit" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (generation !== currentGeneration) return;
        const blobUrl = createObjectURL(blob);
        blobUrls.add(blobUrl);
        const image = container.ownerDocument.createElement("img");
        image.src = blobUrl;
        image.alt = placeholder.dataset.imageAlt;
        placeholder.replaceWith(image);
      } catch {
        if (generation === currentGeneration) placeholder.dataset.imageState = "failed";
      }
    }));
    if (generation === currentGeneration) {
      loading = false;
      updateButton();
    }
  }

  loadButton.addEventListener("click", () => { void loadImages(); });
  updateButton();
  return { setMarkdown, show, hide, reset, loadImages };
}
