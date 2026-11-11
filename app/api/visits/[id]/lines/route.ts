import { z } from "zod";
import { allow, callerOf } from "@/lib/auth";
import { editLines, publicVisit } from "@/lib/checkout";
import { respond } from "@/lib/http";
import { getRepo } from "@/lib/repo";

const Body = z.object({ lines: z.array(z.object({ sku: z.string().max(64), qty: z.number() })).max(50) });

export async function PUT(req: Request, ctx: RouteContext<"/api/visits/[id]/lines">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  if (!allow(`visit-edit:${callerOf(req)}`, 120, 60_000)) return Response.json({ error: "slow_down" }, { status: 429 });
  return respond(async () => {
    const { visit, bill } = await editLines(getRepo(), id, parsed.data.lines, Date.now());
    return { visit: publicVisit(visit), bill };
  });
}
