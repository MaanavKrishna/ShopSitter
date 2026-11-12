import { z } from "zod";
import { saveProduct } from "@/lib/catalogue";
import { ownerRoute } from "@/lib/owner-http";
import { centsFromDollars, MAX_DESCRIPTION, MAX_NAME, MAX_PRICE_CENTS, MAX_STOCK, SKU_PATTERN } from "@/lib/products";
import { getRepo } from "@/lib/repo";
import { ZONE_ID, findZone } from "@/lib/store";
import { trialHasRoomFor } from "@/lib/trials";
import { EditError, editRoute } from "./edit";
import { refuseNonJson } from "@/lib/http";

const cents = z.number().int().min(0).max(MAX_PRICE_CENTS);

const Body = z
  .object({
    sku: z.string().regex(SKU_PATTERN),
    name: z.string().trim().min(1).max(MAX_NAME),
    description: z.string().trim().max(MAX_DESCRIPTION),
    /** The price as the owner typed it, in dollars. Turned into cents here. */
    price: z.string().max(12).optional(),
    priceCents: cents.optional(),
    /** The count before anything was taken. Left out on an edit, it stays as it is; the restock route sets it from a shelf count. */
    stock: z.number().int().min(0).max(MAX_STOCK).optional(),
    /** True when adding: a product on sale with this sku is then left alone. A removed one comes back. */
    create: z.boolean().optional(),
    /** The shelf the product is kept on, or null for anywhere. Left out on an edit, it stays as it is. */
    zoneId: z.string().regex(ZONE_ID).nullable().optional(),
  })
  .transform((body, ctx) => {
    const { price, priceCents, create, ...rest } = body;
    const value = price === undefined ? priceCents : (centsFromDollars(price) ?? undefined);
    const checked = cents.safeParse(value);
    if (!checked.success || (price !== undefined && priceCents !== undefined)) {
      ctx.addIssue({ code: "custom", message: "price", path: ["price"] });
      return z.NEVER;
    }
    return { fields: { ...rest, priceCents: checked.data }, create: create ?? false };
  });

export async function GET() {
  return ownerRoute(async (shop) => ({ products: await getRepo().listProducts(shop) }));
}

export async function PUT(req: Request) {
  const notJson = refuseNonJson(req);
  if (notJson) return notJson;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return editRoute(async (shop) => {
    if (!parsed.success) throw new EditError("bad_request", 400);
    const { fields, create } = parsed.data;
    // Only a trial stand has a limit on how many products it may have on sale.
    if (!(await trialHasRoomFor(getRepo(), shop, fields.sku))) throw new EditError("trial_limit", 403);
    // A product can only be put on a shelf this stand has.
    if (fields.zoneId && !(await findZone(getRepo(), shop, fields.zoneId))) throw new EditError("bad_request", 400);
    const product = await saveProduct(getRepo(), shop, fields, create);
    if (product === "sku_taken") throw new EditError("sku_taken", 409);
    return { product };
  });
}
