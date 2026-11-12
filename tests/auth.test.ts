import { beforeEach, describe, expect, it } from "vitest";
import { LOGIN_FAILS_ALL, allow, callerOf, limiterSize, loginLocked, noteLoginFail, isStandTokenValid, ownerCookieValue, shopForPasscode, shopFromCookie } from "@/lib/auth";

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

  it("forgets keys whose window has passed once it tracks many", () => {
    for (let i = 0; i < 6_000; i++) allow(`flood-${i}`, 5, 1000, 10_000);
    expect(limiterSize()).toBeGreaterThan(5_000);
    allow("late", 5, 1000, 20_000);
    expect(limiterSize()).toBeLessThan(10);
    // Keys still inside their window keep counting.
    expect(allow("late", 1, 1000, 20_100)).toBe(false);
  });
});

describe("callerOf", () => {
  const req = (headers: Record<string, string>) => new Request("http://x/", { headers });
  it("prefers the platform's own address headers over the client-supplied forwarded list", () => {
    expect(callerOf(req({ "x-vercel-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2", "x-forwarded-for": "9.9.9.9" }))).toBe("1.1.1.1");
    expect(callerOf(req({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "9.9.9.9, 3.3.3.3" }))).toBe("2.2.2.2");
  });
  it("otherwise takes the last hop of x-forwarded-for, the one the nearest proxy added", () => {
    expect(callerOf(req({ "x-forwarded-for": "6.6.6.6, 3.3.3.3" }))).toBe("3.3.3.3");
    expect(callerOf(req({ "x-forwarded-for": "anything-the-client-says,  4.4.4.4 " }))).toBe("4.4.4.4");
  });
  it("is 'local' with no address at all", () => {
    expect(callerOf(req({}))).toBe("local");
    expect(callerOf(req({ "x-forwarded-for": " , " }))).toBe("local");
  });
});

describe("owner sign-in cap across all callers", () => {
  it("locks sign-in for everyone after too many wrong passcodes in ten minutes, then opens again", () => {
    const t = 50_000_000;
    expect(loginLocked(t)).toBe(false);
    for (let i = 0; i < LOGIN_FAILS_ALL; i++) noteLoginFail(t + i);
    expect(loginLocked(t + LOGIN_FAILS_ALL)).toBe(true);
    expect(loginLocked(t + 10 * 60_000 + LOGIN_FAILS_ALL)).toBe(false);
  });
});

