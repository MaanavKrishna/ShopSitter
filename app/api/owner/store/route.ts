import { getRepo } from "@/lib/repo";
import { getStore } from "@/lib/store";
import { holdFigures, storeRead } from "./shared";

/** The stand's shelves, how its shoppers pay, and the hold a shopper would be asked for now. */
export async function GET() {
  return storeRead(async (shop) => {
    const repo = getRepo();
    const { zones, settings } = await getStore(repo, shop);
    return { zones, settings, ...(await holdFigures(repo, shop, settings, Date.now())) };
  });
}
