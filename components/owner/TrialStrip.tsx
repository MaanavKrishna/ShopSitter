"use client";

import Link from "next/link";
import { useState } from "react";
import { timeLeft } from "@/lib/trial-view";
import { EndTrialDialog } from "./EndTrialDialog";
import { useOwner } from "./OwnerProvider";

/** A slim line over every section of a trial stand: what it is, how long it has left, and the way to end it. */
export function TrialStrip({ now }: { now: number }) {
  const { trialStand, markEnded } = useOwner();
  const [asking, setAsking] = useState(false);
  const left = trialStand ? timeLeft(trialStand.expiresAt, now) : "";

  return (
    <div className="ow-trial-strip" role="status" aria-live="off">
      <p>
        <i aria-hidden="true" />
        <b>Trial stand</b>
        <span className="ow-trial-wide"> · private to this browser</span>
        {left && <span> · deleted in {left}</span>}
      </p>
      <button type="button" className="ow-trial-end" onClick={() => setAsking(true)}>
        End now
      </button>
      <EndTrialDialog isOpen={asking} onOpenChange={setAsking} onEnded={markEnded} />
    </div>
  );
}

/** What is left once a trial is over: a calm page and the way to another one. */
export function TrialEnded() {
  return (
    <main className="ow-trial-ended">
      <div>
        <Link href="/" className="wordmark">
          Shopsitter
        </Link>
        <h1>This trial stand has ended</h1>
        <p>Its products, photos and visits have been deleted, and its stand link no longer works.</p>
        {/* A full page load, so nothing of the ended stand stays in memory. */}
        <a href="/demo" className="ow-cta ds-press">
          Start another
        </a>
      </div>
    </main>
  );
}
