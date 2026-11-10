import { seedShop } from "../lib/seed";
import type { Shop } from "../lib/types";

const shop = process.argv[2];
if (shop !== "demo" && shop !== "live") {
  console.error("Usage: npm run seed -- <demo|live>");
  process.exit(1);
}

seedShop(shop as Shop).then(() => console.log(`Seeded the ${shop} shop with the starter catalogue.`));
