import { z } from "zod";
import { ownerAction } from "@/lib/owner";
import { ownerRoute } from "@/lib/owner-http";
import { getGateway } from "@/lib/paypal";
import { getRepo } from "@/lib/repo";

const Line = z.object({ sku: z.string().max(64), qty: z.number() });
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settle") }),
  z.object({ action: z.literal("correct"), lines: z.array(Line).max(50) }),
  z.object({ action: z.literal("refund"), cents: z.number() }),
]);

export async function POST(req: Request, ctx: RouteContext<"/api/owner/visits/[id]">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  return ownerRoute(async (shop) => ({ visit: await ownerAction(getRepo(), getGateway(), shop, id, parsed.data) }));
}
