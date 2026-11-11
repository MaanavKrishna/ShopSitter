// The demo stand's passcode is public, so anyone can settle or correct its visits.
// It puts itself back to the seeded example week once an hour, when someone next looks at it.
import type { Repo } from "./repo";
import { seedExamples } from "./seed";
import { expireIfStale } from "./visits";

export const DEMO_RESET_AFTER_MS = 60 * 60_000;
/** Starts with the shop's name, like every stored key that belongs to one shop. */
const KEY = "demo-last-reset.json";

async function lastReset(repo: Repo): Promise<number> {
  const bytes = await repo.getPhoto(KEY);
  if (!bytes) return 0;
  try {
    const at = (JSON.parse(new TextDecoder().decode(bytes)) as { at?: unknown }).at;
    return typeof at === "number" ? at : 0;
  } catch {
    return 0;
  }
}

// Requests that arrive together on one server instance share a single reset.
const running = new WeakMap<Repo, Promise<boolean>>();

/**
 * Resets the demo stand when its last reset is more than an hour old. Returns whether it did.
 * It waits while a demo bill is still open, so nobody's pay page vanishes mid-visit.
 * Two server instances may both reset at once; the reset writes the same visits under the
 * same ids each time, so the result is the same. Only ever touches the demo stand.
 */
export function healDemo(
  repo: Repo,
  now: number,
  reset: (repo: Repo, now: number) => Promise<void> = (r, t) => seedExamples(r, "demo", t),
): Promise<boolean> {
  const inFlight = running.get(repo);
  if (inFlight) return inFlight;
  const work = (async () => {
    if (now - (await lastReset(repo)) < DEMO_RESET_AFTER_MS) return false;
    const open = await repo.getOpenVisit("demo");
    if (open && expireIfStale(open, now) === open) return false;
    await reset(repo, now);
    // Written after the reset: on Postgres a reset clears the shop's stored keys, this one included.
    await repo.savePhoto(KEY, new TextEncoder().encode(JSON.stringify({ at: now })));
    return true;
  })().finally(() => running.delete(repo));
  running.set(repo, work);
  return work;
}
