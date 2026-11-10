import { createHmac, timingSafeEqual } from "node:crypto";
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

/** Cookie value proving which shop's dashboard this browser may see. */
export const ownerCookieValue = (shop: Shop) => `${shop}.${sign(shop)}`;

export function shopFromCookie(value: string | undefined): Shop | null {
  if (!value) return null;
  const [shop, mac] = value.split(".");
  if ((shop !== "live" && shop !== "demo") || !mac) return null;
  return safeEqual(mac, sign(shop)) ? shop : null;
}

// Small in-memory limiter. Good enough to stop a casual loop on one server instance.
const hits = new Map<string, number[]>();
export function allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
