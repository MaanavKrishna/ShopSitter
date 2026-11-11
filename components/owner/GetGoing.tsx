"use client";

import { IconArrowRight, IconArrowUpRight, IconCheck, IconCopy, IconPlus, IconX } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { easeOut, spring } from "@/lib/motion";
import { getGoing, type StepKey } from "@/lib/trial-view";
import { useOwner } from "./OwnerProvider";
import { PageCode } from "./SetupView";

/** Where the stand screen keeps the code or key it was set up with (see components/stand/useStandToken.ts). */
const STAND_TOKEN_KEY = "shopsitter-stand-token";
/** Set when the visitor says the stand screen is open on another device. Holds the trial's id. */
const OPENED_KEY = "shopsitter-trial-stand-opened";
/** Set when the finished checklist is dismissed. Holds the trial's id. */
const DISMISSED_KEY = "shopsitter-trial-get-going-done";
/** How often the page looks for news from the stand while the checklist is unfinished. */
const WATCH_MS = 5000;

const TITLES: Record<StepKey, string> = {
  products: "Add your products",
  stand: "Open the stand screen",
  take: "Take something",
  paid: "See it here",
};

// Other tabs on this device change these keys; this tab's own writes are announced by hand.
const LOCAL = "shopsitter-local-change";
function subscribeLocal(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(LOCAL, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LOCAL, onChange);
  };
}
function useLocal(key: string): string | null {
  return useSyncExternalStore(
    subscribeLocal,
    () => localStorage.getItem(key),
    () => null,
  );
}
function setLocal(key: string, value: string) {
  localStorage.setItem(key, value);
  window.dispatchEvent(new Event(LOCAL));
}

/**
 * A trial stand's first visit, step by step, at the top of Overview. Every tick comes from what
 * the stand really holds; the one exception is "the stand screen is open", which this browser
 * can also know because it opened the screen itself or the visitor said so.
 */
