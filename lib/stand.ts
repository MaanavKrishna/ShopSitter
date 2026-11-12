import type { AnglePair } from "./angles";
import { priceLines } from "./money";
import { getGateway, type HoldGateway } from "./paypal";
import type { Repo } from "./repo";
import { addToSession, assignChange, isOpenSession, sweepVisit } from "./sessions";
import { getStore, productsForZone } from "./store";
import type { PricedBill, Product, Shop } from "./types";
import type { ShelfDiff } from "./vision";
import { JOIN_WINDOW_MS, LATE_PAY_MS, applyReturns, applyShelfChange, expireIfStale, mergeLines, newVisit, type Visit } from "./visits";

export type ShelfChangeDeps = {
  repo: Repo;
  newId: () => string;
  diff: (input: {
    before: Uint8Array;
    after: Uint8Array;
    products: Product[];
    zoom?: { before: Uint8Array; after: Uint8Array };
    angles?: AnglePair[];
  }) => Promise<ShelfDiff>;
  /** Used only to close a checked-in session that has gone idle with money held. Defaults to the PayPal sandbox. */
  paypal?: () => HoldGateway;
};

export type ShelfChangeInput = {
  shop: Shop;
  before: Uint8Array;
  after: Uint8Array;
  changeStartedAt: number;
  settledAt: number;
  /** Close-ups of the part of the shelf that changed, cut from sharper frames. */
  zoom?: { before: Uint8Array; after: Uint8Array };
  /** The same change seen by extra cameras. */
  angles?: AnglePair[];
  /** The shelf whose camera saw the change. The vision model is shown that shelf's products only. */
  zoneId?: string | null;
  /** Demo runs: always a fresh visit, never joined to or closing anyone else's. */
  standalone?: boolean;
  /** Already-hosted photo locations (demo samples). When absent the photos are stored. */
  photoUrls?: { before: string; after: string };
};

export type ShelfChangeResult = {
  visit: Visit | null;
  bill: PricedBill | null;
  closed?: Visit;
  /** The visit that items put back were taken off, when this change only put things back. */
  returned?: Visit;
  /**
   * Set when shoppers are checked in and the change was not an anonymous one: "session" when it
   * went onto a shopper's basket (the visit is not returned: its id is theirs alone), "pending"
   * when it waits for a shopper to claim it.
   */
  assigned?: "session" | "pending";
};

/**
 * Turns one settled shelf change into the current visit and its bill.
 * A failed read never loses the visit: it is kept or opened with `needsManual`
 * so the customer can enter items by hand.
 */
export async function handleShelfChange(deps: ShelfChangeDeps, input: ShelfChangeInput): Promise<ShelfChangeResult> {
  const { repo } = deps;
  // The whole catalogue prices the bill; only what is on sale now is shown to the vision model.
  const catalogue = await repo.listProducts(input.shop, { includeArchived: true });
  const products = productsForZone(catalogue.filter((p) => !p.archived), input.zoneId);
  const sessionDeps = { repo, paypal: deps.paypal ?? getGateway, newId: deps.newId };

  let open: Visit | null = null;
  if (!input.standalone) {
    const openNow = await repo.listOpenVisits(input.shop);
    // Checked-in sessions and pending changes have their own rules for going stale.
    for (const v of openNow) if (v.session || v.pending) await sweepVisit(sessionDeps, v, input.changeStartedAt);
    // The newest open visit that belongs to nobody in particular.
    const stored = openNow.find((v) => !v.session && !v.pending);
    if (stored) {
      open = expireIfStale(stored, input.changeStartedAt);
      if (open !== stored) {
        await repo.saveVisit(open);
        open = null;
      }
    }
  }

  let diff: ShelfDiff | null = null;
  try {
    diff = await deps.diff({ before: input.before, after: input.after, products, zoom: input.zoom, angles: input.angles });
  } catch (e) {
    console.error("shelf read failed", e);
  }

  if (diff !== null && diff.delta.length > 0 && !input.standalone) {
    const assigned = await assignToShopper(deps, input, diff, catalogue, open !== null);
    if (assigned) return assigned;
  }

  let closed: Visit | undefined;
  let visit: Visit | null;

  if (diff === null) {
    const joins = open !== null && input.changeStartedAt - open.lastSettledAt <= JOIN_WINDOW_MS;
    if (joins && open) {
      visit = { ...open, needsManual: true, lastSettledAt: input.settledAt };
    } else {
      if (open) closed = { ...open, status: "unmatched", closedAt: input.changeStartedAt };
      visit = { ...newVisit(deps.newId(), input.shop, [], input.settledAt), needsManual: true };
    }
  } else {
    const result = applyShelfChange(open, diff.delta, input.changeStartedAt, input.settledAt, input.shop, deps.newId);
    closed = result.close;
    visit = result.visit;
    if (visit && diff.delta.length > 0) {
      // The shelf changed, so any correction or PayPal order made for the old bill no longer applies.
      visit = { ...visit, confidence: diff.confidence, paid: null, paypalOrderId: null, orderCents: null };
    }
  }

  if (closed) await repo.saveVisit(closed);

  const onlyReturns = diff !== null && diff.delta.length > 0 && diff.delta.every((d) => d.qty < 0);
  if (!visit) {
    // Nothing open to put them back on: they come off the latest unmatched visit that held them.
    const returned = onlyReturns && !input.standalone ? await returnToUnmatched(repo, input, diff!.delta) : undefined;
    const base = closed ? { visit: null, bill: null, closed } : { visit: null, bill: null };
    return returned ? { ...base, returned } : base;
  }

  const changed = diff === null || diff.delta.length > 0;
  if (changed) {
    const urls =
      input.photoUrls ??
      (await storePair(repo, `${input.shop}-${input.settledAt}`, input.before, input.after));
    visit = { ...visit, beforeUrl: visit.beforeUrl ?? urls.before, afterUrl: urls.after };
    if (input.zoneId && !(visit.zoneIds ?? []).includes(input.zoneId)) {
      visit = { ...visit, zoneIds: [...(visit.zoneIds ?? []), input.zoneId] };
    }
  }
  await repo.saveVisit(visit);

  const bill = priceLines(visit.paid ?? visit.detected, catalogue);
  const result: ShelfChangeResult = closed ? { visit, bill, closed } : { visit, bill };
  return onlyReturns ? { ...result, returned: visit } : result;
}

