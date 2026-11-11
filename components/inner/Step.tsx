"use client";

import { useRef } from "react";
import { useInView } from "motion/react";

/** One stop on the timeline. Its marker fills in once the reader has reached it. */
export function Step({ n, children }: { n: number; children: React.ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  const reached = useInView(ref, { once: true, margin: "0px 0px -45% 0px" });
  return (
    <li ref={ref} className="in-step" data-reached={reached || undefined}>
      <span className="in-step-node num" aria-hidden="true">
        {n}
      </span>
      {children}
    </li>
  );
}
