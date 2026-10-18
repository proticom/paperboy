import { createTurndownService, prepareCodeBlocks, wrapTableFragment } from "@proticom/paperboy-converter/turndown";
import { absolutizeUrls as absolutizePickedUrls, unwrapScriptLinks } from "@proticom/paperboy-converter/helpers";

const turndownService = createTurndownService();

function flattenShadowRoots(root) {
  for (const template of [...root.children]) {
    if (template.localName !== "template" || !template.hasAttribute("shadowrootmode")) {
      flattenShadowRoots(template);
      continue;
    }
    if (template.getAttribute("shadowrootmode") !== "open") {
      template.remove();
      continue;
    }
    const host = root;
    const light = [...host.childNodes].filter((node) => node !== template);
    for (const slot of template.content.querySelectorAll("slot")) {
      const name = slot.getAttribute("name") || "";
      const assigned = light.filter((node) => (node.nodeType === 1 || node.nodeType === 3) && node.parentNode === host
        && (node.nodeType === 1 ? node.getAttribute("slot") || "" : "") === name);
      slot.replaceWith(...(assigned.length ? assigned : [...slot.childNodes]));
    }
    light.filter((node) => node.parentNode === host).forEach((node) => node.remove());
    flattenShadowRoots(template.content);
    template.replaceWith(template.content);
  }
}

export function parseHtmlToDocument(html, url, DOMParser = globalThis.DOMParser) {
  const parser = new DOMParser();
  const documentClone = parser.parseFromString(html, "text/html");

  if (documentClone.head && url) {
    const base = documentClone.createElement("base");
    base.setAttribute("href", url);
    documentClone.head.prepend(base);
  }

  flattenShadowRoots(documentClone);
  prepareCodeBlocks(documentClone);
  return documentClone;
}

function readabilityOverCollapsed(article, body, DOMParser) {
  const textLength = (root) => {
    const clone = root.cloneNode(true);
    clone.querySelectorAll("style, script, noscript, template").forEach((node) => node.remove());
    return (clone.textContent || "").length;
  };
  const articleRoot = new DOMParser().parseFromString(`<html><body>${article?.content || ""}</body></html>`, "text/html");
  const articleText = textLength(articleRoot.body);
  const bodyText = body ? textLength(body) : 0;
  if (bodyText < 1000) return false;
  return articleText < bodyText * 0.3;
}

function pickMainContainer(documentClone) {
  return (
    documentClone.querySelector("main") ||
    documentClone.querySelector("[role=main]") ||
    documentClone.body
  );
}

function stripPageChrome(documentClone) {
  const selectors = [
    "nav",
    "aside",
    "[role=navigation]",
    "[role=banner]",
    "[role=complementary]",
    "[role=contentinfo]",
    "[aria-hidden=true]",
  ];
  for (const sel of selectors) {
    documentClone.querySelectorAll(sel).forEach((el) => el.remove());
  }
  // <header>/<footer> only at the page level, not inside articles/sections.
  documentClone.querySelectorAll("body > header, body > footer").forEach((el) =>
    el.remove(),
  );
  documentClone
    .querySelectorAll("body > div header:not(article header):not(section header)")
    .forEach((el) => {
      const closestArticleOrSection = el.closest("article, section, main");
      if (!closestArticleOrSection) el.remove();
    });
  documentClone
    .querySelectorAll("body > div footer:not(article footer):not(section footer)")
    .forEach((el) => {
      const closestArticleOrSection = el.closest("article, section, main");
      if (!closestArticleOrSection) el.remove();
    });
}

const anchorAttribute = "data-paperboy-anchor";
const anchorSelector = "h1, h2, h3, h4, h5, h6, p, pre";

