import { z } from "zod";
import { getRepo } from "@/lib/repo";
import { claimPending, liveDeps } from "@/lib/sessions";
import { refuse, sessionRoute, type SessionContext } from "../../shared";

const Body = z.object({ pendingId: z.string().regex(/^[a-z0-9]{8,20}$/) });

/** "That one was mine": the first shopper to claim a pending shelf change gets its lines. */
export async function POST(req: Request, ctx: SessionContext) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return refuse("bad_request", 400);
  return sessionRoute(ctx, "claim", 30, (id) => claimPending(liveDeps(getRepo()), id, parsed.data.pendingId, Date.now()));
}
