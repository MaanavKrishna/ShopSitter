import { beforeEach, describe, expect, it } from "vitest";
import type { Repo } from "@/lib/repo";
import type { Product } from "@/lib/types";
import { newVisit } from "@/lib/visits";

const honey = (shop: "live" | "demo"): Product => ({
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
  });
}
