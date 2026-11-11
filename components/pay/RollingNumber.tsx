"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { springSnappy } from "@/lib/motion";

const roll = {
  enter: (dir: number) => ({ y: `${dir * 80}%`, opacity: 0 }),
  rest: { y: "0%", opacity: 1 },
  exit: (dir: number) => ({ y: `${dir * -80}%`, opacity: 0 }),
};

const fade = {
  enter: { opacity: 0 },
  rest: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * Shows `text` exactly as given and rolls only the characters that changed: up when `value`
 * grew, down when it shrank. `value` is used for direction only; nothing is counted or
 * interpolated, so the figure on screen is always one the server sent.
 */
export function RollingNumber({
  value,
  text,
  label,
  className,
}: {
  value: number;
  text: string;
  /** What a screen reader hears, when the bare figure is not enough. */
  label?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [seen, setSeen] = useState(value);
  const [dir, setDir] = useState(1);
  if (value !== seen) {
    setDir(value > seen ? 1 : -1);
    setSeen(value);
  }

  const chars = [...text];
  return (
    <span className={className ? `payx-roll ${className}` : "payx-roll"}>
      <span className="sr-only">{label ?? text}</span>
      <span className="payx-roll-row" aria-hidden="true">
        <AnimatePresence initial={false} mode="popLayout" custom={dir}>
          {chars.map((c, i) => {
            // Keyed from the right, so cents and dollars keep their slots when a digit is added in front.
            const slot = chars.length - i;
            return (
              <motion.span
                key={c === "$" ? "currency" : `${slot}-${c}`}
                className="payx-roll-char"
                custom={dir}
                variants={reduce ? fade : roll}
                initial="enter"
                animate="rest"
                exit="exit"
                transition={springSnappy}
              >
                {c}
              </motion.span>
            );
          })}
        </AnimatePresence>
      </span>
    </span>
  );
}
