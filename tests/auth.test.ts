import { beforeEach, describe, expect, it } from "vitest";
import { allow, isStandTokenValid, ownerCookieValue, shopForPasscode, shopFromCookie } from "@/lib/auth";

beforeEach(() => {
  process.env.STAND_TOKEN = "stand-secret";
  process.env.OWNER_PASSCODE = "owner-pass";
  process.env.DEMO_PASSCODE = "demo";
  process.env.SESSION_SECRET = "test-secret";
});

describe("auth", () => {
  it("accepts only the configured stand token", () => {
    expect(isStandTokenValid("stand-secret")).toBe(true);
    expect(isStandTokenValid("nope")).toBe(false);
    expect(isStandTokenValid(null)).toBe(false);
  });

  it("rejects every stand token when none is configured", () => {
    delete process.env.STAND_TOKEN;
    expect(isStandTokenValid("")).toBe(false);
    expect(isStandTokenValid("anything")).toBe(false);
  });

  it("maps each passcode to its own shop", () => {
    expect(shopForPasscode("owner-pass")).toBe("live");
    expect(shopForPasscode("demo")).toBe("demo");
    expect(shopForPasscode("wrong")).toBeNull();
  });

  it("round-trips the owner cookie and rejects a forged one", () => {
    expect(shopFromCookie(ownerCookieValue("demo"))).toBe("demo");
    const forged = ownerCookieValue("demo").replace("demo.", "live.");
    expect(shopFromCookie(forged)).toBeNull();
    expect(shopFromCookie(undefined)).toBeNull();
    expect(shopFromCookie("live.")).toBeNull();
  });

  it("limits how often a key may act within a window", () => {
    expect(allow("k1", 2, 1000, 0)).toBe(true);
    expect(allow("k1", 2, 1000, 10)).toBe(true);
    expect(allow("k1", 2, 1000, 20)).toBe(false);
    expect(allow("k1", 2, 1000, 1500)).toBe(true);
  });
});
