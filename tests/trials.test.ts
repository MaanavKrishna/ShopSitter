import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { saveProduct } from "@/lib/catalogue";
import { getBill, startOrder } from "@/lib/checkout";
import { OwnerError, ownerAction, ownerOverview } from "@/lib/owner";
import type { PayPalGateway } from "@/lib/paypal";
import { FileRepo } from "@/lib/repo-file";
import { productsFor } from "@/lib/seed";
import { isTrial } from "@/lib/shops";
import { handleShelfChange } from "@/lib/stand";
import {
  TRIAL_LIFETIME_MS,
  TRIAL_MAX_PRODUCTS,
  TRIAL_MAX_PRODUCT_ROWS,
  activeShop,
  addStarterProducts,
  createTrial,
  endTrial,
  getTrial,
  sweepExpiredTrials,
  trialHasRoomFor,
} from "@/lib/trials";
import { newVisit } from "@/lib/visits";

let repo: FileRepo;
const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

beforeEach(() => {
  repo = new FileRepo(mkdtempSync(path.join(tmpdir(), "shopsitter-trials-")));
});

describe("trial records", () => {
  it("creates a trial that lasts 24 hours and starts with no products and no visits", async () => {
    const trial = await createTrial(repo, NOW);
    expect(isTrial(trial.shop)).toBe(true);
    expect(trial).toEqual({ shop: trial.shop, createdAt: NOW, expiresAt: NOW + TRIAL_LIFETIME_MS });
    expect(TRIAL_LIFETIME_MS).toBe(24 * HOUR);
    expect(await repo.listProducts(trial.shop, { includeArchived: true })).toEqual([]);
    expect(await repo.listVisits(trial.shop)).toEqual([]);
  });

  it("reads a trial back until it expires, from a second handle too", async () => {
    const trial = await createTrial(repo, NOW);
    expect(await getTrial(repo, trial.shop, NOW + 1)).toEqual(trial);
    expect(await getTrial(repo, trial.shop, trial.expiresAt - 1)).toEqual(trial);
    expect(await getTrial(repo, trial.shop, trial.expiresAt)).toBeNull();
  });

  it("has no trial for an id nobody made, for live or demo, or for anything malformed", async () => {
    await createTrial(repo, NOW);
    for (const id of ["t-aaaaaaaaaa", "live", "demo", "", "../live", "t-AAAAAAAAAA"]) {
      expect(await getTrial(repo, id, NOW)).toBeNull();
    }
  });

  it("deletes an expired trial's products, visits and photos when it is next touched", async () => {
    const trial = await createTrial(repo, NOW);
    const other = await createTrial(repo, NOW + 12 * HOUR);
    for (const shop of [trial.shop, other.shop, "live" as const]) {
      await repo.upsertProduct({ ...productsFor(shop)[0] });
      await repo.saveVisit(newVisit(`v-${shop}`, shop, [{ sku: "honey", qty: 1 }], NOW));
      await repo.savePhoto(`${shop}-1-before.jpg`, new Uint8Array([1]));
    }
    expect(await getTrial(repo, trial.shop, NOW + 25 * HOUR)).toBeNull();
    expect(await repo.listProducts(trial.shop, { includeArchived: true })).toEqual([]);
    expect(await repo.listVisits(trial.shop)).toEqual([]);
    expect(await repo.getPhoto(`${trial.shop}-1-before.jpg`)).toBeNull();
    // Gone for good, even if the clock were wound back.
    expect(await getTrial(repo, trial.shop, NOW)).toBeNull();
    // The younger trial and the live stand are untouched.
    expect(await getTrial(repo, other.shop, NOW + 25 * HOUR)).toEqual(other);
    for (const shop of [other.shop, "live" as const]) {
      expect(await repo.listProducts(shop)).toHaveLength(1);
      expect(await repo.listVisits(shop)).toHaveLength(1);
      expect(await repo.getPhoto(`${shop}-1-before.jpg`)).not.toBeNull();
    }
  });

  it("ends a trial on request, and refuses to end the live or demo stand", async () => {
    const trial = await createTrial(repo, NOW);
    await repo.upsertProduct({ ...productsFor(trial.shop)[0] });
    await repo.upsertProduct({ ...productsFor("live")[0] });
    await endTrial(repo, trial.shop);
    expect(await getTrial(repo, trial.shop, NOW)).toBeNull();
    expect(await repo.listProducts(trial.shop)).toEqual([]);
    await expect(endTrial(repo, "live")).rejects.toThrow();
    await expect(endTrial(repo, "demo")).rejects.toThrow();
    expect(await repo.listProducts("live")).toHaveLength(1);
  });

  it("treats a signed-in trial as signed out once it is gone, and leaves live and demo alone", async () => {
    const trial = await createTrial(repo, NOW);
    expect(await activeShop(repo, trial.shop, NOW)).toBe(trial.shop);
    expect(await activeShop(repo, trial.shop, trial.expiresAt + 1)).toBeNull();
    expect(await activeShop(repo, "t-aaaaaaaaaa", NOW)).toBeNull();
    expect(await activeShop(repo, "live", NOW)).toBe("live");
    expect(await activeShop(repo, "demo", NOW)).toBe("demo");
    expect(await activeShop(repo, null, NOW)).toBeNull();
  });
});

