import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** A before/after photo pair of the demo shelf that anyone can run without a camera. */
export type Sample = { id: string; caption: string; before: string; after: string };

const manifestPath = path.join(process.cwd(), "public", "samples", "manifest.json");

/** Sample pairs listed in public/samples/manifest.json (paths are relative to /samples/). */
export function listSamples(): Sample[] {
  if (!existsSync(manifestPath)) return [];
  const rows = JSON.parse(readFileSync(manifestPath, "utf8")) as Sample[];
  return rows.map((s) => ({ ...s, before: `/samples/${s.before}`, after: `/samples/${s.after}` }));
}

export function readSample(id: string): { sample: Sample; before: Uint8Array; after: Uint8Array } | null {
  const sample = listSamples().find((s) => s.id === id);
  if (!sample) return null;
  const read = (url: string) => new Uint8Array(readFileSync(path.join(process.cwd(), "public", path.normalize(url))));
  return { sample, before: read(sample.before), after: read(sample.after) };
}
