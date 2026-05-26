// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bundlePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist/paperboy-widget.min.js",
);
const bundleSource = readFileSync(bundlePath, "utf8");

const FIXTURE_HTML = `
<main id="content">
  <h1>Test page</h1>
  <p>content text marker</p>
</main>
<div id="noise">
  <p>noise marker — must not be in the output</p>
</div>
`;

let writeTextSpy;

function resetDom({ preserveStorage = false } = {}) {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  delete window.__paperboyWidgetLoaded;
  if (!preserveStorage) {
    localStorage.clear();
  }
}

/** Mount fixture HTML, plant script tag, eval the built widget bundle. */
function mountFixture(html, dataset = {}, options = {}) {
  resetDom(options);
  document.body.innerHTML = html;

  const script = document.createElement("script");
  script.src = "paperboy-widget.min.js";
  for (const [key, value] of Object.entries(dataset)) {
    script.dataset[key] = value;
  }
  document.head.appendChild(script);

  // eslint-disable-next-line no-eval
  globalThis.eval(bundleSource);
}

function getMdButton() {
  return document.querySelector('.pbw-toggle-btn[aria-label="Markdown view"]');
}

function getWebButton() {
  return document.querySelector('.pbw-toggle-btn[aria-label="Web view"]');
}

describe("paperboy widget integration", () => {
  beforeEach(() => {
    writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextSpy },
      configurable: true,
    });
  });

  afterEach(() => {
    resetDom();
    vi.restoreAllMocks();
  });

  it("resolves the data-selector target and converts only that content", async () => {
    mountFixture(FIXTURE_HTML, { selector: "#content" });
    expect(document.querySelector(".pbw-toggle")).not.toBeNull();

    getMdButton().click();
    await Promise.resolve();

    const output = document.querySelector(".pbw-output");
    expect(output.textContent).toContain("content text marker");
    expect(output.textContent).not.toContain("noise marker");
  });

  it("uses an overlay panel by default and toggles visibility", async () => {
    mountFixture(FIXTURE_HTML, { selector: "#content" });
    const overlay = document.querySelector(".pbw-overlay");

    expect(overlay.style.display).not.toBe("block");

    getMdButton().click();
    await Promise.resolve();
    expect(overlay.style.display).toBe("block");

    getWebButton().click();
    await Promise.resolve();
    expect(overlay.style.display).toBe("none");
  });

  it("renders inline when data-render=inline", async () => {
    mountFixture(FIXTURE_HTML, { selector: "#content", render: "inline" });
    const overlay = document.querySelector(".pbw-overlay");

    getMdButton().click();
    await Promise.resolve();

    expect(document.querySelector(".pbw-inline.pbw-visible")).not.toBeNull();
    expect(overlay.style.display).not.toBe("block");
  });

  it("writes the markdown to the clipboard when the copy button is clicked", async () => {
    mountFixture(FIXTURE_HTML, { selector: "#content" });

    getMdButton().click();
    await Promise.resolve();

    document.querySelector(".pbw-overlay .pbw-copy-btn").click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(writeTextSpy).toHaveBeenCalledOnce();
    expect(String(writeTextSpy.mock.calls[0][0])).toMatch(/^# /);
  });

  it("persists the view selection in localStorage and restores it on next init", async () => {
    mountFixture(FIXTURE_HTML, { selector: "#content" });

    getMdButton().click();
    await Promise.resolve();
    expect(localStorage.getItem("paperboy-view")).toBe("md");

    mountFixture(FIXTURE_HTML, { selector: "#content" }, { preserveStorage: true });
    const overlay = document.querySelector(".pbw-overlay");
    expect(overlay.style.display).toBe("block");
  });
});
