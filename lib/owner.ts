import { visitorsSince } from "./footfall";
import { priceLines } from "./money";
import { PayPalRefused, type PayPalGateway } from "./paypal";
import type { Repo } from "./repo";
import type { Line, PricedBill, Product, Shop } from "./types";
import { expireIfStale, isAdjusted, type Visit } from "./visits";

export class OwnerError extends Error {
  constructor(
    /** "paypal_refused": PayPal turned the refund down, so nothing was sent and nothing changed. */
    public code: "not_found" | "not_allowed" | "bad_amount" | "paypal_refused",
    public status: number,
  ) {
    super(code);
  }
}

export type VisitRow = Visit & {
  /** What the camera saw, priced. */
  detectedBill: PricedBill;
  detectedCents: number;
  /** What the customer paid for, priced. Null when they never edited or paid a bill. Always set by ownerOverview. */
  paidBill?: PricedBill | null;
  /** True when what was paid for differs from what the camera saw, late or not. Always set by ownerOverview. */
  adjusted?: boolean;
};

export type Totals = {
  /** Value of everything the camera saw leave the shelf. */
  soldCents: number;
  /** Money captured through PayPal (before refunds). */
  paidCents: number;
  refundedCents: number;
  /** Value of visits that ended with no payment. */
  unmatchedCents: number;
  /** Value customers removed from bills they then paid. */
  adjustedCents: number;
};

export type StockRow = { sku: string; name: string; left: number };

const DAY_MS = 86_400_000;
const isPaid = (v: Visit) => v.status === "paid" || v.status === "paid_adjusted" || v.status === "paid_late";

/** Everything the dashboard shows for one shop. Stale open visits are closed as unmatched first. */
export async function ownerOverview(repo: Repo, shop: Shop, days: number, now: number) {
  // Visits are priced from the whole catalogue, so a product removed since still has its name and price.
  const catalogue = await repo.listProducts(shop, { includeArchived: true });
  const products = catalogue.filter((p) => !p.archived);
  const all: Visit[] = [];
  for (const stored of await repo.listVisits(shop)) {
    const v = expireIfStale(stored, now);
    if (v !== stored) await repo.saveVisit(v);
    all.push(v);
  }

  const rows: VisitRow[] = all
    .filter((v) => v.openedAt >= now - days * DAY_MS)
    .map((v) => {
      const detectedBill = priceLines(v.detected, catalogue);
      return {
        ...v,
        detectedBill,
        detectedCents: detectedBill.totalCents,
        paidBill: v.paid ? priceLines(v.paid, catalogue) : null,
        adjusted: isAdjusted(v),
      };
    });

  const totals: Totals = { soldCents: 0, paidCents: 0, refundedCents: 0, unmatchedCents: 0, adjustedCents: 0 };
  for (const r of rows) {
    if (r.status === "empty") continue;
    totals.soldCents += r.detectedCents;
    totals.paidCents += r.paidCents ?? 0;
    totals.refundedCents += r.refundedCents;
    if (r.status === "unmatched") totals.unmatchedCents += r.detectedCents;
    if (r.adjusted) totals.adjustedCents += Math.max(0, r.detectedCents - (r.paidCents ?? 0));
  }

  // People the stand's own detector saw stop by. Zero when it is not in use.
  const visitors = await visitorsSince(repo, shop, days, now);
  return { visits: rows, totals, stock: stockLeft(products, all), products, visitors };
}

/** Units of each product the camera has seen leave the shelf, over every visit given. */
export function takenBySku(visits: Visit[]): Map<string, number> {
  const taken = new Map<string, number>();
  for (const v of visits) {
    if (v.status === "empty") continue;
    for (const l of v.detected) taken.set(l.sku, (taken.get(l.sku) ?? 0) + l.qty);
  }
  return taken;
}

/** The stock to store so that, with `taken` units gone so far, the shelf list shows `left`. */
export const stockForLeft = (taken: number, left: number) => taken + left;

function stockLeft(products: Product[], visits: Visit[]): StockRow[] {
  const taken = takenBySku(visits);
  return products.map((p) => ({ sku: p.sku, name: p.name, left: Math.max(0, p.stock - (taken.get(p.sku) ?? 0)) }));
}

export type OwnerActionInput =
  | { action: "settle" }
  | { action: "correct"; lines: Line[] }
  | { action: "refund"; cents: number };

const sameLines = (a: Line[], b: Line[]) => {
  const key = (ls: Line[]) => ls.map((l) => `${l.sku}:${l.qty}`).sort().join(",");
  return key(a) === key(b);
};

export async function ownerAction(
  repo: Repo,
  paypal: PayPalGateway,
  shop: Shop,
  visitId: string,
  input: OwnerActionInput,
): Promise<Visit> {
  const visit = await repo.getVisit(visitId);
  if (!visit || visit.shop !== shop) throw new OwnerError("not_found", 404);
  let updated: Visit;

  if (input.action === "settle") {
    // "They paid me in cash" or similar: stops the visit counting as unmatched.
    if (visit.status !== "unmatched" && visit.status !== "open") throw new OwnerError("not_allowed", 409);
    updated = { ...visit, status: "settled_other", closedAt: visit.closedAt ?? Date.now() };
  } else if (input.action === "correct") {
    // Products on sale, plus any removed since that this visit already lists.
    const known = new Set([...(await repo.listProducts(shop)).map((p) => p.sku), ...visit.detected.map((l) => l.sku)]);
    const detected = input.lines.filter((l) => known.has(l.sku) && Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= 20);
    updated = { ...visit, detected };
    // A correction that matches what was paid means the customer's bill was right after all.
    if (isAdjusted(visit) && visit.paid && sameLines(detected, visit.paid)) {
      updated = { ...updated, adjusted: false, status: visit.status === "paid_adjusted" ? "paid" : visit.status };
    }
  } else {
    // Any visit holding a PayPal capture can be refunded, including one whose payment could not be recorded as paid.
    const captured = isPaid(visit) || (visit.paidCents ?? 0) > 0;
    if (!captured || !visit.captureId) throw new OwnerError("not_allowed", 409);
    const remaining = (visit.paidCents ?? 0) - visit.refundedCents;
    if (!Number.isInteger(input.cents) || input.cents < 1 || input.cents > remaining) {
      throw new OwnerError("bad_amount", 400);
    }
    // Keyed on how much was already refunded, so two equal refunds are two requests but a retry is one.
    try {
      await paypal.refundCapture(visit.captureId, input.cents, `refund-${visit.captureId}-${visit.refundedCents}-${input.cents}`);
    } catch (e) {
      if (e instanceof PayPalRefused) throw new OwnerError("paypal_refused", 422);
      throw e;
    }
    updated = { ...visit, refundedCents: visit.refundedCents + input.cents };
  }

  await repo.saveVisit(updated);
  return updated;
}
