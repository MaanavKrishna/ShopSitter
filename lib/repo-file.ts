import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Repo } from "./repo";
import type { Product, Shop } from "./types";
import type { Visit } from "./visits";

/** Local JSON-file storage for development and tests. Not for concurrent production use. */
export class FileRepo implements Repo {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private read<T>(name: string): T[] {
    const file = path.join(this.dir, name);
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T[]) : [];
  }

  private write<T>(name: string, rows: T[]): void {
    writeFileSync(path.join(this.dir, name), JSON.stringify(rows, null, 2));
  }

  async listProducts(shop: Shop): Promise<Product[]> {
    return this.read<Product>("products.json").filter((p) => p.shop === shop);
  }

  async upsertProduct(p: Product): Promise<void> {
    const rest = this.read<Product>("products.json").filter((x) => !(x.shop === p.shop && x.sku === p.sku));
    this.write("products.json", [...rest, p]);
  }

  async getVisit(id: string): Promise<Visit | null> {
    return this.read<Visit>("visits.json").find((v) => v.id === id) ?? null;
  }

  async saveVisit(v: Visit): Promise<void> {
    const rest = this.read<Visit>("visits.json").filter((x) => x.id !== v.id);
    this.write("visits.json", [...rest, v]);
  }

  async getOpenVisit(shop: Shop): Promise<Visit | null> {
    const open = (await this.listVisits(shop)).filter((v) => v.status === "open");
    return open[0] ?? null;
  }

  async listVisits(shop: Shop, sinceMs = 0): Promise<Visit[]> {
    return this.read<Visit>("visits.json")
      .filter((v) => v.shop === shop && v.openedAt >= sinceMs)
      .sort((a, b) => b.openedAt - a.openedAt);
  }

  async resetShop(shop: Shop, products: Product[]): Promise<void> {
    this.write("visits.json", this.read<Visit>("visits.json").filter((v) => v.shop !== shop));
    this.write("products.json", [...this.read<Product>("products.json").filter((p) => p.shop !== shop), ...products]);
  }

  async savePhoto(name: string, bytes: Uint8Array): Promise<string> {
    const dir = path.join(this.dir, "shots");
    mkdirSync(dir, { recursive: true });
    const key = path.basename(name);
    writeFileSync(path.join(dir, key), bytes);
    return key;
  }

  async getPhoto(key: string): Promise<Uint8Array | null> {
    const file = path.join(this.dir, "shots", path.basename(key));
    return existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
  }
}
