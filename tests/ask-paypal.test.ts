import { describe, expect, it } from "vitest";
import type { AskData, Clock } from "@/lib/ask";
import { ENABLED_ACTIONS, type PayPalReader, ordersOf, paypalTools, shapeOrder, shapeTransactions } from "@/lib/paypal-read";
import { priceLines } from "@/lib/money";
import { DEMO_PRODUCTS } from "@/lib/seed";
import { newVisit } from "@/lib/visits";

const NOW = Date.UTC(2026, 10, 12, 12);
const clock: Clock = { now: NOW, days: 7, tzOffset: 0 };

const bill = priceLines([{ sku: "honey", qty: 1 }], DEMO_PRODUCTS);
const visit = (id: string, paypalOrderId: string | null) => ({
  ...newVisit(id, "demo" as const, [{ sku: "honey", qty: 1 }], NOW - 3_600_000),
  paypalOrderId,
  detectedBill: bill,
  detectedCents: bill.totalCents,
});
const data: AskData = {
  visits: [visit("with-order", "8SG55728XT9868238"), visit("no-order", null)],
  totals: { soldCents: 1400, paidCents: 0, refundedCents: 0, unmatchedCents: 0, adjustedCents: 0 },
  stock: [],
  products: DEMO_PRODUCTS,
};

// The shape PayPal's order lookup returns, cut down to what is read.
const ORDER = {
  id: "8SG55728XT9868238",
  status: "COMPLETED",
  purchase_units: [
    {
      amount: { currency_code: "USD", value: "19.00" },
      items: [{ name: "Honey", quantity: "2", unit_amount: { value: "7.00" } }],
      payments: {
        captures: [{ id: "CAP1", status: "PARTIALLY_REFUNDED", amount: { value: "19.00" }, create_time: "2026-11-10T09:01:00Z" }],
        refunds: [{ id: "REF1", status: "COMPLETED", amount: { value: "5.00" } }],
      },
    },
  ],
  create_time: "2026-11-10T09:00:00Z",
};

describe("enabled actions", () => {
  it("are only ones that read", () => {
    expect(ENABLED_ACTIONS).toEqual({ orders: { get: true }, transactions: { list: true } });
  });
});

describe("shapeOrder", () => {
  it("keeps the status and formats the money", () => {
    expect(shapeOrder(ORDER)).toEqual({
      found: true,
      order_id: "8SG55728XT9868238",
      status: "COMPLETED",
      amount: "$19.00",
      created: "2026-11-10T09:00:00Z",
      items: ["2 × Honey"],
      captures: [{ id: "CAP1", status: "PARTIALLY_REFUNDED", amount: "$19.00" }],
      refunds: [{ id: "REF1", status: "COMPLETED", amount: "$5.00" }],
    });
  });

  it("reads an order nobody has paid yet", () => {
    const created = { id: "X", status: "CREATED", purchase_units: [{ amount: { value: "7.00" } }] };
    expect(shapeOrder(created)).toMatchObject({ found: true, status: "CREATED", amount: "$7.00", captures: [], refunds: [] });
  });

  it("reports PayPal's refusals without their wording", () => {
    expect(shapeOrder({ ok: false, status: 404, message: "The specified resource does not exist." })).toEqual({
      found: false,
      reason: "PayPal has no order with that id.",
    });
    expect(shapeOrder({ ok: false, status: 403, message: "x" })).toEqual({
      found: false,
      reason: "PayPal did not allow this lookup for the stand's sandbox app.",
    });
    expect(shapeOrder({ ok: false, status: 500 })).toEqual({ found: false, reason: "PayPal could not be read just now." });
    expect(shapeOrder("garbage")).toEqual({ found: false, reason: "PayPal could not be read just now." });
  });
});

describe("shapeTransactions", () => {
  it("lists transactions with formatted amounts", () => {
    const raw = {
      total_items: 2,
      transaction_details: [
        { transaction_info: { transaction_id: "T1", transaction_status: "S", transaction_amount: { value: "19.00" }, transaction_initiation_date: "2026-11-10T09:01:00+0000" } },
        { transaction_info: { transaction_id: "T2", transaction_status: "S", transaction_amount: { value: "-5.00" }, transaction_initiation_date: "2026-11-10T10:00:00+0000" } },
      ],
    };
    expect(shapeTransactions(raw)).toEqual({
      available: true,
      count: 2,
      transactions: [
        { id: "T1", status: "S", amount: "$19.00", time: "2026-11-10T09:01:00+0000" },
        { id: "T2", status: "S", amount: "-$5.00", time: "2026-11-10T10:00:00+0000" },
      ],
    });
  });

  it("says when the sandbox app may not list transactions", () => {
    expect(shapeTransactions({ ok: false, status: 403 })).toEqual({
      available: false,
      reason: "PayPal did not allow this lookup for the stand's sandbox app.",
    });
  });
});

