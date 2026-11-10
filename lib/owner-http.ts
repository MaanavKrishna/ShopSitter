import { cookies } from "next/headers";
import { OWNER_COOKIE, shopFromCookie } from "./auth";
import { OwnerError } from "./owner";
import type { Shop } from "./types";

/** The shop this browser is signed in to, or null. */
export async function currentShop(): Promise<Shop | null> {
  return shopFromCookie((await cookies()).get(OWNER_COOKIE)?.value);
}

/** Runs an owner route: 401 when not signed in, known errors as JSON. */
export async function ownerRoute<T>(work: (shop: Shop) => Promise<T>): Promise<Response> {
  const shop = await currentShop();
  if (!shop) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(await work(shop));
  } catch (e) {
    if (e instanceof OwnerError) return Response.json({ error: e.code }, { status: e.status });
    console.error(e);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
