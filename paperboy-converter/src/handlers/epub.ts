import JSZip from "jszip";

import { parseHtml, parseXml } from "../dom.js";
import { stripFileExtension, toArrayBuffer, toBytes } from "../helpers.js";
import { createTurndownService } from "../turndown.js";
import type { ConvertInputData, ConvertOptions, ConvertResult } from "../types.js";

interface ManifestItem {
  href: string;
  mediaType: string;
}

function getDirectory(filePath: string): string {
  const index = filePath.lastIndexOf("/");
  if (index < 0) return "";
  return filePath.slice(0, index + 1);
}

function resolveZipPath(baseDir: string, relativePath: string): string {
  const normalizedBase = baseDir.replace(/^\/+/, "");
  const absolute = new URL(
    relativePath,
    `https://paperboy.local/${normalizedBase}`,
  ).pathname;
  return absolute.replace(/^\/+/, "");
}

function getFallbackChapterPaths(zip: JSZip): string[] {
  return zip
    .filter((relativePath, file) => !file.dir && /\.(xhtml?|html?)$/i.test(relativePath))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export async function convertEpub(
  filename: string,
  data: ConvertInputData,
  _options?: ConvertOptions,
): Promise<ConvertResult> {
  const zip = await JSZip.loadAsync(toArrayBuffer(toBytes(data)));
  const turndown = createTurndownService();
  const warnings: string[] = [];
  const containerFile = zip.file("META-INF/container.xml");
  let chapterPaths: string[] = [];

  if (!containerFile) {
    warnings.push(
      "EPUB container metadata was missing. Falling back to HTML file scan.",
    );
    chapterPaths = getFallbackChapterPaths(zip);
  } else {
    const containerXml = await containerFile.async("string");
    const containerDoc = parseXml(containerXml);
    const rootFilePath = containerDoc
      .querySelector("rootfile")
      ?.getAttribute("full-path");

    if (!rootFilePath) {
      warnings.push("EPUB package file was not found. Falling back to HTML file scan.");
      chapterPaths = getFallbackChapterPaths(zip);
    } else {
      const packageFile = zip.file(rootFilePath);
      if (!packageFile) {
        warnings.push(
          "EPUB package reference was invalid. Falling back to HTML file scan.",
        );
        chapterPaths = getFallbackChapterPaths(zip);
      } else {
        const packageXml = await packageFile.async("string");
        const packageDoc = parseXml(packageXml);
        const manifest = new Map<string, ManifestItem>();
        const packageDir = getDirectory(rootFilePath);

        const manifestItems = Array.from(
          packageDoc.querySelectorAll("manifest > item"),
        ) as Array<{ getAttribute(name: string): string | null }>;

        for (const item of manifestItems) {
          const id = item.getAttribute("id");
          const href = item.getAttribute("href");
          if (!id || !href) continue;
          manifest.set(id, {
            href: resolveZipPath(packageDir, href),
            mediaType: item.getAttribute("media-type") ?? "",
          });
        }

        const spineItems = Array.from(
          packageDoc.querySelectorAll("spine > itemref"),
        ) as Array<{ getAttribute(name: string): string | null }>;

        chapterPaths = spineItems
          .map((itemRef) => itemRef.getAttribute("idref"))
          .filter((idRef): idRef is string => Boolean(idRef))
          .map((idRef) => manifest.get(idRef))
          .filter((item): item is ManifestItem => Boolean(item))
          .filter((item) => /html|xhtml/.test(item.mediaType))
          .map((item) => item.href);

        if (chapterPaths.length === 0) {
          warnings.push(
            "EPUB spine did not include readable XHTML chapters. Falling back to HTML file scan.",
          );
          chapterPaths = getFallbackChapterPaths(zip);
        }
      }
    }
  }

  const sections: string[] = [];
  const uniquePaths = Array.from(new Set(chapterPaths));
  for (const chapterPath of uniquePaths) {
    const chapterFile = zip.file(chapterPath);
    if (!chapterFile) {
      warnings.push(`Skipped missing chapter: ${chapterPath}`);
      continue;
    }
    const chapterContent = await chapterFile.async("string");
    const chapterDoc = parseHtml(chapterContent);
    const bodyHtml =
      chapterDoc.body && chapterDoc.body.innerHTML.trim()
        ? chapterDoc.body.innerHTML
        : chapterContent;
    const chapterMarkdown = turndown.turndown(bodyHtml).trim();
    if (!chapterMarkdown) continue;

    const chapterTitle =
      chapterDoc.querySelector("title")?.textContent?.trim() ||
      stripFileExtension(chapterPath.split("/").pop() || chapterPath);

    sections.push(`## ${chapterTitle}\n\n${chapterMarkdown}`);
  }

  if (sections.length === 0) {
    warnings.push("No readable chapter content was extracted from this EPUB.");
  }

  return {
    markdown: sections.join("\n\n"),
    title: stripFileExtension(filename),
    warnings,
  };
}
