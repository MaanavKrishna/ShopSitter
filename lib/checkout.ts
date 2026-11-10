import { priceLines } from "./money";
import { buildOrderBody, type PayPalGateway } from "./paypal";
import type { Repo } from "./repo";
import type { Line, PricedBill, Product } from "./types";
import { LATE_PAY_MS, expireIfStale, settlePayment, type Visit } from "./visits";

export type CheckoutErrorCode =
  | "not_found"
  | "not_editable"
  | "empty_bill"
  | "already_paid"
  | "too_late"
  | "amount_mismatch";

export class CheckoutError extends Error {
  constructor(public code: CheckoutErrorCode) {
    super(code);
  }
}

export type Receipt = { visitId: string; bill: PricedBill; paidCents: number; captureId: string; status: string };

const MAX_QTY = 20;
const isPaid = (v: Visit) => v.status === "paid" || v.status === "paid_adjusted" || v.status === "paid_late";

/** The lines the customer will pay for: their own edit if they made one, else what the camera saw. */
const payableLines = (v: Visit): Line[] => v.paid ?? v.detected;

async function load(repo: Repo, visitId: string, now: number): Promise<{ visit: Visit; products: Product[] }> {
  const stored = await repo.getVisit(visitId);
  if (!stored) throw new CheckoutError("not_found");
  const visit = expireIfStale(stored, now);
  if (visit !== stored) await repo.saveVisit(visit);
  return { visit, products: await repo.listProducts(visit.shop) };
}

export async function getBill(repo: Repo, visitId: string, now: number) {
  const { visit, products } = await load(repo, visitId, now);
  return { visit, products, bill: priceLines(payableLines(visit), products) };
}

/** Customer correction of the bill. Only catalogue products with whole quantities 1..20 are kept. */
export async function editLines(repo: Repo, visitId: string, lines: Line[], now: number) {
  const { visit, products } = await load(repo, visitId, now);
  if (visit.status !== "open" && visit.status !== "unmatched") throw new CheckoutError("not_editable");

  const known = new Set(products.map((p) => p.sku));
  const clean = lines.filter((l) => known.has(l.sku) && Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= MAX_QTY);
  // Any order created for the old total is no longer valid.
  const updated: Visit = { ...visit, paid: clean, paypalOrderId: null, orderCents: null };
  await repo.saveVisit(updated);
  return { visit: updated, bill: priceLines(clean, products) };
}

export async function startOrder(repo: Repo, paypal: PayPalGateway, visitId: string, now: number) {
  const { visit, products } = await load(repo, visitId, now);
  if (isPaid(visit)) throw new CheckoutError("already_paid");
  if (visit.status === "unmatched" && now - (visit.closedAt ?? visit.lastSettledAt) > LATE_PAY_MS) {
    throw new CheckoutError("too_late");
  }
  if (visit.status !== "open" && visit.status !== "unmatched") throw new CheckoutError("empty_bill");

  const bill = priceLines(payableLines(visit), products);
  if (bill.totalCents === 0) {
    if (visit.status === "open") await repo.saveVisit({ ...visit, status: "empty", closedAt: now });
    throw new CheckoutError("empty_bill");
  }

  const { orderId } = await paypal.createOrder(buildOrderBody(bill, visit.id));
  await repo.saveVisit({ ...visit, paypalOrderId: orderId, orderCents: bill.totalCents });
  return { orderId };
}

const receiptFor = (visit: Visit, products: Product[]): Receipt => ({
  visitId: visit.id,
  bill: priceLines(payableLines(visit), products),
  paidCents: visit.paidCents ?? 0,
  captureId: visit.captureId ?? "",
  status: visit.status,
});

// One capture at a time per visit, so a double tap cannot reach PayPal twice.
const inFlight = new Map<string, Promise<{ visit: Visit; receipt: Receipt }>>();

export function captureVisit(repo: Repo, paypal: PayPalGateway, visitId: string, orderId: string, now: number) {
  const running = inFlight.get(visitId);
  if (running) return running;
  const work = capture(repo, paypal, visitId, orderId, now).finally(() => inFlight.delete(visitId));
  inFlight.set(visitId, work);
  return work;
}

async function capture(repo: Repo, paypal: PayPalGateway, visitId: string, orderId: string, now: number) {
  const { visit, products } = await load(repo, visitId, now);
  if (isPaid(visit)) return { visit, receipt: receiptFor(visit, products) };

  const bill = priceLines(payableLines(visit), products);
  // Checked before capturing: money is only taken for the bill the customer is looking at.
  if (visit.paypalOrderId !== orderId || visit.orderCents !== bill.totalCents) {
    throw new CheckoutError("amount_mismatch");
  }

  const result = await paypal.captureOrder(orderId);
  let settled: Visit;
  try {
    settled = settlePayment(visit, payableLines(visit), result.amountCents, now);
  } catch {
    throw new CheckoutError("too_late");
  }
  settled = { ...settled, captureId: result.captureId };
  await repo.saveVisit(settled);
  return { visit: settled, receipt: receiptFor(settled, products) };
}
