// Changes the owner makes to the catalogue. Each takes the store, so it can be tested without a server.
import { stockForLeft, takenBySku } from "./owner";
import { isOwnRefPhoto, type ProductFields } from "./products";
import type { Repo } from "./repo";
import type { Product, Shop } from "./types";

const find = async (repo: Repo, shop: Shop, sku: string, includeArchived = false) =>
  (await repo.listProducts(shop, { includeArchived })).find((p) => p.sku === sku) ?? null;

/** A product the shop sells now, or null. */
export const activeProduct = (repo: Repo, shop: Shop, sku: string) => find(repo, shop, sku);

/**
 * Adds or edits a product. Adding with a sku that is in use is refused ("sku_taken"), unless that
 * product was removed: then it comes back with the new details. An edit keeps the photo, and the
 * stock and the zone when none is sent.
 */
export async function saveProduct(
  repo: Repo,
  shop: Shop,
  fields: Omit<ProductFields, "stock"> & { stock?: number },
  create: boolean,
): Promise<Product | "sku_taken"> {
  const existing = await find(repo, shop, fields.sku, true);
  const current = existing && !existing.archived ? existing : null;
  if (create && current) return "sku_taken";
  // The zone stays as it is when an edit does not mention it; null clears it. It is only stored when set.
  const { zoneId: sentZone, ...rest } = fields;
  const zoneId = sentZone === undefined ? (current?.zoneId ?? null) : sentZone;
  const product: Product = {
    ...rest,
    stock: fields.stock ?? current?.stock ?? 0,
    shop,
    refImageUrl: current?.refImageUrl ?? null,
    ...(zoneId ? { zoneId } : {}),
  };
  await repo.upsertProduct(product);
  return product;
}

/**
 * Removes a product from sale without rewriting history: it stays in storage, marked archived,
 * so visits that include it keep their lines and their value. Its reference photo is deleted.
 * False when there is no such product on sale.
 */
export async function archiveProduct(repo: Repo, shop: Shop, sku: string): Promise<boolean> {
  const product = await find(repo, shop, sku);
  if (!product) return false;
  await repo.upsertProduct({ ...product, refImageUrl: null, archived: true });
  if (isOwnRefPhoto(shop, product.refImageUrl)) await repo.deletePhoto(product.refImageUrl);
  return true;
}

/**
 * The owner has refilled the shelf and counted `left` units on it. The stored stock is the count
 * before anything was taken, so it becomes everything taken so far plus what is there now; the
 * shelf list then shows `left`. Null when there is no such product on sale.
 */
export async function restockProduct(
  repo: Repo,
  shop: Shop,
  sku: string,
  left: number,
): Promise<{ product: Product; left: number } | null> {
  const product = await find(repo, shop, sku);
  if (!product) return null;
  const taken = takenBySku(await repo.listVisits(shop)).get(sku) ?? 0;
  const updated = { ...product, stock: stockForLeft(taken, left) };
  await repo.upsertProduct(updated);
  return { product: updated, left };
}
