import { OwnerError } from "@/lib/owner";
import { ownerRoute } from "@/lib/owner-http";
import { getRepo } from "@/lib/repo";
import { rotateDoor } from "@/lib/store";
import { doorLinkFor } from "../link";
import { refuseNonJson } from "@/lib/http";

/** Makes a new door QR: every code printed before stops working. Answers the new link. */
export async function POST(req: Request) {
  const notJson = refuseNonJson(req);
  if (notJson) return notJson;
  return ownerRoute(async (shop) => {
    if (shop === "demo") throw new OwnerError("demo_no_stand", 403);
    await doorLinkFor(shop); // A trial that has ended is refused before anything changes.
    await rotateDoor(getRepo(), shop);
    return { doorLink: await doorLinkFor(shop) };
  });
}
