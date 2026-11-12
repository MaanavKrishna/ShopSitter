// The store simulator's script and the words it shows. Pure: the page runs the real routes and
// asks this file what comes next, what changed in the basket and how to say it.

import { formatCents } from "./money";
import type { BillLine } from "./types";

export type ShelfKey = "top" | "lower";

/** Shelf pictures are composed from product photos; each sample is a pair in public/samples. */
export const SHELVES = [
  { key: "top" as ShelfKey, name: "Top shelf", aisle: "Aisle 1", order: 0, start: "one-jar-before.jpg" },
  { key: "lower" as ShelfKey, name: "Lower shelf", aisle: "Aisle 1", order: 1, start: "two-alike-before.jpg" },
];

/** The starter catalogue (lib/seed.ts), each kept on the shelf whose camera sees it change. Null is "anywhere". */
export const SIM_PRODUCTS = [
  { sku: "honey", name: "Honey", description: "Glass jar of golden honey with a yellow lid", price: "7.00", shelf: "top" as ShelfKey | null },
  { sku: "jam", name: "Strawberry jam", description: "Small glass jar of red jam with a checked cloth lid", price: "6.00", shelf: null },
  { sku: "bread", name: "Sourdough loaf", description: "Round loaf of bread in a brown paper bag", price: "5.00", shelf: null },
  { sku: "eggs", name: "Half-dozen eggs", description: "Grey cardboard box of six eggs", price: "4.50", shelf: "lower" as ShelfKey | null },
  { sku: "apples", name: "Bag of apples", description: "Clear bag of red apples", price: "4.00", shelf: "lower" as ShelfKey | null },
  { sku: "flowers", name: "Bunch of flowers", description: "Small bunch of mixed flowers tied with string", price: "8.00", shelf: "top" as ShelfKey | null },
];

export type Change = { sku: string; name: string; qty: number };

export type Step = {
  id: string;
  shelf: ShelfKey;
  label: string;
  /** What the shopper does, in a few words for the step's button. */
  verb: string;
  before: string;
  after: string;
  /** What the shelf really lost or got back. Used to check the script, never to price anything. */
  expect: { sku: string; qty: number }[];
};

export const SCRIPT: Step[] = [
  {
    id: "take-honey",
    shelf: "top",
    label: "Take a jar of honey",
    verb: "Take honey",
    before: "one-jar-before.jpg",
    after: "one-jar-after.jpg",
    expect: [{ sku: "honey", qty: 1 }],
  },
  {
    id: "take-eggs",
    shelf: "lower",
    label: "Take two boxes of eggs",
    verb: "Take eggs",
    before: "two-alike-before.jpg",
    after: "two-alike-after.jpg",
    expect: [{ sku: "eggs", qty: 2 }],
  },
  {
    id: "put-back",
    shelf: "top",
    label: "Put the honey back",
    verb: "Put honey back",
    before: "put-back-before.jpg",
    after: "put-back-after.jpg",
    expect: [{ sku: "honey", qty: -1 }],
  },
  {
    id: "slide",
    shelf: "top",
    label: "Slide the loaf along",
    verb: "Slide the loaf",
    before: "slid-along-before.jpg",
    after: "slid-along-after.jpg",
    expect: [],
  },
];

/** Reads one visit to this page may make. Each is a paid vision model call. */
export const MAX_READS = 12;

/** Different files composed to show the very same shelf. */
const SCENES: string[][] = [
  ["one-jar-before.jpg", "put-back-after.jpg", "slid-along-before.jpg"],
  ["one-jar-after.jpg", "put-back-before.jpg"],
];

export function sameScene(a: string, b: string): boolean {
  if (a === b) return true;
  return SCENES.some((group) => group.includes(a) && group.includes(b));
}

/** True when every step starts from the picture its shelf shows at that moment. */
export function scriptChains(script: Step[]): boolean {
  const showing = new Map(SHELVES.map((s) => [s.key, s.start]));
  for (const step of script) {
    if (!sameScene(showing.get(step.shelf)!, step.before)) return false;
    showing.set(step.shelf, step.after);
  }
  return true;
}

/** The step after `done` steps, or null at the end. */
export const nextStep = (done: number): Step | null => SCRIPT[done] ?? null;

