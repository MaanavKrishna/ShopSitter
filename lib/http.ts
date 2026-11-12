import { CheckoutError, type CheckoutErrorCode } from "./checkout";

const STATUS: Record<CheckoutErrorCode, number> = {
  not_found: 404,
  not_editable: 409,
  empty_bill: 409,
  already_paid: 409,
  too_late: 409,
  amount_mismatch: 409,
  use_basket: 409,
  captured_but_unrecorded: 500,
};

/** A JSON answer that no browser or cache in between may keep: every API answer here is private. */
export const privateJson = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** Runs a route handler body and turns known checkout errors into JSON responses. */
export async function respond<T>(work: () => Promise<T>): Promise<Response> {
  try {
    return privateJson(await work());
  } catch (e) {
    if (e instanceof CheckoutError) return privateJson({ error: e.code }, STATUS[e.code]);
    console.error(e);
    return privateJson({ error: "server_error" }, 500);
  }
}

/**
 * Refuses a write whose body is not JSON (415), or with `multipart` not a multipart form either.
 * A page on another site can send a form or plain text without asking, but never a JSON body, so
 * this keeps cross-site forms away from routes that sign in or act for a signed-in owner.
 */
export function refuseNonJson(req: Request, multipart = false): Response | null {
  const type = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (type.startsWith("application/json")) return null;
  if (multipart && type.startsWith("multipart/form-data")) return null;
  return privateJson({ error: "unsupported_media_type" }, 415);
}

