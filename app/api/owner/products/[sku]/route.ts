import { archiveProduct } from "@/lib/catalogue";
import { SKU_PATTERN } from "@/lib/products";
import { getRepo } from "@/lib/repo";
import { EditError, editRoute } from "../edit";

/**
 * Takes a product off sale and deletes its reference photo. The product itself is kept, archived,
 * so visits that include it keep their lines, names and value.
 */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/owner/products/[sku]">) {
  const { sku } = await ctx.params;
  return editRoute(async (shop) => {
    if (!SKU_PATTERN.test(sku)) throw new EditError("bad_request", 400);
    if (!(await archiveProduct(getRepo(), shop, sku))) throw new EditError("not_found", 404);
    return { deleted: sku };
  });
}
