import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { readAngles, saveAngleShot } from "@/lib/angles";
import { createStandGate } from "@/lib/auth";
import { saveProduct } from "@/lib/catalogue";
import { ownerOverview } from "@/lib/owner";
import { FileRepo } from "@/lib/repo-file";
import { resolveStand } from "@/lib/stand-access";
import { signStandKey } from "@/lib/stand-key";
import {
  DEFAULT_SETTINGS,
  MAX_ZONES,
  SettingsBody,
  StoreError,
  TRIAL_MAX_ZONES,
  ZonesBody,
  byZone,
  findZone,
  getStore,
  isZoneId,
  newZoneId,
  normaliseZones,
  productsForZone,
  saveSettings,
  saveZones,
  zoneLimit,
  type Zone,
} from "@/lib/store";
import { createTrial } from "@/lib/trials";
import type { Product, Shop } from "@/lib/types";
import { newVisit, type Visit } from "@/lib/visits";

const NOW = 1_800_000_000_000;
let repo: FileRepo;

const product = (sku: string, priceCents: number, zoneId?: string | null, shop: Shop = "live"): Product => ({
  shop, sku, name: sku, description: "", priceCents, stock: 9, refImageUrl: null,
  ...(zoneId === undefined ? {} : { zoneId }),
});
const zone = (id: string, name: string, order = 0, aisle = ""): Zone => ({ id, name, aisle, order });
const ids = (...made: string[]) => {
  let i = 0;
  return () => made[i++] ?? "zzzzzzz";
};

beforeEach(() => {
  process.env.STAND_TOKEN = "246810";
  process.env.SESSION_SECRET = "test-secret";
  repo = new FileRepo(mkdtempSync(path.join(tmpdir(), "shopsitter-store-")));
});

describe("zone ids", () => {
  it("makes z and six base32 characters", () => {
    const id = newZoneId();
    expect(id).toMatch(/^z[a-z2-7]{6}$/);
    expect(isZoneId(id)).toBe(true);
  });

  it("refuses anything else", () => {
    for (const bad of ["", "zabc", "zABCDEF", "z123456", "xabcdef2", "zabcdefg2", "../live", null, 7]) {
      expect(isZoneId(bad)).toBe(false);
    }
  });
});

describe("normaliseZones", () => {
  it("keeps the ids given, makes ids for new zones, trims, and numbers them in order", () => {
    const out = normaliseZones(
      [
        { name: " Fridge ", aisle: " Back ", order: 5 },
        { id: "zaaaaaa", name: "Bread", aisle: "", order: 1 },
      ],
      24,
      ids("zbbbbbb"),
    );
    expect(out).toEqual([
      { id: "zaaaaaa", name: "Bread", aisle: "", order: 0 },
      { id: "zbbbbbb", name: "Fridge", aisle: "Back", order: 1 },
    ]);
  });

  it("refuses the same id twice", () => {
    const twice = [{ id: "zaaaaaa", name: "A", aisle: "", order: 0 }, { id: "zaaaaaa", name: "B", aisle: "", order: 1 }];
    expect(() => normaliseZones(twice, 24)).toThrow(StoreError);
    expect(() => normaliseZones(twice, 24)).toThrow("bad_request");
  });

  it("never hands a new zone an id that is already in the list", () => {
    const out = normaliseZones(
      [{ name: "New", aisle: "", order: 0 }, { id: "zaaaaaa", name: "Old", aisle: "", order: 1 }],
      24,
      ids("zaaaaaa", "zcccccc"),
    );
    expect(out.map((z) => z.id)).toEqual(["zcccccc", "zaaaaaa"]);
  });

  it("refuses more zones than the stand may have", () => {
    const seven = Array.from({ length: 7 }, (_, i) => ({ name: `Shelf ${i}`, aisle: "", order: i }));
    expect(() => normaliseZones(seven, TRIAL_MAX_ZONES)).toThrow("zone_limit");
    expect(normaliseZones(seven, MAX_ZONES)).toHaveLength(7);
  });

  it("allows 24 zones on the owner's stand and 6 on a trial", () => {
    expect(zoneLimit("live")).toBe(24);
    expect(zoneLimit("demo")).toBe(24);
    expect(zoneLimit("t-abcdefghij")).toBe(6);
  });
});

