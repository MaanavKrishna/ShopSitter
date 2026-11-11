// The demo stand's example week, worked out with the same code the dashboard uses, so the
// figures on the public pages are the ones a visitor finds after signing in.
import { ownerOverview } from "@/lib/owner";
import { ledgerParts, segmentShares } from "@/lib/owner-view";
import type { Repo } from "@/lib/repo";
import { exampleVisits, productsFor } from "@/lib/seed";
import type { Visit } from "@/lib/visits";
import type { Item, Tone } from "./bits";
import { usd } from "./bits";

const SHOP = "demo";
const DAYS = 7;
/** The demo stand is seeded with this many of each product. */
const SEED_STOCK = 12;

export const catalogue = (): Item[] => productsFor(SHOP).map(({ sku, name, priceCents }) => ({ sku, name, priceCents }));

const STATUS: Record<Visit["status"], { tone: Tone; label: string }> = {
  open: { tone: "open", label: "Open" },
  paid: { tone: "paid", label: "Paid" },
  paid_late: { tone: "paid", label: "Paid late" },
  paid_adjusted: { tone: "adjusted", label: "Adjusted" },
  unmatched: { tone: "unmatched", label: "Unmatched" },
  settled_other: { tone: "settled", label: "Settled another way" },
  empty: { tone: "open", label: "Nothing taken" },
};

export async function demoWeek() {
  const now = Date.now();
  const products = productsFor(SHOP).map((p) => ({ ...p, stock: SEED_STOCK }));
  const seeded = exampleVisits(SHOP, now);
  // Just enough of a store for the overview to read the seed from memory.
  const repo = {
    listProducts: async () => products,
    listVisits: async () => seeded,
    saveVisit: async () => {},
    getPhoto: async () => null,
  } as unknown as Repo;

  const { visits, totals, stock } = await ownerOverview(repo, SHOP, DAYS, now);
  const { parts, totalCents } = ledgerParts(totals, visits);
  const shares = segmentShares(parts, 3);

  return {
    days: DAYS,
    visitCount: visits.length,
    totalCents,
    totals,
    parts: parts.map((p, i) => ({ ...p, share: shares[i] })),
    stock: stock.map((s) => ({ ...s, of: SEED_STOCK })),
    rows: [...visits]
      .sort((a, b) => b.openedAt - a.openedAt)
      .map((v) => ({
        id: v.id,
        what: v.detectedBill.lines.map((l) => `${l.qty} × ${l.name}`).join(", "),
        tone: STATUS[v.status].tone,
        status: STATUS[v.status].label,
        detected: usd(v.detectedCents),
        paid: v.paidCents === null ? "—" : usd(v.paidCents),
        amount: usd(v.paidCents ?? v.detectedCents),
      })),
  };
}

export type DemoWeek = Awaited<ReturnType<typeof demoWeek>>;
