import { z } from "zod";
import { OwnerError, ownerAction, visitRow } from "@/lib/owner";
import { ownerRoute } from "@/lib/owner-http";
import { getGateway } from "@/lib/paypal";
import { getRepo } from "@/lib/repo";
import { refuseNonJson } from "@/lib/http";

const Line = z.object({ sku: z.string().max(64), qty: z.number() });
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settle") }),
  z.object({ action: z.literal("correct"), lines: z.array(Line).max(50) }),
  z.object({ action: z.literal("refund"), cents: z.number() }),
]);

export async function POST(req: Request, ctx: RouteContext<"/api/owner/visits/[id]">) {
  const notJson = refuseNonJson(req);
  if (notJson) return notJson;
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  return ownerRoute(async (shop) => {
    // The demo stand's passcode is public: it may look, but never send money back.
    if (shop === "demo" && parsed.data.action === "refund") throw new OwnerError("demo_read_only", 403);
    const repo = getRepo();
    const visit = await ownerAction(repo, getGateway(), shop, id, parsed.data);
    // The same shape the overview gives: never PayPal's order or authorization ids.
    return { visit: visitRow(visit, await repo.listProducts(shop, { includeArchived: true })) };
  });
}
