import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { readAngles, saveAngleShot } from "@/lib/angles";
import { FileRepo } from "@/lib/repo-file";

let repo: FileRepo;
const shot = (n: number) => new Uint8Array([n]);
const noWait = { now: () => 100_000, sleep: async () => {} };

beforeEach(() => {
  repo = new FileRepo(mkdtempSync(path.join(tmpdir(), "shopsitter-angles-")));
});

describe("extra camera angles", () => {
  it("gives nothing when no extra camera has sent a photo", async () => {
    expect(await readAngles(repo, "live", 99_000, noWait)).toEqual([]);
  });

  it("has no pair on an angle's first read, then pairs the last read's photo with the newest", async () => {
    await saveAngleShot(repo, "live", 2, shot(1), 99_500);
    expect(await readAngles(repo, "live", 99_000, noWait)).toEqual([]);

    await saveAngleShot(repo, "live", 2, shot(2), 99_900);
    expect(await readAngles(repo, "live", 99_800, noWait)).toEqual([{ angle: 2, before: shot(1), after: shot(2) }]);

    await saveAngleShot(repo, "live", 2, shot(3), 99_950);
    expect(await readAngles(repo, "live", 99_940, noWait)).toEqual([{ angle: 2, before: shot(2), after: shot(3) }]);
  });

  it("leaves out a camera that has gone quiet for over a minute", async () => {
    await saveAngleShot(repo, "live", 2, shot(1), 10_000);
    await readAngles(repo, "live", 9_000, { now: () => 10_500, sleep: async () => {} });
    await saveAngleShot(repo, "live", 2, shot(2), 20_000);
    expect(await readAngles(repo, "live", 99_000, noWait)).toEqual([]);
  });

  it("waits a moment for a camera whose newest photo is from before the change", async () => {
    await saveAngleShot(repo, "live", 3, shot(1), 90_000);
    await readAngles(repo, "live", 89_000, noWait);
    let sleeps = 0;
    const pairs = await readAngles(repo, "live", 99_000, {
      now: () => 100_000,
      sleep: async () => {
        if (++sleeps === 2) await saveAngleShot(repo, "live", 3, shot(9), 99_500);
      },
    });
    expect(sleeps).toBe(2);
    expect(pairs).toEqual([{ angle: 3, before: shot(1), after: shot(9) }]);
  });

  it("gives up waiting and uses what it has", async () => {
    await saveAngleShot(repo, "live", 2, shot(1), 90_000);
    await readAngles(repo, "live", 89_000, noWait);
    let sleeps = 0;
    const pairs = await readAngles(repo, "live", 99_000, { now: () => 100_000, sleep: async () => void sleeps++ });
    expect(sleeps).toBeLessThanOrEqual(6);
    expect(pairs).toEqual([{ angle: 2, before: shot(1), after: shot(1) }]);
  });

  it("keeps shops apart", async () => {
    await saveAngleShot(repo, "demo", 2, shot(1), 99_500);
    expect(await readAngles(repo, "live", 99_000, noWait)).toEqual([]);
  });
});
