import { activeProduct } from "@/lib/catalogue";
import { isOwnRefPhoto, MAX_PHOTO_BYTES, refPhotoKey, refPhotoProblem, SKU_PATTERN } from "@/lib/products";
import { getRepo } from "@/lib/repo";
import type { Product, Shop } from "@/lib/types";
import { EditError, editRoute } from "../../edit";
import { refuseNonJson } from "@/lib/http";

async function findProduct(shop: Shop, sku: string): Promise<Product> {
  if (!SKU_PATTERN.test(sku)) throw new EditError("bad_request", 400);
  const product = await activeProduct(getRepo(), shop, sku);
  if (!product) throw new EditError("not_found", 404);
  return product;
}

/** Stores a reference photo for a product: what the vision model is shown so it can tell products apart. */
export async function POST(req: Request, ctx: RouteContext<"/api/owner/products/[sku]/photo">) {
  const notJson = refuseNonJson(req, true);
  if (notJson) return notJson;
  const { sku } = await ctx.params;
  return editRoute(async (shop) => {
    const product = await findProduct(shop, sku);
    // Turn an oversized upload away on its declared length, before reading it.
    if (Number(req.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES + 64 * 1024) {
      throw new EditError("photo_too_large", 413);
    }
    const form = await req.formData().catch(() => null);
    const file = form?.get("photo");
    if (!(file instanceof File)) throw new EditError("bad_request", 400);
    if (file.size > MAX_PHOTO_BYTES) throw new EditError("photo_too_large", 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    // JPEG only, told from the bytes: every stored photo is served and labelled as JPEG.
    const problem = refPhotoProblem(bytes);
    if (problem) throw new EditError(problem, 415);

    const repo = getRepo();
    // A new key each time, so a replaced photo is never served from a browser's cache.
    const refImageUrl = await repo.savePhoto(refPhotoKey(shop, sku, Date.now()), bytes);
    const updated = { ...product, refImageUrl };
    await repo.upsertProduct(updated);
    if (isOwnRefPhoto(shop, product.refImageUrl) && product.refImageUrl !== refImageUrl) {
      await repo.deletePhoto(product.refImageUrl);
    }
    return { product: updated };
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/owner/products/[sku]/photo">) {
  const { sku } = await ctx.params;
  return editRoute(async (shop) => {
    const product = await findProduct(shop, sku);
    const updated = { ...product, refImageUrl: null };
    await getRepo().upsertProduct(updated);
    if (isOwnRefPhoto(shop, product.refImageUrl)) await getRepo().deletePhoto(product.refImageUrl);
    return { product: updated };
  });
}
