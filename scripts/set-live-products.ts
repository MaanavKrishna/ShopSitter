// Sets the live stand's catalogue from a JSON file and stores a reference photo for each product.
// Usage: REPO=postgres DATABASE_URL=... npx tsx scripts/set-live-products.ts products.json
// File shape: [{ "sku": "bottle", "name": "...", "description": "...", "priceCents": 1200, "stock": 3, "photo": "bottle.jpg" }]
import { readFileSync } from "node:fs";
import path from "node:path";
import { getRepo } from "../lib/repo";
import type { Product } from "../lib/types";

type Row = Omit<Product, "shop" | "refImageUrl"> & { photo?: string };

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: set-live-products.ts <products.json>");
  const rows = JSON.parse(readFileSync(file, "utf8")) as Row[];
  const repo = getRepo();

  // Start the live stand from empty, then add each product with its photo.
  await repo.resetShop("live", []);
  for (const { photo, ...row } of rows) {
    let refImageUrl: string | null = null;
    if (photo) {
      const bytes = new Uint8Array(readFileSync(path.resolve(path.dirname(file), photo)));
      refImageUrl = await repo.savePhoto(`live-ref-${row.sku}.jpg`, bytes);
    }
    await repo.upsertProduct({ ...row, shop: "live", refImageUrl });
  }
  const names = rows.map((r) => `${r.name} ($${(r.priceCents / 100).toFixed(2)})`).join(", ");
  console.log(`Live stand now sells: ${names}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
