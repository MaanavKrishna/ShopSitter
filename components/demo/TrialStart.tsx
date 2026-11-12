"use client";

import { IconArrowRight, IconCamera, IconDeviceMobile, IconLock, IconQrcode, IconTag } from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import NextLink from "next/link";
import { useEffect, useState } from "react";
import { EndTrialDialog } from "@/components/owner/EndTrialDialog";
import { spring } from "@/lib/motion";
import { timeLeft, trialOver, trialStartProblem } from "@/lib/trial-view";

type Mine = { expiresAt: number };

/** Tells the rest of the page whether this browser has a trial stand, as that changes. */
const TRIAL_CHANGE = "shopsitter-trial-change";

const BEATS = [
  {
    icon: IconTag,
    title: "Add your things",
    text: "Two or three things off your desk. A name, a price and a photo of each.",
  },
  {
    icon: IconCamera,
    title: "Point a camera",
    text: "Open the stand screen on a phone or laptop and aim it at them.",
  },
  {
    icon: IconQrcode,
    title: "Take one and pay",
    text: "The bill appears on the stand. Pay it in the PayPal sandbox and it lands in your dashboard.",
  },
] as const;

/**
 * The front door of the demo: starts a private trial stand for this browser, or leads back to the
 * one it already has. `initial` is what the server knew when it drew the page.
 */
export function TrialStart({ initial }: { initial: Mine | null }) {
  const reduce = useReducedMotion();
  const [mine, setMine] = useState<Mine | null>(initial);
  const [now, setNow] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  /** Said once after a trial has ended, here or on the way in from the dashboard. */
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    let live = true;
    // The page may come back from the browser's history after a trial was started or ended elsewhere.
    const look = () =>
      fetch("/api/trial", { cache: "no-store" })
        .then(async (res) => {
          if (!live) return;
          if (res.ok) setMine((await res.json()) as Mine);
          else if (res.status === 404) setMine(null);
        })
        .catch(() => {});
    void look();
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setStarting(false);
      void look();
    };
    window.addEventListener("pageshow", onShow);
    const params = new URLSearchParams(window.location.search);
    if (params.has("ended")) {
      queueMicrotask(() => live && setEnded(true));
      window.history.replaceState(null, "", window.location.pathname);
    }
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 20_000);
    return () => {
      live = false;
      window.removeEventListener("pageshow", onShow);
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const hasTrial = mine !== null;
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(TRIAL_CHANGE, { detail: hasTrial }));
  }, [hasTrial]);

  async function start() {
    if (starting) return;
    setStarting(true);
    setProblem(null);
    setEnded(false);
    const res = await fetch("/api/trial", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
    if (res?.ok) {
      // A full page load, so the dashboard is drawn for the stand that was just made.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/owner");
      return;
    }
    const body = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
    setProblem(trialStartProblem(res?.status ?? null, body.error));
    setStarting(false);
  }

  const running = mine !== null && (now === null || !trialOver(mine.expiresAt, now));
  const left = mine && now !== null ? timeLeft(mine.expiresAt, now) : "";

  return (
    <section className="dm-trial" aria-labelledby="dm-trial-h">
      <div className="dm-trial-main">
        <h2 id="dm-trial-h" className="ds-h2">
          Run your own stand
        </h2>
        <p className="ds-lead">
          Start a private stand, put your own things on it, and take a real visit from the shelf to PayPal. It takes
          about two minutes.
        </p>

        <AnimatePresence initial={false}>
          {(problem || ended) && (
            <motion.p
              key={problem ?? "ended"}
              className="dm-trial-problem"
              data-tone={problem ? "problem" : "note"}
              role={problem ? "alert" : "status"}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={spring}
            >
              {problem ?? "That trial stand has ended and everything in it was deleted. You can start another."}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="dm-trial-go">
          {running ? (
            <NextLink href="/owner" className="dm-go ds-focus">
              Continue my stand
              <IconArrowRight size={18} stroke={2} aria-hidden="true" />
            </NextLink>
          ) : (
            <button type="button" className="dm-go ds-focus" aria-busy={starting} data-loading={starting || undefined} onClick={start}>
              {starting && <span className="dm-go-spin" aria-hidden="true" />}
              {starting ? "Starting your stand" : "Start my stand"}
              {!starting && <IconArrowRight size={18} stroke={2} aria-hidden="true" />}
            </button>
          )}
          {running ? (
            <p className="dm-trial-state">
              <span>{left ? `Your stand is running. Deleted in ${left}.` : "Your stand is running."}</span>
              <button type="button" className="dm-quiet" onClick={() => setAsking(true)}>
                End it and delete everything
              </button>
            </p>
          ) : (
            <p className="dm-trial-state">
              <span>No account and no passcode.</span>
            </p>
          )}
        </div>

        <p className="dm-private">
          <IconLock size={16} stroke={1.75} aria-hidden="true" />
          Private to this browser. Everything in it is deleted after 24 hours. A stand can have several shelves,
          each with its own camera, and a door QR that starts a basket on a shopper&apos;s phone.
        </p>
      </div>

      <div className="dm-trial-side">
        <ol className="dm-beats">
          {BEATS.map((beat, i) => (
            <li key={beat.title}>
              <span className="dm-beat-mark" aria-hidden="true">
                <beat.icon size={20} stroke={1.75} />
              </span>
              <div>
                <h3>
                  <span className="num">{i + 1}</span>
                  {beat.title}
                </h3>
                <p>{beat.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="dm-needs">
          <h3>What you need</h3>
          <ul>
            <li>
              <IconDeviceMobile size={17} stroke={1.75} aria-hidden="true" />
              <span>A phone or laptop with a camera</span>
            </li>
            <li>
              <i className="dm-needs-pp" aria-hidden="true" />
              <span>
                A PayPal sandbox buyer account, to pay. <small>It is test money: nothing real moves.</small>
              </span>
            </li>
          </ul>
        </div>
      </div>

      <EndTrialDialog
        isOpen={asking}
        onOpenChange={setAsking}
        onEnded={() => {
          setMine(null);
          setProblem(null);
          setEnded(true);
        }}
      />
    </section>
  );
}

/** The way to the shared demo dashboard, with a warning when opening it would cost this browser its trial. */
export function ExampleWeek({ hasTrial }: { hasTrial: boolean }) {
  const [trial, setTrial] = useState(hasTrial);

  useEffect(() => {
    const onChange = (e: Event) => setTrial((e as CustomEvent<boolean>).detail);
    window.addEventListener(TRIAL_CHANGE, onChange);
    return () => window.removeEventListener(TRIAL_CHANGE, onChange);
  }, []);

  return (
    <section className="dm-week" aria-labelledby="dm-week-h">
      <div>
        <h2 id="dm-week-h">An example week</h2>
        <p>
          A shared demo dashboard with a week of made-up visits already in it: paid, unmatched, adjusted and refunded.
          Its products are fixed. The passcode is <b>demo</b>.
        </p>
        {trial && (
          <p className="dm-week-warn">
            Signing in there replaces your trial stand on this browser. Open it in a private window to keep both.
          </p>
        )}
      </div>
      <NextLink href="/owner/login" className="dm-week-link ds-press ds-focus">
        Open the demo dashboard
        <IconArrowRight size={16} stroke={2} aria-hidden="true" />
      </NextLink>
    </section>
  );
}