/**
 * With shoppers checked in, puts the change where it belongs: on a shopper's basket, or aside as
 * pending for one of them to claim. Returns nothing when the change is an anonymous one, which
 * is always the case in a shop where nobody is checked in.
 */
async function assignToShopper(
  deps: ShelfChangeDeps,
  input: ShelfChangeInput,
  diff: ShelfDiff,
  catalogue: Product[],
  anonymousOpen: boolean,
): Promise<ShelfChangeResult | undefined> {
  const { repo } = deps;
  // Read after the shelf was read, so a shopper who checked in meanwhile is counted.
  const openNow = await repo.listOpenVisits(input.shop);
  const sessions = openNow.filter(isOpenSession);
  if (sessions.length === 0) return undefined;
  const { payMode } = (await getStore(repo, input.shop)).settings;
  const pending = openNow.filter((v) => v.pending && v.pending.claimedBy === null);
  const decision = assignChange({ delta: diff.delta, sessions, pending, anonymousOpen, payMode });
  if (decision.to === "anonymous") return undefined;

  if (decision.to === "pending_return") {
    const target = pending.find((v) => v.id === decision.id)!;
    const detected = mergeLines(target.detected, diff.delta.filter((d) => d.qty < 0));
    const updated: Visit =
      detected.length === 0
        ? { ...target, detected, status: "empty", closedAt: input.settledAt }
        : { ...target, detected, lastSettledAt: input.settledAt };
    await repo.saveVisit(updated);
    return { visit: null, bill: null, assigned: "pending", returned: updated };
  }

  const urls = input.photoUrls ?? (await storePair(repo, `${input.shop}-${input.settledAt}`, input.before, input.after));
  if (decision.to === "session") {
    const target = sessions.find((v) => v.id === decision.id)!;
    const updated = addToSession(target, diff.delta, input.settledAt, input.zoneId);
    await repo.saveVisit({
      ...updated,
      confidence: diff.confidence,
      beforeUrl: updated.beforeUrl ?? urls.before,
      afterUrl: urls.after,
    });
    return { visit: null, bill: null, assigned: "session" };
  }

  const detected = mergeLines([], diff.delta);
  if (detected.length === 0) return { visit: null, bill: null, assigned: "pending" };
  const visit: Visit = {
    ...newVisit(deps.newId(), input.shop, detected, input.settledAt),
    confidence: diff.confidence,
    beforeUrl: urls.before,
    afterUrl: urls.after,
    pending: { zoneId: input.zoneId ?? null, claimedBy: null },
    ...(input.zoneId ? { zoneIds: [input.zoneId] } : {}),
  };
  await repo.saveVisit(visit);
  return { visit, bill: priceLines(visit.detected, catalogue), assigned: "pending" };
}

async function returnToUnmatched(repo: Repo, input: ShelfChangeInput, delta: ShelfDiff["delta"]) {
  const recent = await repo.listVisits(input.shop, input.settledAt - LATE_PAY_MS);
  for (const v of recent) {
    const updated = applyReturns(v, delta, input.settledAt);
    if (updated) {
      await repo.saveVisit(updated);
      return updated;
    }
  }
  return undefined;
}

async function storePair(repo: Repo, stem: string, before: Uint8Array, after: Uint8Array) {
  const [b, a] = await Promise.all([
    repo.savePhoto(`${stem}-before.jpg`, before),
    repo.savePhoto(`${stem}-after.jpg`, after),
  ]);
  return { before: b, after: a };
}
