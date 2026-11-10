import { startOrder } from "@/lib/checkout";
import { respond } from "@/lib/http";
import { getGateway } from "@/lib/paypal";
import { getRepo } from "@/lib/repo";

export async function POST(_req: Request, ctx: RouteContext<"/api/visits/[id]/order">) {
  const { id } = await ctx.params;
  return respond(() => startOrder(getRepo(), getGateway(), id, Date.now()));
}
