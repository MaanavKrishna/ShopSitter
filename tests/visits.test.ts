import { describe, expect, it } from "vitest";
import {
  JOIN_WINDOW_MS,
  LATE_PAY_MS,
  OPEN_TIMEOUT_MS,
  applyShelfChange,
  applyReturns,
  expireIfStale,
  mergeLines,
  isAdjusted,
  newVisit,
  settlePayment,
  type Visit,
} from "@/lib/visits";

let n = 0;
const newId = () => `v${++n}`;
const open2Honey = (settledAt = 1_000) =>
  applyShelfChange(null, [{ sku: "honey", qty: 2 }], settledAt - 500, settledAt, "demo", newId).visit!;

describe("mergeLines", () => {
  it("adds taken items and removes put-back items", () => {
    expect(mergeLines([{ sku: "honey", qty: 2 }], [{ sku: "honey", qty: -1 }, { sku: "jam", qty: 1 }])).toEqual([
      { sku: "honey", qty: 1 },
      { sku: "jam", qty: 1 },
    ]);
  });
  it("never goes below zero and drops zero lines", () => {
    expect(mergeLines([{ sku: "honey", qty: 1 }], [{ sku: "honey", qty: -3 }])).toEqual([]);
  });
});

describe("applyShelfChange", () => {
  it("opens a visit on the first change", () => {
    const v = open2Honey();
    expect(v.status).toBe("open");
    expect(v.shop).toBe("demo");
    expect(v.detected).toEqual([{ sku: "honey", qty: 2 }]);
    expect(v.lastSettledAt).toBe(1_000);
  });

  it("joins a change that starts within the join window", () => {
    const v = open2Honey();
    const r = applyShelfChange(v, [{ sku: "jam", qty: 1 }], v.lastSettledAt + 59_000, v.lastSettledAt + 61_000, "demo", newId);
    expect(r.close).toBeUndefined();
    expect(r.visit!.id).toBe(v.id);
    expect(r.visit!.detected).toEqual([{ sku: "honey", qty: 2 }, { sku: "jam", qty: 1 }]);
    expect(r.visit!.lastSettledAt).toBe(v.lastSettledAt + 61_000);
  });

  it("rolls over to a new visit when the change starts after the join window", () => {
    const v = open2Honey();
    const r = applyShelfChange(v, [{ sku: "jam", qty: 1 }], v.lastSettledAt + 61_000, v.lastSettledAt + 63_000, "demo", newId);
    expect(r.close!.id).toBe(v.id);
    expect(r.close!.status).toBe("unmatched");
    expect(r.visit!.id).not.toBe(v.id);
    expect(r.visit!.detected).toEqual([{ sku: "jam", qty: 1 }]);
  });

  it("closes the visit as empty when everything is put back", () => {
    const v = open2Honey();
    const r = applyShelfChange(v, [{ sku: "honey", qty: -2 }], v.lastSettledAt + 5_000, v.lastSettledAt + 8_000, "demo", newId);
    expect(r.visit!.status).toBe("empty");
    expect(r.visit!.closedAt).toBe(v.lastSettledAt + 8_000);
  });

  it("opens nothing when items are only put back and no visit is open", () => {
    const r = applyShelfChange(null, [{ sku: "honey", qty: -2 }], 0, 1_000, "demo", newId);
    expect(r.visit).toBeNull();
    expect(r.close).toBeUndefined();
  });

  it("uses a 60 second join window", () => {
    expect(JOIN_WINDOW_MS).toBe(60_000);
  });
});

describe("expireIfStale", () => {
  it("marks an open visit unmatched after the timeout", () => {
    const v = open2Honey();
    expect(OPEN_TIMEOUT_MS).toBe(600_000);
    expect(expireIfStale(v, v.lastSettledAt + 600_001).status).toBe("unmatched");
  });
  it("leaves a visit open before the timeout", () => {
    const v = open2Honey();
    expect(expireIfStale(v, v.lastSettledAt + 599_999).status).toBe("open");
  });
});

describe("settlePayment", () => {
  it("marks a visit paid when the paid items equal the detected items", () => {
    const v = settlePayment(open2Honey(), [{ sku: "honey", qty: 2 }], 1400, 9_000);
    expect(v.status).toBe("paid");
    expect(v.paidCents).toBe(1400);
    expect(v.closedAt).toBe(9_000);
  });
  it("marks a visit adjusted when fewer items are paid for", () => {
    expect(settlePayment(open2Honey(), [{ sku: "honey", qty: 1 }], 700, 9_000).status).toBe("paid_adjusted");
  });
  it("marks an unmatched visit paid late within 24 hours", () => {
    const u = expireIfStale(open2Honey(), 1_000 + 600_001);
    expect(LATE_PAY_MS).toBe(86_400_000);
    expect(settlePayment(u, [{ sku: "honey", qty: 2 }], 1400, u.closedAt! + 3_600_000).status).toBe("paid_late");
  });
  it("refuses payment more than 24 hours after a visit went unmatched", () => {
    const u = expireIfStale(open2Honey(), 1_000 + 600_001);
    expect(() => settlePayment(u, [{ sku: "honey", qty: 2 }], 1400, u.closedAt! + 86_400_001)).toThrow("too_late");
  });
  it("returns an already paid visit unchanged", () => {
    const paid = settlePayment(open2Honey(), [{ sku: "honey", qty: 2 }], 1400, 9_000);
    expect(settlePayment(paid, [{ sku: "honey", qty: 1 }], 700, 10_000)).toBe(paid);
  });
  it("refuses payment for an empty visit", () => {
    const v = open2Honey();
    const empty = applyShelfChange(v, [{ sku: "honey", qty: -2 }], 2_000, 3_000, "demo", newId).visit!;
    expect(() => settlePayment(empty, [], 0, 4_000)).toThrow("not_payable");
  });
});

