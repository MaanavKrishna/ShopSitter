import type { Line, Shop } from "./types";

/** A shelf change that starts within this long of the last one joins the same visit. */
export const JOIN_WINDOW_MS = 60_000;
/** An open visit with no payment for this long becomes unmatched. */
export const OPEN_TIMEOUT_MS = 600_000;
/** An unmatched visit can still be paid for this long. */
export const LATE_PAY_MS = 86_400_000;

export type VisitStatus = "open" | "paid" | "paid_adjusted" | "paid_late" | "unmatched" | "empty" | "settled_other";

export type Visit = {
  id: string;
  shop: Shop;
  status: VisitStatus;
  /** What the camera saw leave the shelf. */
  detected: Line[];
  /** What the customer chose to pay for (may differ from detected). */
  paid: Line[] | null;
  paidCents: number | null;
  refundedCents: number;
  paypalOrderId: string | null;
  captureId: string | null;
  beforeUrl: string | null;
  afterUrl: string | null;
  confidence: number | null;
  /** True when the shelf could not be read and the customer must enter items by hand. */
  needsManual: boolean;
  openedAt: number;
  lastSettledAt: number;
  closedAt: number | null;
};

export type ChangeResult = {
  /** The previous visit, now closed as unmatched, when this change started a new one. */
  close?: Visit;
  /** The visit after the change, or null when nothing is owed and nothing was open. */
  visit: Visit | null;
};

/** Applies a shelf change to a bill. Negative quantities are items put back. */
export function mergeLines(current: Line[], delta: Line[]): Line[] {
  const qty = new Map(current.map((l) => [l.sku, l.qty]));
  for (const d of delta) qty.set(d.sku, Math.max(0, (qty.get(d.sku) ?? 0) + d.qty));
  return [...qty].filter(([, q]) => q > 0).map(([sku, q]) => ({ sku, qty: q }));
}

export function newVisit(id: string, shop: Shop, detected: Line[], at: number): Visit {
  return {
    id,
    shop,
    status: "open",
    detected,
    paid: null,
    paidCents: null,
    refundedCents: 0,
    paypalOrderId: null,
    captureId: null,
    beforeUrl: null,
    afterUrl: null,
    confidence: null,
    needsManual: false,
    openedAt: at,
    lastSettledAt: at,
    closedAt: null,
  };
}

export function applyShelfChange(
  open: Visit | null,
  delta: Line[],
  changeStartedAt: number,
  settledAt: number,
  shop: Shop,
  newId: () => string,
): ChangeResult {
  const joins = open !== null && open.status === "open" && changeStartedAt - open.lastSettledAt <= JOIN_WINDOW_MS;

  if (joins) {
    const detected = mergeLines(open.detected, delta);
    if (detected.length === 0) {
      return { visit: { ...open, detected, status: "empty", lastSettledAt: settledAt, closedAt: settledAt } };
    }
    return { visit: { ...open, detected, lastSettledAt: settledAt } };
  }

  const close: Visit | undefined =
    open !== null && open.status === "open" ? { ...open, status: "unmatched", closedAt: changeStartedAt } : undefined;
  const detected = mergeLines([], delta);
  const visit = detected.length === 0 ? null : newVisit(newId(), shop, detected, settledAt);
  return close ? { close, visit } : { visit };
}

export function expireIfStale(v: Visit, now: number): Visit {
  if (v.status !== "open" || now - v.lastSettledAt <= OPEN_TIMEOUT_MS) return v;
  return { ...v, status: "unmatched", closedAt: v.lastSettledAt + OPEN_TIMEOUT_MS };
}

function sameLines(a: Line[], b: Line[]): boolean {
  const key = (ls: Line[]) =>
    ls
      .filter((l) => l.qty > 0)
      .map((l) => `${l.sku}:${l.qty}`)
      .sort()
      .join(",");
  return key(a) === key(b);
}

/**
 * Records a captured payment. Throws "too_late" when an unmatched visit is past the
 * late-payment window and "not_payable" for visits that owe nothing.
 */
export function settlePayment(v: Visit, paidLines: Line[], paidCents: number, now: number): Visit {
  if (v.status === "paid" || v.status === "paid_adjusted" || v.status === "paid_late") return v;
  if (v.status === "empty" || v.status === "settled_other") throw new Error("not_payable");

  if (v.status === "unmatched") {
    if (now - (v.closedAt ?? v.lastSettledAt) > LATE_PAY_MS) throw new Error("too_late");
    return { ...v, status: "paid_late", paid: paidLines, paidCents };
  }
  const status: VisitStatus = sameLines(v.detected, paidLines) ? "paid" : "paid_adjusted";
  return { ...v, status, paid: paidLines, paidCents, closedAt: now };
}
