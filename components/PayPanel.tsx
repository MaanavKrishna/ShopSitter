"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { PayPalProvider, usePayPalOneTimePaymentSession } from "@paypal/react-paypal-js/sdk-v6";
import { useCallback, useState, type SVGProps } from "react";
import { formatCents } from "@/lib/money";
import type { Line, PricedBill, Product } from "@/lib/types";
import type { Visit } from "@/lib/visits";
import "@/app/pay/pay.css";

type Props = {
  visitId: string;
  initialVisit: Visit;
  initialBill: PricedBill;
  products: Product[];
  /** True when the bill is past the late-payment window and the server will refuse it. */
  expired?: boolean;
  paypalClientId: string | null;
};

const isPaid = (v: Visit) => v.status === "paid" || v.status === "paid_adjusted" || v.status === "paid_late";

/** Below this the shelf read is shaky enough to ask the customer to double-check. Matches the stand screen. */
const LOW_CONFIDENCE = 0.6;

const MESSAGES: Record<string, string> = {
  empty_bill: "There's nothing on this bill to pay for.",
  already_paid: "This bill is already paid.",
  too_late: "This bill is more than a day old and can't be paid here any more.",
  amount_mismatch: "The bill changed while you were paying. Nothing was charged. Check the new total and pay again.",
  not_editable: "This bill can't be changed any more.",
};
const explain = (code: string) => MESSAGES[code] ?? "Something went wrong and nothing was charged. Try again.";

function MinusGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" {...props}>
      <path d="M5 10h10" />
    </svg>
  );
}

function PlusGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" {...props}>
      <path d="M5 10h10M10 5v10" />
    </svg>
  );
}

