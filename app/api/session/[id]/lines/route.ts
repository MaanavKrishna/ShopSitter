import { z } from "zod";
import { getRepo } from "@/lib/repo";
import { editSessionLines, liveDeps } from "@/lib/sessions";
import { refuse, sessionRoute, type SessionContext } from "../../shared";

const Body = z.object({ lines: z.array(z.object({ sku: z.string().max(64), qty: z.number() })).max(50) });

/** The shopper corrects their basket, under the pay page's rules. */
export async function PUT(req: Request, ctx: SessionContext) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return refuse("bad_request", 400);
  return sessionRoute(ctx, "edit", 60, (id) => editSessionLines(liveDeps(getRepo()), id, parsed.data.lines, Date.now()));
}
