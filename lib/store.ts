// A shop's layout and how its shoppers pay: shelves ("zones") with their own cameras and product
// lists, and the pay settings. One small record per shop, kept beside the shop's other stored keys.
import { z } from "zod";
import type { Repo } from "./repo";
import { isTrial } from "./shops";
import type { Line, Product, Shop } from "./types";
import type { Visit } from "./visits";

export type Zone = { id: string; name: string; aisle: string; order: number };
export type PayMode = "after" | "hold" | "choice";
export type StoreSettings = {
  payMode: PayMode;
  /** The owner's own hold amount, or null to use the suggested one. */
  holdOverrideCents: number | null;
  holdFloorCents: number;
  holdCapCents: number;
};
export type StoreRecord = {
  zones: Zone[];
  settings: StoreSettings;
  /** Signed into the door QR. Moved on when the owner makes a new door QR, so older codes stop working. Absent = 0. */
  doorEpoch?: number;
};

export const MAX_ZONES = 24;
export const TRIAL_MAX_ZONES = 6;
export const MAX_ZONE_NAME = 40;
export const MAX_AISLE = 40;
/** The most a hold may ever be: $500. */
export const MAX_HOLD_CAP_CENTS = 50_000;

export const DEFAULT_SETTINGS: StoreSettings = {
  payMode: "after",
  holdOverrideCents: null,
  holdFloorCents: 1000,
  holdCapCents: 10_000,
};

const ZONE_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
/** A zone id: "z" and six base32 characters. Plain enough to sit inside a stored key. */
export const ZONE_ID = /^z[a-z2-7]{6}$/;
export const isZoneId = (text: unknown): text is string => typeof text === "string" && ZONE_ID.test(text);

export function newZoneId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `z${Array.from(bytes, (b) => ZONE_ALPHABET[b & 31]).join("")}`;
}

/** How many zones this stand may have. A trial is anyone's for a day, so it gets fewer. */
export const zoneLimit = (shop: Shop): number => (isTrial(shop) ? TRIAL_MAX_ZONES : MAX_ZONES);

export class StoreError extends Error {
  constructor(
    public code: "bad_request" | "zone_limit",
    public status: number,
  ) {
    super(code);
  }
}

const ZoneInput = z.object({
  id: z.string().regex(ZONE_ID).optional(),
  name: z.string().trim().min(1).max(MAX_ZONE_NAME),
  aisle: z.string().trim().max(MAX_AISLE),
  order: z.number().int().min(0).max(999),
});
export type ZoneInput = z.infer<typeof ZoneInput>;

/** What `PUT /api/owner/store/zones` accepts: the whole list, replacing the one before. */
export const ZonesBody = z.object({ zones: z.array(ZoneInput).max(MAX_ZONES) });

const holdCents = z.number().int().min(1).max(MAX_HOLD_CAP_CENTS);
/** What `PUT /api/owner/store/settings` accepts. */
export const SettingsBody = z
  .object({
    payMode: z.enum(["after", "hold", "choice"]),
    holdOverrideCents: holdCents.nullable(),
    holdFloorCents: holdCents,
    holdCapCents: holdCents,
  })
  .refine((s) => s.holdFloorCents <= s.holdCapCents);

const StoredZone = z.object({
  id: z.string().regex(ZONE_ID),
  name: z.string().min(1).max(MAX_ZONE_NAME),
  aisle: z.string().max(MAX_AISLE),
  order: z.number().int().min(0),
});
const Stored = z.object({
  zones: z.array(StoredZone).max(MAX_ZONES),
  settings: SettingsBody,
  doorEpoch: z.number().int().min(0).optional(),
});

/**
 * The list to store from the list the owner sent: an id that was given is kept, a zone without
 * one gets a new id, and the zones are numbered 0, 1, 2 in the order asked for.
 * Throws "bad_request" for the same id twice and "zone_limit" for more than `limit` zones.
 */
export function normaliseZones(input: ZoneInput[], limit: number, newId: () => string = newZoneId): Zone[] {
  if (input.length > limit) throw new StoreError("zone_limit", 403);
  const taken = new Set<string>();
  for (const zone of input) {
    if (zone.id === undefined) continue;
    if (taken.has(zone.id)) throw new StoreError("bad_request", 400);
    taken.add(zone.id);
  }
  const fresh = () => {
    for (let tries = 0; tries < 50; tries++) {
      const id = newId();
      if (isZoneId(id) && !taken.has(id)) {
        taken.add(id);
        return id;
      }
    }
    throw new Error("no free zone id");
  };
  return input
    .map((zone, at) => ({ zone, at }))
    .sort((a, b) => a.zone.order - b.zone.order || a.at - b.at)
    .map(({ zone }, order) => ({ id: zone.id ?? fresh(), name: zone.name.trim(), aisle: zone.aisle.trim(), order }));
}

/** Every stored key starts with its shop's id and a dash, so one shop's record is never read for another. */
const recordKey = (shop: Shop) => `${shop}-store.json`;