describe("what the owner may send", () => {
  it("accepts a plain list of zones", () => {
    expect(ZonesBody.safeParse({ zones: [{ name: "Fridge", aisle: "", order: 0 }] }).success).toBe(true);
    expect(ZonesBody.safeParse({ zones: [] }).success).toBe(true);
  });

  it("refuses bad names, aisles, ids and orders", () => {
    const one = (z: unknown) => ZonesBody.safeParse({ zones: [z] }).success;
    expect(one({ name: "", aisle: "", order: 0 })).toBe(false);
    expect(one({ name: "   ", aisle: "", order: 0 })).toBe(false);
    expect(one({ name: "x".repeat(41), aisle: "", order: 0 })).toBe(false);
    expect(one({ name: "ok", aisle: "x".repeat(41), order: 0 })).toBe(false);
    expect(one({ name: "ok", aisle: "", order: 1.5 })).toBe(false);
    expect(one({ name: "ok", aisle: "", order: -1 })).toBe(false);
    expect(one({ id: "live-store", name: "ok", aisle: "", order: 0 })).toBe(false);
    expect(ZonesBody.safeParse({ zones: Array.from({ length: 25 }, (_, i) => ({ name: "a", aisle: "", order: i })) }).success).toBe(false);
    expect(ZonesBody.safeParse(null).success).toBe(false);
  });

  it("accepts settings with whole cents, floor at or under cap, cap at or under $500", () => {
    const ok = { payMode: "hold", holdOverrideCents: null, holdFloorCents: 1000, holdCapCents: 10000 };
    expect(SettingsBody.safeParse(ok).success).toBe(true);
    expect(SettingsBody.safeParse({ ...ok, holdOverrideCents: 2500, payMode: "choice" }).success).toBe(true);
    expect(SettingsBody.safeParse({ ...ok, holdCapCents: 50000 }).success).toBe(true);
    expect(SettingsBody.safeParse({ ...ok, payMode: "free" }).success).toBe(false);
    expect(SettingsBody.safeParse({ ...ok, holdFloorCents: 10001 }).success).toBe(false);
    expect(SettingsBody.safeParse({ ...ok, holdCapCents: 50001 }).success).toBe(false);
    expect(SettingsBody.safeParse({ ...ok, holdFloorCents: 10.5 }).success).toBe(false);
    expect(SettingsBody.safeParse({ ...ok, holdFloorCents: 0 }).success).toBe(false);
    expect(SettingsBody.safeParse({ ...ok, holdOverrideCents: -1 }).success).toBe(false);
    expect(SettingsBody.safeParse({ ...ok, holdOverrideCents: 50001 }).success).toBe(false);
    expect(SettingsBody.safeParse({ payMode: "after" }).success).toBe(false);
  });
});

