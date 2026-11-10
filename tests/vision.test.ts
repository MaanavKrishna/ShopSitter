import { describe, expect, it } from "vitest";
import { DEMO_PRODUCTS } from "@/lib/seed";
import { buildShelfMessage, sanitizeDiff } from "@/lib/vision";

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

describe("buildShelfMessage", () => {
  const img = new Uint8Array([1, 2, 3]);
  const products = DEMO_PRODUCTS.slice(0, 2);

  it("sends the before and after photos, in that order, after the catalogue", () => {
    const parts = buildShelfMessage({ before: img, after: img, products });
    const kinds = parts.map((p) => p.type);
    expect(kinds.filter((k) => k === "file")).toHaveLength(2);
    const text = parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
    expect(text.indexOf("BEFORE")).toBeLessThan(text.indexOf("AFTER"));
    expect(text).toContain(products[0].sku);
  });

  it("adds a labelled reference photo for each product that has one", () => {
    const parts = buildShelfMessage({ before: img, after: img, products, refs: { [products[1].sku]: img } });
    expect(parts.filter((p) => p.type === "file")).toHaveLength(3);
    const text = parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
    expect(text).toContain(`Reference photo of "${products[1].sku}"`);
    expect(text).not.toContain(`Reference photo of "${products[0].sku}"`);
  });
});
