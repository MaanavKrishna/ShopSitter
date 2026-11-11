"use client";

import NextLink from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { DemoEmpty } from "@/components/demo/DemoEmpty";
import { rise, spring, stagger } from "@/lib/motion";
import { formatCents } from "@/lib/money";
import type { Sample } from "@/lib/samples";
import type { PricedBill } from "@/lib/types";
import type { Visit } from "@/lib/visits";

type Outcome = { sampleId: string; visit: Visit | null; bill: PricedBill | null };

const PROBLEMS: Record<string, string> = {
  slow_down: "That's a lot of runs in a minute. Wait a moment and try again.",
  demo_busy: "The demo is busy right now. Try again in a few minutes.",
  unknown_sample: "That sample isn't available any more. Reload the page.",
};

export function DemoRunner({ samples }: { samples: Sample[] }) {
  const reduce = useReducedMotion();
  const [running, setRunning] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function run(sampleId: string) {
    setRunning(sampleId);
    setProblem(null);
    setOutcome(null);
    try {
      const res = await fetch("/api/stand/change", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shop: "demo", sampleId }),
      });
      const data = await res.json();
      if (!res.ok) setProblem(PROBLEMS[data.error] ?? "The shelf couldn't be read just now. Try again.");
      else setOutcome({ sampleId, visit: data.visit, bill: data.bill });
    } catch {
      setProblem("The shelf couldn't be read just now. Check your connection and try again.");
    } finally {
      setRunning(null);
    }
  }

  if (samples.length === 0) return <DemoEmpty />;

  const enter = reduce ? { opacity: 0 } : { opacity: 0, y: 12, filter: "blur(6px)" };
  const rest = reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" };

  return (
    <>
      <div className="dm-intro">
        <h2 className="ds-h2">Pick a shelf to read</h2>
        <p className="ds-lead">
          Each run is a live read by the vision model and opens a visit at the demo stand, so it shows up on the
          owner&apos;s dashboard too.
        </p>
        <p className="dm-note">
          These are sample shelf pictures, composed from product photos. They are not photographs of a real stand.
        </p>
      </div>
      {problem && (
        <div role="alert" className="dm-problem">
          <Banner status="error" title={problem} />
        </div>
      )}
      <ul className="dm-samples">
        {samples.map((s) => {
          const mine = outcome?.sampleId === s.id ? outcome : null;
          return (
            <li key={s.id} className="dm-sample ds-panel" data-busy={running === s.id || undefined}>
              <div className="dm-pair">
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element -- plain static sample pictures */}
                  <img src={s.before} alt="Sample shelf picture before the visitor" loading="lazy" />
                  <figcaption>Before</figcaption>
                </figure>
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.after} alt={`Sample shelf picture after: ${s.caption}`} loading="lazy" />
                  <figcaption>After</figcaption>
                  <span className="dm-scan" aria-hidden="true" />
                </figure>
              </div>
              <div className="dm-sample-body">
                <p className="dm-caption">{s.caption}</p>
                <Button
                  label={running === s.id ? "Reading the shelf…" : mine ? "Read it again" : "Read this shelf"}
                  variant={mine ? "secondary" : "primary"}
                  size="lg"
                  width="100%"
                  isLoading={running === s.id}
                  isDisabled={running !== null && running !== s.id}
                  onClick={() => run(s.id)}
                />

                <div aria-live="polite">
                  <AnimatePresence initial={false}>
                    {mine && (
                      <motion.div
                        key={mine.visit?.id ?? "none"}
                        className="dm-result"
                        initial={enter}
                        animate={rest}
                        exit={{ opacity: 0 }}
                        transition={spring}
                      >
                        {mine.visit && mine.bill && mine.bill.lines.length > 0 ? (
                          <>
                            <h3>The bill</h3>
                            <motion.ul
                              className="dm-receipt"
                              variants={stagger}
                              initial={reduce ? false : "hidden"}
                              animate="shown"
                            >
                              {mine.bill.lines.map((l) => (
                                <motion.li key={l.sku} variants={rise}>
                                  <span>
                                    <b>{l.qty}</b> × {l.name}
                                  </span>
                                  <span className="num">${formatCents(l.lineCents)}</span>
                                </motion.li>
                              ))}
                            </motion.ul>
                            <div className="dm-total">
                              <span>Total to pay</span>
                              <span className="num">${formatCents(mine.bill.totalCents)}</span>
                            </div>
                            <Button
                              label="Open the customer's pay page"
                              variant="primary"
                              size="lg"
                              width="100%"
                              href={`/pay/${mine.visit.id}`}
                              as={NextLink}
                            />
                          </>
                        ) : mine.visit?.needsManual ? (
                          <>
                            <p>The shelf couldn&apos;t be read this time, so the customer enters items by hand.</p>
                            <Button
                              label="Open the customer's pay page"
                              variant="secondary"
                              size="lg"
                              width="100%"
                              href={`/pay/${mine.visit.id}`}
                              as={NextLink}
                            />
                          </>
                        ) : (
                          <p>Nothing was taken, so there&apos;s no bill.</p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