describe("paypalTools", () => {
  const reader = (calls: unknown[][]): PayPalReader => ({
    getOrder: async (id) => (calls.push(["order", id]), ORDER),
    listTransactions: async (start, end) => (calls.push(["transactions", start, end]), { transaction_details: [] }),
  });
  const own = new Set(["8SG55728XT9868238"]);
  const live = { shop: "live" as const, ownsOrder: async (id: string) => own.has(id) };
  const pick = (calls: unknown[][], name: string, access: Parameters<typeof paypalTools>[3] = live) => {
    const tool = paypalTools(data, clock, reader(calls), access).find((t) => t.name === name);
    if (!tool) throw new Error(`no ${name}`);
    return tool as unknown as { run: (args: unknown) => Promise<{ facts: unknown; sources: unknown[]; lines: string[] }> };
  };

  it("offers both lookups to the owner's stand, only the order lookup to the demo, and none to a trial", () => {
    const names = (shop: "live" | "demo" | "t-abcdefghij") =>
      paypalTools(data, clock, reader([]), { shop, ownsOrder: async () => true }).map((t) => t.name);
    expect(names("live")).toEqual(["paypal_order", "paypal_transactions"]);
    expect(names("demo")).toEqual(["paypal_order"]);
    expect(names("t-abcdefghij")).toEqual([]);
  });

  it("refuses an order id that is not one of this stand's own, and asks PayPal nothing", async () => {
    const calls: unknown[][] = [];
    const out = await pick(calls, "paypal_order").run({ order_id: "9AB12345CD6789012" });
    expect(calls).toEqual([]);
    expect(out.facts).toMatchObject({ found: false });
    const demo = { shop: "demo" as const, ownsOrder: async () => false };
    await pick(calls, "paypal_order", demo).run({ visit_id: "with-order" });
    expect(calls).toEqual([]);
  });

  it("knows a stand's own order ids: pay-page orders and hold orders", () => {
    const v = (id: string, patch: object) => ({ ...newVisit(id, "live", [], 0), ...patch });
    expect(
      ordersOf([
        v("a", { paypalOrderId: "ORDERA" }),
        v("b", { holdOrder: { orderId: "ORDERB", cents: 100 } }),
        v("c", { hold: { orderId: "ORDERC", authorizationId: "X", cents: 1, status: "voided" } }),
        v("d", {}),
      ]),
    ).toEqual(new Set(["ORDERA", "ORDERB", "ORDERC"]));
  });

  it("looks up the order a visit has on record", async () => {
    const calls: unknown[][] = [];
    const out = await pick(calls, "paypal_order").run({ visit_id: "with-order" });
    expect(calls).toEqual([["order", "8SG55728XT9868238"]]);
    expect(out.facts).toMatchObject({ found: true, status: "COMPLETED", amount: "$19.00" });
    expect(out.sources).toEqual([{ kind: "paypal", label: "PayPal sandbox" }]);
    expect(out.lines[0]).toContain("$19.00");
  });

  it("does not ask PayPal about a visit with no order", async () => {
    const calls: unknown[][] = [];
    const out = await pick(calls, "paypal_order").run({ visit_id: "no-order" });
    expect(calls).toEqual([]);
    expect(out.facts).toEqual({ found: false, reason: "The stand has no PayPal order on record for that visit." });
    expect(out.sources).toEqual([]);

    expect((await pick(calls, "paypal_order").run({ visit_id: "nobody" })).facts).toEqual({
      found: false,
      reason: "No visit with that id in this period.",
    });
  });

  it("accepts an order id only when it looks like one", async () => {
    const calls: unknown[][] = [];
    await pick(calls, "paypal_order").run({ order_id: "8SG55728XT9868238" });
    const bad = await pick(calls, "paypal_order").run({ order_id: "../v1/payments" });
    expect(calls).toEqual([["order", "8SG55728XT9868238"]]);
    expect(bad.facts).toMatchObject({ found: false });
  });

  it("lists transactions for the period on screen", async () => {
    const calls: unknown[][] = [];
    const out = await pick(calls, "paypal_transactions").run({});
    expect(calls).toEqual([["transactions", "2026-11-05T12:00:00Z", "2026-11-12T12:00:00Z"]]);
    expect(out.facts).toEqual({ available: true, count: 0, transactions: [] });
    expect(out.sources).toEqual([{ kind: "paypal", label: "PayPal sandbox" }]);
  });
});
