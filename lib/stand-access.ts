// Which stand a request from a stand device acts for. The live stand's devices send its typed
// code; a trial stand's devices send the signed key from the trial's stand link.
import { type StandGate, refuseStand } from "./auth";
import { getRepo, type Repo } from "./repo";
import { verifyStandKey } from "./stand-key";
import { findZone, type Zone } from "./store";
import { getTrial } from "./trials";
import type { Shop } from "./types";

/** `zone` is there only when the request named one of the stand's own shelves in `x-stand-zone`. */
export type StandAccess = { shop: Shop; kind: "live" | "trial"; expiresAt?: number; zone?: Zone };

/**
 * For the stand's routes: the stand the request's `x-stand-token` header stands for, or the refusal to send.
 *  - A key this server signed for a trial resolves to that trial while the trial exists. It is
 *    checked first and stays clear of the code limiter: a signed key cannot be guessed, so it
 *    neither needs slowing nor says anything about the live code, and a trial stand is not
 *    stopped by someone else's wrong codes from the same address.
 *  - A signed key whose trial has ended is refused as "trial_ended" and not counted as a guess.
 *  - Everything else goes through the stand gate exactly as before: the live code resolves to
 *    the live stand, and anything wrong (a tampered key included) counts as a wrong code.
 *  - A request may name one of the stand's shelves in `x-stand-zone`. One the stand does not have
 *    is refused as 400 "unknown_zone". Without the header nothing changes.
 */
export async function resolveStand(
  req: Request,
  opts: { gate?: StandGate; repo?: Repo; now?: number } = {},
): Promise<StandAccess | Response> {
  const token = req.headers.get("x-stand-token")?.trim() ?? null;
  const now = opts.now ?? Date.now();
  const key = verifyStandKey(token, now);
  let stand: StandAccess;
  if (key) {
    const trial = key.expired ? null : await getTrial(opts.repo ?? getRepo(), key.shop, now);
    if (!trial) return Response.json({ error: "trial_ended" }, { status: 401 });
    stand = { shop: trial.shop, kind: "trial", expiresAt: trial.expiresAt };
  } else {
    const refusal = refuseStand(req, opts.gate);
    if (refusal) return refusal;
    stand = { shop: "live", kind: "live" };
  }
  // The zone is looked up only after the code or key has passed, and only among this stand's own
  // zones: another shop's zone id is unknown here.
  const zoneId = req.headers.get("x-stand-zone")?.trim();
  if (!zoneId) return stand;
  const zone = await findZone(opts.repo ?? getRepo(), stand.shop, zoneId);
  if (!zone) return Response.json({ error: "unknown_zone" }, { status: 400 });
  return { ...stand, zone };
}

/** The largest still a trial stand may send. The stand screen's 1024-pixel JPEGs are a fraction of this. */
export const TRIAL_MAX_STILL_BYTES = 1_000_000;

const DAY_MS = 24 * 60 * 60_000;
/** Shelf reads one trial may make in a day. Each is a paid vision model call. */
export const TRIAL_READS_PER_DAY = 60;
/** Shelf reads all trials together may make in a day. */
export const TRIAL_READS_ALL_PER_DAY = 600;
const MAX_TRACKED_TRIALS = 5_000;

export type TrialReadAnswer = "ok" | "trial_read_limit" | "trial_busy";

/**
 * Limits shelf reads by trial stands: sixty a day for each trial and 600 a day across all of them.
 * A refused read is not counted. The live stand is never passed through this. In memory per
 * server instance, like the stand gate.
 */
export function createTrialReadGate(): (shop: string, now?: number) => TrialReadAnswer {
  const byTrial = new Map<string, number[]>();
  let all: number[] = [];
  return (shop, now = Date.now()) => {
    const mine = (byTrial.get(shop) ?? []).filter((t) => now - t < DAY_MS);
    if (mine.length >= TRIAL_READS_PER_DAY) return "trial_read_limit";
    all = all.filter((t) => now - t < DAY_MS);
    if (all.length >= TRIAL_READS_ALL_PER_DAY) return "trial_busy";
    if (byTrial.size >= MAX_TRACKED_TRIALS) byTrial.clear();
    mine.push(now);
    byTrial.set(shop, mine);
    all.push(now);
    return "ok";
  };
}

export const trialReadGate = createTrialReadGate();
