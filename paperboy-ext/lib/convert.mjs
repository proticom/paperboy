import { createTurndownService, prepareCodeBlocks } from "@proticom/paperboy-converter/turndown";

const turndownService = createTurndownService();

function flattenShadowRoots(root) {
  root.querySelectorAll('template[shadowrootmode="closed"]').forEach((template) => template.remove());
  for (const template of root.querySelectorAll('template[shadowrootmode="open"]')) {
    flattenShadowRoots(template.content);
    template.replaceWith(template.content);
  }
}

function parseHtmlToDocument(html, url, DOMParser) {
  const parser = new DOMParser();
  const documentClone = parser.parseFromString(html, "text/html");

  if (documentClone.head && url) {
    const base = documentClone.createElement("base");
    base.href = url;
    documentClone.head.prepend(base);
  }

  flattenShadowRoots(documentClone);
  prepareCodeBlocks(documentClone);
  return documentClone;
}

function readabilityOverCollapsed(article, body) {
  const articleText = (article?.textContent ?? "").length;
  const bodyText = (body?.textContent ?? "").length;
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

export function convertHtmlToMarkdown(payload, {
  DOMParser = globalThis.DOMParser,
  Readability = globalThis.Readability,
} = {}) {
  if (payload.fromPicker) {
    const markdownBody = turndownService.turndown(
      parseHtmlToDocument(`<html><body>${payload.html ?? ""}</body></html>`, payload.url, DOMParser).body.innerHTML,
    ).trim();
    const title = payload.title || "Selected region";
    const markdownLines = [`# ${title}`];
    if (payload.url) markdownLines.push("", `Source: ${payload.url}`);
    markdownLines.push("", markdownBody || "_No markdown generated._");
    return {
      markdown: `${markdownLines.join("\n").trim()}\n`,
      title,
      length: markdownBody.length,
    };
  }

  // Readability mutates the document during parse, so keep a pristine clone
  // for the fallback branch in case we decide to bypass.
  const documentClone = parseHtmlToDocument(payload.html, payload.url, DOMParser);
  const fallbackClone = parseHtmlToDocument(payload.html, payload.url, DOMParser);

  const reader = new Readability(documentClone, {
    charThreshold: 40,
    keepClasses: false,
    nbTopCandidates: 5,
  });
  const article = reader.parse();
  const overCollapsed = readabilityOverCollapsed(article, fallbackClone.body);
  stripPageChrome(fallbackClone);
  const fallbackContent = pickMainContainer(fallbackClone);

  const countCode = (root) => [...root.querySelectorAll("pre")]
    .filter((pre) => pre.textContent.trim()).length;
  const articleDocument = new DOMParser().parseFromString(article?.content || "", "text/html");
  const droppedCode = fallbackContent && countCode(articleDocument) < countCode(fallbackContent);
  let contentHtml;
  if (article?.content && !droppedCode && !overCollapsed) {
    contentHtml = article.content;
  } else {
    contentHtml = fallbackContent?.innerHTML ?? "";
  }

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
  };
}