describe("the store record", () => {
  it("starts with no zones and pay after", async () => {
    expect(await getStore(repo, "live")).toEqual({ zones: [], settings: DEFAULT_SETTINGS });
    expect(DEFAULT_SETTINGS).toEqual({ payMode: "after", holdOverrideCents: null, holdFloorCents: 1000, holdCapCents: 10000 });
  });

  it("stores zones and settings for one shop only", async () => {
    const zones = await saveZones(repo, "live", [{ name: "Fridge", aisle: "A", order: 0 }], ids("zaaaaaa"));
    expect(zones).toEqual([zone("zaaaaaa", "Fridge", 0, "A")]);
    const settings = { payMode: "hold" as const, holdOverrideCents: 2000, holdFloorCents: 500, holdCapCents: 5000 };
    await saveSettings(repo, "live", settings);
    expect(await getStore(repo, "live")).toEqual({ zones, settings });
    expect(await getStore(repo, "demo")).toEqual({ zones: [], settings: DEFAULT_SETTINGS });
    expect(await getStore(repo, "t-abcdefghij")).toEqual({ zones: [], settings: DEFAULT_SETTINGS });
  });

  it("reads a damaged record as the defaults", async () => {
    await repo.savePhoto("live-store.json", new TextEncoder().encode("{not json"));
    expect(await getStore(repo, "live")).toEqual({ zones: [], settings: DEFAULT_SETTINGS });
    await repo.savePhoto("live-store.json", new TextEncoder().encode(JSON.stringify({ zones: [{ id: "bad" }], settings: 3 })));
    expect(await getStore(repo, "live")).toEqual({ zones: [], settings: DEFAULT_SETTINGS });
  });

  it("keeps a trial to six zones", async () => {
    const trial = await createTrial(repo, NOW);
    const seven = Array.from({ length: 7 }, (_, i) => ({ name: `Shelf ${i}`, aisle: "", order: i }));
    await expect(saveZones(repo, trial.shop, seven)).rejects.toThrow("zone_limit");
    expect(await saveZones(repo, trial.shop, seven.slice(0, 6))).toHaveLength(6);
  });

  it("un-assigns the products of a zone that is removed, and leaves the rest", async () => {
    await saveZones(repo, "live", [{ name: "A", aisle: "", order: 0 }, { name: "B", aisle: "", order: 1 }], ids("zaaaaaa", "zbbbbbb"));
    await repo.upsertProduct(product("honey", 700, "zaaaaaa"));
    await repo.upsertProduct(product("bread", 500, "zbbbbbb"));
    await repo.upsertProduct(product("eggs", 400));
    await repo.upsertProduct({ ...product("old", 100, "zaaaaaa"), archived: true });
    await saveZones(repo, "live", [{ id: "zbbbbbb", name: "B", aisle: "", order: 0 }]);
    const all = await repo.listProducts("live", { includeArchived: true });
    const zoneOf = (sku: string) => all.find((p) => p.sku === sku)!.zoneId ?? null;
    expect(zoneOf("honey")).toBeNull();
    expect(zoneOf("bread")).toBe("zbbbbbb");
    expect(zoneOf("eggs")).toBeNull();
    expect(zoneOf("old")).toBeNull();
    expect(all.find((p) => p.sku === "old")!.archived).toBe(true);
  });

  it("finds a zone only in its own shop", async () => {
    const a = await createTrial(repo, NOW);
    const b = await createTrial(repo, NOW);
    const [z] = await saveZones(repo, a.shop, [{ name: "Fridge", aisle: "", order: 0 }]);
    expect(await findZone(repo, a.shop, z.id)).toEqual(z);
    expect(await findZone(repo, b.shop, z.id)).toBeNull();
    expect(await findZone(repo, "live", z.id)).toBeNull();
    expect(await findZone(repo, a.shop, "../live-store")).toBeNull();
  });
});

describe("productsForZone", () => {
  const products = [product("honey", 700, "zaaaaaa"), product("bread", 500, "zbbbbbb"), product("eggs", 400, null), product("jam", 300)];

  it("offers a zone its own products and the ones kept anywhere", () => {
    expect(productsForZone(products, "zaaaaaa").map((p) => p.sku)).toEqual(["honey", "eggs", "jam"]);
    expect(productsForZone(products, "zbbbbbb").map((p) => p.sku)).toEqual(["bread", "eggs", "jam"]);
  });

  it("offers everything when the camera names no zone, as before", () => {
    expect(productsForZone(products, null)).toEqual(products);
    expect(productsForZone(products, undefined)).toEqual(products);
  });
});

describe("saving a product's zone", () => {
  const fields = { sku: "honey", name: "Honey", description: "", priceCents: 700 };

  it("stores the zone, keeps it on an edit that does not mention it, and clears it with null", async () => {
    await saveProduct(repo, "live", { ...fields, zoneId: "zaaaaaa" }, true);
    expect((await repo.listProducts("live"))[0].zoneId).toBe("zaaaaaa");
    await saveProduct(repo, "live", { ...fields, priceCents: 800 }, false);
    expect((await repo.listProducts("live"))[0]).toMatchObject({ priceCents: 800, zoneId: "zaaaaaa" });
    await saveProduct(repo, "live", { ...fields, zoneId: null }, false);
    expect((await repo.listProducts("live"))[0].zoneId ?? null).toBeNull();
  });

  it("stores a product with no zone exactly as before", async () => {
    await saveProduct(repo, "live", fields, true);
    expect(await repo.listProducts("live")).toEqual([{ ...fields, shop: "live", stock: 0, refImageUrl: null }]);
    expect("zoneId" in (await repo.listProducts("live"))[0]).toBe(false);
  });
});