function excludedCode(node) {
  const boundary = node.closest("article, main, [role=main]");
  const tokens = boundary
    ? /(?:^|[\s_-])(?:comments?|related|newsletter|promo|share|sharing|subscribe|nav(?:bar|igation)?)(?=$|[\s_-])/i
    : /(?:^|[\s_-])(?:comments?|related|footer|sidebar|newsletter|promo|share|sharing|subscribe|nav(?:bar|igation)?)(?=$|[\s_-])/i;
  for (let parent = node; parent && parent !== boundary && !parent.matches("html, body"); parent = parent.parentElement) {
    if (parent.matches("footer, nav, [role=navigation], [role=contentinfo]")) return true;
    if (!boundary && parent.matches("aside, [role=banner], [role=complementary]")) return true;
    const identity = `${parent.id} ${parent.getAttribute("class") || ""}`;
    if (boundary && parent.matches("aside")) {
      const spaced = identity.replace(/([a-z])([A-Z])/g, "$1-$2");
      if (/(?:^|[\s_-])(?:notes?|callouts?)(?=$|[\s_-])/i.test(spaced) || parent.classList.contains("starlight-aside")) continue;
      if (/(?:^|[\s_-])(?:sidebar|widgets?|related|popular)(?=$|[\s_-])/i.test(spaced)) return true;
    }
    if (tokens.test(identity)) return true;
  }
  return false;
}

function reinsertCode(article, source) {
  const anchors = [...source.querySelectorAll(`[${anchorAttribute}]`)];
  const retained = new Map([...article.querySelectorAll(`[${anchorAttribute}]`)]
    .map((node) => [node.getAttribute(anchorAttribute), node]));
  const surviving = anchors.filter((node) => retained.has(node.getAttribute(anchorAttribute)));
  if (!surviving.length) return 0;
  let region = surviving[0].parentElement;
  while (region && !surviving.every((node) => region.contains(node))) region = region.parentElement;
  let introSibling = region?.previousElementSibling;
  while (introSibling?.matches("aside, nav, [role=navigation], [role=complementary]") && !introSibling.querySelector("pre")) {
    introSibling = introSibling.previousElementSibling;
  }
  let previous = null;
  let inserted = 0;
  for (let index = 0; index < anchors.length; index++) {
    const original = anchors[index];
    const id = original.getAttribute(anchorAttribute);
    if (retained.has(id)) {
      previous = retained.get(id);
      continue;
    }
    if (original.localName !== "pre" || !original.textContent.trim() || excludedCode(original)) continue;
    const following = anchors.slice(index + 1).find((node) => retained.has(node.getAttribute(anchorAttribute)));
    let branch = original;
    while (branch.parentElement && branch.parentElement !== region?.parentElement) branch = branch.parentElement;
    const adjacentIntro = branch === introSibling && !branch.querySelector("h2, h3, h4, h5, h6");
    const adjacentCode = branch === region?.nextElementSibling
      && (branch.localName === "pre" || branch.matches("mdn-code-example, .code-example, .highlight, .code-block"));
    if (!(previous && following) && !region?.contains(original) && !adjacentIntro && !adjacentCode) continue;
    const clone = article.importNode(original, true);
    const callout = original.closest("aside, [role=note]");
    const boundary = original.closest("article, main, [role=main]");
    const calloutBlocks = callout && boundary?.contains(callout) ? [...callout.querySelectorAll("p, pre")] : [];
    const leads = calloutBlocks.slice(0, calloutBlocks.indexOf(original))
      .filter((node) => node.localName === "p" && node.closest("aside, [role=note]") === callout
        && !retained.has(node.getAttribute(anchorAttribute)))
      .map((node) => article.importNode(node, true));
    if (previous) previous.after(...leads, clone);
    else if (following) retained.get(following.getAttribute(anchorAttribute)).before(...leads, clone);
    else continue;
    for (const lead of leads) retained.set(lead.getAttribute(anchorAttribute), lead);
    retained.set(id, clone);
    previous = clone;
    inserted++;
  }
  return inserted;
}

