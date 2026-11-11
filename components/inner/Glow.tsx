"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { animate } from "motion/react";
import { cn } from "@/lib/utils";

type GlowProps = {
  /** Degrees of the rim that light up at once. */
  spread?: number;
  /** How far outside the panel the pointer still counts, in pixels. */
  proximity?: number;
  borderWidth?: number;
  className?: string;
};

// The rim's light: cobalt running to lit blue and pale blue, so it reads as light on the edge.
const RIM = `radial-gradient(circle, #2152f2 10%, #2152f200 20%),
  radial-gradient(circle at 40% 40%, #c9d5ff 5%, #c9d5ff00 15%),
  repeating-conic-gradient(
    from 236.84deg at 50% 50%,
    #0a35c8 0%,
    #2152f2 calc(25% / 5),
    #c9d5ff calc(50% / 5),
    #2152f2 calc(75% / 5),
    #0a35c8 calc(100% / 5)
  )`;

/**
 * A lit stretch on the rim of its parent that turns to face the pointer. The parent needs
 * `position: relative` and a border radius; this fills it and takes no pointer events.
 */
export const Glow = memo(function Glow({ spread = 36, proximity = 72, borderWidth = 2, className }: GlowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef({ x: 0, y: 0 });
  const frame = useRef(0);

  const move = useCallback(
    (e?: { x: number; y: number }) => {
      if (!ref.current) return;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const { left, top, width, height } = el.getBoundingClientRect();
        if (e) last.current = { x: e.x, y: e.y };
        const { x, y } = last.current;

        const near = x > left - proximity && x < left + width + proximity && y > top - proximity && y < top + height + proximity;
        el.style.setProperty("--active", near ? "1" : "0");
        if (!near) return;

        const from = parseFloat(el.style.getPropertyValue("--start")) || 0;
        const target = (180 * Math.atan2(y - (top + height / 2), x - (left + width / 2))) / Math.PI + 90;
        const turn = ((target - from + 180) % 360) - 180;
        animate(from, from + turn, {
          duration: 1.6,
          ease: [0.16, 1, 0.3, 1],
          onUpdate: (v) => el.style.setProperty("--start", String(v)),
        });
      });
    },
    [proximity],
  );

  useEffect(() => {
    // A fine pointer only: on touch there is nothing to follow.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const onScroll = () => move();
    const onPointer = (e: PointerEvent) => move(e);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.body.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener("scroll", onScroll);
      document.body.removeEventListener("pointermove", onPointer);
    };
  }, [move]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={
        {
          "--spread": spread,
          "--start": "0",
          "--active": "0",
          "--glow-width": `${borderWidth}px`,
          "--gradient": RIM,
        } as React.CSSProperties
      }
      className={cn("pointer-events-none absolute inset-0 rounded-[inherit]", className)}
    >
      <div
        className={cn(
          "rounded-[inherit]",
          'after:absolute after:inset-[calc(-1*var(--glow-width))] after:rounded-[inherit] after:content-[""]',
          "after:[border:var(--glow-width)_solid_transparent]",
          "after:[background:var(--gradient)] after:[background-attachment:fixed]",
          "after:opacity-[var(--active)] after:transition-opacity after:duration-300",
          "after:[mask-clip:padding-box,border-box]",
          "after:[mask-composite:intersect]",
          "after:[mask-image:linear-gradient(#0000,#0000),conic-gradient(from_calc((var(--start)-var(--spread))*1deg),#00000000_0deg,#fff,#00000000_calc(var(--spread)*2deg))]",
        )}
      />
    </div>
  );
});
