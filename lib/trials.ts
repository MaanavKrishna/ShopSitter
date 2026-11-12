// A visitor's own private stand. Anyone can start one without a passcode; it holds only what that
// visitor adds, and everything in it is deleted a day later.
import { getGateway } from "./paypal";
import type { Repo } from "./repo";
import { isTrial, newTrialId, parseShop } from "./shops";
import type { Product, Shop, TrialShop } from "./types";

export const TRIAL_LIFETIME_MS = 24 * 60 * 60_000;
/** Products a trial may have on sale at once. */
export const TRIAL_MAX_PRODUCTS = 12;
/** Products a trial may hold in all, removed ones included, so adding and removing cannot fill the store. */
export const TRIAL_MAX_PRODUCT_ROWS = 48;
/** Expired trials cleared away each time a new one starts. */
export const SWEEP_PER_START = 3;

export type Trial = { shop: TrialShop; createdAt: number; expiresAt: number };

/** Kept beside the shop's other stored keys, so it starts with the shop's id like all of them. */
const RECORD = "-trial.json";
const recordKey = (shop: TrialShop) => `${shop}${RECORD}`;

function readRecord(shop: TrialShop, bytes: Uint8Array): Trial | null {
  try {
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Trial>;
    if (raw.shop !== shop || typeof raw.createdAt !== "number" || typeof raw.expiresAt !== "number") return null;
    return { shop, createdAt: raw.createdAt, expiresAt: raw.expiresAt };
  } catch {
    return null;
  }
}

/** Starts a trial: only its record is stored. It has no products and no visits until the visitor adds some. */
export async function createTrial(repo: Repo, now: number, newId: () => TrialShop = newTrialId): Promise<Trial> {
  const trial: Trial = { shop: newId(), createdAt: now, expiresAt: now + TRIAL_LIFETIME_MS };
  await repo.savePhoto(recordKey(trial.shop), new TextEncoder().encode(JSON.stringify(trial)));
  return trial;
}

/** Holds released when a trial ends; past this many the rest are left to PayPal's own expiry. */
const MAX_RELEASES_PER_END = 20;

/**
 * Deletes a trial and everything in it. Refuses anything that is not a trial id, so it can never
 * touch the live or demo stand. Money still held for its shoppers is released first, as far as
 * PayPal allows: a hold that cannot be released is logged and the trial is ended anyway.
 */
export async function endTrial(repo: Repo, shop: string): Promise<void> {
  if (!isTrial(shop)) throw new Error("only a trial stand can be ended");
  const held = (await repo.listVisits(shop)).filter((v) => v.hold?.status === "authorized").slice(0, MAX_RELEASES_PER_END);
  for (const v of held) {
    try {
      await getGateway().voidAuthorization(v.hold!.authorizationId);
    } catch (e) {
      console.error("hold could not be released as a trial ended", e instanceof Error ? e.message : e);
    }
  }
  await repo.deleteShop(shop);
}

/**
 * The trial with this id, or null when there is none or it has run out. Touching a trial that
 * has run out deletes its products, visits and photos.
 */
export async function getTrial(repo: Repo, shop: string, now: number): Promise<Trial | null> {
  if (!isTrial(shop)) return null;
  const bytes = await repo.getPhoto(recordKey(shop));
  if (!bytes) return null;
  const trial = readRecord(shop, bytes);
  if (!trial) return null;
  if (now >= trial.expiresAt) {
    await endTrial(repo, shop);
    return null;
  }
  return trial;
}

/**
 * The shop a signed-in browser may act for right now. The live and demo stands pass straight
 * through; a trial passes only while it exists, so an ended trial reads as signed out.
 */
export async function activeShop(repo: Repo, shop: Shop | null, now: number): Promise<Shop | null> {
  if (!shop || !isTrial(shop)) return shop;
  return (await getTrial(repo, shop, now)) ? shop : null;
}

/**
 * Deletes up to `max` trials that have run out (or whose record cannot be read) and returns how
 * many. Trials are found by their records, so there is no separate list to fall out of step.
 */
