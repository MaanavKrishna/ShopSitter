// Extra cameras looking at the same shelf from other sides.
// Each one keeps sending its newest still. When the main camera reports a change, the
// newest still of every active extra camera is paired with the one used at the last read.
import type { Repo } from "./repo";
import type { Shop } from "./types";

/** The main camera is angle 1; extra cameras take these numbers. */
export const EXTRA_ANGLES = [2, 3, 4] as const;
export type AnglePair = { angle: number; before: Uint8Array; after: Uint8Array };

const ACTIVE_MS = 60_000; // a camera that has sent nothing for this long is treated as switched off
const WAIT_STEP_MS = 250;
const MAX_WAIT_MS = 1200; // how long a read waits for an extra camera's photo of the changed shelf

// A zone's extra cameras keep their own stills; a stand with no zones keeps the keys it always had.
const key = (shop: Shop, zoneId: string | null, angle: number, part: string) =>
  zoneId ? `${shop}-zone-${zoneId}-angle-${angle}-${part}` : `${shop}-angle-${angle}-${part}`;
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

async function latestAt(repo: Repo, shop: Shop, zoneId: string | null, angle: number): Promise<number | null> {
  const bytes = await repo.getPhoto(key(shop, zoneId, angle, "meta.json"));
  if (!bytes) return null;
  try {
    const at = (JSON.parse(new TextDecoder().decode(bytes)) as { latestAt?: unknown }).latestAt;
    return typeof at === "number" ? at : null;
  } catch {
    return null;
  }
}

/** Stores an extra camera's newest still. */
export async function saveAngleShot(
  repo: Repo,
  shop: Shop,
  angle: number,
  photo: Uint8Array,
  takenAt: number,
  zoneId: string | null = null,
) {
  await repo.savePhoto(key(shop, zoneId, angle, "latest.jpg"), photo);
  await repo.savePhoto(key(shop, zoneId, angle, "meta.json"), encode({ latestAt: takenAt }));
}

type Clock = { now: () => number; sleep: (ms: number) => Promise<void> };
const realClock: Clock = { now: Date.now, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/**
 * Before and after photos from every active extra camera, for a change that began at
 * `changeStartedAt`. Waits briefly for cameras that have not yet sent a photo of the changed
 * shelf. The photos used as "after" become "before" for the next read. With a zone, only that
 * zone's cameras are read.
 */
export async function readAngles(
  repo: Repo,
  shop: Shop,
  changeStartedAt: number,
  clock: Clock = realClock,
  zoneId: string | null = null,
): Promise<AnglePair[]> {
  const cutoff = clock.now() - ACTIVE_MS;
  const times = await Promise.all(EXTRA_ANGLES.map((a) => latestAt(repo, shop, zoneId, a)));
  const active = EXTRA_ANGLES.filter((_, i) => times[i] !== null && times[i]! >= cutoff);
  if (active.length === 0) return [];

  let pending = active.filter((a) => times[EXTRA_ANGLES.indexOf(a)]! < changeStartedAt);
  for (let waited = 0; pending.length > 0 && waited < MAX_WAIT_MS; waited += WAIT_STEP_MS) {
    await clock.sleep(WAIT_STEP_MS);
    const fresh = await Promise.all(pending.map((a) => latestAt(repo, shop, zoneId, a)));
    pending = pending.filter((_, i) => (fresh[i] ?? 0) < changeStartedAt);
  }

  const pairs: AnglePair[] = [];
  for (const angle of active) {
    const [before, after] = await Promise.all([
      repo.getPhoto(key(shop, zoneId, angle, "base.jpg")),
      repo.getPhoto(key(shop, zoneId, angle, "latest.jpg")),
    ]);
    if (!after) continue;
    if (before) pairs.push({ angle, before, after });
    await repo.savePhoto(key(shop, zoneId, angle, "base.jpg"), after);
  }
  return pairs;
}
