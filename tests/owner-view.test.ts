import { describe, expect, it } from "vitest";
import type { Totals } from "@/lib/owner";
import {
  countByFilter,
  isLow,
  ledgerParts,
  matchesFilter,
  matchesSearch,
  paidBuckets,
  segmentShares,
  takenBySku,
} from "@/lib/owner-view";

const totals = (patch: Partial<Totals> = {}): Totals => ({
  soldCents: 0,
  paidCents: 0,
  refundedCents: 0,
  unmatchedCents: 0,
  adjustedCents: 0,
  ...patch,
});

describe("ledgerParts", () => {
  it("splits the value taken from the shelf into where it went", () => {
    const { parts, totalCents } = ledgerParts(
      totals({ soldCents: 11600, paidCents: 9650, unmatchedCents: 800, adjustedCents: 700 }),
      [
        { status: "paid", detectedCents: 9650 },
        { status: "unmatched", detectedCents: 800 },
        { status: "settled_other", detectedCents: 450 },
      ],
    );
    expect(totalCents).toBe(11600);
    expect(parts.map((p) => [p.key, p.cents])).toEqual([
      ["paid", 9650],
      ["unmatched", 800],
      ["adjusted", 700],
      ["settled", 450],
    ]);
    expect(parts.reduce((sum, p) => sum + p.cents, 0)).toBe(totalCents);
  });

  it("always lists paid, unmatched and adjusted, and the rest only when there is any", () => {
    const { parts } = ledgerParts(totals(), []);
    expect(parts.map((p) => p.key)).toEqual(["paid", "unmatched", "adjusted"]);
    expect(parts.every((p) => p.cents === 0)).toBe(true);
  });

  it("shows paid net of refunds and the refunds as their own part", () => {
    const { parts } = ledgerParts(totals({ soldCents: 1000, paidCents: 1000, refundedCents: 300 }), [
      { status: "paid", detectedCents: 1000 },
    ]);
    expect(parts.map((p) => [p.key, p.cents])).toEqual([
      ["paid", 700],
      ["unmatched", 0],
      ["adjusted", 0],
      ["refunded", 300],
    ]);
  });

  it("counts visits still open as their own part", () => {
    const { parts } = ledgerParts(totals({ soldCents: 500 }), [{ status: "open", detectedCents: 500 }]);
    expect(parts.find((p) => p.key === "open")?.cents).toBe(500);
  });

  it("never shows a negative paid amount", () => {
    const { parts } = ledgerParts(totals({ paidCents: 100, refundedCents: 400 }), []);
    expect(parts[0].cents).toBe(0);
  });
});

describe("segmentShares", () => {
  it("gives each non-zero part its share of the bar in percent", () => {
    expect(segmentShares([{ cents: 750 }, { cents: 250 }, { cents: 0 }], 0)).toEqual([75, 25, 0]);
  });

  it("lifts a tiny part to the minimum and takes the difference from the larger ones", () => {
    const shares = segmentShares([{ cents: 9900 }, { cents: 100 }], 4);
    expect(shares[1]).toBe(4);
    expect(shares[0]).toBe(96);
  });

  it("is all zeros when nothing was taken", () => {
    expect(segmentShares([{ cents: 0 }, { cents: 0 }], 4)).toEqual([0, 0]);
  });
});