describe("adjusted", () => {
  const late = () => expireIfStale(open2Honey(), 1_000 + 600_001);

  it("is recorded apart from lateness when a payment is settled", () => {
    expect(settlePayment(open2Honey(), [{ sku: "honey", qty: 2 }], 1400, 9_000).adjusted).toBe(false);
    expect(settlePayment(open2Honey(), [{ sku: "honey", qty: 1 }], 700, 9_000).adjusted).toBe(true);
    const u = late();
    const paidLate = settlePayment(u, [{ sku: "honey", qty: 1 }], 700, u.closedAt! + 1000);
    expect(paidLate.status).toBe("paid_late");
    expect(paidLate.adjusted).toBe(true);
    expect(settlePayment(u, [{ sku: "honey", qty: 2 }], 1400, u.closedAt! + 1000).adjusted).toBe(false);
  });

  it("is worked out for visits stored before the flag existed", () => {
    const strip = <T extends { adjusted?: boolean }>(v: T) => {
      const { adjusted: _dropped, ...rest } = v;
      void _dropped;
      return rest;
    };
    const u = late();
    expect(isAdjusted(strip(settlePayment(open2Honey(), [{ sku: "honey", qty: 1 }], 700, 9_000)))).toBe(true);
    expect(isAdjusted(strip(settlePayment(open2Honey(), [{ sku: "honey", qty: 2 }], 1400, 9_000)))).toBe(false);
    expect(isAdjusted(strip(settlePayment(u, [{ sku: "honey", qty: 1 }], 700, u.closedAt! + 1000)))).toBe(true);
    expect(isAdjusted(strip(settlePayment(u, [{ sku: "honey", qty: 2 }], 1400, u.closedAt! + 1000)))).toBe(false);
  });

  it("is never true for a visit that was not paid", () => {
    expect(isAdjusted(open2Honey())).toBe(false);
    expect(isAdjusted({ ...late(), paid: [{ sku: "honey", qty: 1 }] })).toBe(false);
  });

  it("takes a late put-back off the open bill instead of closing it as unmatched", () => {
    const v = open2Honey();
    const r = applyShelfChange(v, [{ sku: "honey", qty: -1 }], v.lastSettledAt + 90_000, v.lastSettledAt + 92_000, "demo", newId);
    expect(r.close).toBeUndefined();
    expect(r.visit!.id).toBe(v.id);
    expect(r.visit!.status).toBe("open");
    expect(r.visit!.detected).toEqual([{ sku: "honey", qty: 1 }]);
  });

  it("closes the open bill as empty when everything comes back after the join window", () => {
    const v = open2Honey();
    const r = applyShelfChange(v, [{ sku: "honey", qty: -2 }], v.lastSettledAt + 120_000, v.lastSettledAt + 122_000, "demo", newId);
    expect(r.close).toBeUndefined();
    expect(r.visit!.status).toBe("empty");
  });
});

describe("applyReturns", () => {
  const unmatched = (): Visit => ({
    ...newVisit("u1", "demo", [{ sku: "honey", qty: 2 }, { sku: "jam", qty: 1 }], 1_000),
    status: "unmatched",
    closedAt: 601_000,
  });

  it("takes returned items off an unmatched visit", () => {
    const r = applyReturns(unmatched(), [{ sku: "jam", qty: -1 }], 700_000);
    expect(r!.status).toBe("unmatched");
    expect(r!.detected).toEqual([{ sku: "honey", qty: 2 }]);
  });

  it("closes the visit as empty when everything it held comes back", () => {
    const r = applyReturns(unmatched(), [{ sku: "honey", qty: -2 }, { sku: "jam", qty: -1 }], 700_000);
    expect(r!.status).toBe("empty");
  });

  it("ignores items the visit never held and counts no more than it held", () => {
    expect(applyReturns(unmatched(), [{ sku: "bread", qty: -1 }], 700_000)).toBeNull();
    expect(applyReturns(unmatched(), [{ sku: "jam", qty: -5 }], 700_000)!.detected).toEqual([{ sku: "honey", qty: 2 }]);
  });

  it("only touches unmatched visits that are still within a day", () => {
    const paid = { ...unmatched(), status: "paid" as const };
    expect(applyReturns(paid, [{ sku: "jam", qty: -1 }], 700_000)).toBeNull();
    expect(applyReturns(unmatched(), [{ sku: "jam", qty: -1 }], 601_000 + 86_400_001)).toBeNull();
  });

  it("ignores changes that take something", () => {
    expect(applyReturns(unmatched(), [{ sku: "jam", qty: -1 }, { sku: "bread", qty: 1 }], 700_000)).toBeNull();
  });
});
