import { type Answer, type AskData, type Clock, handleAsk } from "@/lib/ask";
import { askModel } from "@/lib/ask-model";
import { allow, callerOf } from "@/lib/auth";
import { ownerOverview } from "@/lib/owner";
import { currentShop } from "@/lib/owner-http";
import { ordersOf, paypalTools, toolkitReader } from "@/lib/paypal-read";
import { getRepo } from "@/lib/repo";
import { isTrial } from "@/lib/shops";
import { refuseNonJson } from "@/lib/http";

// Briefs already written, by stand and period. Lives as long as this server instance.
const briefs = new Map<string, { at: number; body: Answer }>();

/** A question about the signed-in stand, or its brief. Answers `{ answer, sources, checked }`. */
export async function POST(req: Request) {
  const notJson = refuseNonJson(req);
  if (notJson) return notJson;
  const shop = await currentShop();
  if (!shop) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  const ip = callerOf(req);
  try {
    const res = await handleAsk(
      {
        model: askModel,
        load: (s, days, now) => ownerOverview(getRepo(), s, days, now),
        // PayPal lookups read the one merchant account every stand shares: a trial gets none, the demo
        // reads only its own orders, and only the owner's stand lists the account's transactions.
        extraTools: isTrial(shop)
          ? undefined
          : (data: AskData, clock: Clock) =>
              paypalTools(data, clock, toolkitReader, {
                shop,
                ownsOrder: async (orderId) => ordersOf(await getRepo().listVisits(shop)).has(orderId),
              }),
        allow,
        now: Date.now,
        cache: briefs,
      },
      { shop, ip, body },
    );
    return Response.json(res.body, { status: res.status });
  } catch {
    // Questions and answers are never logged.
    return Response.json({ error: "server_error", message: "That did not work. Nothing was changed." }, { status: 500 });
  }
}
