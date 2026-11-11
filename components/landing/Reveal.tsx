"use client";

import { useStill } from "./useStill";
import { useLayoutEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { spring } from "@/lib/motion";

/**
 * Fades and lifts its children into place the first time they scroll into view.
 * The content is rendered visible; it is only held back when, on load, it sits below the
 * fold, so nothing is hidden from someone without scripts or who is already looking at it.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "li" | "section";
}) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useStill();
  const inView = useInView(ref, { once: true, margin: "0px 0px -12% 0px" });
  const [held, setHeld] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    // Measured once, before first paint.
    if (el.getBoundingClientRect().top > window.innerHeight * 0.92) setHeld(true);
  }, [reduce]);

  const Tag = motion[as] as typeof motion.div;
  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      className={className}
      initial={false}
      animate={held && !inView ? { opacity: 0, y: 18 } : { opacity: 1, y: 0 }}
      transition={{ ...spring, delay: held ? delay : 0 }}
    >
      {children}
    </Tag>
  );
}
