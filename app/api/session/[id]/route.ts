import { getRepo } from "@/lib/repo";
import { liveDeps, sessionView } from "@/lib/sessions";
import { sessionRoute, type SessionContext } from "../shared";

/** The shopper's live basket. The phone asks every two seconds, so the allowance is generous. */
export async function GET(_req: Request, ctx: SessionContext) {
  return sessionRoute(ctx, "read", 120, (id) => sessionView(liveDeps(getRepo()), id, Date.now()));
}
