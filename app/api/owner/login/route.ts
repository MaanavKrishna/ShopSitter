import { cookies } from "next/headers";
import { z } from "zod";
import { OWNER_COOKIE, allow, callerOf, loginLocked, noteLoginFail, ownerCookieOptions, ownerCookieValue, shopForPasscode } from "@/lib/auth";
import { refuseNonJson } from "@/lib/http";

const Body = z.object({ passcode: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const notJson = refuseNonJson(req);
  if (notJson) return notJson;
  if (!allow(`login:${callerOf(req)}`, 10, 60_000)) return Response.json({ error: "slow_down" }, { status: 429 });
  // Across every caller too, so changing addresses does not buy more guesses.
  if (loginLocked()) return Response.json({ error: "slow_down" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  const shop = parsed.success ? shopForPasscode(parsed.data.passcode) : null;
  if (!shop) {
    noteLoginFail();
    return Response.json({ error: "wrong_passcode" }, { status: 401 });
  }
  (await cookies()).set(OWNER_COOKIE, ownerCookieValue(shop), ownerCookieOptions());
  return Response.json({ shop });
}

export async function DELETE() {
  (await cookies()).delete(OWNER_COOKIE);
  return Response.json({ ok: true });
}
