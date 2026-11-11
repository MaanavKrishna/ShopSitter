import { resolveStand } from "@/lib/stand-access";

/**
 * Lets a stand device test its code or key before it is used: 204 right, 401 wrong, 429 limited.
 * On 204 the `x-stand-kind` header says which kind of stand it is ("live" or "trial"), and for a
 * trial `x-stand-expires-at` says when it ends, in milliseconds.
 */
export async function GET(req: Request) {
  const stand = await resolveStand(req);
  if (stand instanceof Response) return stand;
  const headers = new Headers({ "x-stand-kind": stand.kind, "cache-control": "no-store" });
  if (stand.expiresAt !== undefined) headers.set("x-stand-expires-at", String(stand.expiresAt));
  return new Response(null, { status: 204, headers });
}
