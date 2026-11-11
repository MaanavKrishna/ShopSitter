import path from "node:path";
import { FileRepo } from "./repo-file";
import { PostgresRepo } from "./repo-postgres";
import type { Product, Shop } from "./types";
import type { Visit } from "./visits";

export interface Repo {
  /**
   * The products the shop sells now. Archived ones are left out unless asked for; ask for them
   * when pricing or naming the lines of a visit, which may hold products removed since.
   */
  listProducts(shop: Shop, opts?: { includeArchived?: boolean }): Promise<Product[]>;
  /** Adds or replaces a product, its `archived` flag included: saving without the flag brings an archived product back. */
  upsertProduct(p: Product): Promise<void>;
  getVisit(id: string): Promise<Visit | null>;
  saveVisit(v: Visit): Promise<void>;
  getOpenVisit(shop: Shop): Promise<Visit | null>;
  /** Newest first. `sinceMs` filters on the time the visit opened. */
  listVisits(shop: Shop, sinceMs?: number): Promise<Visit[]>;
  /** Deletes the shop's visits and replaces its products. */
  resetShop(shop: Shop, products: Product[]): Promise<void>;
  /** Stores a shelf photo privately and returns the key to read it back with. */
  savePhoto(name: string, bytes: Uint8Array): Promise<string>;
  getPhoto(key: string): Promise<Uint8Array | null>;
  /** Removes a stored photo. Does nothing when the key is not there. */
  deletePhoto(key: string): Promise<void>;
}

let cached: Repo | null = null;

/** Storage chosen by the REPO env var: "file" (default, local .data/ folder) or "postgres". */
export function getRepo(): Repo {
  if (cached) return cached;
  if (process.env.REPO === "postgres") {
    cached = new PostgresRepo();
  } else {
    cached = new FileRepo(path.join(process.cwd(), ".data"));
  }
  return cached;
}
