"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { formatCents } from "@/lib/money";
import { easeOut, rise, spring, springBouncy, springSnappy, stagger } from "@/lib/motion";
import type { PricedBill } from "@/lib/types";
import type { Visit } from "@/lib/visits";
import { CountUp } from "./CountUp";
import { QrGlint } from "./QrGlint";
import { Swap } from "./Swap";

export type StageView = "ready" | "bill" | "paid";

// A whole state leaves as soft glass and the next one settles in its place.
const leave = { opacity: 0, scale: 0.98, filter: "blur(10px)", transition: { duration: 0.22, ease: easeOut } };
const arrive = { opacity: 1, scale: 1, filter: "blur(0px)", transition: spring };
const from = { opacity: 0, scale: 0.98, filter: "blur(10px)" };

/** The small picture of a shelf being read: a rounded frame with a line passing down it. */
function ScanFrame({ sweeping }: { sweeping: boolean }) {
  return (
    <span className="sd-scan-frame" data-sweeping={sweeping} aria-hidden="true">
      <i />
    </span>
  );
}

function BillLines({ bill }: { bill: PricedBill }) {
  // The list reveals its lines one after another when the bill first appears;
  // a line added later simply rises into place while the others make room.
  return (
    <motion.ul className="sd-lines" data-dense={bill.lines.length > 5} variants={stagger} initial="hidden" animate="shown">
      <AnimatePresence mode="popLayout">
        {bill.lines.map((l) => (
          <motion.li
            key={l.sku}
            layout
            variants={rise}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.18, ease: easeOut } }}
            transition={spring}
          >
            <span className="sd-qty">
              <Swap text={String(l.qty)} />
            </span>
            <span className="sd-name">{l.name}</span>
            <span className="num">
              <Swap text={`$${formatCents(l.lineCents)}`} />
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </motion.ul>
  );
}

function PaidMark() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="sd-paid-disc"
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springBouncy}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <motion.path
          d="M14.5 24.8l6.6 6.6 12.6-13.6"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.42, ease: easeOut, delay: 0.18 }}
        />
      </svg>
    </motion.div>
  );
}

/**
 * The stand's one message at a time: take what you like, your bill, paid.
 * Nothing here fetches or decides; it draws what the page tells it.
 */
export function Stage({
  view,
  current,
  paidCents,
  reading,
  moving,
  note,
  trouble = null,
  cameraProblem = null,
  qr,
}: {
  view: StageView;
  current: { visit: Visit; bill: PricedBill } | null;
  paidCents: number | null;
  reading: boolean;
  /** The shelf is changing and has not gone still yet. */
  moving: boolean;
  note: string | null;
  /** An upload is being sent again: said in place of "Reading the shelf". */
  trouble?: string | null;
  /** Why the camera could not start. The stand then says it is not watching instead of inviting anyone. */
  cameraProblem?: string | null;
  qr: string | null;
}) {
  const step = trouble ?? (reading ? "Reading the shelf" : moving ? "Noticed a change" : null);
  const lowConfidence = current?.visit.confidence !== null && (current?.visit.confidence ?? 1) < 0.6;
  const manualOnly = !!current?.visit.needsManual && current.bill.totalCents === 0;

  return (
    <div className="sd-stage" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        {view === "paid" ? (
          <motion.div layout="position" key="paid" className="sd-paid" exit={leave}>
            <PaidMark />
            <motion.span layoutId="sd-amount" className="num" transition={spring}>
              ${formatCents(paidCents ?? 0)}
            </motion.span>
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.12 }}
            >
              Paid, thank you
            </motion.h1>
          </motion.div>
        ) : view === "bill" && current ? (
          <motion.div layout="position" key="bill" className="sd-bill" data-manual={manualOnly} initial={from} animate={arrive} exit={leave}>
            <section className="sd-bill-main">
              <div className="sd-bill-head">
                <h1>{manualOnly ? "Couldn’t read the shelf" : "Your bill"}</h1>
                <AnimatePresence>
                  {reading && (
                    <motion.p
                      className="sd-rereading"
                      initial={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
                      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
                      transition={springSnappy}
                    >
                      <ScanFrame sweeping />
                      {trouble ?? "Reading the shelf"}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              {manualOnly ? (
                <p className="sd-note sd-note-lg">Scan the code to enter what you took.</p>
              ) : (
                <BillLines bill={current.bill} />
              )}
              {!manualOnly && (lowConfidence || current.visit.needsManual) && (
                <motion.p
                  layout="position"
                  className="sd-note sd-note-lg"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.3 }}
                >
                  Not sure we got that right. Please check it on your phone.
                </motion.p>
              )}
            </section>

            <aside className="sd-pay">
              {!manualOnly && (
                <p className="sd-total">
                  <span>Total</span>
                  <motion.span layoutId="sd-amount" className="sd-total-figure" transition={spring}>
                    <CountUp cents={current.bill.totalCents} className="num" />
                  </motion.span>
                </p>
              )}
              <motion.div
                className="sd-qr-wrap"
                initial={{ opacity: 0, scale: 0.96, filter: "blur(12px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                transition={{ ...spring, duration: 0.6, delay: 0.22 }}
              >
                <QrGlint>
                  <div className="sd-qr">
                    <div className="sd-qr-code">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL, nothing to optimise */}
                      {qr && <img src={qr} alt="QR code to pay this bill with PayPal" />}
                    </div>
                    <div className="sd-qr-copy">
                      <p className="sd-scan">Scan to pay with PayPal</p>
                      <p className="sd-fix">Wrong? Fix it on your phone.</p>
                    </div>
                  </div>
                </QrGlint>
              </motion.div>
            </aside>
          </motion.div>
        ) : cameraProblem ? (
          <motion.div layout="position" key="blocked" className="sd-ready sd-blocked" initial={from} animate={arrive} exit={leave}>
            <h1>This stand isn&rsquo;t watching the shelf yet</h1>
            <p className="sd-ready-line">{cameraProblem}</p>
          </motion.div>
        ) : (
          <motion.div layout="position" key="ready" className="sd-ready" initial={from} animate={arrive} exit={leave}>
            <h1>Take what you like</h1>
            <div className="sd-ready-sub">
              <AnimatePresence mode="popLayout" initial={false}>
                {step ? (
                  <motion.p
                    key="step"
                    layout
                    className="sd-reading"
                    style={{ borderRadius: 999 }}
                    initial={{ opacity: 0, scale: 0.96, filter: "blur(8px)" }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, scale: 0.96, filter: "blur(8px)" }}
                    transition={spring}
                  >
                    <motion.span layout="position" className="sd-reading-icon">
                      <ScanFrame sweeping={reading && !trouble} />
                    </motion.span>
                    <motion.span layout="position">
                      <Swap text={step} />
                    </motion.span>
                  </motion.p>
                ) : (
                  <motion.p
                    key={note ?? "idle"}
                    className="sd-ready-line"
                    initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, filter: "blur(6px)" }}
                    transition={spring}
                  >
                    {note ?? "Your bill appears here."}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
