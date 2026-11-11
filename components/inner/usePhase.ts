"use client";

import { type RefObject, useEffect, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";

/**
 * Steps a small demonstration through its phases while it is on screen, holding each phase
 * for the given time and then starting again. With reduced motion it rests on the last phase,
 * which every demonstration draws as its finished state.
 */
export function usePhase(ref: RefObject<Element | null>, holds: readonly number[]): number {
  const inView = useInView(ref, { amount: 0.5 });
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const timer = setTimeout(() => setPhase((p) => (p + 1) % holds.length), holds[phase]);
    return () => clearTimeout(timer);
  }, [inView, reduce, phase, holds]);

  return reduce ? holds.length - 1 : phase;
}
