import { getRepo } from "@/lib/repo";
import { StoreError, ZonesBody, saveZones } from "@/lib/store";
import { storeWrite } from "../shared";
import { refuseNonJson } from "@/lib/http";

/**
 * Replaces the stand's shelves with the list sent. A shelf keeps its id when one is given; products
 * on a shelf that is no longer listed go back to "anywhere". 403 "zone_limit" for more shelves
 * than the stand may have.
 */
export async function PUT(req: Request) {
  const notJson = refuseNonJson(req);
  if (notJson) return notJson;
  const parsed = ZonesBody.safeParse(await req.json().catch(() => null));
  return storeWrite(async (shop) => {
    if (!parsed.success) throw new StoreError("bad_request", 400);
    return { zones: await saveZones(getRepo(), shop, parsed.data.zones) };
  });
}
