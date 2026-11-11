"use client";

import { MotionConfig, motion } from "motion/react";
import { useCallback, useState } from "react";
import { StandCamera, type CameraPhase } from "@/components/StandCamera";
import { Wordmark } from "@/components/Wordmark";
import { easeOut, spring } from "@/lib/motion";
import { Setup } from "./Setup";
import { Swap } from "./Swap";
import { useStandToken } from "./useStandToken";

/**
 * An extra camera on another side of the shelf. It sends each new still of the shelf to the
 * stand; the main stand screen decides when to read and shows the bill.
 */
export function ExtraCamera({ angle }: { angle: number }) {
  const { token, booted, save, forget } = useStandToken();
  const [phase, setPhase] = useState<CameraPhase>("starting");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const onShot = useCallback(
    (photo: Blob, takenAt: number) => {
      const form = new FormData();
      form.set("photo", photo, "angle.jpg");
      form.set("angle", String(angle));
      form.set("takenAt", String(takenAt));
      fetch("/api/stand/angle", { method: "POST", headers: { "x-stand-token": token ?? "" }, body: form }).then(
        (res) => {
          if (res.status === 401) {
            forget();
            setProblem("That stand code isn't right. Enter it again.");
          } else if (res.ok) {
            setProblem(null);
            setSentAt(takenAt);
          } else setProblem("This camera couldn't reach the server. It will keep trying.");
        },
        () => setProblem("This camera couldn't reach the server. It will keep trying."),
      );
    },
    [angle, token, forget],
  );

  if (!booted) return <main className="void sd" />;

  if (!token) {
    return (
      <Setup
        problem={problem}
        onCode={(code) => {
          setProblem(null);
          save(code);
        }}
      />
    );
  }

  const connecting = phase === "starting" || !sentAt;
  const status = phase === "starting" ? "Starting the camera…" : sentAt ? "Sending this view to the stand." : "Connecting to the stand…";

  return (
    <MotionConfig reducedMotion="user">
      <main className="void sd sd-angle">
        <motion.div
          className="sd-stage sd-angle-stage"
          initial={{ opacity: 0, scale: 0.98, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={spring}
        >
          <h1>Camera {angle}</h1>
          <p>Point this at the shelf from another side. The bill shows on the main stand screen.</p>
        </motion.div>

        <footer className="sd-foot">
          {problem && (
            <p role="alert" className="sd-note" data-tone="problem">
              {problem}
            </p>
          )}
          <div className="sd-dock sd-dock-angle ds-material-blue">
            <div className="sd-dock-cam">
              <StandCamera onChange={() => {}} onPhase={setPhase} onShot={onShot} />
            </div>
            <div className="sd-status">
              <span className="sd-indicator" data-tone={connecting ? "busy" : "calm"} aria-hidden="true">
                {sentAt && (
                  // One ring leaves the dot each time a photo is sent.
                  <motion.i
                    key={sentAt}
                    initial={{ opacity: 0.8, scale: 1 }}
                    animate={{ opacity: 0, scale: 3.4 }}
                    transition={{ duration: 1.1, ease: easeOut }}
                  />
                )}
              </span>
              <p role="status">
                <Swap text={status} />
              </p>
            </div>
            <div className="sd-fine">
              {sentAt && (
                <p className="sd-sent">
                  Last sent <time dateTime={new Date(sentAt).toISOString()}>{new Date(sentAt).toLocaleTimeString()}</time>
                </p>
              )}
              <p className="sd-privacy">
                <Wordmark href="/stand" /> A camera counts items on this shelf. It does not record people.
              </p>
            </div>
          </div>
        </footer>
      </main>
    </MotionConfig>
  );
}
