"use client";

import { animate, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { formatCents } from "@/lib/money";
import { easeOut } from "@/lib/motion";

const text = (cents: number) => `$${formatCents(cents)}`;

/**
 * A money figure that counts from the amount it last showed to the new one, and lands on it exactly.
 * Screen readers get the final amount only.
 */
export function CountUp({ cents, className }: { cents: number; className?: string }) {
  const figure = useRef<HTMLSpanElement>(null);
  // The amount on screen right now, so a count that is interrupted carries on from where it was.
  const showing = useRef(0);
  const reduce = useReducedMotion();

  useLayoutEffect(() => {
    const el = figure.current;
    if (!el) return;
    const from = showing.current;
    if (reduce || from === cents) {
      showing.current = cents;
      el.textContent = text(cents);
      return;
    }
    el.textContent = text(from);
    const run = animate(from, cents, {
      duration: 0.9,
      ease: easeOut,
      onUpdate: (v) => {
        showing.current = Math.round(v);
        el.textContent = text(showing.current);
      },
      onComplete: () => {
        showing.current = cents;
        el.textContent = text(cents);
      },
    });
    return () => run.stop();
  }, [cents, reduce]);

  return (
    <span className={className}>
      <span className="sr-only">{text(cents)}</span>
      <span ref={figure} aria-hidden="true">
        {text(cents)}
      </span>
    </span>
  );
}