describe("clearing out expired trials", () => {
  it("deletes a few expired trials at a time and never a current one", async () => {
    const old = [];
    for (let i = 0; i < 5; i++) old.push(await createTrial(repo, NOW - 30 * HOUR - i));
    const current = await createTrial(repo, NOW - HOUR);
    for (const t of [...old, current]) await repo.upsertProduct({ ...productsFor(t.shop)[0] });
    await repo.upsertProduct({ ...productsFor("live")[0] });
    await repo.savePhoto("demo-last-reset.json", new Uint8Array([1]));

    expect(await sweepExpiredTrials(repo, NOW, 3)).toBe(3);
    expect(await sweepExpiredTrials(repo, NOW, 3)).toBe(2);
    expect(await sweepExpiredTrials(repo, NOW, 3)).toBe(0);
    for (const t of old) expect(await repo.listProducts(t.shop)).toEqual([]);
    expect(await repo.listProducts(current.shop)).toHaveLength(1);
    expect(await getTrial(repo, current.shop, NOW)).toEqual(current);
    expect(await repo.listProducts("live")).toHaveLength(1);
    expect(await repo.getPhoto("demo-last-reset.json")).not.toBeNull();
  });

  it("clears a trial whose record cannot be read", async () => {
    const trial = await createTrial(repo, NOW);
    await repo.upsertProduct({ ...productsFor(trial.shop)[0] });
    await repo.savePhoto(`${trial.shop}-trial.json`, new TextEncoder().encode("not json"));
    expect(await getTrial(repo, trial.shop, NOW)).toBeNull();
    expect(await sweepExpiredTrials(repo, NOW, 3)).toBe(1);
    expect(await repo.listProducts(trial.shop)).toEqual([]);
  });
});

