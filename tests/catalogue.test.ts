import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { archiveProduct, restockProduct, saveProduct } from "@/lib/catalogue";
import { CheckoutError, editLines, getBill, publicBill, startOrder } from "@/lib/checkout";
import { ownerAction, ownerOverview, stockForLeft, takenBySku } from "@/lib/owner";
import type { PayPalGateway } from "@/lib/paypal";
import { FileRepo } from "@/lib/repo-file";
import { productsFor } from "@/lib/seed";
import { handleShelfChange } from "@/lib/stand";
import type { Product } from "@/lib/types";
import { newVisit, type Visit } from "@/lib/visits";

const DAY = 86_400_000;
const NOW = 10 * DAY;
let repo: FileRepo;

const paypal: PayPalGateway = {
  createOrder: async () => ({ orderId: "O1" }),
  captureOrder: async () => ({ captureId: "C", amountCents: 0, status: "COMPLETED" }),
  refundCapture: async () => ({ refundId: "R" }),
};
const visit = (id: string, lines: { sku: string; qty: number }[], patch: Partial<Visit> = {}): Visit => ({
  ...newVisit(id, "live", lines, NOW - 3_600_000),
  ...patch,
});
const skus = (ps: { sku: string }[]) => ps.map((p) => p.sku).sort();

beforeEach(async () => {
  repo = new FileRepo(mkdtempSync(path.join(tmpdir(), "shopsitter-catalogue-")));
  await repo.resetShop("live", productsFor("live"));
  await repo.savePhoto("live-ref-honey-1.jpg", new Uint8Array([0xff, 0xd8, 0xff, 1]));
  await repo.upsertProduct({ ...productsFor("live")[0], refImageUrl: "live-ref-honey-1.jpg" });
  // Paid: 2 honey + 1 bread = 1900.
  await repo.saveVisit(
    visit("paid", [{ sku: "honey", qty: 2 }, { sku: "bread", qty: 1 }], {
      status: "paid", paid: [{ sku: "honey", qty: 2 }, { sku: "bread", qty: 1 }], paidCents: 1900, closedAt: NOW - 3_000_000,
    }),
  );
  // Still open: 1 honey + 1 jam = 1300.
  await repo.saveVisit(visit("open", [{ sku: "honey", qty: 1 }, { sku: "jam", qty: 1 }], { openedAt: NOW - 60_000, lastSettledAt: NOW - 60_000 }));
});

describe("archiving a product", () => {
  it("takes it off the owner's product, shelf and restock lists, and removes its photo", async () => {
    expect(await archiveProduct(repo, "live", "honey")).toBe(true);
    const { products, stock } = await ownerOverview(repo, "live", 7, NOW);
    expect(skus(products)).not.toContain("honey");
    expect(skus(stock)).not.toContain("honey");
    expect(products).toHaveLength(5);
    expect(await repo.getPhoto("live-ref-honey-1.jpg")).toBeNull();
    const kept = (await repo.listProducts("live", { includeArchived: true })).find((p) => p.sku === "honey")!;
    expect(kept).toMatchObject({ archived: true, refImageUrl: null, name: "Honey", priceCents: 700 });
  });

  it("does not change what past visits were worth or what they list", async () => {
    const before = await ownerOverview(repo, "live", 7, NOW);
    await archiveProduct(repo, "live", "honey");
    const after = await ownerOverview(repo, "live", 7, NOW);
    expect(after.totals).toEqual(before.totals);
    const row = after.visits.find((v) => v.id === "paid")!;
    expect(row.detectedCents).toBe(1900);
    expect(row.detectedBill.lines.map((l) => l.name)).toEqual(["Honey", "Sourdough loaf"]);
    expect(row.paidBill!.totalCents).toBe(1900);
  });

  it("keeps an open bill payable in full, but does not offer the product for adding", async () => {
    await archiveProduct(repo, "live", "honey");
    const { bill, products } = await getBill(repo, "open", NOW);
    expect(bill.totalCents).toBe(1300);
    expect(skus(products)).not.toContain("honey");
    expect(products).toHaveLength(5);
    expect(await startOrder(repo, paypal, "open", NOW)).toEqual({ orderId: "O1" });
    expect((await repo.getVisit("open"))!.orderCents).toBe(1300);
  });

  it("lets a customer keep or reduce an archived line that is already on their bill, but not add one", async () => {
    await archiveProduct(repo, "live", "honey");
    await archiveProduct(repo, "live", "eggs");
    const kept = await editLines(repo, "open", [{ sku: "honey", qty: 1 }, { sku: "jam", qty: 2 }, { sku: "eggs", qty: 1 }], NOW);
    expect(kept.bill.lines.map((l) => `${l.sku}:${l.qty}`)).toEqual(["honey:1", "jam:2"]);
    expect(kept.bill.totalCents).toBe(1900);
  });

  it("lets the owner correct a visit that has an archived line, but not add an archived product to another", async () => {
    await archiveProduct(repo, "live", "honey");
    const fixed = await ownerAction(repo, paypal, "live", "open", { action: "correct", lines: [{ sku: "honey", qty: 2 }] });
    expect(fixed.detected).toEqual([{ sku: "honey", qty: 2 }]);
    await repo.saveVisit(visit("other", [{ sku: "jam", qty: 1 }], { status: "unmatched" }));
    const other = await ownerAction(repo, paypal, "live", "other", { action: "correct", lines: [{ sku: "honey", qty: 1 }, { sku: "jam", qty: 1 }] });
    expect(other.detected).toEqual([{ sku: "jam", qty: 1 }]);
  });

  it("is not shown to the vision model, and an open bill with it still prices in full", async () => {
    await archiveProduct(repo, "live", "honey");
    let seen: Product[] = [];
    const result = await handleShelfChange(
      {
        repo,
        newId: () => "new",
        diff: async ({ products }) => {
          seen = products;
          return { delta: [{ sku: "apples", qty: 1 }], confidence: 0.9 };
        },
      },
      { shop: "live", before: new Uint8Array([1]), after: new Uint8Array([2]), changeStartedAt: NOW - 30_000, settledAt: NOW - 20_000 },
    );
    expect(skus(seen)).not.toContain("honey");
    expect(seen).toHaveLength(5);
    expect(result.visit!.id).toBe("open");
    expect(result.bill!.totalCents).toBe(1300 + 400);
  });

  it("says no when the product is not there or is already archived", async () => {
    expect(await archiveProduct(repo, "live", "nope")).toBe(false);
    await archiveProduct(repo, "live", "honey");
    expect(await archiveProduct(repo, "live", "honey")).toBe(false);
  });
});

