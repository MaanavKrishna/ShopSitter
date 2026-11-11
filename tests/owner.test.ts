import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { OwnerError, ownerAction, ownerOverview } from "@/lib/owner";
import { PayPalRefused, refusalFrom, type PayPalGateway } from "@/lib/paypal";
import { FileRepo } from "@/lib/repo-file";
import { DEMO_PRODUCTS, productsFor } from "@/lib/seed";
import { newVisit, type Visit } from "@/lib/visits";

let repo: FileRepo;
let refunds: { captureId: string; cents: number }[];
let refundKeys: string[];
const paypal: PayPalGateway = {
  createOrder: async () => ({ orderId: "O" }),
  captureOrder: async () => ({ captureId: "C", amountCents: 0, status: "COMPLETED" }),
  refundCapture: async (captureId, cents, key) => {
    refunds.push({ captureId, cents });
    refundKeys.push(key);
    return { refundId: `R${refunds.length}` };
  },
};

const DAY = 86_400_000;
const NOW = 10 * DAY;
const visit = (id: string, patch: Partial<Visit>, lines = [{ sku: "honey", qty: 2 }]): Visit => ({
  ...newVisit(id, "demo", lines, NOW - 3_600_000),
  ...patch,
});

beforeEach(async () => {
  repo = new FileRepo(mkdtempSync(path.join(tmpdir(), "shopsitter-owner-")));
  refunds = [];
  refundKeys = [];
  await repo.resetShop("demo", DEMO_PRODUCTS);
  await repo.resetShop("live", productsFor("live"));
  // paid in full: honey x2 + bread = 1900
  await repo.saveVisit(
    visit("paid", { status: "paid", paid: [{ sku: "honey", qty: 2 }, { sku: "bread", qty: 1 }], paidCents: 1900, captureId: "CAP1" },
      [{ sku: "honey", qty: 2 }, { sku: "bread", qty: 1 }]),
  );
  // camera saw 2 honey (1400), customer paid for 1 (700)
  await repo.saveVisit(visit("adjusted", { status: "paid_adjusted", paid: [{ sku: "honey", qty: 1 }], paidCents: 700, captureId: "CAP2" }));
  // 2 apples (800) taken, never paid
  await repo.saveVisit(visit("unmatched", { status: "unmatched", closedAt: NOW - 1000 }, [{ sku: "apples", qty: 2 }]));
  await repo.saveVisit(visit("empty", { status: "empty", detected: [] }, []));
  await repo.saveVisit({ ...newVisit("other-shop", "live", [{ sku: "jam", qty: 1 }], NOW - 1000) });
});

const code = (p: Promise<unknown>) => p.then(() => "no error", (e) => (e instanceof OwnerError ? e.code : `unexpected: ${e}`));