/** The shop's store record. A shop that has never saved one, or whose record cannot be read, has the defaults. */
export async function getStore(repo: Repo, shop: Shop): Promise<StoreRecord> {
  const bytes = await repo.getPhoto(recordKey(shop));
  if (bytes) {
    try {
      const parsed = Stored.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
      if (parsed.success) return parsed.data;
    } catch {
      // Falls through to the defaults.
    }
  }
  return { zones: [], settings: { ...DEFAULT_SETTINGS } };
}

const putStore = (repo: Repo, shop: Shop, record: StoreRecord) =>
  repo.savePhoto(recordKey(shop), new TextEncoder().encode(JSON.stringify(record)));

/**
 * Replaces the shop's zones. Products that were in a zone no longer listed go back to "anywhere",
 * removed products included, so no product ever names a zone that does not exist.
 */
export async function saveZones(repo: Repo, shop: Shop, input: ZoneInput[], newId: () => string = newZoneId): Promise<Zone[]> {
  const zones = normaliseZones(input, zoneLimit(shop), newId);
  const record = await getStore(repo, shop);
  await putStore(repo, shop, { ...record, zones });
  const kept = new Set(zones.map((zone) => zone.id));
  for (const product of await repo.listProducts(shop, { includeArchived: true })) {
    if (product.zoneId && !kept.has(product.zoneId)) await repo.upsertProduct({ ...product, zoneId: null });
  }
  return zones;
}

export async function saveSettings(repo: Repo, shop: Shop, settings: StoreSettings): Promise<StoreSettings> {
  const checked = SettingsBody.parse(settings);
  const record = await getStore(repo, shop);
  await putStore(repo, shop, { ...record, settings: checked });
  return checked;
}

/** Makes the shop's door QR new: moves the door number on, so every code printed before stops working. Answers the new number. */
export async function rotateDoor(repo: Repo, shop: Shop): Promise<number> {
  const record = await getStore(repo, shop);
  const doorEpoch = (record.doorEpoch ?? 0) + 1;
  await putStore(repo, shop, { ...record, doorEpoch });
  return doorEpoch;
}

/** The zone with this id in this shop, or null. Another shop's zone id is simply not found. */
export async function findZone(repo: Repo, shop: Shop, zoneId: unknown): Promise<Zone | null> {
  if (!isZoneId(zoneId)) return null;
  return (await getStore(repo, shop)).zones.find((zone) => zone.id === zoneId) ?? null;
}

/**
 * The products a zone's camera may be reading: the zone's own and those kept "anywhere".
 * With no zone, every product, as on a stand that has no zones.
 */
export function productsForZone<P extends Pick<Product, "zoneId">>(products: P[], zoneId: string | null | undefined): P[] {
  if (!zoneId) return products;
  return products.filter((p) => !p.zoneId || p.zoneId === zoneId);
}

export type ZoneFigures = {
  /** Null gathers the products kept anywhere. */
  zoneId: string | null;
  /** Value of what the cameras saw leave. */
  takenCents: number;
  /** Value of the lines shoppers paid for. */
  paidCents: number;
  /** Value of what left in visits that ended with no payment. */
  unmatchedCents: number;
  /** Visits with at least one line here. */
  visits: number;
};

const PAID = new Set<Visit["status"]>(["paid", "paid_adjusted", "paid_late"]);

/**
 * Splits the visits' value by shelf. A line belongs to its product's zone; products kept anywhere,
 * or naming a zone that is not in `zones`, are gathered under null. Every zone gets a row, in
 * order, and the null row comes last. Empty visits count for nothing.
 */
export function byZone(visits: Visit[], catalogue: Product[], zones: Zone[]): ZoneFigures[] {
  const known = new Set(zones.map((zone) => zone.id));
  const bySku = new Map(catalogue.map((p) => [p.sku, p]));
  const rows = new Map<string | null, ZoneFigures>();
  for (const id of [...zones.map((zone) => zone.id), null]) {
    rows.set(id, { zoneId: id, takenCents: 0, paidCents: 0, unmatchedCents: 0, visits: 0 });
  }
  const each = (lines: Line[], add: (row: ZoneFigures, cents: number) => void) => {
    for (const { sku, qty } of lines) {
      const product = bySku.get(sku);
      if (!product || qty <= 0) continue;
      const zoneId = product.zoneId && known.has(product.zoneId) ? product.zoneId : null;
      add(rows.get(zoneId)!, product.priceCents * qty);
    }
  };
  for (const visit of visits) {
    if (visit.status === "empty") continue;
    const seen = new Set<ZoneFigures>();
    each(visit.detected, (row, cents) => {
      row.takenCents += cents;
      if (visit.status === "unmatched") row.unmatchedCents += cents;
      seen.add(row);
    });
    if (PAID.has(visit.status)) each(visit.paid ?? visit.detected, (row, cents) => (row.paidCents += cents));
    for (const row of seen) row.visits += 1;
  }
  return [...rows.values()];
}
