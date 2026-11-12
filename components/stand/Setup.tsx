"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import { spring } from "@/lib/motion";
import { CodeField } from "./CodeField";
import { checkStand, type StandKind, ZONE_GONE } from "./useStandToken";

const CODE_LENGTH = 6;
// Long enough for the button to show that the code was taken before the stand takes over.
const HANDOVER_MS = 380;

const REFUSALS = {
  wrong: "That stand code isn't right. Check it and try again.",
  ended: "That trial stand has ended. Start a new one from the demo page.",
  limited: "Too many tries. Try again in a few minutes.",
  unreachable: "Couldn't check the code. Check the connection and try again.",
  no_zone: ZONE_GONE,
} as const;

/**
 * The first screen on a new device: one field for the stand code, on a white sheet.
 * The code is checked with the server before the stand starts, so a wrong one never gets past here.
 */
export function Setup({
  problem,
  onCode,
}: {
  /** Why the stand sent this device back here, if it did. */
  problem: string | null;
  onCode: (code: string, kind: StandKind | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [starting, setStarting] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  async function start(code: string) {
    setCodeError(null);
    setStarting(true);
    const [{ result, kind }] = await Promise.all([checkStand(code), new Promise((r) => setTimeout(r, HANDOVER_MS))]);
    if (!live.current) return;
    if (result === "ok") return onCode(code, kind);
    setStarting(false);
    setCodeError(REFUSALS[result]);
    if (result === "wrong") setShake((n) => n + 1);
    // The field was switched off while the code was checked; give the cursor back once it is on again.
    setTimeout(() => form.current?.querySelector("input")?.focus(), 0);
  }

  return (
    <main className="void sd sd-setup">
      <motion.div
        className="sd-sheet"
        initial={{ opacity: 0, scale: 0.96, y: 14, filter: "blur(12px)" }}
        animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
        transition={{ ...spring, duration: 0.6 }}
      >
        <form
          ref={form}
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
            void start(code);
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
            {starting ? "Checking the code" : "Start watching the shelf"}
          </button>
          <p className="sd-sheet-fine">A camera counts items on this shelf. It does not record people.</p>
          <p className="sd-sheet-fine sd-sheet-try">
            Trying it out? <Link href="/demo">Start a stand from the demo page</Link>
          </p>
        </form>
      </motion.div>
    </main>
  );
}

/** Shown in place of the stand when the trial behind this device's key is over. There is no code to type. */
export function TrialEndedSheet() {
  return (
    <main className="void sd sd-setup">
      <motion.div
        className="sd-sheet sd-sheet-ended"
        role="alert"
        initial={{ opacity: 0, scale: 0.96, y: 14, filter: "blur(12px)" }}
        animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
        transition={{ ...spring, duration: 0.6 }}
      >
        <Wordmark />
        <div className="sd-sheet-copy">
          <h1>This trial stand has ended</h1>
          <p>Its products and visits were deleted, so this screen has nothing to watch. Start a new one from the demo page.</p>
        </div>
        <Link href="/demo" className="sd-primary ds-press">
          Go to the demo page
        </Link>
      </motion.div>
    </main>
  );
}

/** Shown in place of the stand when the shelf this device was set up for was removed from the store. */
export function ZoneGoneSheet() {
  return (
    <main className="void sd sd-setup">
      <motion.div
        className="sd-sheet sd-sheet-ended"
        role="alert"
        initial={{ opacity: 0, scale: 0.96, y: 14, filter: "blur(12px)" }}
        animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
        transition={{ ...spring, duration: 0.6 }}
      >
        <Wordmark />
        <div className="sd-sheet-copy">
          <h1>This shelf is no longer part of the store</h1>
          <p>Open the camera link again from the Store page.</p>
        </div>
        <Link href="/owner/store" className="sd-primary ds-press">
          Go to the Store page
        </Link>
      </motion.div>
    </main>
  );
}