describe("ownerOverview", () => {
  it("totals what sold, what was paid, what is unmatched and what customers adjusted", async () => {
    const { totals } = await ownerOverview(repo, "demo", 7, NOW);
    expect(totals).toEqual({ soldCents: 4100, paidCents: 2600, refundedCents: 0, unmatchedCents: 800, adjustedCents: 700 });
  });

  it("shows only this shop's visits, newest first, with a priced bill each", async () => {
    const { visits } = await ownerOverview(repo, "demo", 7, NOW);
    expect(visits.map((v) => v.id).sort()).toEqual(["adjusted", "empty", "paid", "unmatched"]);
    expect(visits.find((v) => v.id === "unmatched")!.detectedCents).toBe(800);
  });

  it("works out stock left from what the camera saw leave", async () => {
    const { stock } = await ownerOverview(repo, "demo", 7, NOW);
    const left = Object.fromEntries(stock.map((s) => [s.sku, s.left]));
    expect(left).toMatchObject({ honey: 2, bread: 5, apples: 4, jam: 6 });
  });

  it("counts the shortfall of a bill that was corrected and then paid late as adjusted", async () => {
    // camera saw 2 honey (1400), paid for 1 (700) after the visit had gone unmatched
    await repo.saveVisit(
      visit("late-adjusted", { status: "paid_late", adjusted: true, paid: [{ sku: "honey", qty: 1 }], paidCents: 700, captureId: "CAP3" }),
    );
    // paid late in full: nothing adjusted
    await repo.saveVisit(visit("late-full", { status: "paid_late", adjusted: false, paid: [{ sku: "honey", qty: 2 }], paidCents: 1400 }));
    // stored before the flag existed
    await repo.saveVisit(visit("late-old", { status: "paid_late", paid: [{ sku: "honey", qty: 1 }], paidCents: 700 }));
    const { totals, visits } = await ownerOverview(repo, "demo", 7, NOW);
    expect(totals.adjustedCents).toBe(700 + 700 + 700);
    const row = (id: string) => visits.find((v) => v.id === id)!;
    expect(row("late-adjusted").adjusted).toBe(true);
    expect(row("late-old").adjusted).toBe(true);
    expect(row("late-full").adjusted).toBe(false);
    expect(row("adjusted").adjusted).toBe(true);
    expect(row("paid").adjusted).toBe(false);
    expect(row("unmatched").adjusted).toBe(false);
    expect(row("late-adjusted").status).toBe("paid_late");
  });

  it("prices what the customer paid for on each row", async () => {
    const { visits } = await ownerOverview(repo, "demo", 7, NOW);
    const row = (id: string) => visits.find((v) => v.id === id)!;
    expect(row("adjusted").paidBill).toEqual({
      lines: [{ sku: "honey", name: "Honey", qty: 1, unitCents: 700, lineCents: 700 }],
      totalCents: 700,
    });
    expect(row("unmatched").paidBill).toBeNull();
  });

  it("turns a stale open visit into an unmatched one when the owner looks", async () => {
    await repo.saveVisit(newVisit("stale", "demo", [{ sku: "jam", qty: 1 }], NOW - 700_000));
    const { visits, totals } = await ownerOverview(repo, "demo", 7, NOW);
    expect(visits.find((v) => v.id === "stale")!.status).toBe("unmatched");
    expect(totals.unmatchedCents).toBe(1400);
    expect((await repo.getVisit("stale"))!.status).toBe("unmatched");
  });

  it("leaves out visits older than the chosen number of days from the totals", async () => {
    await repo.saveVisit({ ...visit("old", { status: "unmatched" }), openedAt: NOW - 8 * DAY });
    expect((await ownerOverview(repo, "demo", 7, NOW)).totals.unmatchedCents).toBe(800);
  });
});