export async function sweepExpiredTrials(repo: Repo, now: number, max: number = SWEEP_PER_START): Promise<number> {
  let cleared = 0;
  for (const { key, bytes } of await repo.listStored(RECORD)) {
    if (cleared >= max) break;
    const shop = parseShop(key.slice(0, -RECORD.length));
    if (!shop || !isTrial(shop)) continue;
    const trial = readRecord(shop, bytes);
    if (trial && now < trial.expiresAt) continue;
    await endTrial(repo, shop);
    cleared++;
  }
  return cleared;
}

const STARTER: Omit<Product, "shop">[] = [
  { sku: "coffee-mug", name: "Coffee mug", description: "Ceramic mug with a handle, about as tall as a hand is wide", priceCents: 400, stock: 5, refImageUrl: null },
  { sku: "notebook", name: "Notebook", description: "Flat rectangular paper notebook with a plain cover", priceCents: 600, stock: 5, refImageUrl: null },
  { sku: "pen", name: "Pen", description: "Thin ballpoint pen about as long as a hand", priceCents: 150, stock: 5, refImageUrl: null },
];

const onSale = (repo: Repo, shop: Shop) => repo.listProducts(shop);

/**
 * Whether the shop may put this product on sale. Only trials are limited. Saving a product that
 * is already on sale is an edit and always has room; a new one, or one coming back after being
 * removed, needs a free place. Removed products are kept for past visits, so they have a
 * (larger) limit of their own.
 */
export async function trialHasRoomFor(repo: Repo, shop: Shop, sku: string): Promise<boolean> {
  if (!isTrial(shop)) return true;
  const all = await repo.listProducts(shop, { includeArchived: true });
  const products = all.filter((p) => !p.archived);
  if (products.some((p) => p.sku === sku)) return true;
  if (products.length >= TRIAL_MAX_PRODUCTS) return false;
  return all.some((p) => p.sku === sku) || all.length < TRIAL_MAX_PRODUCT_ROWS;
}

/**
 * Adds three everyday desk items, without photos, so a visitor has something to point a camera at.
 * A product the visitor already has under the same id is left as it is, and the trial's product
 * limit is kept. Returns the ones added.
 */
export async function addStarterProducts(repo: Repo, shop: TrialShop): Promise<Product[]> {
  if (!isTrial(shop)) throw new Error("suggested products are for trial stands only");
  const have = await onSale(repo, shop);
  const taken = new Set(have.map((p) => p.sku));
  let room = TRIAL_MAX_PRODUCTS - have.length;
  const added: Product[] = [];
  for (const item of STARTER) {
    if (room <= 0 || taken.has(item.sku)) continue;
    const product: Product = { ...item, shop };
    await repo.upsertProduct(product);
    added.push(product);
    room--;
  }
  return added;
}

const HOUR_MS = 60 * 60_000;
export const TRIAL_STARTS_PER_CALLER_HOUR = 3;
export const TRIAL_STARTS_ALL_PER_DAY = 150;
const MAX_TRACKED_CALLERS = 5_000;

export type TrialStartAnswer = "ok" | "slow_down" | "trial_busy";

/**
 * Limits how many trials are started: three an hour per caller and 150 a day across everyone.
 * A refused start is not counted. In memory per server instance, like the stand gate.
 */
export function createTrialStartGate(): (caller: string, now?: number) => TrialStartAnswer {
  const byCaller = new Map<string, number[]>();
  let all: number[] = [];
  return (caller, now = Date.now()) => {
    const mine = (byCaller.get(caller) ?? []).filter((t) => now - t < HOUR_MS);
    if (mine.length >= TRIAL_STARTS_PER_CALLER_HOUR) return "slow_down";
    all = all.filter((t) => now - t < TRIAL_LIFETIME_MS);
    if (all.length >= TRIAL_STARTS_ALL_PER_DAY) return "trial_busy";
    if (byCaller.size >= MAX_TRACKED_CALLERS) byCaller.clear();
    mine.push(now);
    byCaller.set(caller, mine);
    all.push(now);
    return "ok";
  };
}

export const trialStartGate = createTrialStartGate();
