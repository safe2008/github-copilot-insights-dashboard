import { describe, it, expect } from "vitest";
import { cn, formatNumber, formatPercent, formatDelta, daysAgo, isValidDate } from "../utils";

// ── cn (class merge utility) ──

describe("cn", () => {
  it("should merge class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("should handle conditional classes", () => {
    const isActive = true;
    expect(cn("base", isActive && "active")).toBe("base active");
  });

  it("should filter out falsy values", () => {
    expect(cn("base", false, null, undefined, "end")).toBe("base end");
  });

  it("should merge conflicting Tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("should return empty string for no arguments", () => {
    expect(cn()).toBe("");
  });
});

// ── isValidDate ──

describe("isValidDate", () => {
  it("should accept valid YYYY-MM-DD dates", () => {
    expect(isValidDate("2026-04-15")).toBe(true);
    expect(isValidDate("2000-01-01")).toBe(true);
    expect(isValidDate("1999-12-31")).toBe(true);
  });

  it("should reject non-date strings", () => {
    expect(isValidDate("not-a-date")).toBe(false);
    expect(isValidDate("")).toBe(false);
    expect(isValidDate("abcd-ef-gh")).toBe(false);
  });

  it("should reject dates with wrong format", () => {
    expect(isValidDate("04-15-2026")).toBe(false);
    expect(isValidDate("2026/04/15")).toBe(false);
    expect(isValidDate("20260415")).toBe(false);
  });

  it("should reject dates with extra characters", () => {
    expect(isValidDate("2026-04-15T00:00:00Z")).toBe(false);
    expect(isValidDate(" 2026-04-15")).toBe(false);
  });

  it("should reject invalid calendar dates", () => {
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-00-01")).toBe(false);
  });
});

// ── formatNumber ──

describe("formatNumber", () => {
  it("should format billions", () => {
    expect(formatNumber(1_500_000_000)).toBe("1.5B");
  });

  it("should format millions", () => {
    expect(formatNumber(2_300_000)).toBe("2.3M");
  });

  it("should format thousands", () => {
    expect(formatNumber(4_500)).toBe("4.5K");
  });

  it("should format small numbers with locale string", () => {
    expect(formatNumber(42)).toBe("42");
  });

  it("should handle zero", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("should handle negative numbers", () => {
    expect(formatNumber(-2_000)).toBe("-2.0K");
  });
});

// ── formatPercent ──

describe("formatPercent", () => {
  it("should format a percentage value", () => {
    expect(formatPercent(85.678)).toBe("85.7%");
  });

  it("should handle zero", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("should handle 100%", () => {
    expect(formatPercent(100)).toBe("100.0%");
  });
});

// ── formatDelta ──

describe("formatDelta", () => {
  it("should add + prefix for positive values", () => {
    const result = formatDelta(12.34);
    expect(result.text).toBe("+12.3%");
    expect(result.className).toBe("text-growth");
  });

  it("should not add prefix for negative values", () => {
    const result = formatDelta(-5.67);
    expect(result.text).toBe("-5.7%");
    expect(result.className).toBe("text-decline");
  });

  it("should handle zero", () => {
    const result = formatDelta(0);
    expect(result.text).toBe("0.0%");
    expect(result.className).toBe("text-gray-500");
  });
});

// ── daysAgo ──

describe("daysAgo", () => {
  it("should return a YYYY-MM-DD string", () => {
    const result = daysAgo(7);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("should return today for 0 days ago", () => {
    const today = new Date().toISOString().split("T")[0];
    expect(daysAgo(0)).toBe(today);
  });

  it("should return a date in the past for positive n", () => {
    const result = new Date(daysAgo(30));
    const now = new Date();
    expect(result.getTime()).toBeLessThan(now.getTime());
  });
});