describe("byZone", () => {
  const zones = [zone("zaaaaaa", "A", 0), zone("zbbbbbb", "B", 1)];
  const catalogue = [product("honey", 700, "zaaaaaa"), product("bread", 500, "zbbbbbb"), product("eggs", 400), product("gone", 100, "zremove")];
  const visit = (id: string, lines: { sku: string; qty: number }[], patch: Partial<Visit> = {}): Visit => ({
    ...newVisit(id, "live", lines, NOW - 1000),
    ...patch,
  });

  it("gives every zone a row, then the products kept anywhere, all zero with no visits", () => {
    expect(byZone([], catalogue, zones)).toEqual([
      { zoneId: "zaaaaaa", takenCents: 0, paidCents: 0, unmatchedCents: 0, visits: 0 },
      { zoneId: "zbbbbbb", takenCents: 0, paidCents: 0, unmatchedCents: 0, visits: 0 },
      { zoneId: null, takenCents: 0, paidCents: 0, unmatchedCents: 0, visits: 0 },
    ]);
  });

  it("puts each line in its product's zone", () => {
    const rows = byZone(
      [
        visit("p", [{ sku: "honey", qty: 2 }, { sku: "bread", qty: 1 }], {
          status: "paid", paid: [{ sku: "honey", qty: 2 }, { sku: "bread", qty: 1 }], paidCents: 1900,
        }),
        visit("adj", [{ sku: "honey", qty: 1 }, { sku: "eggs", qty: 2 }], {
          status: "paid_adjusted", paid: [{ sku: "eggs", qty: 2 }], paidCents: 800,
        }),
        visit("u", [{ sku: "honey", qty: 1 }, { sku: "gone", qty: 3 }], { status: "unmatched" }),
        visit("o", [{ sku: "bread", qty: 1 }]),
        visit("e", [{ sku: "bread", qty: 4 }], { status: "empty" }),
      ],
      catalogue,
      zones,
    );
    expect(rows).toEqual([
      { zoneId: "zaaaaaa", takenCents: 2800, paidCents: 1400, unmatchedCents: 700, visits: 3 },
      { zoneId: "zbbbbbb", takenCents: 1000, paidCents: 500, unmatchedCents: 0, visits: 2 },
      // "gone" names a zone that no longer exists, so it counts with the products kept anywhere.
      { zoneId: null, takenCents: 1100, paidCents: 800, unmatchedCents: 300, visits: 2 },
    ]);
  });

  it("is part of the owner overview, with the zones", async () => {
    const saved = await saveZones(repo, "live", [{ name: "A", aisle: "", order: 0 }], ids("zaaaaaa"));
    await repo.upsertProduct(product("honey", 700, "zaaaaaa"));
    await repo.saveVisit({ ...newVisit("u", "live", [{ sku: "honey", qty: 1 }], NOW - 1000), status: "unmatched" });
    const overview = await ownerOverview(repo, "live", 7, NOW);
    expect(overview.zones).toEqual(saved);
    expect(overview.byZone).toEqual([
      { zoneId: "zaaaaaa", takenCents: 700, paidCents: 0, unmatchedCents: 700, visits: 1 },
      { zoneId: null, takenCents: 0, paidCents: 0, unmatchedCents: 0, visits: 0 },
    ]);
  });

  it("is empty zones and one all-zero row for a stand with no zones and no visits", async () => {
    const overview = await ownerOverview(repo, "live", 7, NOW);
    expect(overview.zones).toEqual([]);
    expect(overview.byZone).toEqual([{ zoneId: null, takenCents: 0, paidCents: 0, unmatchedCents: 0, visits: 0 }]);
  });
});

