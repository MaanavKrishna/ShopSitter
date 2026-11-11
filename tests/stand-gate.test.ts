import { beforeEach, describe, expect, it } from "vitest";
import {
  STAND_CALLER_FAILS,
  STAND_FAIL_WINDOW_MS,
  STAND_GLOBAL_FAILS,
  createDemoReadGate,
  createStandGate,
  refuseStand,
} from "@/lib/auth";
import { GET as checkRoute } from "@/app/api/stand/check/route";
import { POST as angleRoute } from "@/app/api/stand/angle/route";
import { POST as changeRoute } from "@/app/api/stand/change/route";
import { POST as presenceRoute } from "@/app/api/stand/presence/route";

const RIGHT = "246810";
const MIN = 60_000;

beforeEach(() => {
  process.env.STAND_TOKEN = RIGHT;
});

describe("stand code gate", () => {
  it("lets the right code through and refuses a wrong one", () => {
    const gate = createStandGate();
    expect(gate(RIGHT, "a", 0)).toBe("ok");
    expect(gate("000000", "a", 1)).toBe("unauthorized");
    expect(gate(null, "a", 2)).toBe("unauthorized");
  });

  it("limits a caller after five wrong codes, and then refuses the right code too", () => {
    const gate = createStandGate();
    for (let i = 0; i < STAND_CALLER_FAILS; i++) expect(gate("000000", "guesser", i)).toBe("unauthorized");
    expect(gate("000001", "guesser", 10)).toBe("limited");
    // No difference between a wrong and a right code while limited, so the limit gives nothing away.
    expect(gate(RIGHT, "guesser", 11)).toBe("limited");
    // Someone else is not affected.
    expect(gate(RIGHT, "stand", 12)).toBe("ok");
  });

  it("lets the caller try again once the wrong codes are ten minutes old", () => {
    const gate = createStandGate();
    for (let i = 0; i < STAND_CALLER_FAILS; i++) gate("000000", "guesser", i);
    expect(gate(RIGHT, "guesser", STAND_FAIL_WINDOW_MS - 1)).toBe("limited");
    expect(gate(RIGHT, "guesser", STAND_FAIL_WINDOW_MS + 10)).toBe("ok");
  });

  it("does not count attempts made while limited, so the limit ends on time", () => {
    const gate = createStandGate();
    for (let i = 0; i < STAND_CALLER_FAILS; i++) gate("000000", "guesser", 0);
    for (let i = 0; i < 50; i++) expect(gate("000000", "guesser", 5 * MIN)).toBe("limited");
    expect(gate(RIGHT, "guesser", STAND_FAIL_WINDOW_MS + 1)).toBe("ok");
  });

  it("never limits a stand for its own successful requests", () => {
    const gate = createStandGate();
    for (let i = 0; i < 500; i++) expect(gate(RIGHT, "stand", i * 100)).toBe("ok");
  });

  it("forgives a stand a few typing mistakes", () => {
    const gate = createStandGate();
    for (let i = 0; i < STAND_CALLER_FAILS - 1; i++) expect(gate("000000", "stand", i)).toBe("unauthorized");
    expect(gate(RIGHT, "stand", 10)).toBe("ok");
  });

  it("slows every unknown caller once wrong codes from many callers reach the global cap", () => {
    const gate = createStandGate();
    for (let i = 0; i < STAND_GLOBAL_FAILS; i++) expect(gate("000000", `bot-${i}`, i)).toBe("unauthorized");
    // A caller never seen before is now refused whatever it sends.
    expect(gate("000000", "bot-new", 100)).toBe("limited");
    expect(gate(RIGHT, "bot-lucky", 101)).toBe("limited");
    // It ends when the wrong codes have aged out.
    expect(gate(RIGHT, "bot-lucky", STAND_FAIL_WINDOW_MS + 100)).toBe("ok");
  });

  it("keeps a stand that has recently sent the right code working through the global cool-off", () => {
    const gate = createStandGate();
    expect(gate(RIGHT, "stand", 0)).toBe("ok");
    for (let i = 0; i < STAND_GLOBAL_FAILS + 20; i++) gate("000000", `bot-${i}`, 1 + i);
    expect(gate(RIGHT, "stand", 200)).toBe("ok");
    expect(gate(RIGHT, "stand", 9 * MIN)).toBe("ok");
  });

  it("does not let attempts made during the cool-off extend it", () => {
    const gate = createStandGate();
    for (let i = 0; i < STAND_GLOBAL_FAILS; i++) gate("000000", `bot-${i}`, 0);
    for (let i = 0; i < 200; i++) expect(gate("000000", `late-${i}`, 5 * MIN)).toBe("limited");
    expect(gate(RIGHT, "new-stand", STAND_FAIL_WINDOW_MS + 1)).toBe("ok");
  });

  it("refuses everything when no stand code is configured", () => {
    delete process.env.STAND_TOKEN;
    const gate = createStandGate();
    expect(gate("", "a", 0)).toBe("unauthorized");
    expect(gate("anything", "a", 1)).toBe("unauthorized");
  });
});