describe("saving a product", () => {
  const fields = { sku: "honey", name: "Heather honey", description: "Dark jar", priceCents: 900, stock: 4 };

  it("refuses to add a product whose sku is in use", async () => {
    expect(await saveProduct(repo, "live", fields, true)).toBe("sku_taken");
  });

  it("brings an archived product back when one is added with the same sku", async () => {
    await archiveProduct(repo, "live", "honey");
    const saved = await saveProduct(repo, "live", fields, true);
    expect(saved).toMatchObject({ sku: "honey", name: "Heather honey", priceCents: 900, stock: 4, refImageUrl: null });
    expect((saved as Product).archived).toBeFalsy();
    expect(skus(await repo.listProducts("live"))).toContain("honey");
    expect(await repo.listProducts("live", { includeArchived: true })).toHaveLength(6);
  });

  it("keeps the photo, and the stock when none is sent, on an edit", async () => {
    const saved = (await saveProduct(repo, "live", { sku: "honey", name: "Honey", description: "", priceCents: 750 }, false)) as Product;
    expect(saved).toMatchObject({ priceCents: 750, stock: 6, refImageUrl: "live-ref-honey-1.jpg" });
  });

  it("starts a new product with nothing on the shelf when no stock is sent", async () => {
    const saved = (await saveProduct(repo, "live", { sku: "candles", name: "Candles", description: "", priceCents: 300 }, true)) as Product;
    expect(saved.stock).toBe(0);
  });
});

describe("restocking", () => {
  it("counts what has left the shelf, leaving out visits where nothing was taken", () => {
    const taken = takenBySku([
      visit("a", [{ sku: "honey", qty: 2 }]),
      visit("b", [{ sku: "honey", qty: 1 }, { sku: "jam", qty: 1 }]),
      visit("c", [{ sku: "honey", qty: 5 }], { status: "empty" }),
    ]);
    expect(taken.get("honey")).toBe(3);
    expect(taken.get("jam")).toBe(1);
    expect(stockForLeft(3, 10)).toBe(13);
    expect(stockForLeft(0, 0)).toBe(0);
  });

  it("sets the stock so the shelf list shows the number the owner counted", async () => {
    // 3 honey have left the shelf so far; the owner has just put the shelf back to 8.
    const result = await restockProduct(repo, "live", "honey", 8);
    expect(result).toMatchObject({ left: 8, product: { sku: "honey", stock: 11 } });
    const { stock } = await ownerOverview(repo, "live", 7, NOW);
    expect(stock.find((s) => s.sku === "honey")!.left).toBe(8);
    // Nothing else about the product changes.
    expect((await repo.listProducts("live")).find((p) => p.sku === "honey")).toMatchObject({ name: "Honey", priceCents: 700, refImageUrl: "live-ref-honey-1.jpg" });
  });

  it("can set a shelf to empty, and counts visits older than the period on screen", async () => {
    await repo.saveVisit(visit("ancient", [{ sku: "jam", qty: 4 }], { status: "unmatched", openedAt: NOW - 9 * DAY }));
    const result = await restockProduct(repo, "live", "jam", 0);
    expect(result!.product.stock).toBe(5);
    const { stock } = await ownerOverview(repo, "live", 7, NOW);
    expect(stock.find((s) => s.sku === "jam")!.left).toBe(0);
  });

  it("has nothing to restock for an unknown or archived product", async () => {
    expect(await restockProduct(repo, "live", "nope", 3)).toBeNull();
    await archiveProduct(repo, "live", "honey");
    expect(await restockProduct(repo, "live", "honey", 3)).toBeNull();
  });
});

describe("what the pay and stand pages are sent", () => {
  it("leaves out everything they do not read", async () => {
    await repo.saveVisit({
      ...(await repo.getVisit("open"))!,
      paypalOrderId: "ORDER-SECRET", orderCents: 1300, beforeUrl: "live-1-before.jpg", afterUrl: "live-1-after.jpg", confidence: 0.4, needsManual: true,
    });
    await archiveProduct(repo, "live", "eggs");
    const sent = publicBill(await getBill(repo, "open", NOW));
    expect(sent.visit).toEqual({ id: "open", status: "open", confidence: 0.4, needsManual: true, paidCents: null, captureId: null });
    expect(sent.bill.totalCents).toBe(1300);
    expect(sent.products).toHaveLength(5);
    expect(sent.products[0]).toEqual({ sku: "honey", name: "Honey", priceCents: 700 });
    expect(JSON.stringify(sent)).not.toMatch(/ORDER-SECRET|before\.jpg|stock|description|refImageUrl|detected/);
  });

  it("still reports an unknown visit", async () => {
    await expect(getBill(repo, "nope", NOW)).rejects.toBeInstanceOf(CheckoutError);
  });
});
