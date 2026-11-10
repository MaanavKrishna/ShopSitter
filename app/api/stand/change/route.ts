import { randomUUID } from "node:crypto";
import { z } from "zod";
import { allow, isStandTokenValid } from "@/lib/auth";
import { getRepo } from "@/lib/repo";
import { readSample } from "@/lib/samples";
import { handleShelfChange, type ShelfChangeDeps } from "@/lib/stand";
import { diffShelf } from "@/lib/vision";

const MAX_PHOTO_BYTES = 3_000_000;
const DemoBody = z.object({ shop: z.literal("demo"), sampleId: z.string().max(64) });

const deps = (): ShelfChangeDeps => ({ repo: getRepo(), diff: diffShelf, newId: () => randomUUID().slice(0, 8) });
const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";

  // Demo: a sample photo pair picked by id. Nothing is uploaded.
  if (type.includes("application/json")) {
    const parsed = DemoBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return bad("bad_request");
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
    if (!allow(`demo:${ip}`, 10, 60_000)) return bad("slow_down", 429);
    const found = readSample(parsed.data.sampleId);
    if (!found) return bad("unknown_sample");
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

  // Live stand: the camera page uploads the before and after stills.
  if (!isStandTokenValid(req.headers.get("x-stand-token"))) return bad("unauthorized", 401);
  const form = await req.formData().catch(() => null);
  const before = form?.get("before");
  const after = form?.get("after");
  const changeStartedAt = Number(form?.get("changeStartedAt"));
  const settledAt = Number(form?.get("settledAt"));
  if (!(before instanceof File) || !(after instanceof File)) return bad("bad_request");
  if (before.size > MAX_PHOTO_BYTES || after.size > MAX_PHOTO_BYTES) return bad("photo_too_large", 413);
  if (!Number.isFinite(changeStartedAt) || !Number.isFinite(settledAt) || settledAt < changeStartedAt) {
    return bad("bad_request");
  }

  const result = await handleShelfChange(deps(), {
    shop: "live",
    before: new Uint8Array(await before.arrayBuffer()),
    after: new Uint8Array(await after.arrayBuffer()),
    changeStartedAt,
    settledAt,
  });
  return Response.json(result);
}