const standRequest = (url: string, token: string | null, ip: string, method = "POST") =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "x-forwarded-for": ip, ...(token === null ? {} : { "x-stand-token": token }) },
  });

describe("stand routes", () => {
  it("turns the gate's answer into 401 and 429 responses, and nothing for the right code", async () => {
    const gate = createStandGate();
    expect(refuseStand(standRequest("/api/stand/check", RIGHT, "1.1.1.1"), gate)).toBeNull();
    const wrong = refuseStand(standRequest("/api/stand/check", "nope", "1.1.1.1"), gate)!;
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: "unauthorized" });
    for (let i = 0; i < STAND_CALLER_FAILS; i++) refuseStand(standRequest("/api/stand/check", "nope", "2.2.2.2"), gate);
    const limited = refuseStand(standRequest("/api/stand/check", RIGHT, "2.2.2.2"), gate)!;
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "slow_down" });
  });

  it("checks a stand code: 204 when right, 401 when wrong", async () => {
    expect((await checkRoute(standRequest("/api/stand/check", RIGHT, "10.0.0.1", "GET"))).status).toBe(204);
    expect((await checkRoute(standRequest("/api/stand/check", "999999", "10.0.0.1", "GET"))).status).toBe(401);
    expect((await checkRoute(standRequest("/api/stand/check", null, "10.0.0.1", "GET"))).status).toBe(401);
  });

  it("shares one limit across the check, change, camera and presence routes, and hides the right code behind it", async () => {
    const ip = "10.0.0.2";
    expect((await checkRoute(standRequest("/api/stand/check", "1", ip, "GET"))).status).toBe(401);
    expect((await changeRoute(standRequest("/api/stand/change", "2", ip))).status).toBe(401);
    expect((await angleRoute(standRequest("/api/stand/angle", "3", ip))).status).toBe(401);
    expect((await presenceRoute(standRequest("/api/stand/presence", "4", ip))).status).toBe(401);
    expect((await checkRoute(standRequest("/api/stand/check", "5", ip, "GET"))).status).toBe(401);

    expect((await checkRoute(standRequest("/api/stand/check", RIGHT, ip, "GET"))).status).toBe(429);
    expect((await changeRoute(standRequest("/api/stand/change", RIGHT, ip))).status).toBe(429);
    expect((await angleRoute(standRequest("/api/stand/angle", RIGHT, ip))).status).toBe(429);
    expect((await presenceRoute(standRequest("/api/stand/presence", RIGHT, ip))).status).toBe(429);
  });
});

describe("demo shelf reads", () => {
  it("allows ten a minute per caller", () => {
    const gate = createDemoReadGate();
    for (let i = 0; i < 10; i++) expect(gate("a", i)).toBe("ok");
    expect(gate("a", 20)).toBe("slow_down");
    expect(gate("b", 21)).toBe("ok");
    expect(gate("a", MIN + 20)).toBe("ok");
  });

  it("caps reads across all callers at 120 an hour, then says the demo is busy", () => {
    const gate = createDemoReadGate();
    for (let i = 0; i < 120; i++) expect(gate(`caller-${i}`, i * 1000)).toBe("ok");
    expect(gate("someone-new", 130_000)).toBe("demo_busy");
    // A refused read does not use up the caller's own allowance or the hour.
    expect(gate("someone-new", 60 * MIN + 1)).toBe("ok");
  });
});
