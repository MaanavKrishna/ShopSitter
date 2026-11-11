import { ownerRoute } from "@/lib/owner-http";
import { OwnerError } from "@/lib/owner";
import { getRepo } from "@/lib/repo";
import { isTrial } from "@/lib/shops";
import { signStandKey } from "@/lib/stand-key";
import { getTrial } from "@/lib/trials";
import { standLinkFor } from "../../trial/shared";

/**
 * How this stand's devices prove themselves. A trial stand gets a signed key that lasts as long
 * as the trial. The live stand keeps its typed code, which is never sent from here. The demo
 * stand has no camera.
 */
export async function GET() {
  return ownerRoute(async (shop) => {
    if (shop === "demo") throw new OwnerError("demo_no_stand", 403);
    if (!isTrial(shop)) return { mode: "code" as const };
    const trial = await getTrial(getRepo(), shop, Date.now());
    if (!trial) throw new OwnerError("not_found", 404);
    const key = signStandKey(trial.shop, trial.expiresAt);
    return { mode: "key" as const, key, expiresAt: trial.expiresAt, standLink: standLinkFor(key) };
  });
}
