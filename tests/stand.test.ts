import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FileRepo } from "@/lib/repo-file";
import { DEMO_PRODUCTS, productsFor } from "@/lib/seed";
import { handleShelfChange, type ShelfChangeDeps } from "@/lib/stand";
import type { Line } from "@/lib/types";

const img = new Uint8Array([1, 2, 3]);
let repo: FileRepo;
let n: number;

const deps = (delta: Line[] | Error, confidence = 0.9): ShelfChangeDeps => ({
  repo,
  newId: () => `v${++n}`,
  diff: async () => {
    if (delta instanceof Error) throw delta;
    return { delta, confidence };
  },
});

const change = (startedAt: number, settledAt: number, extra = {}) => ({
  shop: "live" as const, before: img, after: img, changeStartedAt: startedAt, settledAt, ...extra,
});

beforeEach(async () => {
  repo = new FileRepo(mkdtempSync(path.join(tmpdir(), "shopsitter-stand-")));
  n = 0;
  await repo.resetShop("live", productsFor("live"));
  await repo.resetShop("demo", DEMO_PRODUCTS);
});

describe("handleShelfChange", () => {
  it("opens a visit with a priced bill and the photo pair when items are taken", async () => {
    const r = await handleShelfChange(deps([{ sku: "honey", qty: 2 }]), change(1_000, 3_000));
    expect(r.visit!.status).toBe("open");
    expect(r.bill!.totalCents).toBe(1400);
    expect(r.visit!.confidence).toBe(0.9);
    expect(r.visit!.beforeUrl).toBeTruthy();
    expect(r.visit!.afterUrl).toBeTruthy();
    expect((await repo.getOpenVisit("live"))!.id).toBe(r.visit!.id);
  });

  it("adds a later change to the same visit", async () => {
    const first = await handleShelfChange(deps([{ sku: "honey", qty: 2 }]), change(1_000, 3_000));
    const second = await handleShelfChange(deps([{ sku: "jam", qty: 1 }]), change(10_000, 12_000));
    expect(second.visit!.id).toBe(first.visit!.id);
    expect(second.bill!.totalCents).toBe(2000);
  });

  it("closes the old visit as unmatched and starts a new one after the join window", async () => {
    const first = await handleShelfChange(deps([{ sku: "honey", qty: 2 }]), change(1_000, 3_000));
    const second = await handleShelfChange(deps([{ sku: "jam", qty: 1 }]), change(3_000 + 61_000, 70_000));
    expect(second.closed!.id).toBe(first.visit!.id);
    expect((await repo.getVisit(first.visit!.id))!.status).toBe("unmatched");
    expect(second.visit!.id).not.toBe(first.visit!.id);
    expect(second.bill!.totalCents).toBe(600);
  });

  it("returns no visit when nothing was taken", async () => {
    const r = await handleShelfChange(deps([]), change(1_000, 3_000));
    expect(r.visit).toBeNull();
    expect(r.bill).toBeNull();
    expect(await repo.listVisits("live")).toEqual([]);
  });

  it("opens a manual-entry visit instead of failing when the shelf cannot be read", async () => {
    const r = await handleShelfChange(deps(new Error("model timed out")), change(1_000, 3_000));
    expect(r.visit!.status).toBe("open");
    expect(r.visit!.needsManual).toBe(true);
    expect(r.bill!.totalCents).toBe(0);
  });

  it("keeps the existing bill and flags manual entry when a later read fails", async () => {
    await handleShelfChange(deps([{ sku: "honey", qty: 2 }]), change(1_000, 3_000));
    const r = await handleShelfChange(deps(new Error("boom")), change(10_000, 12_000));
    expect(r.visit!.needsManual).toBe(true);
    expect(r.bill!.totalCents).toBe(1400);
  });

  it("drops a customer's earlier edit when the shelf changes again", async () => {
    const first = await handleShelfChange(deps([{ sku: "honey", qty: 2 }]), change(1_000, 3_000));
    await repo.saveVisit({ ...first.visit!, paid: [{ sku: "honey", qty: 1 }], paypalOrderId: "O1", orderCents: 700 });
    const r = await handleShelfChange(deps([{ sku: "jam", qty: 1 }]), change(10_000, 12_000));
    expect(r.visit!.paid).toBeNull();
    expect(r.visit!.paypalOrderId).toBeNull();
    expect(r.bill!.totalCents).toBe(2000);
  });

  it("gives every demo run its own visit and never closes another one", async () => {
    const a = await handleShelfChange(deps([{ sku: "honey", qty: 1 }]), change(1_000, 2_000, { shop: "demo", standalone: true }));
    const b = await handleShelfChange(deps([{ sku: "jam", qty: 1 }]), change(1_500, 2_500, { shop: "demo", standalone: true }));
    expect(b.visit!.id).not.toBe(a.visit!.id);
    expect(b.closed).toBeUndefined();
    expect((await repo.getVisit(a.visit!.id))!.status).toBe("open");
  });

  it("hands the close-ups of the changed area to the shelf reader", async () => {
    const zoom = { before: new Uint8Array([7]), after: new Uint8Array([8]) };
    let seen: unknown;
    const d = deps([{ sku: "honey", qty: 1 }]);
    const diff = d.diff;
    d.diff = async (input) => {
      seen = input.zoom;
      return diff(input);
    };
    await handleShelfChange(d, change(1_000, 3_000, { zoom }));
    expect(seen).toBe(zoom);
  });

  it("hands extra camera angles to the shelf reader", async () => {
    const angles = [{ angle: 2, before: new Uint8Array([5]), after: new Uint8Array([6]) }];
    let seen: unknown;
    const d = deps([{ sku: "honey", qty: 1 }]);
    const diff = d.diff;
    d.diff = async (input) => {
      seen = input.angles;
      return diff(input);
    };
    await handleShelfChange(d, change(1_000, 3_000, { angles }));
    expect(seen).toBe(angles);
  });

  it("takes items put back after a visit went unmatched off that visit", async () => {
    const first = await handleShelfChange(deps([{ sku: "honey", qty: 2 }]), change(1_000, 3_000));
    // Ten minutes pass with no payment: the next change finds the visit stale.
    const back = await handleShelfChange(deps([{ sku: "honey", qty: -2 }]), change(3_000 + 700_000, 705_000));
    expect(back.visit).toBeNull();
    expect(back.returned!.id).toBe(first.visit!.id);
    expect((await repo.getVisit(first.visit!.id))!.status).toBe("empty");
  });

  it("reports a put-back that went onto the open bill", async () => {
    await handleShelfChange(deps([{ sku: "honey", qty: 2 }]), change(1_000, 3_000));
    const back = await handleShelfChange(deps([{ sku: "honey", qty: -1 }]), change(95_000, 97_000));
    expect(back.closed).toBeUndefined();
    expect(back.visit!.status).toBe("open");
    expect(back.bill!.totalCents).toBe(700);
    expect(back.returned).toBeTruthy();
  });
});
