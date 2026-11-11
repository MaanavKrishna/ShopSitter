import { type Answer, type AskData, type Clock, handleAsk } from "@/lib/ask";
import { askModel } from "@/lib/ask-model";
import { allow } from "@/lib/auth";
import { ownerOverview } from "@/lib/owner";
import { currentShop } from "@/lib/owner-http";
import { paypalTools, toolkitReader } from "@/lib/paypal-read";
import { getRepo } from "@/lib/repo";

// Briefs already written, by stand and period. Lives as long as this server instance.
const briefs = new Map<string, { at: number; body: Answer }>();

/** A question about the signed-in stand, or its brief. Answers `{ answer, sources, checked }`. */
export async function POST(req: Request) {
  const shop = await currentShop();
  if (!shop) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  try {
    const res = await handleAsk(
      {
        model: askModel,
        load: (s, days, now) => ownerOverview(getRepo(), s, days, now),
        extraTools: (data: AskData, clock: Clock) => paypalTools(data, clock, toolkitReader),
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
