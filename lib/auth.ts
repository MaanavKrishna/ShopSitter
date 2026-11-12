import { createHmac, timingSafeEqual } from "node:crypto";
import { parseShop } from "./shops";
import type { Shop } from "./types";

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** The live stand's camera page must send this token; it stops strangers posting photos as the stand. */
export function isStandTokenValid(token: string | null): boolean {
  const expected = process.env.STAND_TOKEN;
  return !!expected && !!token && safeEqual(token, expected);
}

export function shopForPasscode(code: string): Shop | null {
  const live = process.env.OWNER_PASSCODE;
  const demo = process.env.DEMO_PASSCODE;
  if (live && safeEqual(code, live)) return "live";
  if (demo && safeEqual(code, demo)) return "demo";
  return null;
}

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET must be set");
  return s;
};
const sign = (value: string) => createHmac("sha256", secret()).update(value).digest("hex");

export const OWNER_COOKIE = "shopsitter_owner";

/**
 * Cookie value proving which shop's dashboard this browser may see. For a trial stand the cookie
 * is only half of it: the trial must also still exist (see activeShop in lib/trials.ts).
 */
export const ownerCookieValue = (shop: Shop) => `${shop}.${sign(shop)}`;

/** The cookie's maximum age for the live and demo stands, in seconds. */
export const OWNER_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/** How the owner cookie is set: unreadable by scripts, sent on same-site requests and top-level visits only. */
export const ownerCookieOptions = (maxAgeSeconds: number = OWNER_COOKIE_MAX_AGE) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: maxAgeSeconds,
});

export function shopFromCookie(value: string | undefined): Shop | null {
  if (!value) return null;
  const [name, mac] = value.split(".");
  const shop = parseShop(name);
  if (!shop || !mac) return null;
  return safeEqual(mac, sign(shop)) ? shop : null;
}

// Small in-memory limiter. Good enough to stop a casual loop on one server instance.
/** Each key's recent hits and the window they count in. */
const hits = new Map<string, { times: number[]; windowMs: number }>();
/** Past this many keys, keys whose window has passed are dropped when the next hit comes in. */
const PRUNE_ABOVE = 5_000;
export function allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  if (hits.size > PRUNE_ABOVE) {
    for (const [k, h] of hits) if (h.times.length === 0 || now - h.times[h.times.length - 1] >= h.windowMs) hits.delete(k);
  }
  const recent = (hits.get(key)?.times ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, { times: recent, windowMs });
    return false;
  }
  recent.push(now);
  hits.set(key, { times: recent, windowMs });
  return true;
}

/** How many keys the limiter is tracking, for tests. */
export const limiterSize = () => hits.size;

/**
 * The caller a limit is counted against. The host's own headers come first (on Vercel
 * `x-vercel-forwarded-for`, then `x-real-ip`), which a client cannot set; otherwise the last hop
 * of `x-forwarded-for`, the one the nearest proxy added, since anything before it is the client's
 * own say. "local" when there is no address at all.
 */
export function callerOf(req: Request): string {
  const first = (name: string) => req.headers.get(name)?.split(",")[0]?.trim();
  const platform = first("x-vercel-forwarded-for") || first("x-real-ip");
  if (platform) return platform;
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  return hops.at(-1) ?? "local";
}

/** Wrong owner passcodes from all callers together, in the window, before sign-in is refused for everyone. */
export const LOGIN_FAILS_ALL = 60;
const LOGIN_FAIL_WINDOW_MS = 10 * 60_000;
let loginFails: number[] = [];

/** True while sign-in is refused for every caller, after too many wrong passcodes across all of them. */
export function loginLocked(now = Date.now()): boolean {
  loginFails = loginFails.filter((t) => now - t < LOGIN_FAIL_WINDOW_MS);
  return loginFails.length >= LOGIN_FAILS_ALL;
}

export function noteLoginFail(now = Date.now()): void {
  loginFails.push(now);
  if (loginFails.length > LOGIN_FAILS_ALL * 4) loginFails = loginFails.slice(-LOGIN_FAILS_ALL * 2);
}

/** Wrong stand codes one caller may send in the window before it is refused outright. */
export const STAND_CALLER_FAILS = 5;
/** Wrong stand codes from all callers together before unknown callers are refused for a while. */
export const STAND_GLOBAL_FAILS = 30;
export const STAND_FAIL_WINDOW_MS = 10 * 60_000;
/** How long a caller that sent the right code stays known, and so is spared the global cool-off. */
const STAND_KNOWN_MS = 24 * 60 * 60_000;
const MAX_TRACKED_CALLERS = 5_000;