describe("trial products", () => {
  it("adds three everyday desk items without photos as suggestions", async () => {
    const trial = await createTrial(repo, NOW);
    const added = await addStarterProducts(repo, trial.shop);
    expect(added.map((p) => [p.name, p.priceCents, p.stock, p.refImageUrl])).toEqual([
      ["Coffee mug", 400, 5, null],
      ["Notebook", 600, 5, null],
      ["Pen", 150, 5, null],
    ]);
    for (const p of added) {
      expect(p.shop).toBe(trial.shop);
      expect(p.description.length).toBeGreaterThan(10);
    }
    expect((await repo.listProducts(trial.shop)).map((p) => p.name).sort()).toEqual(["Coffee mug", "Notebook", "Pen"]);
    expect(await repo.listProducts("live")).toEqual([]);
  });

  it("does not overwrite a product the visitor already has under the same id", async () => {
    const trial = await createTrial(repo, NOW);
    await saveProduct(repo, trial.shop, { sku: "pen", name: "My pen", description: "", priceCents: 999, stock: 1 }, true);
    const added = await addStarterProducts(repo, trial.shop);
    expect(added.map((p) => p.name)).toEqual(["Coffee mug", "Notebook"]);
    expect((await repo.listProducts(trial.shop)).find((p) => p.sku === "pen")!.priceCents).toBe(999);
  });

  it("allows twelve products on sale and no more, while edits and returns of the twelve still work", async () => {
    const trial = await createTrial(repo, NOW);
    expect(TRIAL_MAX_PRODUCTS).toBe(12);
    for (let i = 0; i < 12; i++) {
      expect(await trialHasRoomFor(repo, trial.shop, `p${i}`)).toBe(true);
      await saveProduct(repo, trial.shop, { sku: `p${i}`, name: `P${i}`, description: "", priceCents: 100, stock: 1 }, true);
    }
    expect(await trialHasRoomFor(repo, trial.shop, "p12")).toBe(false);
    // Editing one of the twelve is not adding.
    expect(await trialHasRoomFor(repo, trial.shop, "p3")).toBe(true);
    // An archived product does not count, but bringing it back needs room.
    await repo.upsertProduct({ ...(await repo.listProducts(trial.shop))[0], archived: true });
    expect(await trialHasRoomFor(repo, trial.shop, "p12")).toBe(true);
    await saveProduct(repo, trial.shop, { sku: "p12", name: "P12", description: "", priceCents: 100, stock: 1 }, true);
    expect(await trialHasRoomFor(repo, trial.shop, "p0")).toBe(false);
  });

  it("stops a trial piling up removed products without end", async () => {
    const trial = await createTrial(repo, NOW);
    for (let i = 0; i < TRIAL_MAX_PRODUCT_ROWS; i++) {
      expect(await trialHasRoomFor(repo, trial.shop, `gone${i}`)).toBe(true);
      await repo.upsertProduct({ shop: trial.shop, sku: `gone${i}`, name: "Gone", description: "", priceCents: 1, stock: 0, refImageUrl: null, archived: true });
    }
    expect(await repo.listProducts(trial.shop)).toEqual([]);
    expect(await trialHasRoomFor(repo, trial.shop, "brand-new")).toBe(false);
    // One that was removed can still come back: it adds no row.
    expect(await trialHasRoomFor(repo, trial.shop, "gone3")).toBe(true);
  });

  it("stops suggestions at the limit", async () => {
    const trial = await createTrial(repo, NOW);
    for (let i = 0; i < 11; i++) {
      await saveProduct(repo, trial.shop, { sku: `p${i}`, name: `P${i}`, description: "", priceCents: 100, stock: 1 }, true);
    }
    expect((await addStarterProducts(repo, trial.shop)).map((p) => p.name)).toEqual(["Coffee mug"]);
    expect(await repo.listProducts(trial.shop)).toHaveLength(12);
  });

  it("never limits the live stand", async () => {
    for (let i = 0; i < 20; i++) {
      await saveProduct(repo, "live", { sku: `p${i}`, name: `P${i}`, description: "", priceCents: 100, stock: 1 }, true);
    }
    expect(await trialHasRoomFor(repo, "live", "another")).toBe(true);
  });
});

