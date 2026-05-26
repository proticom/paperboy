#!/usr/bin/env node
/**
 * Re-embed paperboy-spec-tasks.json into paperboy-spec-status-dashboard.html
 * so the dashboard works when opened as a local file (file://).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const htmlPath = path.join(root, 'paperboy-spec-status-dashboard.html');
const jsonPath = path.join(root, 'paperboy-spec-tasks.json');

const json = fs.readFileSync(jsonPath, 'utf8').trim();
let html = fs.readFileSync(htmlPath, 'utf8');

const re = /<script type="application\/json" id="embedded-data">[\s\S]*?<\/script>/;
if (!re.test(html)) {
  console.error('embedded-data block not found in dashboard HTML');
  process.exit(1);
}

html = html.replace(
  re,
  `<script type="application/json" id="embedded-data">\n${json}\n</script>`
);
fs.writeFileSync(htmlPath, html);
console.log(`Embedded ${json.length} bytes from paperboy-spec-tasks.json`);
