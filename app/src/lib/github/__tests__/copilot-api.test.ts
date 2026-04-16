import { describe, it, expect } from "vitest";
import { parseNdjson } from "../copilot-api";

describe("parseNdjson", () => {
  it("should parse valid NDJSON with multiple lines", () => {
    const input = '{"a":1}\n{"a":2}\n{"a":3}';
    const result = parseNdjson<{ a: number }>(input);
    expect(result).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it("should skip empty lines", () => {
    const input = '{"a":1}\n\n\n{"a":2}\n';
    const result = parseNdjson<{ a: number }>(input);
    expect(result).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("should skip malformed JSON lines without throwing", () => {
    const input = '{"a":1}\nnot-json\n{"a":3}';
    const result = parseNdjson<{ a: number }>(input);
    expect(result).toEqual([{ a: 1 }, { a: 3 }]);
  });

  it("should handle single-line input", () => {
    const input = '{"key":"value"}';
    const result = parseNdjson<{ key: string }>(input);
    expect(result).toEqual([{ key: "value" }]);
  });

  it("should return empty array for empty string", () => {
    expect(parseNdjson("")).toEqual([]);
  });

  it("should return empty array for whitespace-only input", () => {
    expect(parseNdjson("   \n   \n  ")).toEqual([]);
  });

  it("should handle lines with leading/trailing whitespace in content", () => {
    const input = '  {"a":1}  \n  {"a":2}  ';
    // The filter checks trim().length > 0, but JSON.parse handles surrounding whitespace
    const result = parseNdjson<{ a: number }>(input);
    expect(result).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
