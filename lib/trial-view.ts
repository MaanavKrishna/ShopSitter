// What the screens say about a trial stand: how long it has left, how far its first visit has
// got, and the words for the refusals only a trial can meet. No server imports.

const MINUTE_MS = 60_000;

/** True once a trial's time has run out. */
export const trialOver = (expiresAt: number, now: number): boolean => now >= expiresAt;

/** The time a trial has left, as "23 h 12 min", "12 min" or "under a minute". Empty once it is over. */
export function timeLeft(expiresAt: number, now: number): string {
  if (trialOver(expiresAt, now)) return "";
  const minutes = Math.floor((expiresAt - now) / MINUTE_MS);
  if (minutes < 1) return "under a minute";
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

export type StepKey = "products" | "stand" | "take" | "paid";

export type GetGoingInput = {
  /** Products on sale. */
  products: number;
  visits: { status: string }[];
  /** People the stand has counted stopping by. */
  visitors: number;
  /** The stand screen was opened with this trial's key, as far as this browser knows. */
  standOpened: boolean;
};

export type GetGoingState = { steps: { key: StepKey; done: boolean }[]; next: StepKey | null; complete: boolean };

/**
 * How far a trial has got through its first visit, worked out from what the stand holds.
 *  - products: at least one is on sale.
 *  - stand: the stand screen has reported anything at all (a shelf read, a person counted),
 *    or this browser knows it was opened.
 *  - take: a visit exists where something left the shelf.
 *  - paid: a visit was paid.
 */
export function getGoing({ products, visits, visitors, standOpened }: GetGoingInput): GetGoingState {
  const taken = visits.some((v) => v.status !== "empty");
  const steps: GetGoingState["steps"] = [
    { key: "products", done: products > 0 },
    { key: "stand", done: standOpened || visitors > 0 || visits.length > 0 },
    { key: "take", done: taken },
    { key: "paid", done: visits.some((v) => v.status.startsWith("paid")) },
  ];
  const next = steps.find((s) => !s.done)?.key ?? null;
  return { steps, next, complete: next === null };
}

/** Why a trial could not be started. `status` is null when the server never answered. */
export function trialStartProblem(status: number | null, code: string | undefined): string {
  if (status === null) return "The stand couldn't be started. Check your connection and try again.";
  if (code === "owner_signed_in") {
    return "You're signed in to a real stand on this browser. Sign out first, or use a private window.";
  }
  if (code === "slow_down") return "You've started a few stands in the last hour. Wait a little, then try again.";
  if (code === "trial_busy") return "Trial stands are busy today. Try again later, or watch the sample shelves below.";
  return "The stand couldn't be started just now. Try again in a moment.";
}

/** Words for the refusals of a shelf read that only a trial stand can meet, or null for any other. */
export function standChangeProblem(code: string | undefined): string | null {
  if (code === "trial_read_limit") return "This trial has used today's 60 shelf reads.";
  if (code === "trial_busy") return "Trial stands are busy right now. Shelf reads will pick up again later.";
  if (code === "photo_too_large") return "That shelf photo was too large to send. The next one will be tried.";
  if (code === "trial_still_limit") return "This trial has sent as many extra-camera photos as it can for now.";
  return null;
}
