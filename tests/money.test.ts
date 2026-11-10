import { describe, expect, it } from "vitest";
import { formatCents, priceLines } from "@/lib/money";
import type { Product } from "@/lib/types";

const P: Product[] = [
  { shop: "demo", sku: "honey", name: "Honey", description: "", priceCents: 700, stock: 5, refImageUrl: null },
  { shop: "demo", sku: "bread", name: "Bread", description: "", priceCents: 300, stock: 5, refImageUrl: null },
];

describe("formatCents", () => {
  it("formats whole dollars with two decimals", () => {
    expect(formatCents(1700)).toBe("17.00");
  });
  it("pads amounts under ten cents", () => {
    expect(formatCents(5)).toBe("0.05");
  });
});

describe("priceLines", () => {
  it("totals quantity times unit price", () => {
    const bill = priceLines([{ sku: "honey", qty: 2 }, { sku: "bread", qty: 1 }], P);
    expect(bill.totalCents).toBe(1700);
    expect(bill.lines[0]).toEqual({ sku: "honey", name: "Honey", qty: 2, unitCents: 700, lineCents: 1400 });
  });
  it("drops unknown products and zero quantities", () => {
    expect(priceLines([{ sku: "ghost", qty: 1 }, { sku: "bread", qty: 0 }], P)).toEqual({ lines: [], totalCents: 0 });
  });
});
