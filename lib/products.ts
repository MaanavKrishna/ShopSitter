import type { Product, Shop } from "./types";

// The rules for a product in the catalogue. Pure, so the editor and the server check the same way.

export const SKU_PATTERN = /^[a-z0-9-]{1,32}$/;
export const MAX_NAME = 60;
export const MAX_DESCRIPTION = 200;
export const MAX_PRICE_CENTS = 1_000_00;
export const MAX_STOCK = 999;
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

/**
 * "7.10" -> 710. Works on the digits, never on a float, so nothing drifts.
 * Null for negatives, more than two decimals and anything that is not a plain amount.
 */
export function centsFromDollars(input: string): number | null {
  const match = /^\$?(\d{0,7})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const [, whole, part] = match;
  if (!whole && !part) return null;
  return Number(whole || "0") * 100 + Number((part ?? "").padEnd(2, "0"));
}

/** A short id made from the product's name, with a number added when that id is taken. Empty when the name has no letters or digits. */
export function suggestSku(name: string, taken: readonly string[]): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28)
    .replace(/-+$/, "");
  if (!base) return "";
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    const next = `${base}-${n}`;
    if (!taken.includes(next)) return next;
  }
}

export type ProductForm = { sku: string; name: string; description: string; price: string; stock: string };
export type ProductFields = Omit<Product, "shop" | "refImageUrl">;
export type ProductFormErrors = Partial<Record<keyof ProductForm, string>>;

/** Checks what the owner typed. Either the product's fields ready to store, or a message for each field that is wrong. */
export function checkProductForm(
  form: ProductForm,
): { ok: true; value: ProductFields } | { ok: false; errors: ProductFormErrors } {
  const errors: ProductFormErrors = {};
  const name = form.name.trim();
  const description = form.description.trim();
  const sku = form.sku.trim();

  if (!name) errors.name = "Give the product a name.";
  else if (name.length > MAX_NAME) errors.name = `Keep the name to ${MAX_NAME} characters.`;

  if (description.length > MAX_DESCRIPTION) errors.description = `Keep this to ${MAX_DESCRIPTION} characters.`;

  if (!SKU_PATTERN.test(sku)) errors.sku = "Use up to 32 lowercase letters, numbers and dashes.";

  const priceCents = centsFromDollars(form.price);
  if (priceCents === null) errors.price = "Enter a price in dollars, like 7.50.";
  else if (priceCents > MAX_PRICE_CENTS) errors.price = "The highest price is $1,000.";

  const stockText = form.stock.trim();
  const stock = /^\d{1,4}$/.test(stockText) ? Number(stockText) : null;
  if (stock === null) errors.stock = "Enter a whole number, 0 or more.";
  else if (stock > MAX_STOCK) errors.stock = `The most a shelf can hold here is ${MAX_STOCK}.`;

  if (Object.keys(errors).length > 0 || priceCents === null || stock === null) return { ok: false, errors };
  return { ok: true, value: { sku, name, description, priceCents, stock } };
}

export type ImageKind = "jpeg" | "png" | "webp";

/** What kind of picture these bytes are, read from the bytes themselves and not from a file name. */
export function imageKind(bytes: Uint8Array): ImageKind | null {
  const starts = (sig: number[], at = 0) => bytes.length >= at + sig.length && sig.every((b, i) => bytes[at + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return "jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}

/**
 * Why these bytes cannot be a product's reference photo, or null when they can. Only JPEG is taken:
 * stored photos are served, and shown to the vision model, as JPEG. The editor converts before uploading.
 */
export function refPhotoProblem(bytes: Uint8Array): "bad_photo" | "not_jpeg" | null {
  const kind = imageKind(bytes);
  if (kind === null) return "bad_photo";
  return kind === "jpeg" ? null : "not_jpeg";
}

/** Storage key for a product's reference photo. It starts with the shop, which is what the owner photo route checks. */
export function refPhotoKey(shop: Shop, sku: string, at: number): string {
  return `${shop}-ref-${sku}-${at}.jpg`;
}

/** True for a reference photo this shop stored itself (not a public sample file, not a shelf photo, not another shop's). */
export function isOwnRefPhoto(shop: Shop, refImageUrl: string | null): refImageUrl is string {
  return refImageUrl !== null && refImageUrl.startsWith(`${shop}-ref-`);
}
