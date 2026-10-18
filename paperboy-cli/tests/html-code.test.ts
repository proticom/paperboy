import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import { convertFileToMarkdown } from "../src/converter.ts";

it("converts an HTML file's preformatted code to a multiline fenced block", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperboy-cli-html-code-"));
  try {
    const inputPath = path.join(tempDir, "code.html");
    await fs.writeFile(inputPath, '<html><head><title>Code sample</title></head><body><pre class="language-js">const value = 1;\nconsole.log(value);</pre></body></html>', "utf8");

    const result = await convertFileToMarkdown(inputPath);

    expect(result.markdown).toBe("```js\nconst value = 1;\nconsole.log(value);\n```");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
