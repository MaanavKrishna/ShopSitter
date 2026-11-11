import { currentShop } from "@/lib/owner-http";
import type { Shop } from "@/lib/types";

/** A refusal with a code the editor can turn into a plain sentence. */
export class EditError extends Error {
  constructor(
    /** "not_jpeg": a real picture, but PNG or WebP; reference photos are stored as JPEG only. */
    /** "trial_limit": a trial stand already has as many products on sale as it may. */
    public code: "bad_request" | "not_found" | "sku_taken" | "bad_photo" | "not_jpeg" | "photo_too_large" | "trial_limit",
    public status: number,
  ) {
    super(code);
  }
}

/**
 * Runs a route that changes the catalogue: 401 when not signed in, and 403 for the demo stand,
 * whose passcode is public, so its products stay as they are. A trial stand belongs to one
 * visitor, so it can be edited like the owner's own.
 */
export async function editRoute<T>(work: (shop: Shop) => Promise<T>): Promise<Response> {
  const shop = await currentShop();
  if (!shop) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (shop === "demo") return Response.json({ error: "demo_read_only" }, { status: 403 });
  try {
    return Response.json(await work(shop));
  } catch (e) {
    if (e instanceof EditError) return Response.json({ error: e.code }, { status: e.status });
    console.error(e);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
