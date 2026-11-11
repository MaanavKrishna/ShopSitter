"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { springSnappy } from "@/lib/motion";

/** Minus, count, plus: the control the pay page uses to correct a line of the bill. */
export function Stepper({
  qty,
  onChange,
  name,
  min = 0,
  max = 20,
}: {
  qty: number;
  onChange: (qty: number) => void;
  name: string;
  min?: number;
  max?: number;
}) {
  return (
    <span className="in-stepper" role="group" aria-label={`How many: ${name}`}>
      <button type="button" className="ds-focus" aria-label={`One fewer ${name}`} disabled={qty <= min} onClick={() => onChange(qty - 1)}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8h9" />
        </svg>
      </button>
      <Rolling className="in-stepper-n num" text={String(qty)} value={qty} />
      <button type="button" className="ds-focus" aria-label={`One more ${name}`} disabled={qty >= max} onClick={() => onChange(qty + 1)}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8h9M8 3.5v9" />
        </svg>
      </button>
    </span>
  );
}

/** A figure that rolls up when it grows and down when it shrinks. */
export function Rolling({ value, text, className }: { value: number; text: string; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <span className={`in-rolling ${className ?? ""}`} aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false} custom={value}>
        <motion.span
          key={text}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, filter: "blur(3px)" }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, filter: "blur(3px)" }}
          transition={springSnappy}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
