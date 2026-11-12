import { cookies } from "next/headers";
import { OWNER_COOKIE, shopFromCookie } from "./auth";
import { privateJson } from "./http";
import { OwnerError } from "./owner";
import { getRepo } from "./repo";
import { activeShop } from "./trials";
import type { Shop } from "./types";

/** The shop the browser's cookie names, whether or not that shop still exists. */
export async function cookieShop(): Promise<Shop | null> {
  return shopFromCookie((await cookies()).get(OWNER_COOKIE)?.value);
}

/**
 * The shop this browser is signed in to, or null. A trial stand counts only while it exists:
 * once it has run out or been ended, its cookie reads as signed out.
 */
export async function currentShop(): Promise<Shop | null> {
  const shop = await cookieShop();
  if (shop === null || shop === "live" || shop === "demo") return shop;
  return activeShop(getRepo(), shop, Date.now());
}

/** Runs an owner route: 401 when not signed in, known errors as JSON. */
export async function ownerRoute<T>(work: (shop: Shop) => Promise<T>): Promise<Response> {
  const shop = await currentShop();
  if (!shop) return privateJson({ error: "unauthorized" }, 401);
  try {
    return privateJson(await work(shop));
  } catch (e) {
    if (e instanceof OwnerError) return privateJson({ error: e.code }, e.status);
    console.error(e);
    return privateJson({ error: "server_error" }, 500);
  }
}
