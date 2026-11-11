/**
 * Small decisions the browser screens make about requests: when to try again, what a failed
 * payment answer means, whether a refund amount can be sent, and where focus goes when a row leaves.
 */

/** A request is tried at most this many times. */
export const MAX_TRIES = 5;
/** No retry is started that would end later than this after the first try. */
export const MAX_RETRY_MS = 30_000;
const BASE_WAIT_MS = 1000;
/** How long to wait after "too many requests" when the server does not say. */
const LIMITED_WAIT_MS = 5000;
const LIMITED_MAX_MS = 15_000;

export type TryState = {
  /** Tries made so far, all failed. */
  tries: number;
  /** Time since the first try started. */
  elapsedMs: number;
  /** Status of the last answer, or null when the request never got one. */
  status: number | null;
  /** What a 429 asked for, when it said. */
  retryAfterMs?: number;
};

export type GiveUp = "wrong_code" | "gave_up";
export type NextTry = { retry: true; waitMs: number } | { retry: false; reason: GiveUp };

/** Whether to try a failed request again, and after how long: 1 s, 2 s, 4 s, 8 s. */
export function nextTry({ tries, elapsedMs, status, retryAfterMs }: TryState): NextTry {
  // A refused stand code stays refused however often it is sent.
  if (status === 401) return { retry: false, reason: "wrong_code" };
  // So does a request the server found wrong in itself.
  if (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return { retry: false, reason: "gave_up" };
  }
  if (tries >= MAX_TRIES) return { retry: false, reason: "gave_up" };
  let waitMs = BASE_WAIT_MS * 2 ** (tries - 1);
  if (status === 429) waitMs = Math.max(waitMs, Math.min(retryAfterMs ?? LIMITED_WAIT_MS, LIMITED_MAX_MS));
  if (elapsedMs + waitMs > MAX_RETRY_MS) return { retry: false, reason: "gave_up" };
  return { retry: true, waitMs };
}

/** The wait a Retry-After header asks for, when it is a number of seconds. */
export function retryAfterMs(header: string | null): number | undefined {
  if (header === null || header.trim() === "") return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

export type SendResult = { ok: true; response: Response } | { ok: false; reason: GiveUp };

/**
 * Sends a request until it is accepted or `nextTry` says to stop. `send` returns the answer,
 * or null (or throws) when there was none.
 */
export async function sendWithRetry(
  send: () => Promise<Response | null>,
  {
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    now = Date.now,
    onWaiting,
  }: {
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    /** Called before each wait with the number of tries that have failed. */
    onWaiting?: (tries: number, waitMs: number) => void;
  } = {},
): Promise<SendResult> {
  const startedAt = now();
  for (let tries = 1; ; tries++) {
    const response = await send().catch(() => null);
    if (response?.ok) return { ok: true, response };
    const next = nextTry({
      tries,
      elapsedMs: now() - startedAt,
      status: response?.status ?? null,
      retryAfterMs: retryAfterMs(response?.headers.get("retry-after") ?? null),
    });
    if (!next.retry) return { ok: false, reason: next.reason };
    onWaiting?.(tries, next.waitMs);
    await sleep(next.waitMs);
  }
}

/** The JSON body of an answer, or null when it has none (an error page, an empty body). */
export async function readJson<T = Record<string, unknown>>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Error code the server sends when PayPal took the money and the visit could not be marked paid. */
export const CAPTURED_UNRECORDED = "captured_but_unrecorded";

/**
 * What an answer to "capture this payment" means for the customer. Anything that is not a plain
 * refusal may have moved money, so it is never described as "nothing was charged".
 */
export function captureOutcome(status: number | null, code: string | undefined): "paid" | "unconfirmed" | "refused" {
  if (status !== null && status >= 200 && status < 300) return "paid";
  if (status === null || status >= 500 || code === CAPTURED_UNRECORDED) return "unconfirmed";
  return "refused";
}

export type RefundCheck = { ok: true; cents: number } | { ok: false; reason: "invalid" | "too_much" };

/** Reads a refund typed in dollars and checks it against what is left of the payment. */
export function checkRefund(text: string, leftCents: number): RefundCheck {
  const cents = Math.round(Number(text.trim()) * 100);
  if (text.trim() === "" || !Number.isFinite(cents) || cents <= 0) return { ok: false, reason: "invalid" };
  if (cents > leftCents) return { ok: false, reason: "too_much" };
  return { ok: true, cents };
}

/**
 * Where focus goes when one of a list's rows leaves: the row that takes its place, else the one
 * before it, else nowhere in the list (null). `ids` is the list before the removal.
 */
export function focusAfterRemoval(ids: string[], removed: string): string | null {
  const at = ids.indexOf(removed);
  if (at < 0) return null;
  return ids[at + 1] ?? ids[at - 1] ?? null;
}
