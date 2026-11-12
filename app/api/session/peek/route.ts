import { z } from "zod";
import { privateJson } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { peekStore } from "@/lib/sessions";
import { openDoor } from "../door";
import { refuse } from "../shared";

const Body = z.object({ store: z.string().min(1).max(120) });

/** Before checking in: how this shop takes payment and the hold it would ask for. Nobody is checked in. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return refuse("bad_request", 400);
  const now = Date.now();
  const door = await openDoor(req, "peek", parsed.data.store, now);
  if (door instanceof Response) return door;
  try {
    return privateJson(await peekStore(getRepo(), door.shop, now));
  } catch (e) {
    console.error("peek failed", e instanceof Error ? e.message : e);
    return refuse("server_error", 500);
  }
}
