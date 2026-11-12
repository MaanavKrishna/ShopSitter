import { allow, callerOf } from "@/lib/auth";
import { admitDoor } from "@/lib/door-token";
import { getRepo } from "@/lib/repo";
import type { Shop } from "@/lib/types";
import { refuse } from "./shared";

const HOUR_MS = 60 * 60_000;
/** Calls one caller may make in an hour, and one shop may take in a day, for each kind of door call. */
const PER_CALLER_HOUR = 10;
const PER_SHOP_DAY = 300;

/**
 * The checks a door QR's token goes through before check-in or a peek: the caller's allowance,
 * the signature, the store's door number, the expiry (a trial's door closes with the trial) and the
 * shop's daily allowance.
 * Answers the shop, or the refusal to send.
 */
export async function openDoor(req: Request, kind: "check-in" | "peek", token: string, now: number): Promise<{ shop: Shop } | Response> {
  if (!allow(`${kind}:${callerOf(req)}`, PER_CALLER_HOUR, HOUR_MS)) return refuse("slow_down", 429);
  const door = await admitDoor(getRepo(), token, now);
  if ("error" in door) return door.error === "store_closed" ? refuse("store_closed", 410) : refuse("bad_store", 400);
  if (!allow(`${kind}-shop:${door.shop}`, PER_SHOP_DAY, 24 * HOUR_MS)) return refuse("store_busy", 429);
  return { shop: door.shop };
}
