// The three kinds of stand and which stored keys belong to which. No server-only imports,
// so screens can use these too.
import type { Shop, TrialShop } from "./types";

export type ShopKind = "live" | "demo" | "trial";

const TRIAL_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const TRIAL_ID = /^t-[a-z2-7]{10}$/;
/** A stored key that belongs to a trial: the whole id, then a dash. */
const TRIAL_KEY = /^(t-[a-z2-7]{10})-/;
/** Stored keys are plain file names: nothing that could step out of a folder. ("+" appears when a time is written as 1e+21.) */
const PLAIN_KEY = /^[A-Za-z0-9._+-]+$/;

export const isTrial = (shop: unknown): shop is TrialShop => typeof shop === "string" && TRIAL_ID.test(shop);

/** The shop a piece of outside text names, or null. Only "live", "demo" and well-formed trial ids pass. */
export function parseShop(text: unknown): Shop | null {
  if (text === "live" || text === "demo") return text;
  return isTrial(text) ? text : null;
}

export const shopKind = (shop: Shop): ShopKind => (shop === "live" || shop === "demo" ? shop : "trial");

/** A new trial id: fifty random bits as ten base32 characters. */
export function newTrialId(): TrialShop {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `t-${Array.from(bytes, (b) => TRIAL_ALPHABET[b & 31]).join("")}`;
}

/**
 * The shop a stored key belongs to, read from the start of the key, or null when it names none.
 * Every stored key begins with its shop's id and a dash. Trial ids have a fixed length, so one
 * trial's id is never the start of another's.
 */
export function shopOfKey(key: string): Shop | null {
  if (!PLAIN_KEY.test(key) || key.includes("..")) return null;
  const trial = TRIAL_KEY.exec(key);
  if (trial) return trial[1] as TrialShop;
  if (key.startsWith("demo-")) return "demo";
  if (key.startsWith("live-")) return "live";
  return null;
}

/** True when the stored key belongs to this shop and to no other. */
export const ownsKey = (shop: Shop, key: string): boolean => shopOfKey(key) === shop;
