// How many people stopped at the stand each day. Only a number is kept: no pictures, no identities.
import type { Repo } from "./repo";
import type { Shop } from "./types";

const DAY_MS = 86_400_000;
const key = (shop: Shop, t: number) => `${shop}-footfall-${new Date(t).toISOString().slice(0, 10)}.json`;

async function countOn(repo: Repo, shop: Shop, t: number): Promise<number> {
  const bytes = await repo.getPhoto(key(shop, t));
  if (!bytes) return 0;
  try {
    const n = (JSON.parse(new TextDecoder().decode(bytes)) as { count?: unknown }).count;
    return typeof n === "number" && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function addVisitor(repo: Repo, shop: Shop, now: number) {
  const count = (await countOn(repo, shop, now)) + 1;
  await repo.savePhoto(key(shop, now), new TextEncoder().encode(JSON.stringify({ count })));
}

/** People who stopped by today and on the days before it, `days` days in all. */
export async function visitorsSince(repo: Repo, shop: Shop, days: number, now: number): Promise<number> {
  const counts = await Promise.all(Array.from({ length: days }, (_, i) => countOn(repo, shop, now - i * DAY_MS)));
  return counts.reduce((a, b) => a + b, 0);
}
