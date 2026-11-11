"use client";

import { MotionConfig, motion } from "motion/react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { StandCamera, type CameraPhase, type ShelfChange } from "@/components/StandCamera";
import { Wordmark } from "@/components/Wordmark";
import { Setup } from "@/components/stand/Setup";
import { Stage } from "@/components/stand/Stage";
import { Swap } from "@/components/stand/Swap";
import { useStandToken } from "@/components/stand/useStandToken";
import { spring } from "@/lib/motion";
import type { PricedBill } from "@/lib/types";
import type { Visit } from "@/lib/visits";
import "./stand.css";

const DOCK_KEY = "shopsitter-stand-dock";
const PAID_MESSAGE_MS = 6000;
const isPaid = (v: Visit) => v.status === "paid" || v.status === "paid_adjusted" || v.status === "paid_late";

type Current = { visit: Visit; bill: PricedBill };


export default function StandPage() {
  const router = useRouter();
  const { token, booted, save, forget } = useStandToken();
  const [current, setCurrent] = useState<Current | null>(null);
  const [justPaid, setJustPaid] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [phase, setPhase] = useState<CameraPhase>("starting");
  const [note, setNote] = useState<string | null>(null);
  const [stats, setStats] = useState<{ moving: number; differs: number } | null>(null);
  const [readNow, setReadNow] = useState(0);
  const [cameras, setCameras] = useState(1);
  const [sighting, setSighting] = useState<{ hand: boolean; person: boolean; present: boolean } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [qr, setQr] = useState<{ visitId: string; url: string } | null>(null);
  // The dock can shrink to a pill so the display is clean; the choice stays on this device.
  const [collapsed, setCollapsed] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    // Extra cameras used to live at /stand?angle=2; they have their own address now.
    const asked = new URLSearchParams(window.location.search).get("angle");
    if (asked && ["2", "3", "4"].includes(asked)) router.replace(`/stand/camera/${asked}`);
    if (localStorage.getItem(DOCK_KEY) === "collapsed") queueMicrotask(() => setCollapsed(true));
  }, [router]);


  // Keep the screen awake while the stand is running.
  useEffect(() => {
    if (!token || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = () => navigator.wakeLock.request("screen").then((l) => (lock = l), () => {});
    void request();
    const onVisible = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [token]);

  const visitId = current?.visit.id ?? null;

  useEffect(() => {
    if (!visitId) return;
    let live = true;
    QRCode.toDataURL(`${window.location.origin}/pay/${visitId}`, { margin: 1, width: 520 }).then((url) => {
      if (live) setQr({ visitId, url });
    });
    return () => {
      live = false;
    };
  }, [visitId]);

  // Follow the open bill: the customer may correct it or pay it from their phone.
  useEffect(() => {
    if (!visitId) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/visits/${visitId}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as Current;
      if (isPaid(data.visit)) {
        setJustPaid(data.visit.paidCents ?? 0);
        setCurrent(null);
        setTimeout(() => setJustPaid(null), PAID_MESSAGE_MS);
      } else if (data.visit.status === "open") {
        setCurrent(data);
      } else {
        setCurrent(null);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [visitId]);

  const onChange = useCallback(
    (change: ShelfChange) => {
      // One read at a time, in order, so bills never arrive out of sequence.
      queue.current = queue.current.then(async () => {
        setReading(true);
        try {
          const form = new FormData();
          form.set("before", change.before, "before.jpg");
          form.set("after", change.after, "after.jpg");
          if (change.zoom) {
            form.set("beforeZoom", change.zoom.before, "before-zoom.jpg");
            form.set("afterZoom", change.zoom.after, "after-zoom.jpg");
          }
          form.set("changeStartedAt", String(change.changeStartedAt));
          form.set("settledAt", String(change.settledAt));
          const res = await fetch("/api/stand/change", {
            method: "POST",
            headers: { "x-stand-token": token ?? "" },
            body: form,
          });
          if (res.status === 401) {
            forget();
            setProblem("That stand code isn't right. Enter it again.");
            return;
          }
          if (!res.ok) {
            setProblem("The stand couldn't reach the server. It will keep trying.");
            return;
          }
          setProblem(null);
          const data = (await res.json()) as { visit: Visit | null; bill: PricedBill | null; cameras?: number };
          setCameras(data.cameras ?? 1);
          const open = data.visit && data.bill && data.visit.status === "open";
          setCurrent(open ? { visit: data.visit!, bill: data.bill! } : null);
          // Say so when a change was seen but nothing is owed, so the stand never looks stuck.
          setNote(open ? null : "Nothing was taken.");
          if (!open) setTimeout(() => setNote(null), 6000);
        } catch {
          setProblem("The stand couldn't reach the server. It will keep trying.");
        } finally {
          setReading(false);
        }
      });
    },
    [token, forget],
  );

  // Someone stopped by and has gone: only the count is reported.
  const onVisitorLeft = useCallback(() => {
    void fetch("/api/stand/presence", { method: "POST", headers: { "x-stand-token": token ?? "" } }).catch(() => {});
  }, [token]);

  const toggleDock = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(DOCK_KEY, next ? "collapsed" : "open");
  };

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

  const view = justPaid !== null ? "paid" : current ? "bill" : "ready";
  const handAtShelf = !reading && !!sighting?.hand;
  const tone = reading ? "busy" : handAtShelf || phase === "moving" ? "alert" : phase === "starting" ? "busy" : "calm";
  const status = reading
    ? "Reading the shelf…"
    : sighting?.hand
      ? "A hand is at the shelf. Waiting until it is clear…"
      : phase === "moving"
        ? "Something moved. Waiting for the shelf to go still…"
        : phase === "starting"
          ? "Starting the camera…"
          : (note ?? "Watching the shelf. Keep this device still.");
  const presence =
    sighting === null ? "People check starting or unavailable" : sighting.present ? "Someone is here" : "Nobody here";

  return (
    <MotionConfig reducedMotion="user">
      <main className="void sd" data-view={view}>
        <span className="sd-light" aria-hidden="true" />

        <Stage
          view={view}
          current={current}
          paidCents={justPaid}
          reading={reading}
          moving={phase === "moving"}
          note={note}
          qr={qr && qr.visitId === visitId ? qr.url : null}
        />

        <footer className="sd-foot">
          {problem && (
            <p role="alert" className="sd-note" data-tone="problem">
              {problem}
            </p>
          )}
          <motion.div
            layout
            className="sd-dock ds-material-blue"
            data-collapsed={collapsed}
            style={{ borderRadius: collapsed ? 999 : 24 }}
            transition={spring}
          >
            <motion.div layout="position" className="sd-dock-cam" transition={spring}>
              <StandCamera
                onChange={onChange}
                onPhase={setPhase}
                onStats={setStats}
                readNow={readNow}
                onSighting={setSighting}
                onVisitorLeft={onVisitorLeft}
              />
            </motion.div>

            <motion.div layout="position" className="sd-status" transition={spring}>
              <span className="sd-indicator" data-tone={tone} aria-hidden="true" />
              <p role="status">
                <Swap text={status} />
              </p>
            </motion.div>

            {!collapsed && (
              <motion.div layout="position" className="sd-fine" transition={spring} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <p className="sd-privacy">
                  <Wordmark href="/stand" /> A camera counts items on this shelf. It notices when someone is here, on this
                  device only, and does not record people.
                </p>
                {stats && (
                  <p className="sd-stats">
                    Moving areas {stats.moving}. Areas changed since last read {stats.differs}.
                  </p>
                )}
              </motion.div>
            )}

            {!collapsed && (
              <motion.div layout="position" className="sd-side" transition={spring} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {stats && (
                  <ul className="sd-chips">
                    <motion.li layout className="sd-chip" style={{ borderRadius: 999 }} transition={spring}>
                      <Swap text={`${cameras} ${cameras === 1 ? "camera" : "cameras"}`} />
                    </motion.li>
                    <motion.li
                      layout
                      className="sd-chip"
                      data-on={!!sighting?.present}
                      style={{ borderRadius: 999 }}
                      transition={spring}
                    >
                      <Swap text={presence} />
                    </motion.li>
                  </ul>
                )}
                <button
                  type="button"
                  className="sd-glass-btn ds-press"
                  disabled={reading}
                  onClick={() => setReadNow((n) => n + 1)}
                >
                  Read the shelf now
                </button>
              </motion.div>
            )}

            <motion.button
              layout="position"
              type="button"
              className="sd-dock-toggle"
              whileTap={{ scale: 0.94 }}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Show stand details" : "Hide stand details"}
              onClick={toggleDock}
              transition={spring}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 6l4.5 4.5L12.5 6" />
              </svg>
            </motion.button>
          </motion.div>
        </footer>
      </main>
    </MotionConfig>
  );
}
