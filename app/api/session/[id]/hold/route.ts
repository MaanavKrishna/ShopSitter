import { z } from "zod";
import { getRepo } from "@/lib/repo";
import { authorizeHold, liveDeps } from "@/lib/sessions";
import { refuse, sessionRoute, type SessionContext } from "../../shared";

const Body = z.object({ orderId: z.string().min(1).max(64) });

/** The shopper approved the hold with the PayPal button: the money is set aside. */
export async function POST(req: Request, ctx: SessionContext) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return refuse("bad_request", 400);
  return sessionRoute(ctx, "hold", 10, (id) => authorizeHold(liveDeps(getRepo()), id, parsed.data.orderId, Date.now()));
}
