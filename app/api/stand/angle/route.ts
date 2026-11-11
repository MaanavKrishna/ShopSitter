import { EXTRA_ANGLES, saveAngleShot } from "@/lib/angles";
import { allow } from "@/lib/auth";
import { getRepo } from "@/lib/repo";
import { TRIAL_MAX_STILL_BYTES, resolveStand } from "@/lib/stand-access";

const MAX_PHOTO_BYTES = 3_000_000;
const DAY_MS = 24 * 60 * 60_000;
const TRIAL_STILLS_PER_DAY = 26_000;
const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** An extra camera sends its newest still of the shelf. */
export async function POST(req: Request) {
  const stand = await resolveStand(req);
  if (stand instanceof Response) return stand;
  const form = await req.formData().catch(() => null);
  const photo = form?.get("photo");
  const angle = Number(form?.get("angle"));
  const takenAt = Number(form?.get("takenAt"));
  if (!(photo instanceof File) || photo.size === 0) return bad("bad_request");
  if (photo.size > (stand.kind === "trial" ? TRIAL_MAX_STILL_BYTES : MAX_PHOTO_BYTES)) return bad("photo_too_large", 413);
  if (!(EXTRA_ANGLES as readonly number[]).includes(angle) || !Number.isFinite(takenAt)) return bad("bad_request");
  // A still every few seconds is plenty; anything faster is a fault.
  // Each stand has its own allowance for each camera; the live stand's is counted as it always was.
  const limitKey = stand.kind === "live" ? `angle:${angle}` : `angle:${stand.shop}:${angle}`;
  if (!allow(limitKey, 60, 60_000)) return bad("slow_down", 429);
  // A trial lasts a day: this is one still every ten seconds from each of three cameras for all of it.
  if (stand.kind === "trial" && !allow(`angle-day:${stand.shop}`, TRIAL_STILLS_PER_DAY, DAY_MS)) return bad("trial_still_limit", 429);

  await saveAngleShot(getRepo(), stand.shop, angle, new Uint8Array(await photo.arrayBuffer()), takenAt);
  return Response.json({ ok: true });
}
