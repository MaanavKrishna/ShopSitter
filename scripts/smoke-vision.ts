// Sends the same photo as "before" and "after": a working setup answers with an empty change.
// Usage: npx tsx --env-file=.env.local scripts/smoke-vision.ts path/to/photo.jpg
import { readFileSync } from "node:fs";
import { DEMO_PRODUCTS } from "../lib/seed";
import { diffShelf } from "../lib/vision";

const photo = new Uint8Array(readFileSync(process.argv[2]));
const started = Date.now();
diffShelf({ before: photo, after: photo, products: DEMO_PRODUCTS }).then(
  (r) => console.log(JSON.stringify(r), `${Date.now() - started} ms`),
  (e) => {
    console.error("FAILED:", e?.message ?? e);
    process.exit(1);
  },
);
