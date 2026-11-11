"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { spring } from "@/lib/motion";

/**
 * Lifts its children into place the first time they scroll into view. The content is rendered
 * visible and is only held back when it starts below the fold, so it is never hidden from
 * someone without scripts or who is already looking at it.
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
  as?: "div" | "li" | "section" | "header";
}) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const [held, setHeld] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    if (el.getBoundingClientRect().top > window.innerHeight * 0.94) setHeld(true);
  }, [reduce]);

  const Tag = motion[as] as typeof motion.div;
  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      className={className}
      initial={false}
      animate={held && !inView ? { opacity: 0, y: 16 } : { opacity: 1, y: 0 }}
      transition={{ ...spring, delay: held ? delay : 0 }}
    >
      {children}
    </Tag>
  );
}
