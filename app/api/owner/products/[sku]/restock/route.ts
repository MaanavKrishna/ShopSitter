import { z } from "zod";
import { restockProduct } from "@/lib/catalogue";
import { MAX_STOCK, SKU_PATTERN } from "@/lib/products";
import { getRepo } from "@/lib/repo";
import { EditError, editRoute } from "../../edit";
import { refuseNonJson } from "@/lib/http";

const Body = z.object({ left: z.number().int().min(0).max(MAX_STOCK) });

/** The owner has refilled the shelf: `left` is how many units of this product are on it now. */
export async function POST(req: Request, ctx: RouteContext<"/api/owner/products/[sku]/restock">) {
  const notJson = refuseNonJson(req);
  if (notJson) return notJson;
  const { sku } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return editRoute(async (shop) => {
    if (!SKU_PATTERN.test(sku) || !parsed.success) throw new EditError("bad_request", 400);
    const result = await restockProduct(getRepo(), shop, sku, parsed.data.left);
    if (!result) throw new EditError("not_found", 404);
    return result;
  });
}
