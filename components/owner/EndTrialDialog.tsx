"use client";

import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { useState } from "react";

/**
 * Asks before ending a trial stand, then deletes it. `onEnded` runs once the server has deleted
 * everything, or says the trial was already gone.
 */
export function EndTrialDialog({
  isOpen,
  onOpenChange,
  onEnded,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onEnded: () => void;
}) {
  const [ending, setEnding] = useState(false);
  const [failed, setFailed] = useState(false);

  async function end() {
    setEnding(true);
    setFailed(false);
    const res = await fetch("/api/trial", { method: "DELETE" }).catch(() => null);
    setEnding(false);
    // 404 means it has already gone, which is what was asked for.
    if (res && (res.ok || res.status === 404)) {
      onOpenChange(false);
      onEnded();
    } else setFailed(true);
  }

  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (ending) return;
        setFailed(false);
        onOpenChange(open);
      }}
      title="End this trial stand?"
      description={
        failed
          ? "The stand couldn't be reached, so nothing was deleted. Check the connection and try again."
          : "Its products, photos and visits are deleted now, and its stand link stops working. This cannot be undone."
      }
      actionLabel="End and delete"
      cancelLabel="Keep it"
      isActionLoading={ending}
      onAction={() => void end()}
      width={440}
    />
  );
}
