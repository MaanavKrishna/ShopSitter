"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";

const TAIL = 360; // length of the lit stretch behind the beam's head, in pixels

/**
 * A line down the side of its children with a lit stretch that follows the reader down the
 * page. The line itself is always drawn; only the light moves.
 */
export function Beam({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.55", "end 0.55"] });
  const settle = { stiffness: 500, damping: 90 };
  const head = useSpring(useTransform(scrollYProgress, [0, 1], [0, height]), settle);
  const tail = useSpring(useTransform(scrollYProgress, [0, 1], [-TAIL, height - TAIL]), settle);

  return (
    <div ref={ref} className={`in-beam ${className}`}>
      <svg className="in-beam-line" viewBox={`0 0 20 ${height || 1}`} width="20" height={height} aria-hidden="true">
        <path d={`M 10 0 V ${height}`} fill="none" className="in-beam-track" />
        <path d={`M 10 0 V ${height}`} fill="none" stroke={`url(#${id})`} strokeWidth="2" className="in-beam-light" />
        <defs>
          <motion.linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={head} y2={tail}>
            <stop stopColor="#2152f2" stopOpacity="0" />
            <stop stopColor="#2152f2" />
            <stop offset="0.35" stopColor="#0a35c8" />
            <stop offset="1" stopColor="#0a35c8" stopOpacity="0" />
          </motion.linearGradient>
        </defs>
      </svg>
      {children}
    </div>
  );
}
