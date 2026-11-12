// Small decisions the shopper's basket, the store page and the stand screen make about what to
// show: which step a basket is at, the words for a refusal, how zones are grouped. No server imports.

import type { BillLine } from "./types";

export type PayMode = "after" | "hold" | "choice";
export type ZoneLike = { id: string; name: string; aisle: string; order: number };

/** A door token is far shorter than this; anything longer is not one. */
const MAX_TOKEN = 512;
const ZONE_ID = /^z[a-z2-7]{6}$/;
/** From this share of the hold, the basket says the hold is nearly used. */
const NEAR_HOLD = 0.8;
/** The faintest tint a shelf with anything unmatched gets, so it never looks clean. */
const MIN_TINT = 0.2;
/** Paid visits the suggested hold needs before it is worked out from them. */
const ENOUGH_VISITS = 10;

const parts = (text: string) => new URLSearchParams(text.replace(/^[#?]/, ""));

/** The door token a door QR carries after the "#", or null. */
export function doorTokenFromHash(hash: string): string | null {
  const token = parts(hash).get("store")?.trim();
  return token && token.length <= MAX_TOKEN ? token : null;
}

/** Why a shopper could not be checked in. `status` is null when the server never answered. */
export function enterProblem(status: number | null, code: string | undefined): string {
  if (status === null) return "We couldn't reach the store. Check your connection and try again.";
  if (code === "store_busy") return "The store is busy right now. Wait a moment, then scan the door code again.";
  if (code === "slow_down" || status === 429) {
    return "You've started a few baskets in the last hour. Wait a little, then scan the door code again.";
  }
  if (code === "paypal_unavailable") return "PayPal couldn't be reached to set up the hold. Try again in a moment.";
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 410) {
    return "This door link is not valid any more. Scan the code on the door again.";
  }
  return "The basket couldn't be started just now. Try again in a moment.";
}

export type BasketStage = "hold" | "shopping" | "pay" | "paid" | "closed";

/**
 * Which step a basket is at, from the status the server gives a session. `holdWaiting` is true
 * when this phone holds a PayPal order for a hold that has not been approved yet.
 */
export function basketStage(
  session: { status: string; payMode: PayMode; hold: { cents: number; status: string } | null },
  holdWaiting: boolean,
): BasketStage {
  if (session.status.startsWith("paid")) return "paid";
  if (session.status === "needs_hold") return "hold";
  if (session.status === "pay") return "pay";
  if (session.status !== "open") return "closed";
  if (session.hold?.status === "authorized") return "shopping";
  return session.payMode === "hold" || holdWaiting ? "hold" : "shopping";
}

function listed(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The question a claim card asks: "Shelf 3 saw 1 × Honey leave. Yours?" */
export function claimQuestion({ zoneName, lines }: { zoneName: string | null; lines: BillLine[] }): string {
  const shelf = zoneName?.trim() || "A shelf";
  const taken = lines.filter((l) => l.qty > 0);
  const back = lines.filter((l) => l.qty < 0);
  const shown = taken.length > 0 ? taken : back;
  if (shown.length === 0) return `${shelf} saw something change. Yours?`;
  const what = listed(shown.map((l) => `${Math.abs(l.qty)} × ${l.name}`));
  return `${shelf} saw ${what} ${taken.length > 0 ? "leave" : "come back"}. Yours?`;
}

/** How a basket's total sits against its hold. */
export function holdLimit(totalCents: number, holdCents: number | null): "under" | "near" | "over" {
  if (holdCents === null || holdCents <= 0) return "under";
  if (totalCents > holdCents) return "over";
  return totalCents >= holdCents * NEAR_HOLD ? "near" : "under";
}

/** The zone a camera link names, in its fragment ("#key=…&zone=…") or its query ("?zone=…"). */
export function standZoneFromUrl(hash: string, search: string): string | null {
  const zone = parts(hash).get("zone") ?? parts(search).get("zone");
  return zone && ZONE_ID.test(zone) ? zone : null;
}

/** The stand screen address for one zone: a trial's key travels after the "#", a typed code needs none. */
export function cameraPath(zoneId: string, standKey: string | null): string {
  return standKey ? `/stand#key=${standKey}&zone=${zoneId}` : `/stand?zone=${zoneId}`;
}

/** Zones as a simple map: one group per aisle in the order aisles first appear, zones by their order. */
export function byAisle<Z extends ZoneLike>(zones: Z[]): { aisle: string; zones: Z[] }[] {
  const sorted = [...zones].sort((a, b) => a.order - b.order);
  const groups = new Map<string, Z[]>();
  for (const zone of sorted) {
    const aisle = zone.aisle.trim();
    groups.set(aisle, [...(groups.get(aisle) ?? []), zone]);
  }
  return [...groups].map(([aisle, list]) => ({ aisle, zones: list }));
}

/** Moves a zone one place up (-1) or down (1) among the zones of its aisle, and numbers the list again. */
export function moveZone<Z extends ZoneLike>(zones: Z[], id: string, by: -1 | 1): Z[] {
  const sorted = [...zones].sort((a, b) => a.order - b.order);
  const from = sorted.findIndex((z) => z.id === id);
  if (from < 0) return sorted;
  const aisle = sorted[from].aisle.trim();
  let to = from + by;
  while (to >= 0 && to < sorted.length && sorted[to].aisle.trim() !== aisle) to += by;
  if (to < 0 || to >= sorted.length) return sorted;
  [sorted[from], sorted[to]] = [sorted[to], sorted[from]];
  return sorted.map((z, order) => ({ ...z, order }));
}

/** How strongly a shelf's tile is tinted, 0 to 1, from its unmatched value against the largest. */
export function tintStrength(unmatchedCents: number, maxCents: number): number {
  if (unmatchedCents <= 0 || maxCents <= 0) return 0;
  return Math.max(MIN_TINT, Math.min(1, Math.round((unmatchedCents / maxCents) * 100) / 100));
}

/** What the suggested hold is based on. */
export function holdBasisText(visits: number, days: number): string {
  return visits >= ENOUGH_VISITS
    ? `Covers 9 in 10 baskets from the last ${days} days`
    : "Not enough visits yet: using twice your minimum";
}
