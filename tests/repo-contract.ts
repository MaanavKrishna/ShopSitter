import { beforeEach, describe, expect, it } from "vitest";
import type { Repo } from "@/lib/repo";
import type { Product, Shop } from "@/lib/types";
import { newVisit } from "@/lib/visits";

const honey = (shop: Shop): Product => ({
  shop, sku: "honey", name: "Honey", description: "Jar", priceCents: 700, stock: 6, refImageUrl: null,
});

/**
 * The behaviour every storage backend must have. `fresh` returns an empty store;
 * `reopen` returns a second handle on the same data.
 */
export function repoContract(name: string, fresh: () => Promise<Repo>, reopen: () => Repo) {
  describe(name, () => {
    let repo: Repo;
    beforeEach(async () => {
      repo = await fresh();
    });

  it("round-trips a product, scoped by shop", async () => {
    await repo.upsertProduct(honey("demo"));
    expect(await repo.listProducts("demo")).toEqual([honey("demo")]);
    expect(await repo.listProducts("live")).toEqual([]);
  });

  it("updates a product with the same shop and sku instead of duplicating it", async () => {
    await repo.upsertProduct(honey("demo"));
    await repo.upsertProduct({ ...honey("demo"), priceCents: 800 });
    const products = await repo.listProducts("demo");
    expect(products).toHaveLength(1);
    expect(products[0].priceCents).toBe(800);
  });

  it("keeps an archived product in storage but leaves it out of the usual list", async () => {
    await repo.upsertProduct(honey("demo"));
    await repo.upsertProduct({ ...honey("demo"), sku: "jam", name: "Jam" });
    await repo.upsertProduct(honey("live"));
    await repo.upsertProduct({ ...honey("demo"), archived: true });
    expect((await repo.listProducts("demo")).map((p) => p.sku)).toEqual(["jam"]);
    const all = await reopen().listProducts("demo", { includeArchived: true });
    expect(all.map((p) => p.sku).sort()).toEqual(["honey", "jam"]);
    expect(all.find((p) => p.sku === "honey")).toEqual({ ...honey("demo"), archived: true });
    expect(all.find((p) => p.sku === "jam")!.archived).toBeFalsy();
    // The other shop's product with the same sku is untouched.
    expect(await repo.listProducts("live")).toEqual([honey("live")]);
  });

  it("brings an archived product back when it is saved again without the flag", async () => {
    await repo.upsertProduct({ ...honey("demo"), archived: true });
    expect(await repo.listProducts("demo")).toEqual([]);
    await repo.upsertProduct({ ...honey("demo"), priceCents: 900 });
    expect(await repo.listProducts("demo")).toEqual([{ ...honey("demo"), priceCents: 900 }]);
    expect(await repo.listProducts("demo", { includeArchived: true })).toHaveLength(1);
  });

  it("keeps the zone a product is on, and stores a product kept anywhere without one", async () => {
    await repo.upsertProduct({ ...honey("demo"), zoneId: "zabcdef" });
    expect(await reopen().listProducts("demo")).toEqual([{ ...honey("demo"), zoneId: "zabcdef" }]);
    await repo.upsertProduct({ ...honey("demo"), zoneId: null });
    const [kept] = await reopen().listProducts("demo");
    expect(kept).toEqual(honey("demo"));
    expect("zoneId" in kept).toBe(false);
  });

  it("clears archived products too when a shop is reset", async () => {
    await repo.upsertProduct({ ...honey("demo"), sku: "old", archived: true });
    await repo.resetShop("demo", [honey("demo")]);
    expect((await repo.listProducts("demo", { includeArchived: true })).map((p) => p.sku)).toEqual(["honey"]);
  });

  it("round-trips a visit and survives a new instance on the same folder", async () => {
    const v = newVisit("v1", "demo", [{ sku: "honey", qty: 2 }], 1_000);
    await repo.saveVisit(v);
    expect(await reopen().getVisit("v1")).toEqual(v);
    expect(await repo.getVisit("nope")).toBeNull();
  });

  it("returns only an open visit from getOpenVisit, for the right shop", async () => {
    await repo.saveVisit({ ...newVisit("v1", "demo", [{ sku: "honey", qty: 1 }], 1_000), status: "paid" });
    await repo.saveVisit(newVisit("v2", "demo", [{ sku: "honey", qty: 1 }], 2_000));
    await repo.saveVisit(newVisit("v3", "live", [{ sku: "honey", qty: 1 }], 3_000));
    expect((await repo.getOpenVisit("demo"))!.id).toBe("v2");
  });

  it("lists every open visit of one shop, newest first", async () => {
    await repo.saveVisit({ ...newVisit("v1", "demo", [{ sku: "honey", qty: 1 }], 1_000), status: "paid" });
    await repo.saveVisit(newVisit("v2", "demo", [{ sku: "honey", qty: 1 }], 2_000));
    await repo.saveVisit(newVisit("v3", "demo", [], 3_000));
    await repo.saveVisit(newVisit("v4", "live", [{ sku: "honey", qty: 1 }], 4_000));
    expect((await repo.listOpenVisits("demo")).map((v) => v.id)).toEqual(["v3", "v2"]);
  });

  it("gives a pending visit to the first session that claims it, and to no other", async () => {
    const pending = { ...newVisit("p1", "demo", [{ sku: "honey", qty: 1 }], 1_000), pending: { zoneId: null, claimedBy: null } };
    await repo.saveVisit(pending);
    const answers = await Promise.all([repo.claimVisit("p1", "sessiona"), reopen().claimVisit("p1", "sessionb")]);
    expect(answers.filter(Boolean)).toHaveLength(1);
    const winner = answers[0] ? "sessiona" : "sessionb";
    const stored = (await reopen().getVisit("p1"))!;
    expect(stored.status).toBe("empty");
    expect(stored.pending).toEqual({ zoneId: null, claimedBy: winner });
    expect(stored.detected).toEqual([{ sku: "honey", qty: 1 }]);
    expect(await repo.claimVisit("p1", "sessionc")).toBe(false);
    expect(await repo.listOpenVisits("demo")).toEqual([]);
  });

  it("refuses to claim a visit that is not pending, not open, or not there", async () => {
    await repo.saveVisit(newVisit("plain", "demo", [{ sku: "honey", qty: 1 }], 1_000));
    await repo.saveVisit({
      ...newVisit("gone", "demo", [{ sku: "honey", qty: 1 }], 2_000),
      status: "unmatched",
      pending: { zoneId: "zabc234", claimedBy: null },
    });
    expect(await repo.claimVisit("plain", "s")).toBe(false);
    expect(await repo.claimVisit("gone", "s")).toBe(false);
    expect(await repo.claimVisit("nope", "s")).toBe(false);
    expect((await repo.getVisit("plain"))!.status).toBe("open");
    expect((await repo.getVisit("gone"))!.status).toBe("unmatched");
  });

  it("lists visits newest first and filters by time", async () => {
    await repo.saveVisit(newVisit("v1", "demo", [{ sku: "honey", qty: 1 }], 1_000));
    await repo.saveVisit(newVisit("v2", "demo", [{ sku: "honey", qty: 1 }], 5_000));
    expect((await repo.listVisits("demo")).map((v) => v.id)).toEqual(["v2", "v1"]);
    expect((await repo.listVisits("demo", 2_000)).map((v) => v.id)).toEqual(["v2"]);
  });

  it("resets one shop without touching the other", async () => {
    await repo.upsertProduct(honey("live"));
    await repo.saveVisit(newVisit("v1", "demo", [{ sku: "honey", qty: 1 }], 1_000));
    await repo.saveVisit(newVisit("v2", "live", [{ sku: "honey", qty: 1 }], 1_000));
    await repo.resetShop("demo", [honey("demo")]);
    expect(await repo.listVisits("demo")).toEqual([]);
    expect(await repo.listProducts("demo")).toEqual([honey("demo")]);
    expect(await repo.listVisits("live")).toHaveLength(1);
    expect(await repo.listProducts("live")).toHaveLength(1);
  });

    it("stores a shelf photo privately and reads it back", async () => {
      const bytes = new Uint8Array([255, 216, 255, 0, 1, 2, 3]);
      const key = await repo.savePhoto("demo-123-before.jpg", bytes);
      expect(await reopen().getPhoto(key)).toEqual(bytes);
      expect(await repo.getPhoto("nope.jpg")).toBeNull();
    });

    it("deletes a stored photo, and only that one", async () => {
      const bytes = new Uint8Array([255, 216, 255, 9]);
      const gone = await repo.savePhoto("demo-ref-honey-1.jpg", bytes);
      const kept = await repo.savePhoto("demo-ref-jam-1.jpg", bytes);
      await repo.deletePhoto(gone);
      await repo.deletePhoto("demo-ref-never-there.jpg");
      expect(await reopen().getPhoto(gone)).toBeNull();
      expect(await repo.getPhoto(kept)).toEqual(bytes);
    });

    describe("trial stands", { timeout: 60_000 }, () => {
      const A = "t-abcdefghij" as const;
      const B = "t-zyxwvu2345" as const;
      const ALL: Shop[] = ["live", "demo", A, B];
      const bytes = (n: number) => new Uint8Array([255, 216, 255, n]);

      // The same rows for every shop. Written shop by shop at once: a hosted database answers each call slowly.
      const fill = () =>
        Promise.all(
          ALL.map(async (shop, i) => {
            await repo.upsertProduct({ ...honey(shop), priceCents: 100 + i });
            await repo.upsertProduct({ ...honey(shop), sku: "old", archived: true });
            await repo.saveVisit(newVisit(`v-${shop}`, shop, [{ sku: "honey", qty: 1 }], 1_000 + i));
            await repo.savePhoto(`${shop}-1-before.jpg`, bytes(i));
            await repo.savePhoto(`${shop}-note.json`, bytes(10 + i));
          }),
        );

      it("keeps each shop's products and visits apart, trials included", async () => {
        await fill();
        for (const [i, shop] of ALL.entries()) {
          expect(await repo.listProducts(shop)).toEqual([{ ...honey(shop), priceCents: 100 + i }]);
          expect((await repo.listVisits(shop)).map((v) => v.id)).toEqual([`v-${shop}`]);
          expect((await repo.getOpenVisit(shop))!.id).toBe(`v-${shop}`);
        }
      });

      it("deletes one trial's products, visits and stored keys and nothing else", async () => {
        await fill();
        await repo.deleteShop(A);
        const after = reopen();
        expect(await after.listProducts(A, { includeArchived: true })).toEqual([]);
        expect(await after.listVisits(A)).toEqual([]);
        expect(await after.getVisit(`v-${A}`)).toBeNull();
        expect(await after.getPhoto(`${A}-1-before.jpg`)).toBeNull();
        expect(await after.getPhoto(`${A}-note.json`)).toBeNull();
        for (const shop of ["live", "demo", B] as Shop[]) {
          expect(await after.listProducts(shop, { includeArchived: true })).toHaveLength(2);
          expect(await after.listVisits(shop)).toHaveLength(1);
          expect(await after.getPhoto(`${shop}-1-before.jpg`)).not.toBeNull();
          expect(await after.getPhoto(`${shop}-note.json`)).not.toBeNull();
        }
      });

      it("leaves a trial's stored keys alone when the live or demo stand is reset", async () => {
        await fill();
        await repo.resetShop("live", []);
        await repo.resetShop("demo", []);
        for (const shop of [A, B]) {
          expect(await repo.getPhoto(`${shop}-1-before.jpg`)).toEqual(bytes(ALL.indexOf(shop)));
          expect(await repo.listProducts(shop)).toHaveLength(1);
          expect(await repo.listVisits(shop)).toHaveLength(1);
        }
      });

      it("leaves the live stand's stored keys alone when a trial is deleted or reset", async () => {
        await fill();
        await repo.resetShop(A, []);
        await repo.deleteShop(B);
        expect(await repo.getPhoto("live-1-before.jpg")).toEqual(bytes(0));
        expect(await repo.getPhoto("demo-1-before.jpg")).toEqual(bytes(1));
      });

      it("lists stored records by the end of their key, with their contents", async () => {
        await fill();
        const found = await repo.listStored("-note.json");
        expect(found.map((f) => f.key).sort()).toEqual(ALL.map((s) => `${s}-note.json`).sort());
        expect(found.find((f) => f.key === `${A}-note.json`)!.bytes).toEqual(bytes(12));
        expect(await repo.listStored("-never.json")).toEqual([]);
      });
    });
  });
}
