"use client";

import { motion } from "motion/react";
import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";
import { springSnappy } from "@/lib/motion";

export type PillOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Spoken name, when the visible label is shortened. */
  name?: string;
  count?: number;
};

/**
 * A single-choice switch whose active pill slides between options.
 * A radio group to assistive tech: arrow keys move and choose, Tab enters and leaves once.
 */
export function PillSwitch<T extends string>({
  label,
  value,
  onChange,
  options,
  tone = "light",
  size = "md",
  className,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: PillOption<T>[];
  tone?: "light" | "blue";
  size?: "sm" | "md";
  className?: string;
}) {
  const id = useId();
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent, index: number) {
    const last = options.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? index === last
          ? 0
          : index + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? index === 0
            ? last
            : index - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : -1;
    if (next < 0) return;
    e.preventDefault();
    items.current[next]?.focus();
    onChange(options[next].value);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`ow-switch${className ? ` ${className}` : ""}`}
      data-tone={tone}
      data-size={size}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              items.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.name}
            tabIndex={selected ? 0 : -1}
            className="ow-switch-item"
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {selected && <motion.span layoutId={`${id}-pill`} className="ow-switch-pill" transition={springSnappy} />}
            <span className="ow-switch-label">
              {o.label}
              {o.count !== undefined && <span className="ow-switch-count">{o.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
