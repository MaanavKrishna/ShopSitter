import { formatCents } from "@/lib/money";
import type { VisitRow } from "@/lib/owner";
import { paidBuckets } from "@/lib/owner-view";

const dayName = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "long" });
const dayInitial = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "narrow" });
const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const hourName = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Small bar chart of money paid per day of the period (per hour when the period is one day). */
export function PaidChart({ visits, days, now }: { visits: VisitRow[]; days: number; now: number }) {
  const { unit, buckets } = paidBuckets(visits, days, now);
  const max = Math.max(0, ...buckets.map((b) => b.cents));
  const best = max > 0 ? buckets.findIndex((b) => b.cents === max) : -1;
  const last = buckets.length - 1;
  const dense = buckets.length > 10;

  const name = (ms: number) => (unit === "hour" ? hourName(ms) : dense ? shortDate(ms) : dayName(ms));
  // Every bar is named when there are few; otherwise every sixth hour or seventh day, counted back from now.
  const tick = (i: number, ms: number) => {
    if (!dense) return dayInitial(ms);
    const step = unit === "hour" ? 6 : 7;
    return (last - i) % step === 0 ? name(ms) : null;
  };
  // A label over a bar near the edge leans inwards so it stays inside the chart.
  const lean = (i: number) => (!dense ? undefined : i < 3 ? "start" : i > last - 3 ? "end" : undefined);

  const paidOnes = buckets.filter((b) => b.cents > 0);
  const summary =
    paidOnes.length === 0
      ? "No payments in this period."
      : `${paidOnes.map((b) => `${name(b.start)} $${formatCents(b.cents)}`).join(", ")}.`;

  return (
    <figure className="ow-chart" data-dense={dense || undefined}>
      <figcaption>
        <h2>{unit === "hour" ? "Paid by hour" : "Paid by day"}</h2>
        {best >= 0 && (
          <span>
            Best {unit}: {name(buckets[best].start)}
          </span>
        )}
      </figcaption>
      <div className="ow-chart-plot" role="img" aria-label={summary}>
        {buckets.map((b, i) => (
          <div key={b.start} className="ow-chart-col" data-lean={lean(i)}>
            {i === best && <span className="ow-chart-value num">${formatCents(b.cents)}</span>}
            <span
              className="ow-chart-bar"
              data-zero={b.cents === 0 || undefined}
              style={{
                height: b.cents === 0 ? undefined : `${Math.max(4, (b.cents / max) * 100)}%`,
                animationDelay: `${Math.min(i * 18, 360)}ms`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="ow-chart-axis" aria-hidden="true">
        {buckets.map((b, i) => (
          <span key={b.start} data-lean={i === last && dense ? "end" : undefined}>
            <i>{tick(i, b.start)}</i>
          </span>
        ))}
      </div>
    </figure>
  );
}
