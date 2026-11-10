import type { BillLine, Line, PricedBill, Product } from "./types";

/** 1700 -> "17.00". All money is integer cents until it reaches PayPal or the screen. */
export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Prices lines from the catalogue. Unknown products and non-positive quantities are dropped. */
export function priceLines(lines: Line[], products: Product[]): PricedBill {
  const bySku = new Map(products.map((p) => [p.sku, p]));
  const priced: BillLine[] = [];
  for (const { sku, qty } of lines) {
    const product = bySku.get(sku);
    if (!product || qty <= 0) continue;
    priced.push({ sku, name: product.name, qty, unitCents: product.priceCents, lineCents: product.priceCents * qty });
  }
  return { lines: priced, totalCents: priced.reduce((sum, l) => sum + l.lineCents, 0) };
}
