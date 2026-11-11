import { allow, refuseStand } from "@/lib/auth";
import { addVisitor } from "@/lib/footfall";
import { getRepo } from "@/lib/repo";

/** The stand reports that someone stopped by and has now gone. Only the count is kept. */
export async function POST(req: Request) {
  const refusal = refuseStand(req);
  if (refusal) return refusal;
  if (!allow("footfall:live", 30, 60_000)) return Response.json({ error: "slow_down" }, { status: 429 });
  await addVisitor(getRepo(), "live", Date.now());
  return Response.json({ ok: true });
}
