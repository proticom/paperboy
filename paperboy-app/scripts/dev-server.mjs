import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createServer } from "node:http";

const root = resolve("src");
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};

createServer((req, res) => {
  const raw = req.url?.split("?")[0] || "/";
  const safe = normalize(raw === "/" ? "/index.html" : raw).replace(/^(\.\.[/\\])+/, "");
  const file = join(root, safe);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(1420, "127.0.0.1", () => {
  console.log("Paperboy dev server on http://127.0.0.1:1420");
});

