import { getBill } from "@/lib/checkout";
import { respond } from "@/lib/http";
import { getRepo } from "@/lib/repo";

export async function GET(_req: Request, ctx: RouteContext<"/api/visits/[id]">) {
  const { id } = await ctx.params;
  return respond(() => getBill(getRepo(), id, Date.now()));
}
