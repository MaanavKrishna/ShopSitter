import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { Repo } from "./repo";
import { shopOfKey } from "./shops";
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
  archived: boolean;
  zone_id: string | null;
};

const toProduct = (r: ProductRow): Product => ({
  shop: r.shop,
  sku: r.sku,
  name: r.name,
  description: r.description,
  priceCents: r.price_cents,
  stock: r.stock,
  refImageUrl: r.ref_image_url,
  ...(r.archived ? { archived: true } : {}),
  ...(r.zone_id ? { zoneId: r.zone_id } : {}),
});

/**
 * Hosted storage on Postgres (the database Vercel provisions). The whole visit lives in
 * a JSON column, with a few columns copied out for queries. Shelf photos are kept in the
 * same database so they stay private and nothing else needs setting up.
 */
export class PostgresRepo implements Repo {
  private sql: NeonQueryFunction<false, false>;
  private ready: Promise<void> | null = null;
  private products: string;
  private visits: string;
  private photos: string;

  /** `prefix` is only for tests, so they can run beside real data. */
  constructor(url: string | undefined = process.env.DATABASE_URL, prefix = "") {
    if (!url) throw new Error("DATABASE_URL must be set when REPO=postgres");
    if (!/^[a-z_]*$/.test(prefix)) throw new Error("table prefix must be lowercase letters or underscores");
    this.sql = neon(url);
    this.products = `${prefix}products`;
    this.visits = `${prefix}visits`;
    this.photos = `${prefix}photos`;
  }

  /** Creates the tables on first use, so hosting needs no manual database step. */
  private setup(): Promise<void> {
    this.ready ??= (async () => {
      await this.sql.query(`create table if not exists ${this.products} (
        shop text not null, sku text not null, name text not null, description text not null default '',
        price_cents integer not null, stock integer not null default 0, ref_image_url text,
        primary key (shop, sku))`);
      // Added after the first release: existing tables gain the column, with every product not archived.
      await this.sql.query(
        `alter table ${this.products} add column if not exists archived boolean not null default false`,
      );
      // The shelf a product is kept on. Existing rows gain the column empty: kept anywhere.
      await this.sql.query(`alter table ${this.products} add column if not exists zone_id text`);
      await this.sql.query(`create table if not exists ${this.visits} (
        id text primary key, shop text not null, status text not null,
        opened_at bigint not null, data jsonb not null)`);
      await this.sql.query(
        `create index if not exists ${this.visits}_shop_opened on ${this.visits} (shop, opened_at desc)`,
      );
      await this.sql.query(`create table if not exists ${this.photos} (
        key text primary key, shop text not null, bytes_b64 text not null, created_at timestamptz not null default now())`);
    })();
    return this.ready;
  }

