// The token inside a shop's door QR. A shopper's phone sends it to check in. It is made by the
// server, names the shop, when it stops working and the store's door number, and is signed so none
// can be changed. The owner makes a new door QR by moving the door number on: older codes stop working.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Repo } from "./repo";
import { isTrial } from "./shops";
import { getStore } from "./store";
import { getTrial } from "./trials";
import type { Shop } from "./types";

/**
 * "d" . shop . expiry in base 36 ("0" = no expiry) . ["e" door number in base 36, absent for 0] .
 * the first 16 bytes of the signature as 22 URL-safe characters
 */
const SHAPE = /^d\.(live|t-[a-z2-7]{10})\.([0-9a-z]{1,11})\.(?:e([1-9a-z][0-9a-z]{0,6})\.)?([A-Za-z0-9_-]{22})$/;

// The signed text starts with its own purpose, so this signature can never pass as a stand key's
// ("stand-key:") or the owner cookie's (the bare shop id), or the other way round. Door number 0
// signs the same text as before door numbers existed, so codes already printed keep working.
const mac = (shop: string, expiry: string, epoch: number, secret: string) =>
  createHmac("sha256", secret)
    .update(epoch === 0 ? `door-token:${shop}:${expiry}` : `door-token:${shop}:${expiry}:${epoch}`)
    .digest()
    .subarray(0, 16)
    .toString("base64url");

/**
 * A door token for the owner's stand (no expiry: pass null) or a trial stand (expires with the trial).
 * The demo stand has no door.
 */
export function signDoorToken(
  shop: string,
  expiresAt: number | null,
  secret: string | undefined = process.env.SESSION_SECRET,
  /** The store's door number (lib/store.ts). */
  epoch = 0,
): string {
  if (!secret) throw new Error("SESSION_SECRET must be set");
  if (!Number.isSafeInteger(epoch) || epoch < 0 || epoch > 2_000_000_000) throw new Error("bad door number");
  if (shop !== "live" && !isTrial(shop)) throw new Error("door tokens are for the owner's stand and trial stands only");
  if (isTrial(shop) && expiresAt === null) throw new Error("a trial's door token must expire");
  if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt <= 0)) throw new Error("bad expiry");
  const expiry = expiresAt === null ? "0" : expiresAt.toString(36);
  const door = epoch === 0 ? "" : `e${epoch.toString(36)}.`;
  return `d.${shop}.${expiry}.${door}${mac(shop, expiry, epoch, secret)}`;
}

export type DoorToken = { shop: Exclude<Shop, "demo">; expiresAt: number | null; expired: boolean; epoch: number };

/** What a token says, or null when it is not a door token this server signed. */
export function verifyDoorToken(
  token: string | null | undefined,
  now: number,
  secret: string | undefined = process.env.SESSION_SECRET,
): DoorToken | null {
  if (!token || !secret) return null;
  const match = SHAPE.exec(token);
  if (!match) return null;
  const [, shop, expiry, door, given] = match;
  const epoch = door === undefined ? 0 : parseInt(door, 36);
  const expiresAt = expiry === "0" ? null : parseInt(expiry, 36);
  // One spelling per expiry: no leading zeros. A trial's token always carries an expiry.
  if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt.toString(36) !== expiry)) return null;
  if (expiresAt === null && shop !== "live") return null;
  const expected = Buffer.from(mac(shop, expiry, epoch, secret));
  const got = Buffer.from(given);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  return { shop: shop as DoorToken["shop"], expiresAt, expired: expiresAt !== null && now >= expiresAt, epoch };
}

/**
 * Whether a door QR's token lets a shopper in now: signed here ("bad_store" if not), carrying the
 * store's current door number ("bad_store" once the owner made a new QR), and not past its expiry
 * or its trial's end ("store_closed").
 */
export async function admitDoor(
  repo: Repo,
  token: string,
  now: number,
  secret: string | undefined = process.env.SESSION_SECRET,
): Promise<{ shop: DoorToken["shop"] } | { error: "bad_store" | "store_closed" }> {
  const door = verifyDoorToken(token, now, secret);
  if (!door) return { error: "bad_store" };
  if (door.expired || (isTrial(door.shop) && !(await getTrial(repo, door.shop, now)))) return { error: "store_closed" };
  if (door.epoch !== ((await getStore(repo, door.shop)).doorEpoch ?? 0)) return { error: "bad_store" };
  return { shop: door.shop };
}
