// Pure rules for PayPal holds: how much to hold, and what fits under a hold when the bill is larger.
import { priceLines } from "./money";
import type { StoreSettings } from "./store";
import type { Line, Product } from "./types";
import type { Visit } from "./visits";

export const HOLD_BASIS_DAYS = 30;
const DAY_MS = 86_400_000;

/** What each paid visit of the last 30 days paid, in cents. */
export function holdBasis(visits: Pick<Visit, "status" | "paidCents" | "openedAt">[], now: number): number[] {
  return visits
    .filter((v) => v.status === "paid" || v.status === "paid_adjusted" || v.status === "paid_late")
    .filter((v) => v.openedAt >= now - HOLD_BASIS_DAYS * DAY_MS && (v.paidCents ?? 0) > 0)
    .map((v) => v.paidCents as number);
}

/** Below this many paid visits there is too little to go on, and the hold is twice the floor. */
export const HOLD_MIN_VISITS = 10;
const STEP_CENTS = 500;

/**
 * The hold to ask a shopper for: the amount that covers nine in ten paid visits (the 90th
 * percentile by nearest rank), rounded up to the next $5 and kept between the floor and the cap.
 * With fewer than ten paid visits it is twice the floor. The owner's own amount wins when set.
 * Never more than the cap.
 */
export function suggestedHoldCents(paidCents: number[], settings: Omit<StoreSettings, "payMode">): number {
  const cap = settings.holdCapCents;
  if (settings.holdOverrideCents !== null) return Math.min(settings.holdOverrideCents, cap);
  if (paidCents.length < HOLD_MIN_VISITS) return Math.min(settings.holdFloorCents * 2, cap);
  const sorted = [...paidCents].sort((a, b) => a - b);
  const ninth = sorted[Math.ceil(0.9 * sorted.length) - 1];
  const rounded = Math.ceil(ninth / STEP_CENTS) * STEP_CENTS;
  return Math.min(Math.max(rounded, settings.holdFloorCents), cap);
}

export type HoldSplit = { keep: Line[]; keepCents: number; rest: Line[] };

/**
 * Splits a bill that may be larger than the hold. Lines are taken in order, a unit at a time, for
 * as long as they fit; `keep` never costs more than `holdCents`. What does not fit is `rest`.
 * Lines the catalogue cannot price are in neither.
 */
export function splitForHold(lines: Line[], catalogue: Product[], holdCents: number): HoldSplit {
  let room = Math.max(0, Math.floor(holdCents));
  const keep: Line[] = [];
  const rest: Line[] = [];
  for (const line of priceLines(lines, catalogue).lines) {
    const fits = line.unitCents > 0 ? Math.min(line.qty, Math.floor(room / line.unitCents)) : line.qty;
    if (fits > 0) keep.push({ sku: line.sku, qty: fits });
    if (fits < line.qty) rest.push({ sku: line.sku, qty: line.qty - fits });
    room -= fits * line.unitCents;
  }
  return { keep, keepCents: priceLines(keep, catalogue).totalCents, rest };
}
