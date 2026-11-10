// Turns a stream of "is a person or a hand in view?" answers into a steady signal.
// The answers come from a detector running on the stand device itself; no picture of a
// person is stored or sent, and nobody is identified.

const HITS_TO_START = 2; // sightings in a row before someone counts as present
const ABSENT_MS = 3000; // with no sighting for this long, they have gone

export type PresenceState = { present: boolean; hits: number; lastSeenAt: number | null };
export const initialPresence = (): PresenceState => ({ present: false, hits: 0, lastSeenAt: null });

/** `left` is true once, at the moment someone who was present is counted as gone. */
export function stepPresence(state: PresenceState, sample: { seen: boolean; t: number }): { state: PresenceState; left: boolean } {
  if (sample.seen) {
    const hits = state.hits + 1;
    return { state: { present: state.present || hits >= HITS_TO_START, hits, lastSeenAt: sample.t }, left: false };
  }
  if (!state.present) return { state: initialPresence(), left: false };
  if (state.lastSeenAt !== null && sample.t - state.lastSeenAt < ABSENT_MS) {
    return { state: { ...state, hits: 0 }, left: false };
  }
  return { state: initialPresence(), left: true };
}
