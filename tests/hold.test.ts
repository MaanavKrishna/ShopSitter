import { describe, expect, it } from "vitest";
import { holdBasis, splitForHold, suggestedHoldCents } from "@/lib/hold";
import type { Product } from "@/lib/types";

const settings = { holdOverrideCents: null, holdFloorCents: 1000, holdCapCents: 10_000 };
const product = (sku: string, priceCents: number): Product => ({
  shop: "live", sku, name: sku, description: "", priceCents, stock: 9, refImageUrl: null,
});
const catalogue = [product("honey", 700), product("jam", 600), product("cake", 2500)];

describe("suggestedHoldCents", () => {
  it("is twice the floor with fewer than ten paid visits, never above the cap", () => {
    expect(suggestedHoldCents([], settings)).toBe(2000);
    expect(suggestedHoldCents([900, 5000, 100, 100, 100, 100, 100, 100, 100], settings)).toBe(2000);
    expect(suggestedHoldCents([], { ...settings, holdFloorCents: 6000 })).toBe(10_000);
  });

  it("covers nine in ten paid visits, rounded up to the next $5", () => {
    const ten = [100, 200, 300, 400, 500, 600, 700, 800, 2300, 9000];
    expect(suggestedHoldCents(ten, settings)).toBe(2500);
    const twenty = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
    expect(suggestedHoldCents(twenty, settings)).toBe(2000);
    expect(suggestedHoldCents([...ten].reverse(), settings)).toBe(2500);
  });

  it("keeps the amount between the floor and the cap", () => {
    expect(suggestedHoldCents(Array(10).fill(300), settings)).toBe(1000);
    expect(suggestedHoldCents(Array(10).fill(40_000), settings)).toBe(10_000);
    expect(suggestedHoldCents(Array(10).fill(2500), settings)).toBe(2500);
  });

  it("lets the owner's own amount win, still under the cap", () => {
    expect(suggestedHoldCents(Array(10).fill(2500), { ...settings, holdOverrideCents: 700 })).toBe(700);
    expect(suggestedHoldCents([], { ...settings, holdOverrideCents: 99_000 })).toBe(10_000);
  });
});

describe("holdBasis", () => {
  it("takes what paid visits of the last 30 days paid", () => {
    const now = 100 * 86_400_000;
    const visit = (status: string, paidCents: number | null, daysAgo: number) =>
      ({ status, paidCents, openedAt: now - daysAgo * 86_400_000 }) as Parameters<typeof holdBasis>[0][number];
    const visits = [
      visit("paid", 500, 1), visit("paid_adjusted", 300, 29), visit("paid_late", 200, 2),
      visit("paid", 900, 31), visit("unmatched", null, 1), visit("open", null, 0), visit("paid", 0, 1),
    ];
    expect(holdBasis(visits, now)).toEqual([500, 300, 200]);
  });
});

describe("splitForHold", () => {
  it("keeps everything when the bill fits", () => {
    const lines = [{ sku: "honey", qty: 2 }, { sku: "jam", qty: 1 }];
    expect(splitForHold(lines, catalogue, 2000)).toEqual({ keep: lines, keepCents: 2000, rest: [] });
  });

  it("keeps the units that fit, in order, and moves the rest", () => {
    const split = splitForHold([{ sku: "honey", qty: 3 }, { sku: "jam", qty: 2 }], catalogue, 2000);
    expect(split.keep).toEqual([{ sku: "honey", qty: 2 }, { sku: "jam", qty: 1 }]);
    expect(split.keepCents).toBe(2000);
    expect(split.rest).toEqual([{ sku: "honey", qty: 1 }, { sku: "jam", qty: 1 }]);
  });

  it("skips a line too dear for what is left and still fits a cheaper one after it", () => {
    const split = splitForHold([{ sku: "cake", qty: 1 }, { sku: "jam", qty: 1 }], catalogue, 1000);
    expect(split).toEqual({ keep: [{ sku: "jam", qty: 1 }], keepCents: 600, rest: [{ sku: "cake", qty: 1 }] });
  });

  it("never keeps more than the hold, whatever the lines", () => {
    for (const hold of [0, 1, 599, 600, 1299, 1300, 5000, 100_000]) {
      const split = splitForHold([{ sku: "honey", qty: 7 }, { sku: "cake", qty: 2 }, { sku: "jam", qty: 5 }], catalogue, hold);
      expect(split.keepCents).toBeLessThanOrEqual(hold);
      const total = (ls: { sku: string; qty: number }[]) =>
        ls.reduce((sum, l) => sum + l.qty * catalogue.find((p) => p.sku === l.sku)!.priceCents, 0);
      expect(total(split.keep) + total(split.rest)).toBe(7 * 700 + 2 * 2500 + 5 * 600);
    }
  });

  it("leaves out lines the catalogue cannot price", () => {
    expect(splitForHold([{ sku: "ghost", qty: 2 }, { sku: "jam", qty: 1 }], catalogue, 5000)).toEqual({
      keep: [{ sku: "jam", qty: 1 }], keepCents: 600, rest: [],
    });
  });
});
