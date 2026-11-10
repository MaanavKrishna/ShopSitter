import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addVisitor, visitorsSince } from "@/lib/footfall";
import { FileRepo } from "@/lib/repo-file";

const DAY = 86_400_000;
const NOON = Date.UTC(2026, 10, 10, 12);

describe("footfall", () => {
  it("counts people who stopped by, per shop, over the days asked for", async () => {
    const repo = new FileRepo(mkdtempSync(path.join(tmpdir(), "shopsitter-footfall-")));
    expect(await visitorsSince(repo, "live", 7, NOON)).toBe(0);
    await addVisitor(repo, "live", NOON - 3 * DAY);
    await addVisitor(repo, "live", NOON - DAY);
    await addVisitor(repo, "live", NOON);
    await addVisitor(repo, "live", NOON);
    await addVisitor(repo, "demo", NOON);
    expect(await visitorsSince(repo, "live", 1, NOON)).toBe(2);
    expect(await visitorsSince(repo, "live", 2, NOON)).toBe(3);
    expect(await visitorsSince(repo, "live", 7, NOON)).toBe(4);
  });
});
