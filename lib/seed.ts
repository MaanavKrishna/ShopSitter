import { getRepo } from "./repo";
import type { Product, Shop } from "./types";

const item = (sku: string, name: string, description: string, priceCents: number): Omit<Product, "shop"> => ({
  sku,
  name,
  description,
  priceCents,
  stock: 6,
  refImageUrl: null,
});

/** The starter catalogue: six visually distinct products for one shelf. */
const CATALOGUE = [
  item("honey", "Honey", "Glass jar of golden honey with a yellow lid", 700),
  item("jam", "Strawberry jam", "Small glass jar of red jam with a checked cloth lid", 600),
  item("bread", "Sourdough loaf", "Round loaf of bread in a brown paper bag", 500),
  item("eggs", "Half-dozen eggs", "Grey cardboard box of six eggs", 450),
  item("apples", "Bag of apples", "Clear bag of red apples", 400),
  item("flowers", "Bunch of flowers", "Small bunch of mixed flowers tied with string", 800),
];

export const productsFor = (shop: Shop): Product[] => CATALOGUE.map((p) => ({ ...p, shop }));

export const DEMO_PRODUCTS: Product[] = productsFor("demo");

/** Replaces a shop's products with the starter catalogue and clears its visits. */
export async function seedShop(shop: Shop): Promise<void> {
  await getRepo().resetShop(shop, productsFor(shop));
}
