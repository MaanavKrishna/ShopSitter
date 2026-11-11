// Measures how well the shelf reader does on the sample pictures in public/samples/.
// Each pair is read RUNS times and compared with scripts/sample-truth.json.
// Usage: npx tsx --env-file=.env.local scripts/eval-samples.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { readSample, listSamples } from "../lib/samples";
import { DEMO_PRODUCTS } from "../lib/seed";
import type { Line } from "../lib/types";
import { diffShelf } from "../lib/vision";

const RUNS = Number(process.env.EVAL_RUNS ?? 2);
const only = process.argv.slice(2);
const truth = JSON.parse(readFileSync(path.join(process.cwd(), "scripts", "sample-truth.json"), "utf8")) as Record<
  string,
  Line[]
>;

/** A change written the same way whatever order its lines come in. */
const show = (lines: Line[]) =>
  lines.length === 0
    ? "nothing"
    : [...lines]
        .sort((a, b) => a.sku.localeCompare(b.sku))
        .map((l) => `${l.qty} ${l.sku}`)
        .join(", ");

async function main() {
  const samples = listSamples().filter((s) => only.length === 0 || only.includes(s.id));
  let reads = 0;
  let exact = 0;
  let failed = 0;
  const times: number[] = [];
  console.log(`model ${process.env.VISION_MODEL || "default in lib/vision.ts"}, ${samples.length} pairs x ${RUNS} reads`);
  for (const s of samples) {
    const found = readSample(s.id);
    const expected = truth[s.id];
    if (!found || !expected) throw new Error(`no pictures or no expected answer for ${s.id}`);
    for (let run = 1; run <= RUNS; run++) {
      reads++;
      const started = Date.now();
      try {
        const got = await diffShelf({ before: found.before, after: found.after, products: DEMO_PRODUCTS });
        const ms = Date.now() - started;
        times.push(ms);
        const ok = show(got.delta) === show(expected);
        if (ok) exact++;
        console.log(
          `${s.id} #${run}: ${ok ? "match" : "MISS "} expected [${show(expected)}] read [${show(got.delta)}] confidence ${got.confidence} ${ms} ms`,
        );
      } catch (e) {
        failed++;
        console.log(`${s.id} #${run}: FAILED ${(e as Error)?.message ?? e} ${Date.now() - started} ms`);
      }
    }
  }
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  console.log(`exact matches: ${exact} of ${reads} reads (${failed} failed to return)`);
  if (times.length) console.log(`time per read: mean ${mean} ms, fastest ${sorted[0]} ms, slowest ${sorted[sorted.length - 1]} ms`);
}

main();
