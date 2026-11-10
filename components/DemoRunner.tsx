"use client";

import Link from "next/link";
import { useState } from "react";
import { formatCents } from "@/lib/money";
import type { Sample } from "@/lib/samples";
import type { PricedBill } from "@/lib/types";
import type { Visit } from "@/lib/visits";

type Outcome = { sampleId: string; visit: Visit | null; bill: PricedBill | null };

const PROBLEMS: Record<string, string> = {
  slow_down: "That's a lot of runs in a minute. Wait a moment and try again.",
  unknown_sample: "That sample isn't available any more. Reload the page.",
};

export function DemoRunner({ samples }: { samples: Sample[] }) {
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

  if (samples.length === 0) {
    return <p className="demo-empty">Sample photos haven&apos;t been added yet. Check back soon.</p>;
  }

  return (
    <>
      {problem && (
        <p role="alert" className="pay-notice">
          {problem}
        </p>
      )}
      <ul className="demo-samples">
        {samples.map((s) => (
          <li key={s.id}>
            <div className="demo-pair">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element -- plain static sample photos */}
                <img src={s.before} alt="The shelf before the visitor" loading="lazy" />
                <figcaption>Before</figcaption>
              </figure>
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.after} alt={`The shelf after: ${s.caption}`} loading="lazy" />
                <figcaption>After</figcaption>
              </figure>
            </div>
            <p className="demo-caption">{s.caption}</p>
            <button type="button" className="btn" disabled={running !== null} onClick={() => run(s.id)}>
              {running === s.id ? "Reading the shelf…" : "Read this shelf"}
            </button>

            {outcome?.sampleId === s.id && (
              <div className="demo-result" aria-live="polite">
                {outcome.visit && outcome.bill && outcome.bill.lines.length > 0 ? (
                  <>
                    <ul className="pay-receipt">
                      {outcome.bill.lines.map((l) => (
                        <li key={l.sku}>
                          <span>
                            {l.qty} × {l.name}
                          </span>
                          <span className="money">${formatCents(l.lineCents)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="tag pay-total">
                      <span>Total</span>
                      <span className="money">${formatCents(outcome.bill.totalCents)}</span>
                    </div>
                    <Link className="btn btn-pay" href={`/pay/${outcome.visit.id}`}>
                      Open the customer&apos;s pay page
                    </Link>
                  </>
                ) : outcome.visit?.needsManual ? (
                  <>
                    <p>The shelf couldn&apos;t be read this time, so the customer enters items by hand.</p>
                    <Link className="btn" href={`/pay/${outcome.visit.id}`}>
                      Open the customer&apos;s pay page
                    </Link>
                  </>
                ) : (
                  <p>Nothing was taken, so there&apos;s no bill.</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
