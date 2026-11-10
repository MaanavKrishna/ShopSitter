import { EXTRA_ANGLES, saveAngleShot } from "@/lib/angles";
import { allow, isStandTokenValid } from "@/lib/auth";
import { getRepo } from "@/lib/repo";

const MAX_PHOTO_BYTES = 3_000_000;
const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** An extra camera sends its newest still of the shelf. */
export async function POST(req: Request) {
  const caller = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!isStandTokenValid(req.headers.get("x-stand-token")?.trim() ?? null)) {
    if (!allow(`standcode:${caller}`, 5, 10 * 60_000)) return bad("slow_down", 429);
    return bad("unauthorized", 401);
  }
  const form = await req.formData().catch(() => null);
  const photo = form?.get("photo");
  const angle = Number(form?.get("angle"));
  const takenAt = Number(form?.get("takenAt"));
  if (!(photo instanceof File) || photo.size === 0) return bad("bad_request");
  if (photo.size > MAX_PHOTO_BYTES) return bad("photo_too_large", 413);
  if (!(EXTRA_ANGLES as readonly number[]).includes(angle) || !Number.isFinite(takenAt)) return bad("bad_request");
  // A still every few seconds is plenty; anything faster is a fault.
  if (!allow(`angle:${angle}`, 60, 60_000)) return bad("slow_down", 429);

  await saveAngleShot(getRepo(), "live", angle, new Uint8Array(await photo.arrayBuffer()), takenAt);
  return Response.json({ ok: true });
}