describe("ownerAction", () => {
  it("marks an unmatched visit as settled another way", async () => {
    const v = await ownerAction(repo, paypal, "demo", "unmatched", { action: "settle" });
    expect(v.status).toBe("settled_other");
  });

  it("will not settle a visit that is already paid", async () => {
    expect(await code(ownerAction(repo, paypal, "demo", "paid", { action: "settle" }))).toBe("not_allowed");
  });

  it("corrects a miscount, keeping only catalogue products", async () => {
    const v = await ownerAction(repo, paypal, "demo", "unmatched", {
      action: "correct",
      lines: [{ sku: "apples", qty: 1 }, { sku: "ghost", qty: 4 }],
    });
    expect(v.detected).toEqual([{ sku: "apples", qty: 1 }]);
  });

  it("turns an adjusted visit into a paid one when the correction matches what was paid", async () => {
    const v = await ownerAction(repo, paypal, "demo", "adjusted", { action: "correct", lines: [{ sku: "honey", qty: 1 }] });
    expect(v.status).toBe("paid");
  });

  it("refunds part of a payment through PayPal and remembers it", async () => {
    const v = await ownerAction(repo, paypal, "demo", "paid", { action: "refund", cents: 500 });
    expect(refunds).toEqual([{ captureId: "CAP1", cents: 500 }]);
    expect(v.refundedCents).toBe(500);
    expect((await ownerOverview(repo, "demo", 7, NOW)).totals.refundedCents).toBe(500);
  });

  it("sends two equal refunds to PayPal as two separate requests", async () => {
    await ownerAction(repo, paypal, "demo", "paid", { action: "refund", cents: 300 });
    await ownerAction(repo, paypal, "demo", "paid", { action: "refund", cents: 300 });
    expect(refundKeys).toHaveLength(2);
    expect(refundKeys[0]).not.toBe(refundKeys[1]);
    expect((await repo.getVisit("paid"))!.refundedCents).toBe(600);
  });

  it("refuses a refund larger than what is left of the payment", async () => {
    await ownerAction(repo, paypal, "demo", "paid", { action: "refund", cents: 1500 });
    expect(await code(ownerAction(repo, paypal, "demo", "paid", { action: "refund", cents: 500 }))).toBe("bad_amount");
    expect(await code(ownerAction(repo, paypal, "demo", "paid", { action: "refund", cents: 0 }))).toBe("bad_amount");
    expect(await code(ownerAction(repo, paypal, "demo", "paid", { action: "refund", cents: 10.5 }))).toBe("bad_amount");
    expect(refunds).toHaveLength(1);
  });

  it("says so when PayPal refuses the refund, and records nothing", async () => {
    const refusing: PayPalGateway = { ...paypal, refundCapture: async () => { throw new PayPalRefused("refund"); } };
    const result = await ownerAction(repo, refusing, "demo", "paid", { action: "refund", cents: 500 }).then(
      () => null,
      (e) => e,
    );
    expect(result).toBeInstanceOf(OwnerError);
    expect(result.code).toBe("paypal_refused");
    expect(result.status).toBe(422);
    expect((await repo.getVisit("paid"))!.refundedCents).toBe(0);
  });

  it("leaves any other PayPal failure as an unexpected error", async () => {
    const broken: PayPalGateway = { ...paypal, refundCapture: async () => { throw new Error("socket hang up"); } };
    expect(await code(ownerAction(repo, broken, "demo", "paid", { action: "refund", cents: 500 }))).toMatch(/^unexpected/);
    expect((await repo.getVisit("paid"))!.refundedCents).toBe(0);
  });

  it("tells a refusal from PayPal (a 4xx answer) from other failures", () => {
    expect(refusalFrom(Object.assign(new Error("x"), { statusCode: 422 }))).toBe(true);
    expect(refusalFrom(Object.assign(new Error("x"), { statusCode: 404 }))).toBe(true);
    expect(refusalFrom(Object.assign(new Error("x"), { statusCode: 503 }))).toBe(false);
    expect(refusalFrom(new Error("timeout"))).toBe(false);
    expect(refusalFrom(null)).toBe(false);
  });

  it("lets the owner refund a payment that was captured but not recorded as paid", async () => {
    await repo.saveVisit(visit("stuck", { status: "settled_other", paid: [{ sku: "honey", qty: 2 }], paidCents: 1400, captureId: "CAP9" }));
    const v = await ownerAction(repo, paypal, "demo", "stuck", { action: "refund", cents: 1400 });
    expect(refunds).toEqual([{ captureId: "CAP9", cents: 1400 }]);
    expect(v.refundedCents).toBe(1400);
  });

  it("clears the adjusted flag when the owner's correction matches what was paid late", async () => {
    await repo.saveVisit(visit("late-adjusted", { status: "paid_late", adjusted: true, paid: [{ sku: "honey", qty: 1 }], paidCents: 700 }));
    const v = await ownerAction(repo, paypal, "demo", "late-adjusted", { action: "correct", lines: [{ sku: "honey", qty: 1 }] });
    expect(v.status).toBe("paid_late");
    expect(v.adjusted).toBe(false);
  });

  it("refuses to refund a visit that was never paid", async () => {
    expect(await code(ownerAction(repo, paypal, "demo", "unmatched", { action: "refund", cents: 100 }))).toBe("not_allowed");
  });

  it("hides another shop's visit", async () => {
    expect(await code(ownerAction(repo, paypal, "demo", "other-shop", { action: "settle" }))).toBe("not_found");
  });
});
