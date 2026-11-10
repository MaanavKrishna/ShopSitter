export type Shop = "live" | "demo";

/** A product id with a quantity. In a shelf change, a negative qty means "put back". */
export type Line = { sku: string; qty: number };

export type Product = {
  shop: Shop;
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  stock: number;
  refImageUrl: string | null;
};

export type BillLine = { sku: string; name: string; qty: number; unitCents: number; lineCents: number };

export type PricedBill = { lines: BillLine[]; totalCents: number };
