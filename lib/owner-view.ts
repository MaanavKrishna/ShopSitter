// Pure helpers behind the owner dashboard: the shelf ledger, paid-by-day buckets and visit filters.

import type { Totals } from "./owner";

export type LedgerKey = "paid" | "unmatched" | "adjusted" | "open" | "settled" | "refunded";
export type LedgerPart = { key: LedgerKey; label: string; cents: number };

type ValuedVisit = { status: string; detectedCents: number };

/**
 * Where the value taken from the shelf went. Paid, unmatched and adjusted are always listed;
 * open, settled another way and refunded only when there is something in them.
 */
export function ledgerParts(totals: Totals, visits: ValuedVisit[]): { parts: LedgerPart[]; totalCents: number } {
  const valueOf = (status: string) =>
    visits.filter((v) => v.status === status).reduce((sum, v) => sum + v.detectedCents, 0);

  const parts: LedgerPart[] = [
    { key: "paid", label: "Paid", cents: Math.max(0, totals.paidCents - totals.refundedCents) },
    { key: "unmatched", label: "Unmatched", cents: totals.unmatchedCents },
    { key: "adjusted", label: "Adjusted by customers", cents: totals.adjustedCents },
  ];
  const optional: LedgerPart[] = [
    { key: "open", label: "Still open", cents: valueOf("open") },
    { key: "settled", label: "Settled another way", cents: valueOf("settled_other") },
    { key: "refunded", label: "Refunded", cents: Math.min(totals.refundedCents, totals.paidCents) },
  ];
  return { parts: [...parts, ...optional.filter((p) => p.cents > 0)], totalCents: totals.soldCents };
}

/**
 * Width of each part of the bar in percent. A part with any value gets at least `minPercent`
 * so it stays visible; the larger parts give up the difference in proportion.
 */
export function segmentShares(parts: { cents: number }[], minPercent: number): number[] {
  const total = parts.reduce((sum, p) => sum + p.cents, 0);
  if (total <= 0) return parts.map(() => 0);

  let shares = parts.map((p) => (p.cents / total) * 100);
  const lifted = new Set<number>();
  // Lifting one part shrinks the others, which can push another under the minimum, so repeat until stable.
  for (let pass = 0; pass < parts.length; pass++) {
    const small = shares.flatMap((s, i) => (s > 0 && s < minPercent && !lifted.has(i) ? [i] : []));
    if (small.length === 0) break;
    for (const i of small) lifted.add(i);
    const room = 100 - lifted.size * minPercent;
    const rest = shares.reduce((sum, s, i) => (lifted.has(i) ? sum : sum + s), 0);
    shares = shares.map((s, i) => (lifted.has(i) ? minPercent : rest > 0 ? (s / rest) * room : 0));
  }
  return shares.map((s) => Math.round(s * 100) / 100);
}

export type PaidBucket = { start: number; cents: number };

type PaidVisit = {
  status: string;
  paidCents: number | null;
  refundedCents: number;
  openedAt: number;
  closedAt: number | null;
};

/**
 * Money paid, net of refunds, per calendar day of the period (in the viewer's time zone),
 * or per clock hour when the period is a single day. The last bucket holds `now`.
 */
export function paidBuckets(visits: PaidVisit[], days: number, now: number): { unit: "hour" | "day"; buckets: PaidBucket[] } {
  const unit = days <= 1 ? "hour" : "day";
  const count = unit === "hour" ? 24 : days;
  const d = new Date(now);
  const startOf = (back: number) =>
    unit === "hour"
      ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() - back).getTime()
      : new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime();

  const buckets: PaidBucket[] = Array.from({ length: count }, (_, i) => ({ start: startOf(count - 1 - i), cents: 0 }));

  for (const v of visits) {
    if (!v.status.startsWith("paid") || v.paidCents === null) continue;
    const at = v.closedAt ?? v.openedAt;
    // The last bucket that starts at or before the payment.
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (buckets[i].start <= at) {
        buckets[i].cents += Math.max(0, v.paidCents - v.refundedCents);
        break;
      }
    }
  }
  return { unit, buckets };
}

export type VisitFilter = "all" | "paid" | "unmatched" | "open";

export function matchesFilter(v: { status: string }, filter: VisitFilter): boolean {
  if (filter === "all") return true;
  if (filter === "paid") return v.status.startsWith("paid");
  return v.status === filter;
}

export function countByFilter(visits: { status: string }[]): Record<VisitFilter, number> {
  const count = (f: VisitFilter) => visits.filter((v) => matchesFilter(v, f)).length;
  return { all: count("all"), paid: count("paid"), unmatched: count("unmatched"), open: count("open") };
}

/** One or none left on the shelf: time to restock. */
export const isLow = (left: number) => left <= 1;