describe("paidBuckets", () => {
  // Local-time constructors keep these independent of the machine's time zone.
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 4, day, hour, minute).getTime();
  const now = at(20, 15, 30);
  const paid = (closedAt: number, paidCents: number, refundedCents = 0) => ({
    status: "paid",
    paidCents,
    refundedCents,
    openedAt: closedAt - 300_000,
    closedAt,
  });

  it("makes one bucket per calendar day, ending today", () => {
    const { unit, buckets } = paidBuckets([], 7, now);
    expect(unit).toBe("day");
    expect(buckets).toHaveLength(7);
    expect(buckets[0].start).toBe(at(14, 0));
    expect(buckets[6].start).toBe(at(20, 0));
    expect(buckets.every((b) => b.cents === 0)).toBe(true);
  });

  it("adds each paid visit, net of refunds, to the day it was paid", () => {
    const { buckets } = paidBuckets(
      [paid(at(20, 9), 700), paid(at(20, 14), 500, 200), paid(at(18, 23, 59), 400), paid(at(14, 0), 100)],
      7,
      now,
    );
    expect(buckets.map((b) => b.cents)).toEqual([100, 0, 0, 0, 400, 0, 1000]);
  });

  it("ignores visits that were not paid and payments from before the first bucket", () => {
    const { buckets } = paidBuckets(
      [
        { status: "unmatched", paidCents: null, refundedCents: 0, openedAt: at(19, 10), closedAt: at(19, 20) },
        { status: "settled_other", paidCents: null, refundedCents: 0, openedAt: at(19, 10), closedAt: at(19, 20) },
        paid(at(13, 23), 900),
      ],
      7,
      now,
    );
    expect(buckets.reduce((sum, b) => sum + b.cents, 0)).toBe(0);
  });

  it("falls back to when the visit opened if it has no closing time", () => {
    const { buckets } = paidBuckets(
      [{ status: "paid_late", paidCents: 300, refundedCents: 0, openedAt: at(19, 10), closedAt: null }],
      7,
      now,
    );
    expect(buckets[5].cents).toBe(300);
  });

  it("uses one bucket per hour for a single day, ending in the current hour", () => {
    const { unit, buckets } = paidBuckets([paid(at(20, 15, 5), 250), paid(at(19, 16, 10), 600)], 1, now);
    expect(unit).toBe("hour");
    expect(buckets).toHaveLength(24);
    expect(buckets[23].start).toBe(at(20, 15));
    expect(buckets[23].cents).toBe(250);
    expect(buckets[0].start).toBe(at(19, 16));
    expect(buckets[0].cents).toBe(600);
  });
});

describe("visit filters", () => {
  const visits = [
    { status: "paid" },
    { status: "paid_adjusted" },
    { status: "paid_late" },
    { status: "unmatched" },
    { status: "open" },
    { status: "settled_other" },
  ];

  it("groups every kind of paid visit under paid", () => {
    expect(visits.filter((v) => matchesFilter(v, "paid")).map((v) => v.status)).toEqual([
      "paid",
      "paid_adjusted",
      "paid_late",
    ]);
  });

  it("counts each filter, with all covering every visit", () => {
    expect(countByFilter(visits)).toEqual({ all: 6, paid: 3, unmatched: 1, open: 1 });
  });
});

describe("isLow", () => {
  it("marks a product with one or none left", () => {
    expect([0, 1, 2].map(isLow)).toEqual([true, true, false]);
  });
});

describe("takenBySku", () => {
  it("adds up how many of each product left the shelf", () => {
    const taken = takenBySku([
      { status: "paid", detected: [{ sku: "honey", qty: 2 }, { sku: "bread", qty: 1 }] },
      { status: "unmatched", detected: [{ sku: "honey", qty: 1 }] },
    ]);
    expect(taken).toEqual({ honey: 3, bread: 1 });
  });

  it("leaves out visits where nothing was taken", () => {
    expect(takenBySku([{ status: "empty", detected: [{ sku: "honey", qty: 4 }] }])).toEqual({});
  });
});

describe("matchesSearch", () => {
  const visit = { detectedBill: { lines: [{ name: "Sourdough loaf" }, { name: "Honey" }] } };

  it("matches part of an item name, whatever the case", () => {
    expect(matchesSearch(visit, "sourd")).toBe(true);
    expect(matchesSearch(visit, "  HONEY ")).toBe(true);
  });

  it("matches everything when the search is empty", () => {
    expect(matchesSearch(visit, "  ")).toBe(true);
  });

  it("does not match a name that is not on the visit", () => {
    expect(matchesSearch(visit, "eggs")).toBe(false);
  });
});
