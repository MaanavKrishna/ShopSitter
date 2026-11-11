"use client";

import { motion, useReducedMotion } from "motion/react";
import { easeOut, spring, springBouncy } from "@/lib/motion";
import { formatCents } from "@/lib/money";
import type { PricedBill } from "@/lib/types";

type Props = {
  bill: PricedBill;
  paidCents: number;
  captureId: string | null | undefined;
  /** True when the payment was just made on this page: play the full entrance once. */
  celebrate: boolean;
};

const riseIn = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0, transition: spring },
};

const fadeIn = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.2 } },
};

/** The paid state: the bill sheet resolved into a receipt. */
export function Receipt({ bill, paidCents, captureId, celebrate }: Props) {
  const reduce = useReducedMotion();
  const full = celebrate && !reduce;
  const item = full ? riseIn : fadeIn;

  return (
    <motion.section
      aria-live="polite"
      className="payx-content payx-receipt"
      data-state="paid"
      // Opening an already-paid link gets a quick fade; only a fresh payment gets the sequence.
      initial="hidden"
      animate="shown"
      variants={{
        hidden: {},
        shown: { transition: full ? { delayChildren: 0.32, staggerChildren: 0.07 } : {} },
      }}
    >
      <div className="payx-seal" aria-hidden="true">
        {full && (
          <motion.span
            className="payx-seal-ring"
            initial={{ scale: 1, opacity: 0 }}
            animate={{ scale: 1.75, opacity: [0, 0.45, 0] }}
            transition={{ duration: 0.75, ease: easeOut, delay: 0.14, times: [0, 0.15, 1] }}
          />
        )}
        <motion.span
          className="payx-seal-disc"
          initial={full ? { scale: 0.6, opacity: 0 } : { opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={full ? springBouncy : { duration: 0.2 }}
        >
          <svg viewBox="0 0 40 40" fill="none">
            <motion.path
              d="M11.5 20.8l5.9 5.9 11.4-12.6"
              stroke="currentColor"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={full ? { pathLength: 0, opacity: 0 } : false}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{
                pathLength: { duration: 0.38, ease: easeOut, delay: 0.2 },
                opacity: { duration: 0.01, delay: 0.2 },
              }}
            />
          </svg>
        </motion.span>
      </div>

      <motion.h1 className="payx-receipt-title" variants={item}>
        Paid, thank you
      </motion.h1>
      <motion.p className="payx-receipt-amount" variants={item}>
        <span className="sr-only">You paid </span>
        <span className="num">${formatCents(paidCents)}</span>
      </motion.p>

      <motion.ul className="payx-receipt-lines" variants={item}>
        {bill.lines.map((l) => (
          <li key={l.sku}>
            <span className="payx-receipt-qty num">{l.qty} ×</span>
            <span className="payx-receipt-name">{l.name}</span>
            <span className="num">${formatCents(l.lineCents)}</span>
          </li>
        ))}
      </motion.ul>

      <motion.dl className="payx-receipt-meta" variants={item}>
        <div>
          <dt>Total paid</dt>
          <dd className="num">${formatCents(paidCents)}</dd>
        </div>
        <div>
          <dt>PayPal reference</dt>
          <dd className="payx-ref">{captureId}</dd>
        </div>
      </motion.dl>

      <motion.p className="payx-small payx-receipt-close" variants={item}>
        You can close this page.
      </motion.p>
    </motion.section>
  );
}
