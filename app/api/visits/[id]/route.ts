import { allow, callerOf } from "@/lib/auth";
import { getBill, publicBill } from "@/lib/checkout";
import { respond } from "@/lib/http";
import { getRepo } from "@/lib/repo";

/** The bill for a visit, for anyone holding its link: only what the pay page and the stand screen read. */
export async function GET(req: Request, ctx: RouteContext<"/api/visits/[id]">) {
  const { id } = await ctx.params;
  // Generous: the stand screen asks every two seconds. In memory per server instance.
  if (!allow(`visit-read:${callerOf(req)}`, 120, 60_000)) return Response.json({ error: "slow_down" }, { status: 429 });
  return respond(async () => publicBill(await getBill(getRepo(), id, Date.now())));
}
