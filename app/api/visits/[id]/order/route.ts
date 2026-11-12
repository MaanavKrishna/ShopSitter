import { allow, callerOf } from "@/lib/auth";
import { startOrder } from "@/lib/checkout";
import { respond } from "@/lib/http";
import { getGateway } from "@/lib/paypal";
import { getRepo } from "@/lib/repo";

/** PayPal orders one caller may start in a minute: plenty for a shopper retrying, not for a loop. */
const ORDERS_PER_MINUTE = 20;

export async function POST(req: Request, ctx: RouteContext<"/api/visits/[id]/order">) {
  const { id } = await ctx.params;
  if (!allow(`order:${callerOf(req)}`, ORDERS_PER_MINUTE, 60_000)) return Response.json({ error: "slow_down" }, { status: 429 });
  return respond(() => startOrder(getRepo(), getGateway(), id, Date.now()));
}
