import { getRepo } from "@/lib/repo";
import { SettingsBody, StoreError, saveSettings } from "@/lib/store";
import { holdFigures, storeWrite } from "../shared";
import { refuseNonJson } from "@/lib/http";

/** Sets how shoppers pay and the limits of the hold. Amounts are whole cents; the floor is at most the cap, the cap at most $500. */
export async function PUT(req: Request) {
  const notJson = refuseNonJson(req);
  if (notJson) return notJson;
  const parsed = SettingsBody.safeParse(await req.json().catch(() => null));
  return storeWrite(async (shop) => {
    if (!parsed.success) throw new StoreError("bad_request", 400);
    const repo = getRepo();
    const settings = await saveSettings(repo, shop, parsed.data);
    const { suggestedHoldCents } = await holdFigures(repo, shop, settings, Date.now());
    return { settings, suggestedHoldCents };
  });
}
