import { healDemo } from "@/lib/demo-reset";
import { ownerOverview } from "@/lib/owner";
import { ownerRoute } from "@/lib/owner-http";
import { getRepo } from "@/lib/repo";

export async function GET(req: Request) {
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 7));
  return ownerRoute(async (shop) => {
    const repo = getRepo();
    const now = Date.now();
    // The demo stand puts itself back to the example week once an hour; a failed reset never blocks the dashboard.
    if (shop === "demo") await healDemo(repo, now).catch((e) => console.error("demo reset failed", e));
    return ownerOverview(repo, shop, days, now);
  });
}
