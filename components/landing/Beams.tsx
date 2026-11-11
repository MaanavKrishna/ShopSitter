"use client";

import { useStill } from "./useStill";
import { motion } from "motion/react";

// A few of the long curves from the registry's background beams, redrawn in the studio's
// own light: white fading into lit blue, travelling slowly along each path.
const PATHS = [
  "M-380 -189C-380 -189 -312 216 152 343C616 470 684 875 684 875",
  "M-331 -245C-331 -245 -263 160 201 287C665 414 733 819 733 819",
  "M-282 -301C-282 -301 -214 104 250 231C714 358 782 763 782 763",
  "M-233 -357C-233 -357 -165 48 299 175C763 302 831 707 831 707",
  "M-184 -413C-184 -413 -116 -8 348 119C812 246 880 651 880 651",
  "M-135 -469C-135 -469 -67 -64 397 63C861 190 929 595 929 595",
  "M-86 -525C-86 -525 -18 -120 446 7C910 134 978 539 978 539",
  "M-37 -581C-37 -581 31 -176 495 -49C959 78 1027 483 1027 483",
];

export function Beams() {
  const reduce = useStill();
  return (
    <svg className="lp-beams" viewBox="0 0 696 316" fill="none" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {PATHS.map((d) => (
        <path key={d} d={d} stroke="rgb(255 255 255 / 0.1)" strokeWidth="0.5" />
      ))}
      {!reduce &&
        PATHS.map((d, i) => (
          <motion.path
            key={`lit-${i}`}
            d={d}
            stroke={`url(#lp-beam-${i})`}
            strokeWidth="0.7"
            strokeLinecap="round"
          />
        ))}
      <defs>
        {!reduce &&
          PATHS.map((_, i) => (
            <motion.linearGradient
              key={i}
              id={`lp-beam-${i}`}
              gradientUnits="userSpaceOnUse"
              initial={{ x1: "0%", x2: "0%", y1: "0%", y2: "0%" }}
              animate={{ x1: ["0%", "100%"], x2: ["0%", "95%"], y1: ["0%", "100%"], y2: ["0%", "93%"] }}
              transition={{ duration: 14 + (i % 4) * 3, ease: "easeInOut", repeat: Infinity, delay: i * 1.3 }}
            >
              <stop stopColor="#ffffff" stopOpacity="0" />
              <stop stopColor="#ffffff" />
              <stop offset="32.5%" stopColor="#7d9bff" />
              <stop offset="100%" stopColor="#2152f2" stopOpacity="0" />
            </motion.linearGradient>
          ))}
      </defs>
    </svg>
  );
}
