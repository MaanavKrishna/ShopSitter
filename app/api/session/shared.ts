import { allow } from "@/lib/auth";
import { privateJson } from "@/lib/http";
import { SESSION_ERROR_STATUS, SessionError, isSessionId } from "@/lib/sessions";

export const refuse = (error: string, status: number) => privateJson({ error }, status);

export type SessionContext = { params: Promise<{ id: string }> };

/**
 * Runs a session route. The id in the path is the shopper's only credential: anything that is not
 * shaped like one is answered 404 before storage is asked, and each session has its own request
 * allowance (`max` a minute for this kind of call). The id is never written to a log.
 */
export async function sessionRoute<T>(
  ctx: SessionContext,
  kind: string,
  max: number,
  work: (id: string) => Promise<T>,
): Promise<Response> {
  const { id } = await ctx.params;
  if (!isSessionId(id)) return refuse("not_found", 404);
  if (!allow(`session-${kind}:${id}`, max, 60_000)) return refuse("slow_down", 429);
  try {
    return privateJson(await work(id));
  } catch (e) {
    if (e instanceof SessionError) return refuse(e.code, SESSION_ERROR_STATUS[e.code]);
    console.error("session route failed", e instanceof Error ? e.message : e);
    return refuse("server_error", 500);
  }
}
