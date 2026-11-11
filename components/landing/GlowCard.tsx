"use client";

import { useRef } from "react";

/**
 * A panel whose edge and surface light up under the pointer. The pointer position is written
 * straight onto the element as two custom properties, which only its own pseudo-elements read.
 */
export function GlowCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={`lp-glow ${className}`}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el || e.pointerType !== "mouse") return;
        const box = el.getBoundingClientRect();
        el.style.setProperty("--gx", `${e.clientX - box.left}px`);
        el.style.setProperty("--gy", `${e.clientY - box.top}px`);
      }}
    >
      {children}
    </div>
  );
}
