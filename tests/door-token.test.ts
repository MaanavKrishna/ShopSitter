import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { admitDoor, signDoorToken, verifyDoorToken } from "@/lib/door-token";
import { FileRepo } from "@/lib/repo-file";
import { getStore, rotateDoor } from "@/lib/store";
import { signStandKey, verifyStandKey } from "@/lib/stand-key";

const SECRET = "test-secret";
const TRIAL = "t-abcdefgh23";
const NOW = 1_000_000;

describe("door tokens", () => {
  it("round-trips a trial's token with its expiry", () => {
    const token = signDoorToken(TRIAL, NOW + 5_000, SECRET);
    expect(verifyDoorToken(token, NOW, SECRET)).toEqual({ shop: TRIAL, expiresAt: NOW + 5_000, expired: false, epoch: 0 });
    expect(verifyDoorToken(token, NOW + 5_000, SECRET)!.expired).toBe(true);
  });

  it("gives the owner's stand a token that does not expire", () => {
    const token = signDoorToken("live", null, SECRET);
    expect(verifyDoorToken(token, NOW * 1_000, SECRET)).toEqual({ shop: "live", expiresAt: null, expired: false, epoch: 0 });
  });

  it("refuses the demo stand, a trial without an expiry, and a missing secret", () => {
    expect(() => signDoorToken("demo", null, SECRET)).toThrow();
    expect(() => signDoorToken(TRIAL, null, SECRET)).toThrow();
    expect(() => signDoorToken("live", null, "")).toThrow();
  });

  it("rejects a token that was changed, signed with another secret, or is not a token", () => {
    const token = signDoorToken(TRIAL, NOW + 5_000, SECRET);
    const other = token.replace(TRIAL, "t-zzzzzzzz22");
    const later = token.replace(`.${(NOW + 5_000).toString(36)}.`, `.${(NOW + 9_000_000).toString(36)}.`);
    expect(verifyDoorToken(other, NOW, SECRET)).toBeNull();
    expect(verifyDoorToken(later, NOW, SECRET)).toBeNull();
    expect(verifyDoorToken(token, NOW, "another-secret")).toBeNull();
    expect(verifyDoorToken(signDoorToken("live", null, SECRET).replace("d.live.", `d.${TRIAL}.`), NOW, SECRET)).toBeNull();
    for (const junk of ["", null, undefined, "live", "d.demo.0.aaaaaaaaaaaaaaaaaaaaaa", "d.live.0.short"]) {
      expect(verifyDoorToken(junk, NOW, SECRET)).toBeNull();
    }
  });

  it("can never be used as a stand key, and a stand key can never be used as a door token", () => {
    const expiresAt = NOW + 5_000;
    const door = signDoorToken(TRIAL, expiresAt, SECRET);
    const key = signStandKey(TRIAL, expiresAt, SECRET);
    expect(verifyStandKey(door, NOW, SECRET)).toBeNull();
    expect(verifyDoorToken(key, NOW, SECRET)).toBeNull();
    // Even reshaped to look like the other kind, the signature is for a different purpose.
    expect(verifyStandKey(door.slice(2), NOW, SECRET)).toBeNull();
    expect(verifyDoorToken(`d.${key}`, NOW, SECRET)).toBeNull();
    expect(verifyStandKey(key, NOW, SECRET)).not.toBeNull();
  });
});

describe("a new door QR", () => {
  it("carries the store's door number, and the old code stops working once the owner makes a new one", async () => {
    const repo = new FileRepo(mkdtempSync(path.join(tmpdir(), "shopsitter-door-")));
    const old = signDoorToken("live", null, SECRET);
    expect(await admitDoor(repo, old, NOW, SECRET)).toEqual({ shop: "live" });
    expect(await rotateDoor(repo, "live")).toBe(1);
    expect((await getStore(repo, "live")).doorEpoch).toBe(1);
    expect(await admitDoor(repo, old, NOW, SECRET)).toEqual({ error: "bad_store" });
    const fresh = signDoorToken("live", null, SECRET, 1);
    expect(verifyDoorToken(fresh, NOW, SECRET)).toMatchObject({ shop: "live", epoch: 1 });
    expect(await admitDoor(repo, fresh, NOW, SECRET)).toEqual({ shop: "live" });
    // The number is signed: changing it breaks the token.
    expect(verifyDoorToken(fresh.replace(".e1.", ".e2."), NOW, SECRET)).toBeNull();
  });

  it("refuses a token that is not one, and a trial that has ended", async () => {
    const repo = new FileRepo(mkdtempSync(path.join(tmpdir(), "shopsitter-door-")));
    expect(await admitDoor(repo, "nonsense", NOW, SECRET)).toEqual({ error: "bad_store" });
    expect(await admitDoor(repo, signDoorToken(TRIAL, NOW + 5_000, SECRET), NOW + 6_000, SECRET)).toEqual({ error: "store_closed" });
    expect(await admitDoor(repo, signDoorToken(TRIAL, NOW + 5_000, SECRET), NOW, SECRET)).toEqual({ error: "store_closed" });
  });
});
