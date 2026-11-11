"use client";

import { AnimatePresence, motion } from "motion/react";
import { springSnappy } from "@/lib/motion";

/** Text that changes in place: the old words lift away as the new ones settle in. */
export function Swap({ text, className }: { text: string; className?: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={text}
        className={className}
        style={{ display: "inline-block" }}
        initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
        transition={springSnappy}
      >
        {text}
      </motion.span>
    </AnimatePresence>
  );
}
