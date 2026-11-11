// The key a trial stand's devices send instead of a typed code. It is made by the server, carries
// the trial's id and when it stops working, and is signed so neither can be changed.
import { createHmac, timingSafeEqual } from "node:crypto";
import { isTrial } from "./shops";
import type { TrialShop } from "./types";

/** shop . expiry in base 36 . the first 16 bytes of the signature as 22 URL-safe characters */
const SHAPE = /^(t-[a-z2-7]{10})\.([0-9a-z]{1,11})\.([A-Za-z0-9_-]{22})$/;

// The text that is signed starts with its purpose, so this signature can never pass as the owner
// cookie's (which signs the bare shop id) or the other way round.
const mac = (shop: string, expiry: string, secret: string) =>
  createHmac("sha256", secret).update(`stand-key:${shop}:${expiry}`).digest().subarray(0, 16).toString("base64url");

/** A key for the trial's stand devices. Only trial stands can have one: the live stand keeps its typed code. */
export function signStandKey(shop: string, expiresAt: number, secret: string | undefined = process.env.SESSION_SECRET): string {
  if (!secret) throw new Error("SESSION_SECRET must be set");
  if (!isTrial(shop)) throw new Error("stand keys are for trial stands only");
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new Error("bad expiry");
  const expiry = expiresAt.toString(36);
  return `${shop}.${expiry}.${mac(shop, expiry, secret)}`;
}

export type StandKey = { shop: TrialShop; expiresAt: number; expired: boolean };

/**
 * What a key says, or null when it is not a key this server signed. A key past its time is still
 * recognised (`expired`), so a stand whose trial has ended can be told so and is not treated as a guess.
 */
export function verifyStandKey(
  token: string | null | undefined,
  now: number,
  secret: string | undefined = process.env.SESSION_SECRET,
): StandKey | null {
  if (!token || !secret) return null;
  const match = SHAPE.exec(token);
  if (!match) return null;
  const [, shop, expiry, given] = match;
  const expiresAt = parseInt(expiry, 36);
  // One spelling per expiry: no leading zeros.
  if (!Number.isSafeInteger(expiresAt) || expiresAt.toString(36) !== expiry) return null;
  const expected = Buffer.from(mac(shop, expiry, secret));
  const got = Buffer.from(given);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  return { shop: shop as TrialShop, expiresAt, expired: now >= expiresAt };
}