describe("a stand request that names a zone", () => {
  const request = (token: string, zoneId?: string) =>
    new Request("http://localhost/api/stand/check", {
      headers: { "x-forwarded-for": "9.9.9.9", "x-stand-token": token, ...(zoneId === undefined ? {} : { "x-stand-zone": zoneId }) },
    });
  const resolve = (token: string, zoneId?: string) => resolveStand(request(token, zoneId), { repo, gate: createStandGate(), now: NOW });
  const refusal = async (r: Awaited<ReturnType<typeof resolve>>) => {
    if (!(r instanceof Response)) throw new Error(`expected a refusal, got ${JSON.stringify(r)}`);
    return { status: r.status, body: await r.json() };
  };

  it("resolves with no zone when the header is absent or blank, exactly as before", async () => {
    expect(await resolve("246810")).toEqual({ shop: "live", kind: "live" });
    expect(await resolve("246810", "  ")).toEqual({ shop: "live", kind: "live" });
  });

  it("resolves the zone of the stand's own shop", async () => {
    const [z] = await saveZones(repo, "live", [{ name: "Fridge", aisle: "", order: 0 }]);
    expect(await resolve("246810", z.id)).toEqual({ shop: "live", kind: "live", zone: z });
    const trial = await createTrial(repo, NOW);
    const [tz] = await saveZones(repo, trial.shop, [{ name: "Desk", aisle: "", order: 0 }]);
    const key = signStandKey(trial.shop, trial.expiresAt);
    expect(await resolve(key, tz.id)).toEqual({ shop: trial.shop, kind: "trial", expiresAt: trial.expiresAt, zone: tz });
  });

  it("refuses an unknown or malformed zone with 400 unknown_zone", async () => {
    expect(await refusal(await resolve("246810", "zaaaaaa"))).toEqual({ status: 400, body: { error: "unknown_zone" } });
    expect(await refusal(await resolve("246810", "../x"))).toEqual({ status: 400, body: { error: "unknown_zone" } });
  });

  it("never resolves one shop's zone for another shop", async () => {
    const a = await createTrial(repo, NOW);
    const b = await createTrial(repo, NOW);
    const [za] = await saveZones(repo, a.shop, [{ name: "Fridge", aisle: "", order: 0 }]);
    const keyB = signStandKey(b.shop, b.expiresAt);
    expect(await refusal(await resolve(keyB, za.id))).toEqual({ status: 400, body: { error: "unknown_zone" } });
    expect(await refusal(await resolve("246810", za.id))).toEqual({ status: 400, body: { error: "unknown_zone" } });
  });

  it("checks the code before the zone, so a wrong code learns nothing about zones", async () => {
    const [z] = await saveZones(repo, "live", [{ name: "Fridge", aisle: "", order: 0 }]);
    expect((await refusal(await resolve("000000", z.id))).status).toBe(401);
    expect((await refusal(await resolve("000000", "zaaaaaa"))).status).toBe(401);
  });
});

describe("extra cameras in a zone", () => {
  const shot = (n: number) => new Uint8Array([n]);
  const noWait = { now: () => 100_000, sleep: async () => {} };

  it("keeps each zone's stills apart from other zones and from the stand with no zone", async () => {
    await saveAngleShot(repo, "live", 2, shot(1), 99_500, "zaaaaaa");
    await readAngles(repo, "live", 99_000, noWait, "zaaaaaa");
    await saveAngleShot(repo, "live", 2, shot(2), 99_900, "zaaaaaa");
    expect(await readAngles(repo, "live", 99_800, noWait)).toEqual([]);
    expect(await readAngles(repo, "live", 99_800, noWait, "zbbbbbb")).toEqual([]);
    expect(await readAngles(repo, "live", 99_800, noWait, "zaaaaaa")).toEqual([{ angle: 2, before: shot(1), after: shot(2) }]);
  });

  it("stores a zone's stills under the shop's own keys", async () => {
    await saveAngleShot(repo, "t-abcdefghij", 2, shot(1), 99_500, "zaaaaaa");
    const stored = await repo.listStored(".jpg");
    expect(stored.map((s) => s.key)).toEqual(["t-abcdefghij-zone-zaaaaaa-angle-2-latest.jpg"]);
  });
});