export type StandGateAnswer = "ok" | "unauthorized" | "limited";
export type StandGate = (token: string | null, caller: string, now?: number) => StandGateAnswer;

/**
 * Decides whether a request may act as the stand. The stand code is short enough to type on a
 * phone, so guessing is slowed in two ways, and both are checked before the code is compared:
 * a limited caller gets the same answer for a right code as for a wrong one.
 *  - Per caller: after STAND_CALLER_FAILS wrong codes in the window, everything from that caller
 *    is refused until those wrong codes are older than the window.
 *  - Across all callers: after STAND_GLOBAL_FAILS wrong codes in the window, every caller that has
 *    not sent the right code in the last day is refused until the wrong codes age out. This slows
 *    a guesser that spreads its attempts over many addresses.
 * Only wrong codes are counted, so a stand sending the right code is never limited by its own
 * requests, and attempts refused as limited are not counted, so a limit always ends on time.
 *
 * The counts live in this server instance's memory. With several instances each one counts
 * separately, so the real limits are these numbers times the number of instances.
 */
export function createStandGate(): StandGate {
  const fails = new Map<string, number[]>();
  const known = new Map<string, number>();
  let allFails: number[] = [];

  const prune = (now: number) => {
    for (const [caller, times] of fails) {
      if (times.every((t) => now - t >= STAND_FAIL_WINDOW_MS)) fails.delete(caller);
    }
    for (const [caller, at] of known) if (now - at >= STAND_KNOWN_MS) known.delete(caller);
  };

  return (token, caller, now = Date.now()) => {
    const mine = (fails.get(caller) ?? []).filter((t) => now - t < STAND_FAIL_WINDOW_MS);
    if (mine.length >= STAND_CALLER_FAILS) return "limited";

    allFails = allFails.filter((t) => now - t < STAND_FAIL_WINDOW_MS);
    const knownAt = known.get(caller);
    const isKnown = knownAt !== undefined && now - knownAt < STAND_KNOWN_MS;
    if (allFails.length >= STAND_GLOBAL_FAILS && !isKnown) return "limited";

    if (isStandTokenValid(token)) {
      known.set(caller, now);
      return "ok";
    }
    if (fails.size >= MAX_TRACKED_CALLERS || known.size >= MAX_TRACKED_CALLERS) prune(now);
    // Still full of callers inside the window: the global count carries on, so nothing is lost by forgetting them.
    if (fails.size >= MAX_TRACKED_CALLERS) fails.clear();
    mine.push(now);
    fails.set(caller, mine);
    allFails.push(now);
    return "unauthorized";
  };
}

const standGate = createStandGate();

/** For the stand's routes: null when the request carries the right stand code, otherwise the refusal to send. */
export function refuseStand(req: Request, gate: StandGate = standGate): Response | null {
  const answer = gate(req.headers.get("x-stand-token")?.trim() ?? null, callerOf(req));
  if (answer === "ok") return null;
  return answer === "limited"
    ? Response.json({ error: "slow_down" }, { status: 429 })
    : Response.json({ error: "unauthorized" }, { status: 401 });
}

const DEMO_CALLER_READS = 10;
const DEMO_CALLER_WINDOW_MS = 60_000;
const DEMO_ALL_READS = 120;
const DEMO_ALL_WINDOW_MS = 60 * 60_000;

export type DemoReadAnswer = "ok" | "slow_down" | "demo_busy";

/**
 * Limits shelf reads on the public demo, each of which is a paid vision model call: ten a minute
 * per caller, and 120 an hour across everyone. A refused read is not counted. In memory per server
 * instance, like the stand gate.
 */
export function createDemoReadGate(): (caller: string, now?: number) => DemoReadAnswer {
  const byCaller = new Map<string, number[]>();
  let all: number[] = [];
  return (caller, now = Date.now()) => {
    const mine = (byCaller.get(caller) ?? []).filter((t) => now - t < DEMO_CALLER_WINDOW_MS);
    if (mine.length >= DEMO_CALLER_READS) return "slow_down";
    all = all.filter((t) => now - t < DEMO_ALL_WINDOW_MS);
    if (all.length >= DEMO_ALL_READS) return "demo_busy";
    if (byCaller.size >= MAX_TRACKED_CALLERS) byCaller.clear();
    mine.push(now);
    byCaller.set(caller, mine);
    all.push(now);
    return "ok";
  };
}

export const demoReadGate = createDemoReadGate();
