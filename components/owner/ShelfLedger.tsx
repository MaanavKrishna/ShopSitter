import { formatCents } from "@/lib/money";
import type { Totals, VisitRow } from "@/lib/owner";
import { ledgerParts, segmentShares } from "@/lib/owner-view";

// A sliver narrower than this is hard to see on a phone, so small parts are lifted to it.
const MIN_SHARE = 3;

/** One bar showing where the value taken from the shelf went, with the amounts underneath. */
export function ShelfLedger({ totals, visits }: { totals: Totals; visits: VisitRow[] }) {
  const { parts, totalCents } = ledgerParts(totals, visits);
  const shares = segmentShares(parts, MIN_SHARE);
  const summary =
    totalCents === 0
      ? "Nothing taken from the shelf in this period."
      : `Of $${formatCents(totalCents)} taken from the shelf: ${parts
          .map((p) => `${p.label.toLowerCase()} $${formatCents(p.cents)}`)
          .join(", ")}.`;

  return (
    <div className="ow-ledger">
      <div className="ow-ledger-track" role="img" aria-label={summary}>
        <div className="ow-ledger-fill">
          {parts.map(
            (p, i) =>
              shares[i] > 0 && (
                <span key={p.key} className="ow-ledger-seg" data-part={p.key} style={{ flexGrow: shares[i] }} />
              ),
          )}
        </div>
      </div>
      <dl className="ow-ledger-legend">
        {parts.map((p) => (
          <div key={p.key} className="ow-ledger-item">
            <dt>
              <span className="ow-ledger-swatch" data-part={p.key} aria-hidden="true" />
              {p.label}
            </dt>
            <dd className="num">${formatCents(p.cents)}</dd>
          </div>
        ))}
        <div className="ow-ledger-item ow-ledger-total">
          <dt>Taken from the shelf</dt>
          <dd className="num">${formatCents(totalCents)}</dd>
        </div>
      </dl>
    </div>
  );
}
