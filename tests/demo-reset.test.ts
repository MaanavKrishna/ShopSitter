import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_RESET_AFTER_MS, healDemo } from "@/lib/demo-reset";
import { FileRepo } from "@/lib/repo-file";
import { exampleVisits, productsFor } from "@/lib/seed";
import { newVisit } from "@/lib/visits";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 11, 12);
let repo: FileRepo;

const ids = async () => (await repo.listVisits("demo")).map((v) => v.id).sort();
const seededIds = exampleVisits("demo", NOW).map((v) => v.id).sort();

beforeEach(async () => {
  repo = new FileRepo(mkdtempSync(path.join(tmpdir(), "shopsitter-heal-")));
  await repo.resetShop("live", productsFor("live"));
  await repo.saveVisit(newVisit("live-1", "live", [{ sku: "jam", qty: 1 }], NOW - 5 * HOUR));
});

describe("healDemo", () => {
  it("resets the demo stand to the example visits when it has never been reset", async () => {
    await repo.saveVisit({ ...newVisit("stray", "demo", [{ sku: "honey", qty: 1 }], NOW - 5 * HOUR), status: "settled_other" });
    expect(await healDemo(repo, NOW)).toBe(true);
    expect(await ids()).toEqual(seededIds);
    expect((await repo.listProducts("demo")).map((p) => p.sku).sort()).toEqual(productsFor("demo").map((p) => p.sku).sort());
  });

  it("leaves the demo alone for an hour after a reset, then resets it again", async () => {
    await healDemo(repo, NOW);
    await repo.saveVisit({ ...newVisit("changed", "demo", [{ sku: "honey", qty: 1 }], NOW), status: "settled_other" });
    expect(await healDemo(repo, NOW + DEMO_RESET_AFTER_MS - 1)).toBe(false);
    expect(await ids()).toContain("changed");
    expect(await healDemo(repo, NOW + DEMO_RESET_AFTER_MS + 1)).toBe(true);
    expect(await ids()).toEqual(exampleVisits("demo", NOW + DEMO_RESET_AFTER_MS + 1).map((v) => v.id).sort());
  });

  it("waits while someone still has a bill open on the demo", async () => {
    await healDemo(repo, NOW);
    const later = NOW + 2 * HOUR;
    await repo.saveVisit(newVisit("mid-demo", "demo", [{ sku: "honey", qty: 1 }], later - 60_000));
    expect(await healDemo(repo, later)).toBe(false);
    expect(await ids()).toContain("mid-demo");
    // Once that bill has gone stale the reset goes ahead.
    expect(await healDemo(repo, later + 11 * 60_000)).toBe(true);
    expect(await ids()).not.toContain("mid-demo");
  });

  it("never touches the live stand", async () => {
    await healDemo(repo, NOW);
    await healDemo(repo, NOW + 3 * HOUR);
    expect((await repo.listVisits("live")).map((v) => v.id)).toEqual(["live-1"]);
    expect(await repo.listProducts("live")).toHaveLength(6);
  });

  it("runs one reset when two requests arrive together", async () => {
    let resets = 0;
    const reset = async () => {
      resets++;
      await new Promise((r) => setTimeout(r, 5));
    };
    const both = await Promise.all([healDemo(repo, NOW, reset), healDemo(repo, NOW, reset)]);
    expect(resets).toBe(1);
    expect(both).toEqual([true, true]);
    expect(await healDemo(repo, NOW + 1000, reset)).toBe(false);
  });

  it("tries again next time when a reset fails", async () => {
    await expect(healDemo(repo, NOW, async () => { throw new Error("storage down"); })).rejects.toThrow("storage down");
    expect(await healDemo(repo, NOW + 1000)).toBe(true);
  });
});
