"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import { spring } from "@/lib/motion";
import { CodeField } from "./CodeField";

const CODE_LENGTH = 6;
// Long enough for the button to show that the code was taken before the stand takes over.
const HANDOVER_MS = 380;

/** The first screen on a new device: one field for the stand code, on a white sheet. */
export function Setup({
  problem,
  onCode,
}: {
  /** Why the stand sent this device back here, if it did. */
  problem: string | null;
  onCode: (code: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [starting, setStarting] = useState(false);
  const handover = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (handover.current && clearTimeout(handover.current)), []);

  return (
    <main className="void sd sd-setup">
      <motion.div
        className="sd-sheet"
        initial={{ opacity: 0, scale: 0.96, y: 14, filter: "blur(12px)" }}
        animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
        transition={{ ...spring, duration: 0.6 }}
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (starting) return;
            const code = draft.trim();
            if (code.length !== CODE_LENGTH) {
              setCodeError(code ? `The stand code has ${CODE_LENGTH} digits.` : `Enter the ${CODE_LENGTH}-digit stand code.`);
              setShake((n) => n + 1);
              return;
            }
            setCodeError(null);
            setStarting(true);
            handover.current = setTimeout(() => onCode(code), HANDOVER_MS);
          }}
        >
          <Wordmark />
          <div className="sd-sheet-copy">
            <h1>Set up this stand</h1>
            <p>Prop this device so its camera sees the whole shelf, then enter the stand code.</p>
          </div>
          {problem && (
            <p role="alert" className="sd-sheet-problem">
              {problem}
            </p>
          )}
          <CodeField
            length={CODE_LENGTH}
            value={draft}
            onChange={(value) => {
              setDraft(value);
              setCodeError(null);
            }}
            error={codeError}
            shake={shake}
            disabled={starting}
          />
          <button type="submit" className="sd-primary ds-press" aria-busy={starting} data-loading={starting}>
            {starting && <span className="sd-spin" aria-hidden="true" />}
            {starting ? "Starting the stand" : "Start watching the shelf"}
          </button>
          <p className="sd-sheet-fine">A camera counts items on this shelf. It does not record people.</p>
        </form>
      </motion.div>
    </main>
  );
}
