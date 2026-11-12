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
  /**
   * True when what was paid for differs from what the camera saw, whenever it was paid.
   * Set when the payment is recorded; visits stored before this existed do not have it (see isAdjusted).
   */
  adjusted?: boolean;
  refundedCents: number;
  paypalOrderId: string | null;
  /** Total of the PayPal order above, so a changed bill can be detected before capture. */
  orderCents: number | null;
  captureId: string | null;
  beforeUrl: string | null;
  afterUrl: string | null;
  confidence: number | null;
  /** True when the shelf could not be read and the customer must enter items by hand. */
  needsManual: boolean;
  openedAt: number;
  lastSettledAt: number;
  closedAt: number | null;
  /** Zones whose cameras added lines to this visit. */
  zoneIds?: string[];
  /** Present when a shopper checked in at the door: the visit's id is that shopper's session id. */
  session?: { checkedInAt: number; closedAt: number | null; /** The visit holding what did not fit under the hold. */ restId?: string };
  /** A PayPal order with intent AUTHORIZE made at check-in, waiting for the shopper to approve it. */
  holdOrder?: { orderId: string; cents: number };
  /** Money PayPal has set aside for this visit. */
  hold?: VisitHold;
  /** A shelf change waiting for a checked-in shopper to say it is theirs. */
  pending?: { zoneId: string | null; claimedBy: string | null };
  /** Everything PayPal did for this visit through a hold, oldest first. */
  money?: MoneyEvent[];
};

export type HoldStatus = "authorized" | "captured" | "voided";
export type VisitHold = {
  orderId: string;
  authorizationId: string;
  cents: number;
  status: HoldStatus;
  /**
   * The charge decided when the shopper finished, saved before PayPal is asked, so a retry charges
   * the same amount under the same key whatever the basket did meanwhile.
   */
  closing?: { cents: number; keep: Line[]; rest: Line[] };
};
export type MoneyEvent = { at: number; kind: "authorized" | "captured" | "voided" | "refunded"; cents: number; ref: string };

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
export const VISIT_ID = /^[a-z2-7]{20}$/;

/** A new visit id: 100 random bits as twenty base32 characters. Visits made before this have 8 hex characters. */
export function newVisitId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => ID_ALPHABET[b & 31]).join("");
}

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
    orderCents: null,
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
  // Things put back belong to the bill that is still open, however long the shopper took to decide.
  const onlyReturns = delta.length > 0 && delta.every((d) => d.qty < 0);
  const joins =
    open !== null &&
    open.status === "open" &&
    (onlyReturns || changeStartedAt - open.lastSettledAt <= JOIN_WINDOW_MS);

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

/**
 * Takes items put back off a visit that has already turned unmatched, while it can still be paid.
 * Only items the visit held count, and never more of them than it held. Returns null when the change
 * takes something, or touches nothing on this visit.
 */
export function applyReturns(v: Visit, delta: Line[], now: number): Visit | null {
  if (v.status !== "unmatched") return null;
  if (delta.length === 0 || delta.some((d) => d.qty >= 0)) return null;
  if (now - (v.closedAt ?? v.lastSettledAt) > LATE_PAY_MS) return null;
  const held = new Set(v.detected.map((l) => l.sku));
  const relevant = delta.filter((d) => held.has(d.sku));
  if (relevant.length === 0) return null;
  const detected = mergeLines(v.detected, relevant);
  return detected.length === 0 ? { ...v, detected, status: "empty" } : { ...v, detected };
}

/**
 * Closes a visit whose bill the shopper brought to nothing. It is "empty" only when the camera saw
 * nothing; otherwise it stays in the owner's figures as unmatched, marked adjusted, with the
 * shopper's own (empty) lines kept beside what the camera saw.
 */
export function closeZeroBill(v: Visit, now: number): Visit {
  if (v.detected.length === 0) return { ...v, status: "empty", closedAt: now };
  return { ...v, status: "unmatched", adjusted: true, paid: v.paid ?? [], closedAt: now };
}

export function expireIfStale(v: Visit, now: number): Visit {
  if (v.status !== "open" || now - v.lastSettledAt <= OPEN_TIMEOUT_MS) return v;
  // A visit with money held is closed by charging the hold (lib/sessions.ts), never by timing out.
  if (v.hold?.status === "authorized") return v;
  const closedAt = v.lastSettledAt + OPEN_TIMEOUT_MS;
  if (v.session) {
    const session = { ...v.session, closedAt: v.session.closedAt ?? closedAt };
    // A shopper who checked in and took nothing owes nothing.
    const nothing = v.detected.length === 0 && (v.paid ?? []).length === 0 && !v.needsManual;
    return { ...v, session, status: nothing ? "empty" : "unmatched", closedAt };
  }
  if (v.pending) {
    // Nobody claimed it: from here on it is an ordinary unmatched visit.
    const rest: Visit = { ...v, status: "unmatched", closedAt };
    delete rest.pending;
    return rest;
  }
  return { ...v, status: "unmatched", closedAt };
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

  const adjusted = !sameLines(v.detected, paidLines);
  if (v.status === "unmatched") {
    if (now - (v.closedAt ?? v.lastSettledAt) > LATE_PAY_MS) throw new Error("too_late");
    return { ...v, status: "paid_late", adjusted, paid: paidLines, paidCents };
  }
  return { ...v, status: adjusted ? "paid_adjusted" : "paid", adjusted, paid: paidLines, paidCents, closedAt: now };
}

/**
 * Whether a paid visit was paid for something other than what the camera saw. Lateness is separate:
 * a "paid_late" visit can be adjusted too. Works for visits stored before the flag existed.
 */
export function isAdjusted(v: Pick<Visit, "status" | "detected" | "paid" | "adjusted">): boolean {
  if (v.status !== "paid" && v.status !== "paid_adjusted" && v.status !== "paid_late") return false;
  if (v.adjusted !== undefined) return v.adjusted;
  if (v.status === "paid_late") return v.paid !== null && !sameLines(v.detected, v.paid);
  return v.status === "paid_adjusted";
}
