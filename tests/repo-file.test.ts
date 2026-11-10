import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileRepo } from "@/lib/repo-file";
import type { Product } from "@/lib/types";
import { newVisit } from "@/lib/visits";

const honey = (shop: "live" | "demo"): Product => ({
  shop, sku: "honey", name: "Honey", description: "Jar", priceCents: 700, stock: 6, refImageUrl: null,
});

let dir: string;
let repo: FileRepo;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "shopsitter-"));
  repo = new FileRepo(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("FileRepo", () => {
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

  it("round-trips a visit and survives a new instance on the same folder", async () => {
    const v = newVisit("v1", "demo", [{ sku: "honey", qty: 2 }], 1_000);
    await repo.saveVisit(v);
    expect(await new FileRepo(dir).getVisit("v1")).toEqual(v);
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
});
