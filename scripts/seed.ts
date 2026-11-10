import { seedShop, seedShopWithExamples } from "../lib/seed";
import type { Shop } from "../lib/types";

const shop = process.argv[2];
if (shop !== "demo" && shop !== "live") {
  console.error("Usage: npm run seed -- <demo|live> [--examples]");
  process.exit(1);
}

const withExamples = process.argv.includes("--examples");
(withExamples ? seedShopWithExamples(shop as Shop) : seedShop(shop as Shop)).then(() =>
  console.log(`Seeded the ${shop} shop with the starter catalogue${withExamples ? " and a week of example visits" : ""}.`),
);
