import { priceLines } from "./money";
import type { Repo } from "./repo";
import type { PricedBill, Product, Shop } from "./types";
import type { ShelfDiff } from "./vision";
import { JOIN_WINDOW_MS, applyShelfChange, expireIfStale, newVisit, type Visit } from "./visits";

export type ShelfChangeDeps = {
  repo: Repo;
  newId: () => string;
  diff: (input: {
    before: Uint8Array;
    after: Uint8Array;
    products: Product[];
    zoom?: { before: Uint8Array; after: Uint8Array };
  }) => Promise<ShelfDiff>;
};

export type ShelfChangeInput = {
  shop: Shop;
  before: Uint8Array;
  after: Uint8Array;
  changeStartedAt: number;
  settledAt: number;
  /** Close-ups of the part of the shelf that changed, cut from sharper frames. */
  zoom?: { before: Uint8Array; after: Uint8Array };
  /** Demo runs: always a fresh visit, never joined to or closing anyone else's. */
  standalone?: boolean;
  /** Already-hosted photo locations (demo samples). When absent the photos are stored. */
  photoUrls?: { before: string; after: string };
};

export type ShelfChangeResult = { visit: Visit | null; bill: PricedBill | null; closed?: Visit };

/**
 * Turns one settled shelf change into the current visit and its bill.
 * A failed read never loses the visit: it is kept or opened with `needsManual`
 * so the customer can enter items by hand.
 */
export async function handleShelfChange(deps: ShelfChangeDeps, input: ShelfChangeInput): Promise<ShelfChangeResult> {
  const { repo } = deps;
  const products = await repo.listProducts(input.shop);

  let open: Visit | null = null;
  if (!input.standalone) {
    const stored = await repo.getOpenVisit(input.shop);
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
    diff = await deps.diff({ before: input.before, after: input.after, products, zoom: input.zoom });
  } catch (e) {
    console.error("shelf read failed", e);
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
  if (!visit) return closed ? { visit: null, bill: null, closed } : { visit: null, bill: null };

  const changed = diff === null || diff.delta.length > 0;
  if (changed) {
    const urls =
      input.photoUrls ??
      (await storePair(repo, `${input.shop}-${input.settledAt}`, input.before, input.after));
    visit = { ...visit, beforeUrl: visit.beforeUrl ?? urls.before, afterUrl: urls.after };
  }
  await repo.saveVisit(visit);

  const bill = priceLines(visit.paid ?? visit.detected, products);
  return closed ? { visit, bill, closed } : { visit, bill };
}

async function storePair(repo: Repo, stem: string, before: Uint8Array, after: Uint8Array) {
  const [b, a] = await Promise.all([
    repo.savePhoto(`${stem}-before.jpg`, before),
    repo.savePhoto(`${stem}-after.jpg`, after),
  ]);
  return { before: b, after: a };
}
