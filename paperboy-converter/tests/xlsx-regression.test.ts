import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { convertXlsx } from "../src/handlers/xlsx.js";

function loadFixture(name: string): Uint8Array {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return new Uint8Array(readFileSync(url));
}

function loadGolden(name: string): unknown {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

// The goldens hold xlsx 0.18.5 output. A SheetJS upgrade must match them, not regenerate them.
describe("xlsx regression goldens", () => {
  it.each([
    ["xlsx-regression.xlsx", "xlsx-regression.expected.json"],
    ["sample.xlsx", "sample-xlsx.expected.json"],
    ["xlsx-regression-biff5-cp1251.xlsx", "xlsx-regression-biff5-cp1251.expected.json"],
  ])("%s matches %s", async (fixture, golden) => {
    const result = await convertXlsx(fixture, loadFixture(fixture));

    expect(result).toStrictEqual(loadGolden(golden));
  });
});
