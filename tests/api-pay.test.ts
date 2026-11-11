import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { CheckoutError, captureVisit, editLines, getBill, startOrder } from "@/lib/checkout";
import type { PayPalGateway } from "@/lib/paypal";
import { FileRepo } from "@/lib/repo-file";
import { DEMO_PRODUCTS } from "@/lib/seed";
import { expireIfStale, newVisit } from "@/lib/visits";

class FakePayPal implements PayPalGateway {
  orders: { id: string; cents: number }[] = [];
  captures: string[] = [];
  async createOrder(body: { purchaseUnits: { amount: { value: string } }[] }) {
    const id = `ORDER${this.orders.length + 1}`;
    this.orders.push({ id, cents: Math.round(Number(body.purchaseUnits[0].amount.value) * 100) });
    return { orderId: id };
  }
  async captureOrder(orderId: string) {
    this.captures.push(orderId);
    const order = this.orders.find((o) => o.id === orderId)!;
    return { captureId: `CAP-${orderId}`, amountCents: order.cents, status: "COMPLETED" };
  }
  async refundCapture() {
    return { refundId: "REF1" };
  }
}

let repo: FileRepo;
let paypal: FakePayPal;
const NOW = 5_000;

beforeEach(async () => {
  repo = new FileRepo(mkdtempSync(path.join(tmpdir(), "shopsitter-pay-")));
  paypal = new FakePayPal();
  await repo.resetShop("demo", DEMO_PRODUCTS);
  await repo.saveVisit(newVisit("v1", "demo", [{ sku: "honey", qty: 2 }, { sku: "bread", qty: 1 }], 1_000));
});

const errorCode = async (p: Promise<unknown>) =>
  p.then(
    () => "no error",
    (e) => (e instanceof CheckoutError ? e.code : `unexpected: ${e}`),
  );

