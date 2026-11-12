// What one phone remembers about its basket between page loads. Kept in this tab only.

const holdKey = (sessionId: string) => `shopsitter-basket-hold-${sessionId}`;
const hiddenKey = (sessionId: string) => `shopsitter-basket-hidden-${sessionId}`;

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Private windows may refuse storage; the basket still works for this page load.
  }
}

/** The PayPal order made at check-in for this basket's hold. */
export const rememberHold = (sessionId: string, orderId: string) => write(holdKey(sessionId), orderId);
export const heldOrder = (sessionId: string) => read(holdKey(sessionId));
export const forgetHold = (sessionId: string) => write(holdKey(sessionId), null);

/** Shelf changes this shopper said were not theirs. */
export function hiddenChanges(sessionId: string): string[] {
  try {
    const list = JSON.parse(read(hiddenKey(sessionId)) ?? "[]") as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export const rememberHidden = (sessionId: string, ids: string[]) => write(hiddenKey(sessionId), JSON.stringify(ids.slice(-50)));
