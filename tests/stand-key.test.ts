import { beforeEach, describe, expect, it } from "vitest";
import { ownerCookieValue, shopFromCookie } from "@/lib/auth";
import { signStandKey, verifyStandKey } from "@/lib/stand-key";

const SHOP = "t-abcdefghij";
const NOW = 1_800_000_000_000;
const EXP = NOW + 86_400_000;

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret";
  process.env.STAND_TOKEN = "246810";
});

describe("stand keys", () => {
  it("round-trips the shop and expiry in a compact token", () => {
    const key = signStandKey(SHOP, EXP);
    expect(key.length).toBeLessThan(60);
    expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(verifyStandKey(key, NOW)).toEqual({ shop: SHOP, expiresAt: EXP, expired: false });
  });

  it("says when a real key has run out", () => {
    const key = signStandKey(SHOP, EXP);
    expect(verifyStandKey(key, EXP - 1)!.expired).toBe(false);
    expect(verifyStandKey(key, EXP)).toEqual({ shop: SHOP, expiresAt: EXP, expired: true });
  });

  it("refuses a key that was changed in any part", () => {
    const [shop, exp, mac] = signStandKey(SHOP, EXP).split(".");
    const later = (EXP + 86_400_000).toString(36);
    const flipped = mac.slice(0, -1) + (mac.endsWith("A") ? "B" : "A");
    for (const forged of [
      `t-zyxwvu2345.${exp}.${mac}`,
      `live.${exp}.${mac}`,
      `${shop}.${later}.${mac}`,
      `${shop}.${exp}.${flipped}`,
      `${shop}.${exp}.${mac}x`,
      `${shop}.${exp}.`,
      `${shop}.${exp}`,
      `${shop}.0${exp}.${mac}`,
      `${shop}.${exp.toUpperCase()}.${mac}`,
      ` ${shop}.${exp}.${mac}`,
      "",
      "246810",
    ]) {
      expect(verifyStandKey(forged, NOW)).toBeNull();
    }
    expect(verifyStandKey(null, NOW)).toBeNull();
  });

  it("refuses a key signed with another secret", () => {
    const key = signStandKey(SHOP, EXP);
    process.env.SESSION_SECRET = "another-secret";
    expect(verifyStandKey(key, NOW)).toBeNull();
    expect(verifyStandKey(signStandKey(SHOP, EXP, "mallory"), NOW)).toBeNull();
  });

  it("accepts nothing, without throwing, when no secret is configured", () => {
    const key = signStandKey(SHOP, EXP);
    delete process.env.SESSION_SECRET;
    expect(verifyStandKey(key, NOW)).toBeNull();
    expect(() => signStandKey(SHOP, EXP)).toThrow();
  });

  it("cannot be minted for the live or demo stand, or for a malformed id", () => {
    for (const shop of ["live", "demo", "t-short", "t-ABCDEFGHIJ", ""]) {
      expect(() => signStandKey(shop, EXP)).toThrow();
    }
    expect(() => signStandKey(SHOP, Number.NaN)).toThrow();
    expect(() => signStandKey(SHOP, -5)).toThrow();
  });

  it("is not interchangeable with the owner cookie", () => {
    const [, , mac] = signStandKey(SHOP, EXP).split(".");
    expect(shopFromCookie(`${SHOP}.${mac}`)).toBeNull();
    const cookieMac = ownerCookieValue(SHOP).split(".")[1];
    expect(verifyStandKey(`${SHOP}.${EXP.toString(36)}.${cookieMac}`, NOW)).toBeNull();
    expect(verifyStandKey(`${SHOP}.${EXP.toString(36)}.${cookieMac.slice(0, 22)}`, NOW)).toBeNull();
  });
});

describe("owner cookie with trial ids", () => {
  it("round-trips a trial shop and rejects a forged or malformed one", () => {
    expect(shopFromCookie(ownerCookieValue(SHOP))).toBe(SHOP);
    expect(shopFromCookie(ownerCookieValue("live"))).toBe("live");
    expect(shopFromCookie(ownerCookieValue("demo"))).toBe("demo");
    const mac = ownerCookieValue(SHOP).split(".")[1];
    expect(shopFromCookie(`t-zyxwvu2345.${mac}`)).toBeNull();
    expect(shopFromCookie(`live.${mac}`)).toBeNull();
    expect(shopFromCookie(`demo.${mac}`)).toBeNull();
    expect(shopFromCookie(`${SHOP}.`)).toBeNull();
    expect(shopFromCookie(`../live.${mac}`)).toBeNull();
  });
});
