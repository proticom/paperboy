import { describe, expect, it } from "vitest";

import { parseNonNegativeInt, parsePositiveInt } from "../src/options.ts";

describe("crawl numeric option parsers", () => {
  it.each([
    ["1", 1],
    ["007", 7],
    ["300", 300],
  ])("parses positive integer %j", (value, expected) => {
    expect(parsePositiveInt(value, "limit")).toBe(expected);
  });

  it("rejects zero for positive integers", () => {
    expect(() => parsePositiveInt("0", "limit")).toThrow("limit must be a positive integer.");
  });

  it.each([
    ["1", 1],
    ["007", 7],
    ["300", 300],
    ["0", 0],
  ])("parses non-negative integer %j", (value, expected) => {
    expect(parseNonNegativeInt(value, "limit")).toBe(expected);
  });

  it.each(["", " ", "abc", "2abc", "1.9", "1e3", "-3", "+3", "0x10", "1_000", "Infinity", "9007199254740993"]) (
    "rejects invalid integer %j",
    (value) => {
      expect(() => parsePositiveInt(value, "limit")).toThrow("limit must be a positive integer.");
      expect(() => parseNonNegativeInt(value, "limit")).toThrow("limit must be zero or a positive integer.");
    },
  );
});
