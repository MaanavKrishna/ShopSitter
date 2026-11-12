import { ownerRoute } from "@/lib/owner-http";
import { doorLinkFor } from "./link";

/** The link inside the shop's door QR (see doorLinkFor). */
export async function GET() {
  return ownerRoute(async (shop) => ({ doorLink: await doorLinkFor(shop) }));
}