export function GetGoing() {
  const { shop, data, trialStand, reloadQuietly, hydrated } = useOwner();
  const savedToken = useLocal(STAND_TOKEN_KEY);
  const openedFor = useLocal(OPENED_KEY);
  const dismissedFor = useLocal(DISMISSED_KEY);
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const standOpened = openedFor === shop || (trialStand !== null && savedToken === trialStand.key);
  const state = getGoing({
    products: data.products.length,
    visits: data.visits,
    visitors: data.visitors ?? 0,
    standOpened,
  });
  const { complete, next } = state;
  const doneCount = state.steps.filter((s) => s.done).length;

  // While steps are left, the stand may report at any moment: look every few seconds while the page is in view.
  useEffect(() => {
    if (complete) return;
    const look = () => document.visibilityState === "visible" && void reloadQuietly();
    const timer = setInterval(look, WATCH_MS);
    document.addEventListener("visibilitychange", look);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", look);
    };
  }, [complete, reloadQuietly]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  const useSuggestions = useCallback(async () => {
    setAdding(true);
    setProblem(null);
    const res = await fetch("/api/trial/starter", { method: "POST" }).catch(() => null);
    if (res?.ok) await reloadQuietly();
    else if (res?.status === 401) await reloadQuietly();
    else setProblem(res ? "The suggestions couldn't be added. Try again." : "The stand couldn't be reached. Check the connection and try again.");
    setAdding(false);
  }, [reloadQuietly]);

  async function copyLink() {
    if (!trialStand) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${trialStand.standLink}`);
      setCopied(true);
    } catch {
      setProblem("The link couldn't be copied. Use the QR code, or open it on this device.");
    }
  }

  if (!hydrated || dismissedFor === shop) return null;

  if (complete) {
    return (
      <motion.section
        className="ow-go ow-go-done"
        aria-label="Get going"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.24, ease: easeOut }}
      >
        <span className="ow-go-mark" data-done aria-hidden="true">
          <IconCheck size={14} stroke={2.5} />
        </span>
        <p>
          <b>You&apos;ve run a full visit.</b> Shelf, bill, PayPal and back to your dashboard.
        </p>
        <Link href="/owner/visits" className="ow-inline-link">
          See it in Visits
          <IconArrowRight size={14} aria-hidden="true" />
        </Link>
        <button type="button" className="ow-icon-btn ds-press" aria-label="Dismiss" onClick={() => setLocal(DISMISSED_KEY, shop)}>
          <IconX size={16} stroke={1.75} aria-hidden="true" />
        </button>
      </motion.section>
    );
  }

  const count = data.products.length;
  const withPhoto = data.products.filter((p) => p.refImageUrl).length;
  const open = data.visits.find((v) => v.status === "open");

  const summary: Record<StepKey, string> = {
    products: `${count} ${count === 1 ? "product" : "products"}${withPhoto < count ? ` · ${withPhoto} with a photo` : " · all with photos"}`,
    stand: "The stand screen is open",
    take: "Your first visit is in",
    paid: "Paid",
  };
  const later: Record<StepKey, string> = {
    products: "Things from your desk, with a price and a photo each.",
    stand: "On the phone or laptop whose camera will watch the shelf.",
    take: "Take one thing off the shelf and wait a second.",
    paid: "The paid visit lands in this dashboard.",
  };

  const body: Record<StepKey, React.ReactNode> = {
    products: (
      <>
        <p>
          Put two or three things from your desk on the stand: a mug, a pen, a snack. Each needs a name and a price.
        </p>
        <p className="ow-go-tip">
          <b>Add a photo of each thing on its own.</b> Photos make the camera far more accurate.
        </p>
        <div className="ow-go-actions">
          <Link href="/owner/products#add" className="ow-cta ds-press">
            <IconPlus size={17} stroke={2} aria-hidden="true" />
            Add product
          </Link>
          <button type="button" className="ow-rowbtn ds-press" disabled={adding} aria-busy={adding || undefined} onClick={useSuggestions}>
            {adding ? "Adding…" : "Use three suggestions"}
          </button>
        </div>
        <p className="ow-go-fine">The suggestions are a coffee mug, a notebook and a pen. You can rename them, reprice them and add photos.</p>
      </>
    ),
    stand: (
      <div className="ow-go-stand">
        {trialStand ? (
          <PageCode path={trialStand.standLink} label="QR code that opens your stand screen" />
        ) : (
          <span className="ow-qr" aria-hidden="true" />
        )}
        <div>
          <p>
            <b>Scan with the phone you&apos;ll prop by the shelf.</b> It opens the stand screen already set up for this
            stand: no code to type. Allow the camera, then aim it so it sees everything on the shelf.
          </p>
          <div className="ow-go-actions">
            <a
              href={trialStand?.standLink}
              target="_blank"
              rel="noreferrer"
              className="ow-rowbtn ds-press"
              data-tone="strong"
              aria-disabled={!trialStand || undefined}
            >
              Use this device
              <IconArrowUpRight size={14} aria-hidden="true" />
            </a>
            <button type="button" className="ow-rowbtn ds-press" disabled={!trialStand} onClick={copyLink}>
              <IconCopy size={14} stroke={1.75} aria-hidden="true" />
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="ow-go-fine">
            This ticks itself when the stand reports in.{" "}
            <button type="button" className="ow-go-link" onClick={() => setLocal(OPENED_KEY, shop)}>
              It&apos;s open on my other device
            </button>
          </p>
          <p className="ow-go-fine">Anyone with this link can run a stand screen for your trial, so keep it to yourself.</p>
        </div>
      </div>
    ),
    take: (
      <>
        <p>
          <b>Take one thing off the shelf and wait a second.</b> Keep your hand clear afterwards: the stand reads the
          shelf once it has gone still, and the bill appears on the stand screen.
        </p>
        <p className="ow-go-fine">
          Nothing after a few seconds? Press &ldquo;Read the shelf now&rdquo; on the stand screen. This page is watching
          for the visit.
        </p>
      </>
    ),
    paid: (
      <>
        <p>
          <b>Your bill is on the stand screen.</b> Scan its QR code to pay in the PayPal sandbox with your sandbox buyer
          account. No real money moves.
        </p>
        <div className="ow-go-actions">
          {open && (
            <a href={`/pay/${open.id}`} target="_blank" rel="noreferrer" className="ow-rowbtn ds-press" data-tone="strong">
              Open the bill on this device
              <IconArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
          <Link href="/owner/visits" className="ow-rowbtn ds-press">
            See the visit
            <IconArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <p className="ow-go-fine">This page is watching for the payment.</p>
      </>
    ),
  };

  return (
    <section className="ow-panel ow-go" aria-labelledby="go-h">
      <div className="ow-panel-head">
        <h2 id="go-h">Get going</h2>
        <p className="ow-panel-meta">
          <span className="num">{doneCount}</span> of 4 done
          <span className="ow-go-meter" aria-hidden="true">
            {state.steps.map((s) => (
              <i key={s.key} data-done={s.done || undefined} />
            ))}
          </span>
        </p>
      </div>
      {problem && (
        <p className="ow-prod-notice ow-go-problem" role="alert">
          {problem}
        </p>
      )}
      <ol className="ow-go-steps">
        {state.steps.map((step, i) => {
          const current = step.key === next;
          return (
            <li key={step.key} data-state={step.done ? "done" : current ? "now" : "later"} aria-current={current ? "step" : undefined}>
              <span className="ow-go-mark" data-done={step.done || undefined} aria-hidden="true">
                <AnimatePresence mode="wait" initial={false}>
                  {step.done ? (
                    <motion.span key="done" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
                      <IconCheck size={14} stroke={2.5} />
                    </motion.span>
                  ) : (
                    <span key="n" className="num">
                      {i + 1}
                    </span>
                  )}
                </AnimatePresence>
              </span>
              <div className="ow-go-step">
                <h3>
                  {TITLES[step.key]}
                  <span className="sr-only">{step.done ? " (done)" : current ? " (next)" : ""}</span>
                </h3>
                {current ? (
                  <motion.div
                    className="ow-go-body"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={spring}
                  >
                    {body[step.key]}
                  </motion.div>
                ) : (
                  <p className="ow-go-line">
                    {step.done ? summary[step.key] : later[step.key]}
                    {step.done && step.key === "products" && (
                      <Link href="/owner/products" className="ow-go-link">
                        {withPhoto < count ? "Add photos" : "Edit"}
                      </Link>
                    )}
                    {step.done && step.key === "stand" && (
                      <Link href="/owner/setup" className="ow-go-link">
                        Show the link again
                      </Link>
                    )}
                    {step.done && step.key === "take" && (
                      <Link href="/owner/visits" className="ow-go-link">
                        Open Visits
                      </Link>
                    )}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
