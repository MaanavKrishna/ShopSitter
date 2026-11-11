"use client";

import { useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useId, useState } from "react";

/**
 * The stand code as a row of large cells. One real input lies over the cells, so typing,
 * paste, the numeric keyboard and screen readers all work as for an ordinary field.
 */
export function CodeField({
  length,
  value,
  onChange,
  error,
  shake,
  disabled,
}: {
  length: number;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  /** Increase to shake the cells once, when a code is refused. */
  shake: number;
  disabled?: boolean;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, length - 1);
  const reduce = useReducedMotion();
  const [field, animate] = useAnimate<HTMLDivElement>();

  useEffect(() => {
    if (shake && !reduce) void animate(field.current, { x: [0, -9, 8, -5, 3, 0] }, { duration: 0.36, ease: "easeInOut" });
  }, [shake, reduce, animate, field]);

  return (
    <div className="sd-code" data-invalid={!!error}>
      <label htmlFor={id}>Stand code</label>
      <div ref={field} className="sd-code-field">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={length}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
        />
        <div className="sd-code-cells" aria-hidden="true">
          {Array.from({ length }, (_, i) => (
            <span key={i} data-filled={i < value.length} data-active={focused && i === active}>
              {value[i] ?? ""}
            </span>
          ))}
        </div>
      </div>
      <p id={`${id}-hint`} className="sd-code-hint">
        The {length}-digit code for this stand.
      </p>
      <p id={`${id}-error`} className="sd-code-error" role="alert">
        {error}
      </p>
    </div>
  );
}