describe("a trial stand end to end, beside the live stand", () => {
  const paypal: PayPalGateway & { orders: number[] } = {
    orders: [],
    async createOrder(body: { purchaseUnits: { amount: { value: string } }[] }) {
      this.orders.push(Math.round(Number(body.purchaseUnits[0].amount.value) * 100));
      return { orderId: `ORDER${this.orders.length}` };
    },
    captureOrder: async () => ({ captureId: "C", amountCents: 0, status: "COMPLETED" }),
    refundCapture: async () => ({ refundId: "R" }),
  };
  const img = new Uint8Array([1, 2, 3]);

  it("prices a trial visit from the trial's own catalogue and orders that amount", async () => {
    paypal.orders = [];
    const trial = await createTrial(repo, NOW);
    // The same sku costs something different on each stand.
    await repo.upsertProduct({ shop: "live", sku: "pen", name: "Live pen", description: "", priceCents: 9900, stock: 5, refImageUrl: null });
    await repo.upsertProduct({ shop: "demo", sku: "pen", name: "Demo pen", description: "", priceCents: 5500, stock: 5, refImageUrl: null });
    await addStarterProducts(repo, trial.shop);

    let n = 0;
    const seen: string[][] = [];
    const result = await handleShelfChange(
      {
        repo,
        newId: () => `tv${++n}`,
        diff: async ({ products }) => {
          seen.push(products.map((p) => `${p.shop}:${p.sku}`));
          return { delta: [{ sku: "pen", qty: 2 }, { sku: "coffee-mug", qty: 1 }], confidence: 0.9 };
        },
      },
      { shop: trial.shop, before: img, after: img, changeStartedAt: NOW, settledAt: NOW + 2_000 },
    );
    // The vision model is shown the trial's products only.
    expect(seen[0].every((s) => s.startsWith(`${trial.shop}:`))).toBe(true);
    expect(result.visit!.shop).toBe(trial.shop);
    expect(result.bill!.totalCents).toBe(2 * 150 + 400);
    expect(result.visit!.beforeUrl!.startsWith(`${trial.shop}-`)).toBe(true);
    expect(result.visit!.afterUrl!.startsWith(`${trial.shop}-`)).toBe(true);

    const { bill, products } = await getBill(repo, result.visit!.id, NOW + 3_000);
    expect(bill.totalCents).toBe(700);
    expect(bill.lines.map((l) => l.name).sort()).toEqual(["Coffee mug", "Pen"]);
    expect(products.every((p) => p.shop === trial.shop)).toBe(true);

    await startOrder(repo, paypal, result.visit!.id, NOW + 4_000);
    expect(paypal.orders).toEqual([700]);

    // The live and demo stands saw nothing of it.
    expect(await repo.getOpenVisit("live")).toBeNull();
    expect(await repo.listVisits("live")).toEqual([]);
    expect(await repo.listVisits("demo")).toEqual([]);
    expect((await ownerOverview(repo, "live", 7, NOW + 5_000)).visits).toEqual([]);
    expect((await ownerOverview(repo, trial.shop, 7, NOW + 5_000)).visits.map((v) => v.id)).toEqual(["tv1"]);
  });

  it("does not join a trial's shelf change to the live stand's open visit, or the other way round", async () => {
    const a = await createTrial(repo, NOW);
    const b = await createTrial(repo, NOW);
    for (const shop of ["live" as const, a.shop, b.shop]) {
      await repo.upsertProduct({ shop, sku: "pen", name: "Pen", description: "", priceCents: 100, stock: 5, refImageUrl: null });
    }
    let n = 0;
    const deps = { repo, newId: () => `x${++n}`, diff: async () => ({ delta: [{ sku: "pen", qty: 1 }], confidence: 0.9 }) };
    const at = (shop: typeof a.shop | "live", t: number) =>
      handleShelfChange(deps, { shop, before: img, after: img, changeStartedAt: t, settledAt: t + 1 });
    const live = await at("live", NOW);
    const ta = await at(a.shop, NOW + 10);
    const tb = await at(b.shop, NOW + 20);
    const live2 = await at("live", NOW + 30);
    expect(new Set([live.visit!.id, ta.visit!.id, tb.visit!.id]).size).toBe(3);
    expect(live2.visit!.id).toBe(live.visit!.id);
    expect(live2.visit!.detected).toEqual([{ sku: "pen", qty: 2 }]);
    expect((await repo.getOpenVisit(a.shop))!.detected).toEqual([{ sku: "pen", qty: 1 }]);
  });

  it("gives the overview a shop kind the screens can read", async () => {
    const trial = await createTrial(repo, NOW);
    expect((await ownerOverview(repo, trial.shop, 7, NOW)).shopKind).toBe("trial");
    expect((await ownerOverview(repo, "live", 7, NOW)).shopKind).toBe("live");
    expect((await ownerOverview(repo, "demo", 7, NOW)).shopKind).toBe("demo");
  });

  it("refuses an owner action on a visit that belongs to another stand", async () => {
    const a = await createTrial(repo, NOW);
    const b = await createTrial(repo, NOW);
    await repo.saveVisit({ ...newVisit("va", a.shop, [{ sku: "pen", qty: 1 }], NOW), status: "unmatched" });
    await repo.saveVisit({ ...newVisit("vl", "live", [{ sku: "pen", qty: 1 }], NOW), status: "unmatched" });
    const code = (p: Promise<unknown>) => p.then(() => "no error", (e) => (e instanceof OwnerError ? e.code : `unexpected: ${e}`));
    expect(await code(ownerAction(repo, paypal, b.shop, "va", { action: "settle" }))).toBe("not_found");
    expect(await code(ownerAction(repo, paypal, b.shop, "vl", { action: "settle" }))).toBe("not_found");
    expect(await code(ownerAction(repo, paypal, "live", "va", { action: "settle" }))).toBe("not_found");
    expect(await code(ownerAction(repo, paypal, "demo", "va", { action: "settle" }))).toBe("not_found");
    expect((await ownerAction(repo, paypal, a.shop, "va", { action: "settle" })).status).toBe("settled_other");
    expect((await repo.getVisit("vl"))!.status).toBe("unmatched");
  });
});
