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
    expect(() => parsePositiveInt("0", "limit")).toThrow("limit must be a positive integer. Got: '0'.");
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
      expect(() => parsePositiveInt(value, "limit")).toThrow(`limit must be a positive integer. Got: '${value}'.`);
      expect(() => parseNonNegativeInt(value, "limit")).toThrow(`limit must be zero or a positive integer. Got: '${value}'.`);
    },
  );

  it.each([
    [parsePositiveInt, "positive"],
    [parseNonNegativeInt, "non-negative"],
  ])("accepts the maximum 32-bit timeout value for %s integers", (parser) => {
    expect(parser("2147483647", "limit")).toBe(2147483647);
  });

  it.each([
    [parsePositiveInt, "positive integer"],
    [parseNonNegativeInt, "zero or a positive integer"],
  ])("rejects values above the maximum for %s", (parser, message) => {
    expect(() => parser("2147483648", "limit")).toThrow(
      "limit must be at most 2147483647. Got: '2147483648'.",
    );
  });

  it("escapes control characters in invalid value messages", () => {
    expect(() => parsePositiveInt("2\nabc", "limit")).toThrow(
      "limit must be a positive integer. Got: '2\\nabc'.",
    );
  });
});
