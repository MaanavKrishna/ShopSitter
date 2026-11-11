"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { formatCents } from "@/lib/money";
import { spring } from "@/lib/motion";
import type { VisitRow } from "@/lib/owner";
import { paidBuckets } from "@/lib/owner-view";

const dayName = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "long" });
const dayInitial = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "narrow" });
const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const hourName = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Small bar chart of money paid per day of the period (per hour when the period is one day). */
export function PaidChart({ visits, days, now }: { visits: VisitRow[]; days: number; now: number }) {
  const { unit, buckets } = paidBuckets(visits, days, now);
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(0, ...buckets.map((b) => b.cents));
  const best = max > 0 ? buckets.findIndex((b) => b.cents === max) : -1;
  const last = buckets.length - 1;
  const dense = buckets.length > 10;

  const name = (ms: number) => (unit === "hour" ? hourName(ms) : dense ? shortDate(ms) : dayName(ms));
  // The bar under the pointer is named in full: the hour, or the day with its date.
  const fullName = (ms: number) => (unit === "hour" || dense ? name(ms) : `${dayName(ms)} ${shortDate(ms)}`);
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

  const pointed = hovered !== null ? buckets[hovered] : null;
  // The best bar keeps its amount; the bar under the pointer shows its own.
  const labelled = (i: number) => i === best || i === hovered;

  return (
    <figure className="ow-chart" data-dense={dense || undefined}>
      <figcaption>
        <h2>{unit === "hour" ? "Paid by hour" : "Paid by day"}</h2>
        {pointed ? (
          <span>
            {fullName(pointed.start)} · <b className="num">${formatCents(pointed.cents)}</b>
          </span>
        ) : best >= 0 ? (
          <span>
            Best {unit}: {name(buckets[best].start)}
          </span>
        ) : (
          <span>No payments yet</span>
        )}
      </figcaption>
      <div className="ow-chart-plot" role="img" aria-label={summary} onPointerLeave={() => setHovered(null)}>
        {buckets.map((b, i) => (
          <div
            key={b.start}
            className="ow-chart-col"
            data-lean={lean(i)}
            data-dim={(hovered !== null && hovered !== i) || undefined}
            onPointerEnter={() => setHovered(i)}
          >
            {labelled(i) && b.cents > 0 && <span className="ow-chart-value num">${formatCents(b.cents)}</span>}
            {b.cents === 0 ? (
              <span className="ow-chart-bar" data-zero />
            ) : (
              <motion.span
                className="ow-chart-bar"
                style={{ height: `${Math.max(4, (b.cents / max) * 100)}%`, originY: 1 }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ ...spring, duration: 0.55, delay: 0.1 + Math.min(i * 0.03, 0.36) }}
              />
            )}
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
