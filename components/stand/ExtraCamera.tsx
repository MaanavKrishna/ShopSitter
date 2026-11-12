"use client";

import { MotionConfig, motion } from "motion/react";
import { useCallback, useState } from "react";
import { StandCamera, type CameraPhase } from "@/components/StandCamera";
import { Wordmark } from "@/components/Wordmark";
import { easeOut, spring } from "@/lib/motion";
import { Setup, TrialEndedSheet, ZoneGoneSheet } from "./Setup";
import { Swap } from "./Swap";
import { SAVED_CODE_REFUSED, saysTrialEnded, saysZoneGone, standHeaders, useStandToken } from "./useStandToken";

// True as written: the camera takes a fresh still every few seconds and sends that one.
const UNSENT = "This camera couldn't reach the server. It sends a new photo every few seconds.";

/**
 * An extra camera on another side of the shelf. It sends each new still of the shelf to the
 * stand; the main stand screen decides when to read and shows the bill.
 */
export function ExtraCamera({ angle }: { angle: number }) {
  const { token, booted, refused, ended, kind, zone, zoneName, zoneGone, loseZone, save, forget, end } = useStandToken();
  const [phase, setPhase] = useState<CameraPhase>("starting");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** Why the camera could not start, when it could not. */
  const [cameraProblem, setCameraProblem] = useState<string | null>(null);

  const onShot = useCallback(
    (photo: Blob, takenAt: number) => {
      const form = new FormData();
      form.set("photo", photo, "angle.jpg");
      form.set("angle", String(angle));
      form.set("takenAt", String(takenAt));
      fetch("/api/stand/angle", { method: "POST", headers: standHeaders(token, zone), body: form }).then(
        async (res) => {
          if (await saysTrialEnded(res)) end();
          else if (await saysZoneGone(res)) loseZone();
          else if (res.status === 401) {
            forget();
            setProblem("That stand code isn't right. Enter it again.");
          } else if (res.ok) {
            setProblem(null);
            setSentAt(takenAt);
          } else setProblem(UNSENT);
        },
        () => setProblem(UNSENT),
      );
    },
    [angle, token, zone, forget, end, loseZone],
  );

  if (!booted) return <main className="void sd" />;

  if (ended) return <TrialEndedSheet />;

  if (zoneGone) return <ZoneGoneSheet />;

  if (!token) {
    return (
      <Setup
        problem={problem ?? (refused ? SAVED_CODE_REFUSED : null)}
        onCode={(code, standKind) => {
          setProblem(null);
          save(code, standKind);
        }}
      />
    );
  }

  const connecting = phase === "starting" || !sentAt;
  const status = cameraProblem
    ? "The camera isn't running."
    : phase === "starting"
      ? "Starting the camera…"
      : sentAt
        ? "Sending this view to the stand."
        : "Connecting to the stand…";

  return (
    <MotionConfig reducedMotion="user">
      <main className="void sd sd-angle">
        <motion.div
          className="sd-stage sd-angle-stage"
          initial={{ opacity: 0, scale: 0.98, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={spring}
        >
          {cameraProblem ? (
            <>
              <h1 className="sd-angle-off">Camera {angle} isn&rsquo;t watching the shelf yet</h1>
              <p role="alert">{cameraProblem}</p>
            </>
          ) : (
            <>
              <h1>Camera {angle}</h1>
              <p>Point this at the shelf from another side. The bill shows on the main stand screen.</p>
            </>
          )}
        </motion.div>

        <footer className="sd-foot">
          {problem && (
            <p role="alert" className="sd-note" data-tone="problem">
              {problem}
            </p>
          )}
          <div className="sd-dock sd-dock-angle ds-material-blue">
            <div className="sd-dock-cam">
              <StandCamera onChange={() => {}} onPhase={setPhase} onShot={onShot} onProblem={setCameraProblem} problemShown />
            </div>
            <div className="sd-status">
              <span className="sd-indicator" data-tone={cameraProblem ? "alert" : connecting ? "busy" : "calm"} aria-hidden="true">
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
              {(kind === "trial" || zoneName) && (
                <ul className="sd-chips">
                  {zoneName && <li className="sd-chip sd-chip-zone">{zoneName}</li>}
                  {kind === "trial" && <li className="sd-chip sd-chip-trial">Trial stand</li>}
                </ul>
              )}
            </div>
          </div>
        </footer>
      </main>
    </MotionConfig>
  );
}
