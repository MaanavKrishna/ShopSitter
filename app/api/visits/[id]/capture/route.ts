import { z } from "zod";
import { captureVisit } from "@/lib/checkout";
import { respond } from "@/lib/http";
import { getGateway } from "@/lib/paypal";
import { getRepo } from "@/lib/repo";

const Body = z.object({ orderId: z.string().min(1).max(64) });

export async function POST(req: Request, ctx: RouteContext<"/api/visits/[id]/capture">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  return respond(() => captureVisit(getRepo(), getGateway(), id, parsed.data.orderId, Date.now()));
}
