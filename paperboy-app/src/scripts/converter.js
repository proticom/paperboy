import {
  convertToMarkdown,
  shouldReadInputAsText,
  SUPPORTED_EXTENSIONS,
} from "@proticom/paperboy-converter";

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdx"]);
const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "tif",
  "tiff",
];

export const OPEN_DIALOG_FILTERS = [
  {
    name: "Supported Files",
    extensions: SUPPORTED_EXTENSIONS,
  },
  { name: "Markdown", extensions: ["md", "markdown", "mdx"] },
  { name: "Documents", extensions: ["docx", "pdf", "epub", "rtf"] },
  { name: "Data", extensions: ["csv", "xlsx"] },
  { name: "Images", extensions: IMAGE_EXTENSIONS },
];

export function shouldReadAsText(filePath) {
  return shouldReadInputAsText(filePath);
}

export function shouldKeepOriginalPath(filePath) {
  return MARKDOWN_EXTENSIONS.has(getExtension(filePath));
}

export async function convertImportedFile({ path, text, base64 }) {
  const extension = getExtension(path);
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    return {
      markdown: normalizeLineEndings(text || ""),
      title: stripFileExtension(path),
      warnings: [`Unsupported file format: .${extension || "unknown"}`],
    };
  }

  const input = shouldReadAsText(path)
    ? normalizeLineEndings(text || "")
    : base64ToUint8Array(base64);

  return convertToMarkdown(path, input);
}

function getExtension(filePath) {
  const fileName = filePath.split(/[\\/]/).pop() || "";
  const parts = fileName.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function stripFileExtension(filePath) {
  const fileName = filePath.split(/[\\/]/).pop() || filePath;
  return fileName.replace(/\.[^.]+$/, "");
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, "\n");
}

function base64ToUint8Array(base64Value) {
  if (!base64Value) return new Uint8Array();
  const binary = atob(base64Value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
