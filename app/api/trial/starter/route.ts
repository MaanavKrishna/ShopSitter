import { currentShop } from "@/lib/owner-http";
import { getRepo } from "@/lib/repo";
import { isTrial } from "@/lib/shops";
import { addStarterProducts } from "@/lib/trials";

/** Adds the suggested everyday products to this browser's trial stand. Ones it already has are left alone. */
export async function POST() {
  try {
    const shop = await currentShop();
    if (!shop) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (!isTrial(shop)) return Response.json({ error: "not_a_trial" }, { status: 403 });
    const repo = getRepo();
    const added = await addStarterProducts(repo, shop);
    return Response.json({ added, products: await repo.listProducts(shop) });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
