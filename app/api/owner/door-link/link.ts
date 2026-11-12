import { signDoorToken } from "@/lib/door-token";
import { OwnerError } from "@/lib/owner";
import { getRepo } from "@/lib/repo";
import { isTrial } from "@/lib/shops";
import { getStore } from "@/lib/store";
import { getTrial } from "@/lib/trials";
import type { Shop } from "@/lib/types";

/**
 * The link inside the shop's door QR. The token rides after the "#", which browsers keep to
 * themselves, so it never reaches a request log. A trial's link stops working with the trial;
 * any shop's stops working when the owner makes a new door QR. The demo stand has no door.
 */
export async function doorLinkFor(shop: Shop): Promise<string> {
  if (shop === "demo") throw new OwnerError("demo_no_stand", 403);
  const repo = getRepo();
  let expiresAt: number | null = null;
  if (isTrial(shop)) {
    const trial = await getTrial(repo, shop, Date.now());
    if (!trial) throw new OwnerError("not_found", 404);
    expiresAt = trial.expiresAt;
  }
  const epoch = (await getStore(repo, shop)).doorEpoch ?? 0;
  return `/enter#store=${signDoorToken(shop, expiresAt, undefined, epoch)}`;
}
