import { getRepo } from "./repo";
import type { Line, Product, Shop } from "./types";
import { newVisit, type Visit } from "./visits";

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

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * A week of made-up visits so the demo dashboard has something to show.
 * They carry no PayPal capture, so they can't be refunded; visits a judge pays for can.
 */
export function exampleVisits(shop: Shop, now: number): Visit[] {
  const price = new Map(CATALOGUE.map((p) => [p.sku, p.priceCents]));
  const value = (lines: Line[]) => lines.reduce((sum, l) => sum + (price.get(l.sku) ?? 0) * l.qty, 0);
  const make = (
    n: number,
    daysAgo: number,
    hour: number,
    detected: Line[],
    status: Visit["status"],
    paid: Line[] | null = null,
  ): Visit => {
    // That many days back, at the given hour of the day.
    const at = Math.floor((now - daysAgo * DAY) / DAY) * DAY + hour * HOUR;
    return {
      ...newVisit(`${shop}-example-${n}`, shop, detected, at),
      status,
      paid,
      paidCents: paid ? value(paid) : null,
      confidence: 0.9,
      closedAt: at + 5 * 60_000,
    };
  };
  const full = (n: number, d: number, h: number, lines: Line[]) => make(n, d, h, lines, "paid", lines);

  return [
    full(1, 6, 9, [{ sku: "eggs", qty: 1 }, { sku: "bread", qty: 1 }]),
    full(2, 6, 11, [{ sku: "honey", qty: 1 }]),
    full(3, 5, 10, [{ sku: "apples", qty: 2 }]),
    make(4, 5, 16, [{ sku: "flowers", qty: 1 }], "unmatched"),
    full(5, 4, 9, [{ sku: "jam", qty: 2 }, { sku: "bread", qty: 1 }]),
    make(6, 3, 12, [{ sku: "honey", qty: 2 }], "paid_adjusted", [{ sku: "honey", qty: 1 }]),
    full(7, 3, 15, [{ sku: "eggs", qty: 2 }]),
    full(8, 2, 10, [{ sku: "flowers", qty: 1 }, { sku: "jam", qty: 1 }]),
    make(9, 2, 17, [{ sku: "apples", qty: 1 }], "paid_late", [{ sku: "apples", qty: 1 }]),
    full(10, 1, 9, [{ sku: "bread", qty: 2 }]),
    make(11, 1, 13, [{ sku: "eggs", qty: 1 }], "settled_other"),
    full(12, 1, 16, [{ sku: "honey", qty: 1 }, { sku: "apples", qty: 1 }]),
  ];
}

/** Resets a shop to the starter catalogue with a week of example visits. */
export async function seedShopWithExamples(shop: Shop, now = Date.now()): Promise<void> {
  const repo = getRepo();
  await repo.resetShop(shop, productsFor(shop).map((p) => ({ ...p, stock: 12 })));
  for (const v of exampleVisits(shop, now)) await repo.saveVisit(v);
}
