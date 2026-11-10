import { z } from "zod";
import { editLines } from "@/lib/checkout";
import { respond } from "@/lib/http";
import { getRepo } from "@/lib/repo";

const Body = z.object({ lines: z.array(z.object({ sku: z.string().max(64), qty: z.number() })).max(50) });

export async function PUT(req: Request, ctx: RouteContext<"/api/visits/[id]/lines">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  return respond(() => editLines(getRepo(), id, parsed.data.lines, Date.now()));
}
