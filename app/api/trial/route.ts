import { cookies } from "next/headers";
import { OWNER_COOKIE, callerOf, ownerCookieOptions, ownerCookieValue } from "@/lib/auth";
import { cookieShop } from "@/lib/owner-http";
import { getRepo } from "@/lib/repo";
import { isTrial } from "@/lib/shops";
import { createTrial, endTrial, getTrial, sweepExpiredTrials, trialStartGate } from "@/lib/trials";
import { trialBody } from "./shared";

const refuse = (error: string, status: number) => Response.json({ error }, { status });

/** The trial this browser is signed in to, if it still exists. */
async function currentTrial(now: number) {
  const shop = await cookieShop();
  return shop && isTrial(shop) ? getTrial(getRepo(), shop, now) : null;
}

/**
 * Starts a private trial stand for this visitor and signs the browser in to it. No passcode is
 * needed. A browser that already has a trial gets that one back.
 */
export async function POST(req: Request) {
  const now = Date.now();
  try {
    // Starting a trial replaces the sign-in, so the owner of the live stand is never switched out of it.
    if ((await cookieShop()) === "live") return refuse("owner_signed_in", 409);
    const existing = await currentTrial(now);
    if (existing) return Response.json(trialBody(existing));

    // Checked before anything is stored: without it neither the cookie nor the stand key can be signed.
    if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET must be set");
    const gate = trialStartGate(callerOf(req), now);
    if (gate !== "ok") return refuse(gate, 429);

    const repo = getRepo();
    // Housekeeping on the way in: a few trials that have run out are deleted. It never blocks a start.
    await sweepExpiredTrials(repo, now).catch((e) => console.error("trial sweep failed", e));
    const trial = await createTrial(repo, now);
    const body = trialBody(trial);
    (await cookies()).set(
      OWNER_COOKIE,
      ownerCookieValue(trial.shop),
      ownerCookieOptions(Math.floor((trial.expiresAt - Date.now()) / 1000)),
    );
    return Response.json(body);
  } catch (e) {
    console.error(e);
    return refuse("server_error", 500);
  }
}

/** The trial this browser is signed in to, or 404. */
export async function GET() {
  try {
    const trial = await currentTrial(Date.now());
    return trial ? Response.json(trialBody(trial)) : refuse("no_trial", 404);
  } catch (e) {
    console.error(e);
    return refuse("server_error", 500);
  }
}

/** Ends this browser's trial now: its products, visits and photos are deleted and the browser is signed out. */
export async function DELETE() {
  try {
    const shop = await cookieShop();
    if (!shop || !isTrial(shop)) return refuse("no_trial", 404);
    await endTrial(getRepo(), shop);
    (await cookies()).delete(OWNER_COOKIE);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return refuse("server_error", 500);
  }
}
