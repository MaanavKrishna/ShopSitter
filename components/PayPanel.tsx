"use client";

import { PayPalProvider, usePayPalOneTimePaymentSession } from "@paypal/react-paypal-js/sdk-v6";
import { useCallback, useState } from "react";
import { formatCents } from "@/lib/money";
import type { Line, PricedBill, Product } from "@/lib/types";
import type { Visit } from "@/lib/visits";

type Props = {
  visitId: string;
  initialVisit: Visit;
  initialBill: PricedBill;
  products: Product[];
  paypalClientId: string | null;
};

const isPaid = (v: Visit) => v.status === "paid" || v.status === "paid_adjusted" || v.status === "paid_late";

const MESSAGES: Record<string, string> = {
  empty_bill: "There's nothing on this bill to pay for.",
  already_paid: "This bill is already paid.",
  too_late: "This bill is more than a day old and can't be paid here any more.",
  amount_mismatch: "The bill changed while you were paying. Nothing was charged. Check the new total and pay again.",
  not_editable: "This bill can't be changed any more.",
};
const explain = (code: string) => MESSAGES[code] ?? "Something went wrong and nothing was charged. Try again.";

export function PayPanel({ visitId, initialVisit, initialBill, products, paypalClientId }: Props) {
  const [visit, setVisit] = useState(initialVisit);
  const [bill, setBill] = useState(initialBill);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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
      <section aria-live="polite">
        <div className="pay-paid void">
          <p>You paid</p>
          <span className="num">${formatCents(visit.paidCents ?? 0)}</span>
          <h1>Paid, thank you</h1>
        </div>
        <div className="pay-card">
          <BillList bill={bill} />
        </div>
        <p className="pay-small">PayPal reference {visit.captureId}. You can close this page.</p>
      </section>
    );
  }

  if (visit.status === "empty" || visit.status === "settled_other") {
    return (
      <section>
        <h1>Nothing to pay</h1>
        <p>This bill is closed. If you took something, scan the code on the stand again.</p>
      </section>
    );
  }

  const notOnBill = products.filter((p) => !bill.lines.some((l) => l.sku === p.sku));

  return (
    <section>
      <h1>Your bill</h1>
      <p className="pay-lede">
        {visit.needsManual
          ? "The stand couldn't read the shelf this time. Add what you took."
          : "This is what the stand saw you take. Fix anything that's wrong."}
      </p>

      {bill.lines.length === 0 ? (
        <p className="pay-empty">Nothing on the bill yet.</p>
      ) : (
        <ul className="pay-lines pay-card">
          {bill.lines.map((l) => (
            <li key={l.sku}>
              <div>
                <strong>{l.name}</strong>
                <span className="pay-each">${formatCents(l.unitCents)} each</span>
              </div>
              <div className="stepper">
                <button type="button" aria-label={`One fewer ${l.name}`} disabled={busy} onClick={() => setQty(l.sku, l.qty - 1)}>
                  −
                </button>
                <span aria-label={`${l.qty} ${l.name}`}>{l.qty}</span>
                <button type="button" aria-label={`One more ${l.name}`} disabled={busy || l.qty >= 20} onClick={() => setQty(l.sku, l.qty + 1)}>
                  +
                </button>
              </div>
              <span className="num pay-line-total">${formatCents(l.lineCents)}</span>
            </li>
          ))}
        </ul>
      )}

      {notOnBill.length > 0 &&
        (adding ? (
          <ul className="pay-add">
            {notOnBill.map((p) => (
              <li key={p.sku}>
                <button type="button" className="btn" disabled={busy} onClick={() => setQty(p.sku, 1)}>
                  Add {p.name} (${formatCents(p.priceCents)})
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <button type="button" className="pay-link" onClick={() => setAdding(true)}>
            I took something that isn&apos;t listed
          </button>
        ))}

      <div className="pay-total">
        <span>Total to pay</span>
        <span className="num">${formatCents(bill.totalCents)}</span>
      </div>

      {notice && (
        <p role="alert" className="pay-notice">
          {notice}
        </p>
      )}

      {bill.totalCents === 0 ? (
        <p className="pay-small">Add what you took to pay for it.</p>
      ) : paypalClientId ? (
        <PayPalProvider clientId={paypalClientId} environment="sandbox" components={["paypal-payments"]} pageType="checkout">
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
      ) : (
        <p role="alert" className="pay-notice">
          PayPal isn&apos;t set up on this stand yet, so it can&apos;t take payment.
        </p>
      )}
      <p className="pay-small">Payments go through the PayPal sandbox. No real money moves.</p>
    </section>
  );
}

function BillList({ bill }: { bill: PricedBill }) {
  return (
    <ul className="pay-receipt">
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
      <p role="alert" className="pay-notice">
        PayPal couldn&apos;t load. Check your connection and reload this page.
      </p>
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
