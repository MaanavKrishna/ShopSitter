import { signStandKey } from "@/lib/stand-key";
import type { Trial } from "@/lib/trials";

/**
 * Where a trial's stand device goes: the stand screen, carrying the key. A path, so it works on any
 * host. The key rides after the "#", which browsers keep to themselves: it is never sent to a server
 * or written to a request log.
 */
export const standLinkFor = (key: string) => `/stand#key=${key}`;

/** What the trial routes send about a trial. */
export function trialBody(trial: Trial) {
  const standKey = signStandKey(trial.shop, trial.expiresAt);
  return { shop: trial.shop, expiresAt: trial.expiresAt, standKey, standLink: standLinkFor(standKey) };
}
