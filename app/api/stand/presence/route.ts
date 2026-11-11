import { allow } from "@/lib/auth";
import { addVisitor } from "@/lib/footfall";
import { getRepo } from "@/lib/repo";
import { resolveStand } from "@/lib/stand-access";

/** The stand reports that someone stopped by and has now gone. Only the count is kept. */
export async function POST(req: Request) {
  const stand = await resolveStand(req);
  if (stand instanceof Response) return stand;
  // Counted per stand: one stand's visitors never use up another's allowance.
  if (!allow(`footfall:${stand.shop}`, 30, 60_000)) return Response.json({ error: "slow_down" }, { status: 429 });
  await addVisitor(getRepo(), stand.shop, Date.now());
  return Response.json({ ok: true });
}
