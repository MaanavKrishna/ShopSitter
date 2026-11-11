"use client";

import { useStill } from "./useStill";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { easeOut, spring, springSnappy } from "@/lib/motion";
import { formatCents } from "@/lib/money";
import type { BillLine } from "@/lib/types";
import { Cutout, MiniCode } from "./visuals";

const STEPS = [
  { title: "They take what they want", body: "No app, no barcode, no till. Just the shelf." },
  { title: "The camera waits for stillness", body: "A phone by the shelf notices the change, then waits until the shelf has been still for a second." },
  { title: "A bill and a PayPal code appear", body: "A vision model compares a photo from before with one from after and names what left." },
  { title: "The owner sees it", body: "What sold, what was paid, and what is unmatched." },
];

const DWELL_MS = 2600;
const SHELF = ["jam", "honey", "bread"];

/**
 * A visit in four beats. The stage plays through once when it scrolls into view and then
 * rests; the list beside it is a set of tabs, so any beat can be picked by hand.
 */
export type PastVisit = { line: BillLine; kind: "paid" | "unmatched"; when: string };

export function VisitTeaser({ line, past }: { line: BillLine; past: PastVisit[] }) {
  const root = useRef<HTMLDivElement>(null);
  const reduce = useStill();
  const inView = useInView(root, { once: true, amount: 0.5 });
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!inView || !auto || reduce || step >= STEPS.length - 1) return;
    const t = setTimeout(() => setStep((s) => s + 1), DWELL_MS);
    return () => clearTimeout(t);
  }, [inView, auto, reduce, step]);

  const pick = (i: number) => {
    setAuto(false);
    setStep(i);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const by = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!by) return;
    e.preventDefault();
    const next = (step + by + STEPS.length) % STEPS.length;
    pick(next);
    root.current?.querySelector<HTMLElement>(`#visit-tab-${next}`)?.focus();
  };

  const swap = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.97, filter: "blur(8px)" },
        animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
        exit: { opacity: 0, scale: 0.97, filter: "blur(8px)" },
      };

  return (
    <div ref={root} className="lp-visit">
      <div className="lp-visit-steps" role="tablist" aria-label="A visit, step by step" aria-orientation="vertical" onKeyDown={onKey}>
        {STEPS.map((s, i) => (
          <button
            key={s.title}
            id={`visit-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={step === i}
            aria-controls="visit-stage"
            tabIndex={step === i ? 0 : -1}
            className="lp-visit-step ds-focus"
            onClick={() => pick(i)}
          >
            <span className="lp-visit-n num" aria-hidden="true">
              {i + 1}
            </span>
            <span className="lp-visit-text">
              <strong>{s.title}</strong>
              <span>{s.body}</span>
            </span>
            {step === i && <motion.span layoutId="visit-active" className="lp-visit-active" transition={spring} />}
          </button>
        ))}
      </div>

      <div id="visit-stage" role="tabpanel" aria-labelledby={`visit-tab-${step}`} className="lp-stage">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={step} className="lp-stage-in" {...swap} transition={springSnappy} aria-hidden="true">
            {step === 0 && <ShelfBeat reduce={!!reduce} />}
            {step === 1 && <WaitBeat reduce={!!reduce} />}
            {step === 2 && <BillBeat line={line} reduce={!!reduce} />}
            {step === 3 && <OwnerBeat line={line} past={past} reduce={!!reduce} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Shelf({ gone, lifting }: { gone?: boolean; lifting?: boolean }) {
  return (
    <div className="lp-shelf">
      {SHELF.map((sku) =>
        sku === "honey" ? (
          <span key={sku} className="lp-shelf-slot" data-empty={gone || lifting || undefined}>
            {lifting ? (
              <motion.span
                className="lp-shelf-item"
                initial={{ opacity: 1, y: 0, rotate: 0 }}
                animate={{ opacity: 0, y: -46, rotate: 8 }}
                transition={{ duration: 0.7, ease: easeOut, delay: 0.7 }}
              >
                <Cutout sku={sku} />
              </motion.span>
            ) : (
              !gone && (
                <span className="lp-shelf-item">
                  <Cutout sku={sku} />
                </span>
              )
            )}
          </span>
        ) : (
          <span key={sku} className="lp-shelf-slot">
            <span className="lp-shelf-item">
              <Cutout sku={sku} />
            </span>
          </span>
        ),
      )}
    </div>
  );
}

function ShelfBeat({ reduce }: { reduce: boolean }) {
  return (
    <div className="lp-beat lp-beat-shelf">
      <Shelf lifting={!reduce} gone={reduce} />
      <motion.p
        className="lp-beat-note"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: reduce ? 0 : 1.3 }}
      >
        One jar of honey leaves the shelf
      </motion.p>
    </div>
  );
}

function WaitBeat({ reduce }: { reduce: boolean }) {
  const [still, setStill] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setStill(true), 1500);
    return () => clearTimeout(t);
  }, [reduce]);

  return (
    <div className="lp-beat lp-beat-wait">
      <div className="lp-finder">
        <Shelf gone />
        <span className="lp-finder-status" data-still={still}>
          <i />
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={String(still)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={springSnappy}
            >
              {still ? "Still. Reading the shelf" : "Something moved"}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="lp-finder-bar">
          <motion.span
            initial={{ scaleX: reduce ? 1 : 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: reduce ? 0 : 1, ease: "linear", delay: reduce ? 0 : 0.5 }}
          />
        </span>
      </div>
    </div>
  );
}

function BillBeat({ line, reduce }: { line: BillLine; reduce: boolean }) {
  const d = (s: number) => (reduce ? 0 : s);
  return (
    <div className="lp-beat lp-beat-bill">
      <div className="lp-pair">
        <figure>
          <Shelf />
          <figcaption>Before</figcaption>
        </figure>
        <figure>
          <Shelf gone />
          <figcaption>After</figcaption>
          {!reduce && (
            <motion.span
              className="lp-pair-scan"
              initial={{ x: "-10%", opacity: 0 }}
              animate={{ x: ["-10%", "110%"], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 0.9, ease: "easeInOut", delay: 0.25 }}
            />
          )}
        </figure>
      </div>
      <motion.div
        className="void lp-minibill"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: d(1.1) }}
      >
        <div>
          <span>
            {line.qty} × {line.name}
          </span>
          <b className="num">${formatCents(line.lineCents)}</b>
        </div>
        <MiniCode />
      </motion.div>
    </div>
  );
}

function OwnerBeat({ line, past, reduce }: { line: BillLine; past: PastVisit[]; reduce: boolean }) {
  const [paid, setPaid] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setPaid(true), 900);
    return () => clearTimeout(t);
  }, [reduce]);

  return (
    <div className="lp-beat lp-beat-owner">
      <div className="lp-row">
        <span className="lp-row-what">
          <b>
            {line.qty} × {line.name}
          </b>
          <small>Just now</small>
        </span>
        <span className="num">${formatCents(line.lineCents)}</span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={String(paid)}
            className="lp-badge"
            data-kind={paid ? "paid" : "open"}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={springSnappy}
          >
            {paid ? "Paid" : "Open"}
          </motion.span>
        </AnimatePresence>
      </div>
      {past.map((v) => (
        <div key={v.line.sku} className="lp-row">
          <span className="lp-row-what">
            <b>
              {v.line.qty} × {v.line.name}
            </b>
            <small>{v.when}</small>
          </span>
          <span className="num">${formatCents(v.line.lineCents)}</span>
          <span className="lp-badge" data-kind={v.kind}>
            {v.kind === "paid" ? "Paid" : "Unmatched"}
          </span>
        </div>
      ))}
      <p className="lp-beat-note">The stand says “Paid, thank you”. The dashboard has the visit.</p>
    </div>
  );
}