  private async run<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    await this.setup();
    return (await this.sql.query(text, params)) as T[];
  }

  async listProducts(shop: Shop, opts: { includeArchived?: boolean } = {}): Promise<Product[]> {
    const rows = await this.run<ProductRow>(
      `select * from ${this.products} where shop = $1 and (archived = false or $2) order by sku`,
      [shop, opts.includeArchived === true],
    );
    return rows.map(toProduct);
  }

  async upsertProduct(p: Product): Promise<void> {
    await this.run(
      `insert into ${this.products} (shop, sku, name, description, price_cents, stock, ref_image_url, archived, zone_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (shop, sku) do update set name = excluded.name, description = excluded.description,
         price_cents = excluded.price_cents, stock = excluded.stock, ref_image_url = excluded.ref_image_url,
         archived = excluded.archived, zone_id = excluded.zone_id`,
      [p.shop, p.sku, p.name, p.description, p.priceCents, p.stock, p.refImageUrl, p.archived === true, p.zoneId || null],
    );
  }

  async getVisit(id: string): Promise<Visit | null> {
    const rows = await this.run<{ data: Visit }>(`select data from ${this.visits} where id = $1`, [id]);
    return rows[0]?.data ?? null;
  }

  async saveVisit(v: Visit): Promise<void> {
    await this.run(
      `insert into ${this.visits} (id, shop, status, opened_at, data) values ($1, $2, $3, $4, $5)
       on conflict (id) do update set shop = excluded.shop, status = excluded.status,
         opened_at = excluded.opened_at, data = excluded.data`,
      [v.id, v.shop, v.status, v.openedAt, JSON.stringify(v)],
    );
  }

  async getOpenVisit(shop: Shop): Promise<Visit | null> {
    const rows = await this.run<{ data: Visit }>(
      `select data from ${this.visits} where shop = $1 and status = 'open' order by opened_at desc limit 1`,
      [shop],
    );
    return rows[0]?.data ?? null;
  }

  async listOpenVisits(shop: Shop): Promise<Visit[]> {
    const rows = await this.run<{ data: Visit }>(
      `select data from ${this.visits} where shop = $1 and status = 'open' order by opened_at desc`,
      [shop],
    );
    return rows.map((r) => r.data);
  }

  async claimVisit(pendingId: string, sessionId: string): Promise<boolean> {
    // One conditional update: the database lets exactly one claim change the row.
    const rows = await this.run(
      `update ${this.visits}
         set status = 'empty',
             data = jsonb_set(jsonb_set(data, '{status}', '"empty"'), '{pending,claimedBy}', to_jsonb($2::text))
       where id = $1 and status = 'open' and data->'pending' is not null and data->'pending'->>'claimedBy' is null
       returning id`,
      [pendingId, sessionId],
    );
    return rows.length === 1;
  }

  async listVisits(shop: Shop, sinceMs = 0): Promise<Visit[]> {
    const rows = await this.run<{ data: Visit }>(
      `select data from ${this.visits} where shop = $1 and opened_at >= $2 order by opened_at desc`,
      [shop, sinceMs],
    );
    return rows.map((r) => r.data);
  }

  async resetShop(shop: Shop, products: Product[]): Promise<void> {
    await this.run(`delete from ${this.visits} where shop = $1`, [shop]);
    await this.run(`delete from ${this.photos} where shop = $1`, [shop]);
    await this.run(`delete from ${this.products} where shop = $1`, [shop]);
    for (const p of products) await this.upsertProduct(p);
  }

  async deleteShop(shop: Shop): Promise<void> {
    await this.run(`delete from ${this.visits} where shop = $1`, [shop]);
    await this.run(`delete from ${this.products} where shop = $1`, [shop]);
    // Stored keys go last: a trial's own record is one of them, so a delete that stops half way can be found and finished.
    await this.run(`delete from ${this.photos} where shop = $1`, [shop]);
  }

  async savePhoto(name: string, bytes: Uint8Array): Promise<string> {
    // Stored names start with the shop they belong to ("live-1700000000000-before.jpg"). The shop is
    // read from that start, so a trial's keys are never filed under the live stand. A name that
    // starts with no shop is filed under the live stand, as it always was.
    const shop = shopOfKey(name) ?? "live";
    await this.run(
      `insert into ${this.photos} (key, shop, bytes_b64) values ($1, $2, $3)
       on conflict (key) do update set bytes_b64 = excluded.bytes_b64`,
      [name, shop, Buffer.from(bytes).toString("base64")],
    );
    return name;
  }

  async getPhoto(key: string): Promise<Uint8Array | null> {
    const rows = await this.run<{ bytes_b64: string }>(`select bytes_b64 from ${this.photos} where key = $1`, [key]);
    return rows[0] ? new Uint8Array(Buffer.from(rows[0].bytes_b64, "base64")) : null;
  }

  async deletePhoto(key: string): Promise<void> {
    await this.run(`delete from ${this.photos} where key = $1`, [key]);
  }

  async listStored(ending: string): Promise<{ key: string; bytes: Uint8Array }[]> {
    const rows = await this.run<{ key: string; bytes_b64: string }>(
      `select key, bytes_b64 from ${this.photos} where right(key, $2) = $1`,
      [ending, ending.length],
    );
    return rows.map((r) => ({ key: r.key, bytes: new Uint8Array(Buffer.from(r.bytes_b64, "base64")) }));
  }

  /** Empties this instance's tables. Refuses to run on unprefixed (real) tables. */
  async wipeForTests(): Promise<void> {
    if (this.products === "products") throw new Error("wipeForTests needs a table prefix");
    await this.run(`truncate ${this.products}, ${this.visits}, ${this.photos}`);
  }
}
