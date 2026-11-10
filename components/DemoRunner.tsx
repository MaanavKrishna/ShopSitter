"use client";

import NextLink from "next/link";
import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { formatCents } from "@/lib/money";
import type { Sample } from "@/lib/samples";
import type { PricedBill } from "@/lib/types";
import type { Visit } from "@/lib/visits";

type Outcome = { sampleId: string; visit: Visit | null; bill: PricedBill | null };

const PROBLEMS: Record<string, string> = {
  slow_down: "That's a lot of runs in a minute. Wait a moment and try again.",
  unknown_sample: "That sample isn't available any more. Reload the page.",
};

const RUN_STEPS = [
  "You pick a before and after photo of the shelf.",
  "Shopsitter reads what was taken and writes the bill.",
  "You open the customer's pay page and pay in the PayPal sandbox.",
];

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
    return (
      <div className="dm-empty">
        <Card padding={0}>
          <div className="dm-empty-main">
            <EmptyState
              headingLevel={2}
              title="The sample photos aren't in yet"
              description="They're being taken on a real shelf. Until then, the demo stand's dashboard shows what the owner sees, and the stand screen is the one that sits by the shelf."
              actions={
                <div className="dm-empty-actions">
                  <Button label="Open the owner's dashboard" variant="primary" size="lg" href="/owner" as={NextLink} />
                  <Button label="Open the stand screen" variant="secondary" size="lg" href="/stand" as={NextLink} />
                </div>
              }
            />
            <p className="dm-empty-note">
              <Text type="supporting">
                The dashboard&apos;s passcode is <strong>demo</strong>. The stand screen asks for the stand code
                and a camera.
              </Text>
            </p>
          </div>
          <Divider />
          <div className="dm-empty-next">
            <Heading level={3}>What this page will do</Heading>
            <ol className="dm-run-steps">
              {RUN_STEPS.map((step, i) => (
                <li key={step}>
                  <span aria-hidden="true">{i + 1}</span>
                  <Text color="secondary">{step}</Text>
                </li>
              ))}
            </ol>
            <NextLink className="dm-back" href="/">
              Back to the toy shelf
            </NextLink>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="dm-intro">
        <Heading level={2}>Pick a shelf to read</Heading>
        <Text as="p" color="secondary">
          Each run is a real visit at the demo stand, so it shows up on the owner&apos;s dashboard too.
        </Text>
      </div>
      {problem && (
        <div role="alert" className="dm-problem">
          <Banner status="error" title={problem} />
        </div>
      )}
      <ul className="dm-samples">
        {samples.map((s) => (
          <li key={s.id}>
            <Card padding={4} height="100%">
              <div className="dm-sample">
                <div className="dm-pair">
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
                <Text as="p" weight="semibold">
                  {s.caption}
                </Text>
                <Button
                  label={running === s.id ? "Reading the shelf…" : "Read this shelf"}
                  variant={outcome?.sampleId === s.id ? "secondary" : "primary"}
                  size="lg"
                  width="100%"
                  isLoading={running === s.id}
                  isDisabled={running !== null && running !== s.id}
                  onClick={() => run(s.id)}
                />

                {outcome?.sampleId === s.id && (
                  <div className="dm-result" aria-live="polite">
                    <Divider />
                    {outcome.visit && outcome.bill && outcome.bill.lines.length > 0 ? (
                      <>
                        <Heading level={3}>The bill</Heading>
                        <ul className="dm-receipt">
                          {outcome.bill.lines.map((l) => (
                            <li key={l.sku}>
                              <span>
                                {l.qty} × {l.name}
                              </span>
                              <span className="num">${formatCents(l.lineCents)}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="dm-total">
                          <span>Total to pay</span>
                          <span className="num">${formatCents(outcome.bill.totalCents)}</span>
                        </div>
                        <Button
                          label="Open the customer's pay page"
                          variant="primary"
                          size="lg"
                          width="100%"
                          href={`/pay/${outcome.visit.id}`}
                          as={NextLink}
                        />
                      </>
                    ) : outcome.visit?.needsManual ? (
                      <>
                        <Text as="p">
                          The shelf couldn&apos;t be read this time, so the customer enters items by hand.
                        </Text>
                        <Button
                          label="Open the customer's pay page"
                          variant="secondary"
                          size="lg"
                          width="100%"
                          href={`/pay/${outcome.visit.id}`}
                          as={NextLink}
                        />
                      </>
                    ) : (
                      <Text as="p">Nothing was taken, so there&apos;s no bill.</Text>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
