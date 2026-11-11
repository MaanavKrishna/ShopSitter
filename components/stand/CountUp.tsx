"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatCents } from "@/lib/money";
import { easeOut } from "@/lib/motion";

const money = (cents: number) => `$${formatCents(cents)}`;

/**
 * A money figure that counts to its value: from zero when it first appears, from the old
 * value when the bill changes. It always ends on the exact amount. Screen readers get the
 * real amount straight away, and so does anyone who asked for reduced motion.
 */
export function CountUp({ cents, className }: { cents: number; className?: string }) {
  const reduce = useReducedMotion();
  const node = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  // Rendered once; after that the figure is written straight to the element while it counts.
  const [first] = useState(() => money(0));

  useEffect(() => {
    const el = node.current;
    if (!el) return;
    if (reduce) {
      shown.current = cents;
      el.textContent = money(cents);
      return;
    }
    const controls = animate(shown.current, cents, {
      duration: 0.9,
      ease: easeOut,
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = money(Math.round(v));
      },
      onComplete: () => {
        shown.current = cents;
        el.textContent = money(cents);
      },
    });
    return () => controls.stop();
  }, [cents, reduce]);

  return (
    <span className={className}>
      <span ref={node} aria-hidden="true">
        {first}
      </span>
      <span className="sr-only">{money(cents)}</span>
    </span>
  );
}
