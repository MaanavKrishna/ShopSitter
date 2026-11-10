import { describe, expect, it } from "vitest";
import { DEMO_PRODUCTS } from "@/lib/seed";
import { sanitizeDiff } from "@/lib/vision";

describe("sanitizeDiff", () => {
  it("keeps only catalogue products with whole, sensible quantities", () => {
    const raw = {
      delta: [
        { sku: "ghost", qty: 1 },
        { sku: "honey", qty: -3 },
        { sku: "jam", qty: 999 },
        { sku: "bread", qty: 1.5 },
        { sku: "eggs", qty: 2 },
        { sku: "apples", qty: 0 },
      ],
      confidence: 7,
    };
    expect(sanitizeDiff(raw, DEMO_PRODUCTS)).toEqual({
      delta: [{ sku: "honey", qty: -3 }, { sku: "eggs", qty: 2 }],
      confidence: 1,
    });
  });

  it("adds up repeated lines for the same product", () => {
    const raw = { delta: [{ sku: "honey", qty: 1 }, { sku: "honey", qty: 1 }], confidence: 0.8 };
    expect(sanitizeDiff(raw, DEMO_PRODUCTS).delta).toEqual([{ sku: "honey", qty: 2 }]);
  });

  it("returns an empty, zero-confidence result for anything that is not the expected shape", () => {
    for (const junk of [null, "honey", 42, [], { delta: "all of it" }, { delta: [null, 3, "x"] }]) {
      expect(sanitizeDiff(junk, DEMO_PRODUCTS)).toEqual({ delta: [], confidence: 0 });
    }
  });

  it("clamps a negative or missing confidence to zero", () => {
    expect(sanitizeDiff({ delta: [{ sku: "eggs", qty: 1 }], confidence: -2 }, DEMO_PRODUCTS).confidence).toBe(0);
    expect(sanitizeDiff({ delta: [{ sku: "eggs", qty: 1 }] }, DEMO_PRODUCTS).confidence).toBe(0);
  });
});