/** The picture a shelf shows once `done` steps have run. */
export function pictureAfter(shelf: ShelfKey, done: number): string {
  let picture = SHELVES.find((s) => s.key === shelf)!.start;
  for (const step of SCRIPT.slice(0, done)) if (step.shelf === shelf) picture = step.after;
  return picture;
}

/** What changed between two baskets, by product. */
export function basketChanges(before: BillLine[], after: BillLine[]): Change[] {
  const skus = [...new Set([...before.map((l) => l.sku), ...after.map((l) => l.sku)])];
  const out: Change[] = [];
  for (const sku of skus) {
    const was = before.find((l) => l.sku === sku);
    const now = after.find((l) => l.sku === sku);
    const qty = (now?.qty ?? 0) - (was?.qty ?? 0);
    if (qty !== 0) out.push({ sku, name: (now ?? was)!.name, qty });
  }
  return out;
}

const counted = (c: Change) => (Math.abs(c.qty) === 1 ? c.name : `${Math.abs(c.qty)} × ${c.name}`);

/** One sentence for the screen reader when the basket changes. */
export function announce(changes: Change[]): string {
  if (changes.length === 0) return "Nothing changed in the basket.";
  return changes
    .map((c) => `${counted(c)} ${c.qty > 0 ? "added to" : "taken off"} the basket.`)
    .join(" ");
}

/** "What just happened", from the real read: the shelf, the basket's change and the server's total. */
export function explainRead(read: { shelfName: string; changes: Change[]; confidence: number | null; totalCents: number }): string {
  const sent = `The ${read.shelfName.toLowerCase()}'s camera sent two pictures.`;
  const total = `$${formatCents(read.totalCents)}`;
  if (read.changes.length === 0) {
    return `${sent} The vision model saw nothing leave or come back, so nothing was charged. The basket stays at ${total}.`;
  }
  const answer = read.changes
    .map((c) => (c.qty > 0 ? `${c.name} × ${c.qty}` : `${counted(c)} put back`))
    .join(", ");
  const sure = read.confidence === null ? "" : ` with ${Math.round(read.confidence * 100)}% confidence`;
  return `${sent} The vision model answered ${answer}${sure}. The server priced the basket at ${total} from the catalogue.`;
}

export type RailState = "done" | "now" | "next";

/** The five narrated steps, lit from what really happened. */
export function stepRail(s: { store: boolean; reads: number; lines: number; done: boolean; ownerSeen: boolean }): RailState[] {
  const reached = [s.store, s.reads > 0, s.reads > 0 && (s.lines > 0 || s.done), s.done, s.done && s.ownerSeen];
  const firstOpen = reached.indexOf(false);
  return reached.map((r, i) => (r ? "done" : i === firstOpen ? "now" : "next"));
}

export const STEP_NAMES = ["Open the store", "Take something", "Watch the basket", "Leave or pay", "See what the owner sees"];

/** Words for a setup that did not work. `status` is null when the server never answered. */
export function setupProblem(status: number | null, code: string | undefined): string {
  if (status === null) return "The sample store couldn't be reached. Check your connection and try again.";
  if (code === "slow_down" || code === "trial_busy") {
    return "Too many sample stores started from this network in the last hour. Try again later, or watch the sample reads below.";
  }
  if (code === "owner_signed_in") {
    return "You're signed in to a real stand on this browser. Sign out first, or use a private window.";
  }
  if (code === "trial_limit" || code === "zone_limit") return "Your trial store is full. Close it below and open a fresh one.";
  if (code === "store_busy") return "This store has checked in a lot of shoppers today. Try again tomorrow.";
  return "The sample store couldn't be set up just now. Try again in a moment.";
}

/** Words for a shelf read that did not work. */
export function readProblem(status: number | null, code: string | undefined): string {
  if (status === null) return "The shelf camera couldn't reach the server. Check your connection and try again.";
  if (code === "trial_read_limit") return "This sample store has used today's 60 reads for that shelf.";
  if (code === "trial_busy") return "Sample stores are busy right now. Try again a little later.";
  if (status === 401) return "This sample store has ended. Open a new one to keep going.";
  return "That read didn't go through. Nothing was charged; try the step again.";
}