describe("checkout", () => {
  it("prices the detected items for the pay page", async () => {
    const { bill, visit } = await getBill(repo, "v1", NOW);
    expect(bill.totalCents).toBe(1900);
    expect(visit.status).toBe("open");
  });

  it("captures a payment once and marks the visit paid", async () => {
    const { orderId } = await startOrder(repo, paypal, "v1", NOW);
    const { visit, receipt } = await captureVisit(repo, paypal, "v1", orderId, NOW + 100);
    expect(visit.status).toBe("paid");
    expect(visit.paidCents).toBe(1900);
    expect(receipt.captureId).toBe("CAP-ORDER1");
    expect((await repo.getVisit("v1"))!.status).toBe("paid");
  });

  it("does not capture twice when the customer taps Pay again", async () => {
    const { orderId } = await startOrder(repo, paypal, "v1", NOW);
    const first = await captureVisit(repo, paypal, "v1", orderId, NOW + 100);
    const second = await captureVisit(repo, paypal, "v1", orderId, NOW + 200);
    expect(paypal.captures).toEqual(["ORDER1"]);
    expect(second.receipt).toEqual(first.receipt);
  });

  it("refuses a new order for a visit that is already paid", async () => {
    const { orderId } = await startOrder(repo, paypal, "v1", NOW);
    await captureVisit(repo, paypal, "v1", orderId, NOW + 100);
    expect(await errorCode(startOrder(repo, paypal, "v1", NOW + 200))).toBe("already_paid");
    expect(paypal.orders).toHaveLength(1);
  });

  it("refuses to capture an order made before the bill changed, and takes no money", async () => {
    const { orderId } = await startOrder(repo, paypal, "v1", NOW);
    const { bill } = await editLines(repo, "v1", [{ sku: "honey", qty: 1 }, { sku: "bread", qty: 1 }], NOW + 50);
    expect(bill.totalCents).toBe(1200);
    expect(await errorCode(captureVisit(repo, paypal, "v1", orderId, NOW + 100))).toBe("amount_mismatch");
    expect(paypal.captures).toEqual([]);
    expect((await repo.getVisit("v1"))!.status).toBe("open");
  });

  it("marks the visit adjusted when the customer pays for fewer items", async () => {
    await editLines(repo, "v1", [{ sku: "honey", qty: 1 }], NOW);
    const { orderId } = await startOrder(repo, paypal, "v1", NOW + 10);
    const { visit } = await captureVisit(repo, paypal, "v1", orderId, NOW + 100);
    expect(visit.status).toBe("paid_adjusted");
    expect(visit.paidCents).toBe(700);
    expect(visit.detected).toEqual([{ sku: "honey", qty: 2 }, { sku: "bread", qty: 1 }]);
  });

  it("creates no PayPal order for an empty bill and closes the visit as empty", async () => {
    await editLines(repo, "v1", [], NOW);
    expect(await errorCode(startOrder(repo, paypal, "v1", NOW + 10))).toBe("empty_bill");
    expect(paypal.orders).toEqual([]);
    expect((await repo.getVisit("v1"))!.status).toBe("empty");
  });

  it("ignores edited lines that are not in the catalogue or have silly quantities", async () => {
    const { bill } = await editLines(
      repo,
      "v1",
      [{ sku: "ghost", qty: 1 }, { sku: "jam", qty: 21 }, { sku: "eggs", qty: 1.5 }, { sku: "honey", qty: 3 }],
      NOW,
    );
    expect(bill.lines.map((l) => `${l.sku}:${l.qty}`)).toEqual(["honey:3"]);
  });

  it("lets an unmatched visit be paid late, but not after 24 hours", async () => {
    const stale = expireIfStale((await repo.getVisit("v1"))!, 1_000 + 600_001);
    await repo.saveVisit(stale);
    const { orderId } = await startOrder(repo, paypal, "v1", stale.closedAt! + 1_000);
    const { visit } = await captureVisit(repo, paypal, "v1", orderId, stale.closedAt! + 2_000);
    expect(visit.status).toBe("paid_late");

    await repo.saveVisit({ ...stale, id: "v2" });
    expect(await errorCode(startOrder(repo, paypal, "v2", stale.closedAt! + 86_400_001))).toBe("too_late");
  });

  it("reports an unknown visit", async () => {
    expect(await errorCode(getBill(repo, "nope", NOW))).toBe("not_found");
  });

  it("takes no money for a visit the owner settled another way while the customer was approving", async () => {
    const { orderId } = await startOrder(repo, paypal, "v1", NOW);
    await repo.saveVisit({ ...(await repo.getVisit("v1"))!, status: "settled_other", closedAt: NOW + 50 });
    expect(await errorCode(captureVisit(repo, paypal, "v1", orderId, NOW + 100))).toBe("empty_bill");
    expect(paypal.captures).toEqual([]);
  });

  it("takes no money for a visit that became empty while the customer was approving", async () => {
    const { orderId } = await startOrder(repo, paypal, "v1", NOW);
    await repo.saveVisit({ ...(await repo.getVisit("v1"))!, status: "empty", closedAt: NOW + 50 });
    expect(await errorCode(captureVisit(repo, paypal, "v1", orderId, NOW + 100))).toBe("empty_bill");
    expect(paypal.captures).toEqual([]);
  });

  it("takes no money once an unmatched visit is past the late-payment window", async () => {
    const stale = expireIfStale((await repo.getVisit("v1"))!, 1_000 + 600_001);
    await repo.saveVisit(stale);
    const { orderId } = await startOrder(repo, paypal, "v1", stale.closedAt! + 1_000);
    expect(await errorCode(captureVisit(repo, paypal, "v1", orderId, stale.closedAt! + 86_400_001))).toBe("too_late");
    expect(paypal.captures).toEqual([]);
  });

  it("keeps the capture on the visit and says money may have moved when recording the payment fails", async () => {
    const { orderId } = await startOrder(repo, paypal, "v1", NOW);
    // Storage fails once, straight after PayPal has captured.
    const save = repo.saveVisit.bind(repo);
    let failures = 1;
    repo.saveVisit = async (v) => {
      if (paypal.captures.length > 0 && failures-- > 0) throw new Error("storage down");
      return save(v);
    };
    expect(await errorCode(captureVisit(repo, paypal, "v1", orderId, NOW + 100))).toBe("captured_but_unrecorded");
    const stored = (await repo.getVisit("v1"))!;
    expect(stored.captureId).toBe("CAP-ORDER1");
    expect(stored.paidCents).toBe(1900);

    // Trying again does not reach PayPal a second time.
    const again = await captureVisit(repo, paypal, "v1", orderId, NOW + 200);
    expect(again.receipt.captureId).toBe("CAP-ORDER1");
    expect(paypal.captures).toEqual(["ORDER1"]);
  });

  it("still says money may have moved when nothing at all can be stored after the capture", async () => {
    const { orderId } = await startOrder(repo, paypal, "v1", NOW);
    repo.saveVisit = async () => {
      throw new Error("storage down");
    };
    expect(await errorCode(captureVisit(repo, paypal, "v1", orderId, NOW + 100))).toBe("captured_but_unrecorded");
    expect(paypal.captures).toEqual(["ORDER1"]);
  });

  it("flags a corrected bill as adjusted when it is paid late, and keeps the late status", async () => {
    const stale = expireIfStale((await repo.getVisit("v1"))!, 1_000 + 600_001);
    await repo.saveVisit(stale);
    await editLines(repo, "v1", [{ sku: "honey", qty: 1 }], stale.closedAt! + 500);
    const { orderId } = await startOrder(repo, paypal, "v1", stale.closedAt! + 1_000);
    const { visit } = await captureVisit(repo, paypal, "v1", orderId, stale.closedAt! + 2_000);
    expect(visit.status).toBe("paid_late");
    expect(visit.adjusted).toBe(true);
    expect(visit.paid).toEqual([{ sku: "honey", qty: 1 }]);
  });
});
