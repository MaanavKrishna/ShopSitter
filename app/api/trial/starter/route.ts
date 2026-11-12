import { currentShop } from "@/lib/owner-http";
import { getRepo } from "@/lib/repo";
import { isTrial } from "@/lib/shops";
import { addStarterProducts } from "@/lib/trials";
import { privateJson, refuseNonJson } from "@/lib/http";

/** Adds the suggested everyday products to this browser's trial stand. Ones it already has are left alone. */
export async function POST(req: Request) {
  const notJson = refuseNonJson(req);
  if (notJson) return notJson;
  try {
    const shop = await currentShop();
    if (!shop) return privateJson({ error: "unauthorized" }, 401);
    if (!isTrial(shop)) return privateJson({ error: "not_a_trial" }, 403);
    const repo = getRepo();
    const added = await addStarterProducts(repo, shop);
    return privateJson({ added, products: await repo.listProducts(shop) });
  } catch (e) {
    console.error(e);
    return privateJson({ error: "server_error" }, 500);
  }
}
