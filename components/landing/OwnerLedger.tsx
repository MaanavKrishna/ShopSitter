"use client";

import { useStill } from "./useStill";
import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { easeOut, spring, STAGGER } from "@/lib/motion";
import { formatCents } from "@/lib/money";

export type LedgerSlice = { key: string; label: string; cents: number; share: number };

/**
 * A miniature of the dashboard's shelf ledger: one bar for where the value taken from the
 * shelf went, drawn in from the left the first time it is seen, with the amounts underneath.
 */
export function OwnerLedger({ slices, totalCents }: { slices: LedgerSlice[]; totalCents: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useStill();
  const seen = useInView(ref, { once: true, amount: 0.45 });
  const on = seen || !!reduce;
  const paid = slices.find((s) => s.key === "paid");
  const summary = `Of $${formatCents(totalCents)} taken from the shelf: ${slices
    .map((s) => `${s.label.toLowerCase()} $${formatCents(s.cents)}`)
    .join(", ")}.`;

  return (
    <div ref={ref} className="lp-ledger">
      <div className="lp-ledger-head">
        <p>
          <span>Paid through PayPal</span>
          <b className="num">${formatCents(paid?.cents ?? 0)}</b>
        </p>
        <p>
          <span>Taken from the shelf</span>
          <b className="num">${formatCents(totalCents)}</b>
        </p>
      </div>

      <div className="lp-ledger-track" role="img" aria-label={summary}>
        <motion.div
          className="lp-ledger-fill"
          initial={false}
          animate={{ clipPath: on ? "inset(0 0% 0 0 round 10px)" : "inset(0 100% 0 0 round 10px)" }}
          transition={{ duration: reduce ? 0 : 1.1, ease: easeOut }}
        >
          {slices.map((s) => s.share > 0 && <span key={s.key} data-part={s.key} style={{ flexGrow: s.share }} />)}
        </motion.div>
      </div>

      <dl className="lp-ledger-legend">
        {slices.map((s, i) => (
          <motion.div
            key={s.key}
            initial={false}
            animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ ...spring, delay: reduce ? 0 : 0.35 + i * STAGGER }}
          >
            <dt>
              <i data-part={s.key} aria-hidden="true" />
              {s.label}
            </dt>
            <dd className="num">${formatCents(s.cents)}</dd>
          </motion.div>
        ))}
      </dl>
    </div>
  );
}
