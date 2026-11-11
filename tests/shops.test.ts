import { describe, expect, it } from "vitest";
import { isTrial, newTrialId, ownsKey, parseShop, shopKind, shopOfKey } from "@/lib/shops";

const A = "t-abcdefghij";
const B = "t-zyxwvu2345";

describe("shop ids", () => {
  it("makes trial ids of t- and ten lowercase base32 characters, different each time", () => {
    const ids = Array.from({ length: 50 }, () => newTrialId());
    for (const id of ids) expect(id).toMatch(/^t-[a-z2-7]{10}$/);
    expect(new Set(ids).size).toBe(50);
  });

  it("tells a trial id from everything else", () => {
    expect(isTrial(A)).toBe(true);
    expect(isTrial(newTrialId())).toBe(true);
    for (const no of ["live", "demo", "t-", "t-abc", "t-ABCDEFGHIJ", "t-abcdefghijk", "t-abcdefghi1", "t-abcdefghi/", " t-abcdefghij", "t-abcdefghij\n"]) {
      expect(isTrial(no)).toBe(false);
    }
  });

  it("parses only the three kinds of shop, strictly", () => {
    expect(parseShop("live")).toBe("live");
    expect(parseShop("demo")).toBe("demo");
    expect(parseShop(A)).toBe(A);
    for (const no of ["", "Live", "live ", "demo-", "t-abcdefghij-x", "../live", "t-../../etc", "trial", null, undefined, 7, {}]) {
      expect(parseShop(no)).toBeNull();
    }
  });

  it("names the kind of a shop", () => {
    expect(shopKind("live")).toBe("live");
    expect(shopKind("demo")).toBe("demo");
    expect(shopKind(A)).toBe("trial");
  });
});

describe("stored key ownership", () => {
  it("reads the shop a key belongs to from its prefix", () => {
    expect(shopOfKey("live-1700000000000-before.jpg")).toBe("live");
    expect(shopOfKey("live-ref-honey.jpg")).toBe("live");
    expect(shopOfKey("demo-last-reset.json")).toBe("demo");
    expect(shopOfKey(`${A}-ref-mug-1.jpg`)).toBe(A);
    expect(shopOfKey(`${A}-trial.json`)).toBe(A);
    expect(shopOfKey("nope.jpg")).toBeNull();
    expect(shopOfKey("t-short-1.jpg")).toBeNull();
    expect(shopOfKey("livestock.jpg")).toBeNull();
  });

  it("lets a shop own only keys that start with its own id", () => {
    expect(ownsKey("live", "live-1-before.jpg")).toBe(true);
    expect(ownsKey("live", "demo-1-before.jpg")).toBe(false);
    expect(ownsKey("live", `${A}-1-before.jpg`)).toBe(false);
    expect(ownsKey("demo", "demo-1-before.jpg")).toBe(true);
    expect(ownsKey("demo", "live-1-before.jpg")).toBe(false);
    expect(ownsKey("demo", `${A}-1-before.jpg`)).toBe(false);
    expect(ownsKey(A, `${A}-1-before.jpg`)).toBe(true);
    expect(ownsKey(A, `${B}-1-before.jpg`)).toBe(false);
    expect(ownsKey(A, "live-1-before.jpg")).toBe(false);
    expect(ownsKey(A, "demo-1-before.jpg")).toBe(false);
  });

  it("never matches a key that tries to leave the photo folder or borrow a prefix", () => {
    expect(ownsKey(A, `${A}-/../live-1-before.jpg`)).toBe(false);
    expect(ownsKey(A, `${A}-..\\live-1.jpg`)).toBe(false);
    expect(ownsKey("live", "live-/../../secrets")).toBe(false);
    expect(ownsKey("live", "../live-1.jpg")).toBe(false);
    // A longer id that merely starts with this trial's id is someone else.
    expect(ownsKey("t-abcdefghij", "t-abcdefghijk-1.jpg")).toBe(false);
    expect(ownsKey(A, A)).toBe(false);
  });
});
