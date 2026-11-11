import { refuseStand } from "@/lib/auth";

/** Lets the stand's set-up sheet test a code before it is used: 204 right, 401 wrong, 429 limited. */
export async function GET(req: Request) {
  return refuseStand(req) ?? new Response(null, { status: 204 });
}