export function PayPanel({ visitId, initialVisit, initialBill, products, expired = false, paypalClientId }: Props) {
  const [visit, setVisit] = useState(initialVisit);
  const [bill, setBill] = useState(initialBill);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // With nothing read from the shelf, the list of things to add is the whole job, so it starts open.
  const [adding, setAdding] = useState(initialVisit.needsManual && initialBill.lines.length === 0);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/visits/${visitId}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setVisit(data.visit);
    setBill(data.bill);
  }, [visitId]);

  async function setQty(sku: string, qty: number) {
    const current: Line[] = bill.lines.map((l) => ({ sku: l.sku, qty: l.qty }));
    const next = current.some((l) => l.sku === sku)
      ? current.map((l) => (l.sku === sku ? { ...l, qty } : l))
      : [...current, { sku, qty }];
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/visits/${visitId}/lines`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines: next.filter((l) => l.qty > 0) }),
      });
      const data = await res.json();
      if (!res.ok) setNotice(explain(data.error));
      else {
        setBill(data.bill);
        setVisit(data.visit);
      }
    } finally {
      setBusy(false);
    }
  }

  if (isPaid(visit)) {
    return (
      <section aria-live="polite" className="payx-col" data-state="paid">
        <div className="payx-paid void">
          <span className="payx-paid-mark" aria-hidden="true">
            <Icon icon="check" size="lg" />
          </span>
          <p className="payx-paid-label">You paid</p>
          <span className="num payx-paid-amount">${formatCents(visit.paidCents ?? 0)}</span>
          <h1 className="payx-paid-title">Paid, thank you</h1>
        </div>
        <Card padding={0}>
          <BillList bill={bill} />
        </Card>
        <p className="payx-small payx-ref">PayPal reference {visit.captureId}. You can close this page.</p>
      </section>
    );
  }

  if (visit.status === "empty" || visit.status === "settled_other") {
    return (
      <section className="payx-closed">
        <EmptyState
          headingLevel={1}
          icon={
            <span className="payx-closed-mark">
              <Icon icon="check" size="lg" />
            </span>
          }
          title="Nothing to pay"
          description="This bill is closed. If you took something, scan the code on the stand again."
        />
      </section>
    );
  }

  const notOnBill = products.filter((p) => !bill.lines.some((l) => l.sku === p.sku));
  const lowConfidence = visit.confidence !== null && visit.confidence < LOW_CONFIDENCE;

  return (
    <section className="payx-grid">
      <div className="payx-intro">
        <h1 className="payx-title">Your bill</h1>
        <p className="payx-lede">
          {visit.needsManual
            ? "The stand couldn't read the shelf this time. Add what you took."
              : "This is what the stand saw you take. Fix anything that's wrong."}
        </p>
      </div>

      <div className="payx-col">
        {expired ? (
          <Banner
            status="warning"
            title="This bill has expired"
            description="It is more than a day old and can't be paid here any more. Scan the code on the stand to start a new one."
          />
        ) : visit.needsManual ? (
          <Banner
            status="info"
            title="Shelf not read"
            description="Use the list below to add each thing you took, then pay."
          />
        ) : lowConfidence ? (
          <Banner
            status="info"
            title="Please check this bill"
            description="The stand wasn't sure about this one. Use the plus and minus buttons to match what you took."
          />
        ) : visit.status === "unmatched" ? (
          <Banner
            status="info"
            title="This bill is still open"
            description="It wasn't paid at the time. You can pay it here now."
          />
        ) : null}

        <Card padding={0}>
          {bill.lines.length === 0 ? (
            <p className="payx-empty">Nothing on the bill yet.</p>
          ) : (
            <ul className="payx-lines">
              {bill.lines.map((l) => (
                <li key={l.sku} className="payx-line">
                  <span className="payx-line-name">{l.name}</span>
                  <span className="payx-line-each">${formatCents(l.unitCents)} each</span>
                  <div className="payx-stepper">
                    <IconButton
                      variant="ghost"
                      size="lg"
                      label={`One fewer ${l.name}`}
                      icon={<Icon icon={MinusGlyph} />}
                      isDisabled={busy || expired}
                      onClick={() => setQty(l.sku, l.qty - 1)}
                    />
                    <span className="num payx-qty" aria-label={`${l.qty} ${l.name}`}>
                      {l.qty}
                    </span>
                    <IconButton
                      variant="ghost"
                      size="lg"
                      label={`One more ${l.name}`}
                      icon={<Icon icon={PlusGlyph} />}
                      isDisabled={busy || expired || l.qty >= 20}
                      onClick={() => setQty(l.sku, l.qty + 1)}
                    />
                  </div>
                  <span className="num payx-line-total">${formatCents(l.lineCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {notOnBill.length > 0 &&
          !expired &&
          (adding ? (
            <ul className="payx-add">
              {notOnBill.map((p) => (
                <li key={p.sku}>
                  <Button
                    size="lg"
                    width="100%"
                    label={`Add ${p.name} ($${formatCents(p.priceCents)})`}
                    isDisabled={busy}
                    onClick={() => setQty(p.sku, 1)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="payx-add-toggle">
              <Button variant="secondary" label="I took something that isn't listed" onClick={() => setAdding(true)} />
            </div>
          ))}
      </div>

      <div className="payx-summary">
        <div className="payx-total">
          <span className="payx-total-label">
            Total to pay
            {busy && <Spinner size="sm" aria-label="Updating the bill" />}
          </span>
          <span className="num payx-total-amount" data-busy={busy}>
            ${formatCents(bill.totalCents)}
          </span>
        </div>

        {notice && (
          <div role="alert">
            <Banner status="error" title="Payment problem" description={notice} />
          </div>
        )}

        {expired ? null : bill.totalCents === 0 ? (
          <p className="payx-small">Add what you took to pay for it.</p>
        ) : paypalClientId ? (
          <div className="payx-paybox">
            <PayPalProvider
              clientId={paypalClientId}
              environment="sandbox"
              components={["paypal-payments"]}
              pageType="checkout"
            >
              <PayButton
                visitId={visitId}
                totalCents={bill.totalCents}
                disabled={busy}
                onPaid={(v) => {
                  setVisit(v);
                  setNotice(null);
                }}
                onProblem={(code) => {
                  setNotice(explain(code));
                  void refresh();
                }}
              />
            </PayPalProvider>
          </div>
        ) : (
          <div role="alert">
            <Banner
              status="error"
              title="PayPal isn't set up"
              description="PayPal isn't set up on this stand yet, so it can't take payment."
            />
          </div>
        )}
        {!expired && <p className="payx-small">Payments go through the PayPal sandbox. No real money moves.</p>}
      </div>
    </section>
  );
}

function BillList({ bill }: { bill: PricedBill }) {
  return (
    <ul className="payx-receipt">
      {bill.lines.map((l) => (
        <li key={l.sku}>
          <span>
            {l.qty} × {l.name}
          </span>
          <span className="num">${formatCents(l.lineCents)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Shown when the link does not match any bill. */
export function PayNotFound() {
  return (
    <section className="payx-closed">
      <EmptyState
        headingLevel={1}
        icon={
          <span className="payx-closed-mark">
            <Icon icon="search" size="lg" />
          </span>
        }
        title="We can't find this bill"
        description="Scan the code on the stand again to get a fresh link."
      />
    </section>
  );
}

/** Placeholder in the shape of the bill while the server loads it. */
export function PaySkeleton() {
  return (
    <section className="payx-grid" aria-busy="true">
      <div className="payx-intro">
        <Skeleton width={190} height={40} />
        <Skeleton width="80%" height={18} index={1} />
      </div>
      <div className="payx-col">
        <Card padding={0}>
          <div className="payx-skeleton-rows">
            {[0, 1].map((i) => (
              <div key={i} className="payx-skeleton-row">
                <Skeleton width="45%" height={22} index={i + 2} />
                <Skeleton width={72} height={22} index={i + 2} />
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="payx-summary">
        <div className="payx-skeleton-row">
          <Skeleton width={96} height={18} index={4} />
          <Skeleton width={130} height={44} index={4} />
        </div>
        <Skeleton height={62} index={5} />
        <Text type="supporting">Loading your bill</Text>
      </div>
    </section>
  );
}

function PayButton({
  visitId,
  totalCents,
  disabled,
  onPaid,
  onProblem,
}: {
  visitId: string;
  totalCents: number;
  disabled: boolean;
  onPaid: (visit: Visit) => void;
  onProblem: (code: string) => void;
}) {
  const [working, setWorking] = useState(false);

  const { isPending, error, handleClick } = usePayPalOneTimePaymentSession({
    presentationMode: "auto",
    // Returned un-awaited to the SDK so the browser still treats the tap as a user action.
    createOrder: async () => {
      const res = await fetch(`/api/visits/${visitId}/order`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        onProblem(data.error);
        throw new Error(data.error);
      }
      return { orderId: data.orderId as string };
    },
    onApprove: async ({ orderId }) => {
      const res = await fetch(`/api/visits/${visitId}/capture`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      setWorking(false);
      if (res.ok) onPaid(data.visit);
      else onProblem(data.error);
    },
    onCancel: () => setWorking(false),
    onError: () => {
      setWorking(false);
      onProblem("paypal_error");
    },
  });

  if (error) {
    return (
      <div role="alert">
        <Banner
          status="error"
          title="PayPal couldn't load"
          description="Check your connection and reload this page."
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-paypal btn-pay"
      disabled={disabled || isPending || working}
      onClick={() => {
        setWorking(true);
        void handleClick();
      }}
    >
      {isPending ? "Loading PayPal…" : working ? "Waiting for PayPal…" : `Pay $${formatCents(totalCents)} with PayPal`}
    </button>
  );
}
