"use client";

import { motion, useAnimationFrame, useMotionTemplate, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";

const LAP_MS = 5600;

/**
 * A PayPal-yellow rim around the QR card with one soft light travelling round it, so the
 * eye lands on the code. The light is left out when reduced motion is asked for.
 */
export function QrGlint({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div className="sd-qr-rim">
      {!reduce && <Glint />}
      {children}
    </div>
  );
}

function Glint() {
  const path = useRef<SVGRectElement>(null);
  const progress = useMotionValue(0);

  useAnimationFrame((time) => {
    const length = path.current?.getTotalLength();
    if (length) progress.set(((time % LAP_MS) / LAP_MS) * length);
  });

  const x = useTransform(progress, (v) => path.current?.getPointAtLength(v).x ?? 0);
  const y = useTransform(progress, (v) => path.current?.getPointAtLength(v).y ?? 0);
  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`;

  return (
    <span className="sd-qr-glint" aria-hidden="true">
      <svg width="100%" height="100%" preserveAspectRatio="none">
        <rect ref={path} fill="none" width="100%" height="100%" rx="24" ry="24" />
      </svg>
      <motion.span style={{ transform }} />
    </span>
  );
}
