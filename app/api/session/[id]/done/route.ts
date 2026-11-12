import { getRepo } from "@/lib/repo";
import { finishSession, liveDeps } from "@/lib/sessions";
import { sessionRoute, type SessionContext } from "../../shared";

/** The shopper is finished: the hold is charged for what they took, or the pay page takes over. */
export async function POST(_req: Request, ctx: SessionContext) {
  return sessionRoute(ctx, "done", 10, (id) => finishSession(liveDeps(getRepo()), id, Date.now()));
}
