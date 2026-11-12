"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { easeOut, spring, springBouncy } from "@/lib/motion";
import { formatCents } from "@/lib/money";
import type { PricedBill } from "@/lib/types";

type Props = {
  bill: PricedBill;
  /** What the hold was charged, when this page saw the basket settle. Null when it is opened again later. */
  paidCents: number | null;
  holdCents: number | null;
  /** Where the part that did not fit the hold can be paid. */
  payRest: string | null;
  /** True when the basket was just finished on this page: play the full entrance once. */
  celebrate: boolean;
};

const riseIn = { hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0, transition: spring } };
const fadeIn = { hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: 0.2 } } };

/** A finished basket: the pay page's receipt, with what happened to the hold. */
export function BasketReceipt({ bill, paidCents, holdCents, payRest, celebrate }: Props) {
  const reduce = useReducedMotion();
  const full = celebrate && !reduce;
  const item = full ? riseIn : fadeIn;
  const nothing = paidCents === 0;
  const shown = paidCents ?? bill.totalCents;
  const released = paidCents !== null && holdCents !== null ? Math.max(0, holdCents - paidCents) : null;

  return (
    <motion.section
      aria-live="polite"
      className="payx-content payx-receipt"
      data-state="paid"
      initial="hidden"
      animate="shown"
      variants={{ hidden: {}, shown: { transition: full ? { delayChildren: 0.32, staggerChildren: 0.07 } : {} } }}
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
              transition={{ pathLength: { duration: 0.38, ease: easeOut, delay: 0.2 }, opacity: { duration: 0.01, delay: 0.2 } }}
            />
          </svg>
        </motion.span>
      </div>

      <motion.h1 className="payx-receipt-title" variants={item}>
        {nothing ? "Nothing charged" : "Paid, thank you"}
      </motion.h1>
      <motion.p className="payx-receipt-amount" variants={item}>
        <span className="sr-only">{paidCents === null ? "Total " : "You paid "}</span>
        <span className="num">${formatCents(shown)}</span>
      </motion.p>

      {bill.lines.length > 0 && (
        <motion.ul className="payx-receipt-lines" variants={item}>
          {bill.lines.map((l) => (
            <li key={l.sku}>
              <span className="payx-receipt-qty num">{l.qty} ×</span>
              <span className="payx-receipt-name">{l.name}</span>
              <span className="num">${formatCents(l.lineCents)}</span>
            </li>
          ))}
        </motion.ul>
      )}

      <motion.dl className="payx-receipt-meta" variants={item}>
        <div>
          <dt>{paidCents === null ? "Total" : "Total paid"}</dt>
          <dd className="num">${formatCents(shown)}</dd>
        </div>
        {released !== null && (
          <div>
            <dt>Released from your ${formatCents(holdCents ?? 0)} hold</dt>
            <dd className="num">${formatCents(released)}</dd>
          </div>
        )}
      </motion.dl>

      {payRest && (
        <motion.div className="bk-rest" variants={item}>
          <p>Your basket was more than the hold. The rest is on a separate bill.</p>
          <Link href={payRest} className="bk-done ds-press">
            Pay the rest
          </Link>
        </motion.div>
      )}

      <motion.p className="payx-small payx-receipt-close" variants={item}>
        {payRest ? "The hold has paid for the items above." : "You can close this page."}
      </motion.p>
    </motion.section>
  );
}
