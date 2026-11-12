import { allow } from "@/lib/auth";
import { HOLD_BASIS_DAYS, holdBasis, suggestedHoldCents } from "@/lib/hold";
import { currentShop } from "@/lib/owner-http";
import type { Repo } from "@/lib/repo";
import { StoreError, type StoreSettings } from "@/lib/store";
import type { Shop } from "@/lib/types";

const refuse = (error: string, status: number) => Response.json({ error }, { status });

/** Runs a route that reads the store record: 401 when not signed in. Every stand may read its own, the demo stand included. */
export async function storeRead<T>(work: (shop: Shop) => Promise<T>): Promise<Response> {
  const shop = await currentShop();
  if (!shop) return refuse("unauthorized", 401);
  try {
    return Response.json(await work(shop));
  } catch (e) {
    console.error(e);
    return refuse("server_error", 500);
  }
}

/**
 * Runs a route that changes the store record: 401 when not signed in, 403 for the demo stand
 * (its passcode is public, so its layout and pay settings stay as they are), and 429 for more
 * than thirty changes a minute to one stand.
 */
export async function storeWrite<T>(work: (shop: Shop) => Promise<T>): Promise<Response> {
  const shop = await currentShop();
  if (!shop) return refuse("unauthorized", 401);
  if (shop === "demo") return refuse("demo_read_only", 403);
  if (!allow(`store-write:${shop}`, 30, 60_000)) return refuse("slow_down", 429);
  try {
    return Response.json(await work(shop));
  } catch (e) {
    if (e instanceof StoreError) return refuse(e.code, e.status);
    console.error(e);
    return refuse("server_error", 500);
  }
}

/** The hold a shopper would be asked for now, and how many paid visits of the last 30 days it rests on. */
export async function holdFigures(repo: Repo, shop: Shop, settings: StoreSettings, now: number) {
  const paid = holdBasis(await repo.listVisits(shop, now - HOLD_BASIS_DAYS * 86_400_000), now);
  return {
    suggestedHoldCents: suggestedHoldCents(paid, settings),
    holdBasis: { visits: paid.length, days: HOLD_BASIS_DAYS },
  };
}
