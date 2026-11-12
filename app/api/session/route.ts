import { z } from "zod";
import { privateJson } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { SESSION_ERROR_STATUS, SessionError, checkIn, liveDeps } from "@/lib/sessions";
import { openDoor } from "./door";
import { refuse } from "./shared";

const Body = z.object({ store: z.string().min(1).max(120), hold: z.boolean().optional() });

/** A shopper scanned the door QR: checks them in and answers with their session id. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return refuse("bad_request", 400);
  const now = Date.now();
  const door = await openDoor(req, "check-in", parsed.data.store, now);
  if (door instanceof Response) return door;

  try {
    return privateJson(await checkIn(liveDeps(getRepo()), door.shop, parsed.data.hold === true, now));
  } catch (e) {
    if (e instanceof SessionError) return refuse(e.code, SESSION_ERROR_STATUS[e.code]);
    console.error("check-in failed", e instanceof Error ? e.message : e);
    return refuse("server_error", 500);
  }
}
