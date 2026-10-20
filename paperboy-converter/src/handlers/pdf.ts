import { extractText, getDocumentProxy } from "unpdf";

import { stripFileExtension, toBytes } from "../helpers.js";
import type { ConvertInputData, ConvertOptions, ConvertResult } from "../types.js";
import { renderPdfPage, type PdfStructureNode, type PdfTextItem } from "./pdf-structure.js";

interface PageResult {
  markdown: string;
  hasText: boolean;
}

interface PublicStructureNode {
  role: string;
  children: readonly (PublicStructureNode | { type: string; id?: string | null })[];
}

function structureNode(node: PublicStructureNode): PdfStructureNode {
  return {
    role: node.role,
    children: node.children.flatMap((child): PdfStructureNode["children"][number][] => {
      if ("role" in child) return [structureNode(child)];
      return child.type === "content" && typeof child.id === "string" ? [{ kind: "content", id: child.id }] : [];
    }),
  };
}

async function structuredPages(bytes: Uint8Array): Promise<PageResult[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const pages: { items: PdfTextItem[]; tree: PdfStructureNode | null }[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const tree = await page.getStructTree();
      const content = await page.getTextContent({ includeMarkedContent: true });
      const stack: (string | undefined)[] = [];
      const items: PdfTextItem[] = [];
      for (const item of content.items) {
        if ("str" in item) {
          items.push({
            text: item.str, x: item.transform[4], y: item.transform[5],
            width: item.width, height: item.height,
            fontName: `${item.fontName} ${content.styles[item.fontName]?.fontFamily ?? ""}`,
            markedId: stack[stack.length - 1],
          });
        } else if (item.type === "beginMarkedContent") stack.push(stack[stack.length - 1]);
        else if (item.type === "beginMarkedContentProps") stack.push(item.id ?? stack[stack.length - 1]);
        else if (item.type === "endMarkedContent") stack.pop();
      }
      pages.push({ items, tree: tree ? structureNode(tree) : null });
    }
    const largestFontSize = pages.reduce((largest, page) => page.items.reduce(
      (size, item) => item.text.trim() ? Math.max(size, item.height || 10) : size, largest), 0);
    let seenText = false;
    return pages.map(({ items, tree }) => {
      const hasText = items.some((item) => item.text.trim().length > 0);
      const markdown = renderPdfPage(items, tree, { isFirstTextPage: !seenText, largestFontSize });
      seenText ||= hasText;
      return { markdown, hasText };
    });
  } finally {
    await pdf.destroy();
  }
}

function normalizePdfText(pageText: string): string {
  return pageText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function convertPdf(
  filename: string,
  data: ConvertInputData,
  _options?: ConvertOptions,
): Promise<ConvertResult> {
  const bytes = toBytes(data);
  let pages: PageResult[];
  try {
    pages = await structuredPages(bytes);
  } catch (error) {
    if (typeof error === "object" && error !== null && "name" in error
      && ["InvalidPDFException", "PasswordException", "MissingPDFException"].includes(String(error.name))) throw error;
    const { text } = await extractText(new Uint8Array(bytes), { mergePages: false });
    pages = text.map((page) => ({ markdown: normalizePdfText(page), hasText: page.trim().length > 0 }));
  }
  const totalPages = pages.length;
  const nonEmptyPages = pages.filter((page) => page.hasText);
  const markdown = pages
    .map((page, index) => {
      if (!page.markdown) return "";
      if (totalPages <= 1) return page.markdown;
      const title = index === 0 ? /^(# [^\n]+)(?:\n\n|$)/.exec(page.markdown) : null;
      if (title) {
        const body = page.markdown.slice(title[0].length);
        return `${title[1]}\n\n## Page 1${body ? `\n\n${body}` : ""}`;
      }
      return `## Page ${index + 1}\n\n${page.markdown}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const warnings: string[] = [];
  if (nonEmptyPages.length === 0) {
    warnings.push("No selectable text was found. This PDF may be image-based.");
  } else if (nonEmptyPages.length < totalPages) {
    warnings.push("Some pages had little or no extractable text.");
  }

  return {
    markdown,
    title: stripFileExtension(filename),
    warnings,
  };
}
