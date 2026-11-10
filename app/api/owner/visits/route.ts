import { ownerOverview } from "@/lib/owner";
import { ownerRoute } from "@/lib/owner-http";
import { getRepo } from "@/lib/repo";

export async function GET(req: Request) {
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 7));
  return ownerRoute((shop) => ownerOverview(getRepo(), shop, days, Date.now()));
}
