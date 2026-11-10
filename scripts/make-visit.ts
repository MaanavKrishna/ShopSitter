// Creates an open visit by hand, for trying the pay page without a camera.
// Usage: npx tsx scripts/make-visit.ts honey:2 bread:1
import { randomUUID } from "node:crypto";
import { getRepo } from "../lib/repo";
import { newVisit } from "../lib/visits";

const lines = process.argv.slice(2).map((arg) => {
  const [sku, qty] = arg.split(":");
  return { sku, qty: Number(qty ?? 1) };
});
const visit = newVisit(randomUUID().slice(0, 8), "demo", lines, Date.now());
getRepo()
  .saveVisit(visit)
  .then(() => console.log(`http://localhost:3210/pay/${visit.id}`));
