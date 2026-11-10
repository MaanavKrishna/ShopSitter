import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Repo } from "./repo";
import type { Product, Shop } from "./types";
import type { Visit } from "./visits";

type ProductRow = {
  shop: Shop;
  sku: string;
  name: string;
  description: string;
  price_cents: number;
  stock: number;
  ref_image_url: string | null;
};

const toProduct = (r: ProductRow): Product => ({
  shop: r.shop,
  sku: r.sku,
  name: r.name,
  description: r.description,
  priceCents: r.price_cents,
  stock: r.stock,
  refImageUrl: r.ref_image_url,
});

const toRow = (p: Product): ProductRow => ({
  shop: p.shop,
  sku: p.sku,
  name: p.name,
  description: p.description,
  price_cents: p.priceCents,
  stock: p.stock,
  ref_image_url: p.refImageUrl,
});

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`storage: ${result.error.message}`);
  return result.data;
}

/** Hosted storage. The whole visit lives in `data`; a few columns are copied out for queries. */
export class SupabaseRepo implements Repo {
  private db: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set when REPO=supabase");
    this.db = createClient(url, key, { auth: { persistSession: false } });
  }

  async listProducts(shop: Shop): Promise<Product[]> {
    const rows = check(await this.db.from("products").select("*").eq("shop", shop).order("sku"));
    return (rows as ProductRow[]).map(toProduct);
  }

  async upsertProduct(p: Product): Promise<void> {
    check(await this.db.from("products").upsert(toRow(p)));
  }

  async getVisit(id: string): Promise<Visit | null> {
    const row = check(await this.db.from("visits").select("data").eq("id", id).maybeSingle());
    return row ? (row.data as Visit) : null;
  }

  async saveVisit(v: Visit): Promise<void> {
    check(
      await this.db.from("visits").upsert({
        id: v.id,
        shop: v.shop,
        status: v.status,
        opened_at: v.openedAt,
        last_settled_at: v.lastSettledAt,
        data: v,
      }),
    );
  }

  async getOpenVisit(shop: Shop): Promise<Visit | null> {
    const rows = check(
      await this.db
        .from("visits")
        .select("data")
        .eq("shop", shop)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1),
    );
    return rows?.length ? (rows[0].data as Visit) : null;
  }

  async listVisits(shop: Shop, sinceMs = 0): Promise<Visit[]> {
    const rows = check(
      await this.db
        .from("visits")
        .select("data")
        .eq("shop", shop)
        .gte("opened_at", sinceMs)
        .order("opened_at", { ascending: false }),
    );
    return (rows ?? []).map((r) => r.data as Visit);
  }

  async resetShop(shop: Shop, products: Product[]): Promise<void> {
    check(await this.db.from("visits").delete().eq("shop", shop));
    check(await this.db.from("products").delete().eq("shop", shop));
    if (products.length) check(await this.db.from("products").insert(products.map(toRow)));
  }

  async savePhoto(name: string, bytes: Uint8Array): Promise<string> {
    const { error } = await this.db.storage.from("shelf").upload(name, bytes, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`storage: ${error.message}`);
    return name;
  }

  async getPhoto(key: string): Promise<Uint8Array | null> {
    const { data, error } = await this.db.storage.from("shelf").download(key);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  }
}
