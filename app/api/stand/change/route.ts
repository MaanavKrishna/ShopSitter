import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readAngles } from "@/lib/angles";
import { callerOf, demoReadGate } from "@/lib/auth";
import { healDemo } from "@/lib/demo-reset";
import { getRepo } from "@/lib/repo";
import { readSample } from "@/lib/samples";
import { ownsKey } from "@/lib/shops";
import { handleShelfChange, type ShelfChangeDeps } from "@/lib/stand";
import { TRIAL_MAX_STILL_BYTES, resolveStand, trialReadGate } from "@/lib/stand-access";
import type { Product } from "@/lib/types";
import { diffShelf } from "@/lib/vision";

const MAX_PHOTO_BYTES = 3_000_000;
const DemoBody = z.object({ shop: z.literal("demo"), sampleId: z.string().max(64) });

/** Reads each product's stored reference photo, if it has one. Only a photo stored by the product's own shop is read. */
async function loadRefs(products: Product[]): Promise<Record<string, Uint8Array>> {
  const repo = getRepo();
  const refs: Record<string, Uint8Array> = {};
  await Promise.all(
    products.map(async (p) => {
      if (!p.refImageUrl || !ownsKey(p.shop, p.refImageUrl)) return;
      const bytes = await repo.getPhoto(p.refImageUrl);
      if (bytes) refs[p.sku] = bytes;
    }),
  );
  return refs;
}

const deps = (): ShelfChangeDeps => ({
  repo: getRepo(),
  diff: async (input) => {
    const result = await diffShelf({ ...input, refs: await loadRefs(input.products) });
    console.log(`shelf read: ${JSON.stringify(result.delta)} confidence ${result.confidence}`);
    return result;
  },
  newId: () => randomUUID().slice(0, 8),
});
const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";

  // Demo: a sample photo pair picked by id. Nothing is uploaded.
  if (type.includes("application/json")) {
    const parsed = DemoBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return bad("bad_request");
    const found = readSample(parsed.data.sampleId);
    if (!found) return bad("unknown_sample");
    // Each read is a paid model call: limited per caller, and across everyone ("demo_busy").
    const gate = demoReadGate(callerOf(req));
    if (gate !== "ok") return bad(gate, 429);
    await healDemo(getRepo(), Date.now()).catch((e) => console.error("demo reset failed", e));
    const now = Date.now();
    const result = await handleShelfChange(deps(), {
      shop: "demo",
      before: found.before,
      after: found.after,
      changeStartedAt: now,
      settledAt: now,
      standalone: true,
      photoUrls: { before: found.sample.before, after: found.sample.after },
    });
    return Response.json(result);
  }

  // A stand with a camera (the live stand or a visitor's trial): the camera page uploads the before and after stills.
  const stand = await resolveStand(req);
  if (stand instanceof Response) {
    if (stand.status === 401) console.warn("stand change refused: wrong stand code or ended trial");
    return stand;
  }
  const { shop } = stand;
  const form = await req.formData().catch(() => null);
  const before = form?.get("before");
  const after = form?.get("after");
  const changeStartedAt = Number(form?.get("changeStartedAt"));
  const settledAt = Number(form?.get("settledAt"));
  if (!(before instanceof File) || !(after instanceof File)) return bad("bad_request");
  const zoomBefore = form?.get("beforeZoom");
  const zoomAfter = form?.get("afterZoom");
  // Anyone can start a trial, so the stills it stores for its day are held to a smaller size.
  const maxBytes = stand.kind === "trial" ? TRIAL_MAX_STILL_BYTES : MAX_PHOTO_BYTES;
  const hasZoom =
    zoomBefore instanceof File && zoomAfter instanceof File &&
    zoomBefore.size <= maxBytes && zoomAfter.size <= maxBytes;
  if (before.size > maxBytes || after.size > maxBytes) return bad("photo_too_large", 413);
  if (!Number.isFinite(changeStartedAt) || !Number.isFinite(settledAt) || settledAt < changeStartedAt) {
    return bad("bad_request");
  }

  // Each read is a paid model call. A trial has a day's allowance, and all trials share one; the live stand has no cap.
  if (stand.kind === "trial") {
    const gate = trialReadGate(shop);
    if (gate !== "ok") return bad(gate, 429);
  }

  const started = Date.now();
  const angles = await readAngles(getRepo(), shop, changeStartedAt).catch(() => []);
  const result = await handleShelfChange(deps(), {
    shop,
    before: new Uint8Array(await before.arrayBuffer()),
    after: new Uint8Array(await after.arrayBuffer()),
    changeStartedAt,
    settledAt,
    zoom: hasZoom
      ? { before: new Uint8Array(await zoomBefore.arrayBuffer()), after: new Uint8Array(await zoomAfter.arrayBuffer()) }
      : undefined,
    angles,
  });
  // One line per read, so a stand that seems stuck can be diagnosed from the logs.
  console.log(
    `stand change (${stand.kind}): ${Date.now() - started}ms, photos ${before.size}+${after.size} bytes, close-ups ${hasZoom}, extra cameras ${angles.length}, ` +
      `visit ${result.visit?.id ?? "none"} ${result.visit?.status ?? ""} ` +
      `detected ${JSON.stringify(result.visit?.detected ?? [])} confidence ${result.visit?.confidence ?? "n/a"} ` +
      `manual ${result.visit?.needsManual ?? false}`,
  );
  return Response.json({ ...result, returned: result.returned ? { id: result.returned.id } : undefined, cameras: 1 + angles.length });
}
