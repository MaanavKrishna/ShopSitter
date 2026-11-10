import { allow, isStandTokenValid } from "@/lib/auth";
import { addVisitor } from "@/lib/footfall";
import { getRepo } from "@/lib/repo";

/** The stand reports that someone stopped by and has now gone. Only the count is kept. */
export async function POST(req: Request) {
  const caller = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!isStandTokenValid(req.headers.get("x-stand-token")?.trim() ?? null)) {
    if (!allow(`standcode:${caller}`, 5, 10 * 60_000)) return Response.json({ error: "slow_down" }, { status: 429 });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!allow("footfall:live", 30, 60_000)) return Response.json({ error: "slow_down" }, { status: 429 });
  await addVisitor(getRepo(), "live", Date.now());
  return Response.json({ ok: true });
}
