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
  /**
   * True once the owner has removed the product. It is kept so past visits still have its name
   * and price, but it is no longer sold: not listed, not offered on bills, not shown to the vision model.
   */
  archived?: boolean;
};

export type BillLine = { sku: string; name: string; qty: number; unitCents: number; lineCents: number };

export type PricedBill = { lines: BillLine[]; totalCents: number };