function absolutizeUrls(root, base) {
  const absolute = (value) => {
    if (!value || /^(?:#|mailto:|tel:|data:)/i.test(value)) return value;
    try { return new URL(value, base).href; } catch { return value; }
  };
  for (const node of root.querySelectorAll("[href], [src], [srcset]")) {
    for (const attribute of ["href", "src"]) {
      if (node.hasAttribute(attribute)) node.setAttribute(attribute, absolute(node.getAttribute(attribute)));
    }
    if (node.hasAttribute("srcset")) {
      node.setAttribute("srcset", node.getAttribute("srcset").replace(/(^|,)(\s*)(data:[^\s]+|[^,\s]+)([^,]*)/gi,
        (_match, separator, space, value, descriptor) => separator + space + absolute(value) + descriptor));
    }
  }
}

export function convertHtmlToMarkdown(payload, {
  DOMParser = globalThis.DOMParser,
  Readability = globalThis.Readability,
} = {}) {
  if (payload.fromPicker) {
    if (payload.html) {
      const document = new DOMParser().parseFromString("<html><body></body></html>", "text/html");
      const template = document.createElement("template");
      template.innerHTML = payload.html;
      unwrapScriptLinks(template.content);
      if (payload.baseUrl || payload.url) {
        absolutizePickedUrls(template.content, payload.baseUrl || payload.url);
      }
      const wrapper = document.createElement("div");
      wrapper.append(template.content.cloneNode(true));
      payload = { ...payload, html: wrapper.innerHTML };
    }
    const markdownBody = turndownService.turndown(
      parseHtmlToDocument(`<html><body>${wrapTableFragment(payload.html ?? "")}</body></html>`, payload.url, DOMParser).body.innerHTML,
    ).trim();
    const title = payload.title || "Selected region";
    const markdownLines = [`# ${title}`];
    if (payload.url) markdownLines.push("", `Source: ${payload.url}`);
    markdownLines.push("", markdownBody || "_No markdown generated._");
    return {
      markdown: `${markdownLines.join("\n").trim()}\n`,
      title,
      length: markdownBody.length,
      conversionPath: "picker",
    };
  }

  // Readability mutates the document during parse, so keep a pristine clone
  // for the fallback branch in case we decide to bypass.
  const documentClone = parseHtmlToDocument(payload.html, payload.url, DOMParser);
  const fallbackClone = parseHtmlToDocument(payload.html, payload.url, DOMParser);

  for (const document of [documentClone, fallbackClone]) {
    document.querySelectorAll(anchorSelector).forEach((node, index) => node.setAttribute(anchorAttribute, String(index)));
  }
  const reader = new Readability(documentClone, {
    charThreshold: 40,
    keepClasses: false,
    nbTopCandidates: 5,
  });
  const article = reader.parse();
  const overCollapsed = readabilityOverCollapsed(article, fallbackClone.body, DOMParser);
  const articleDocument = new DOMParser().parseFromString(`<html><body>${article?.content || ""}</body></html>`, "text/html");
  let contentHtml;
  let conversionPath = "fallback";
  if (article?.content && !overCollapsed) {
    const inserted = reinsertCode(articleDocument, fallbackClone);
    contentHtml = articleDocument.body.innerHTML;
    conversionPath = inserted ? `readability+reinserted ${inserted}` : "readability";
  } else {
    stripPageChrome(fallbackClone);
    const fallbackContent = pickMainContainer(fallbackClone);
    if (fallbackContent) absolutizeUrls(fallbackContent, fallbackClone.querySelector("base")?.getAttribute("href") || payload.url);
    contentHtml = fallbackContent?.innerHTML ?? "";
  }
  const outputDocument = new DOMParser().parseFromString(`<html><body>${contentHtml}</body></html>`, "text/html");
  outputDocument.querySelectorAll(`[${anchorAttribute}]`).forEach((node) => node.removeAttribute(anchorAttribute));
  contentHtml = outputDocument.body.innerHTML;

  if (!contentHtml.trim()) {
    throw new Error(
      "No readable content was found. Try another page or scroll the page first.",
    );
  }

  const markdownBody = turndownService.turndown(contentHtml).trim();
  const title = article?.title || payload.title || "Untitled page";

  const markdownLines = [`# ${title}`];

  if (payload.url) {
    markdownLines.push("", `Source: ${payload.url}`);
  }

  if (article?.byline) {
    markdownLines.push("", `Byline: ${article.byline}`);
  }

  markdownLines.push("", markdownBody || "_No markdown generated._");

  return {
    markdown: `${markdownLines.join("\n").trim()}\n`,
    title,
    length: article?.length ?? markdownBody.length,
    conversionPath,
  };
}
