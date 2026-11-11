import type { Viewport } from "next";
import { Suspense } from "react";
import { CheckoutError, getBill } from "@/lib/checkout";
import { getRepo } from "@/lib/repo";
import { LATE_PAY_MS } from "@/lib/visits";
import { PayNotFound, PayPanel, PaySkeleton } from "@/components/PayPanel";
import { Wordmark } from "@/components/Wordmark";
import "../pay.css";

export const dynamic = "force-dynamic";

// Lets the pay bar read the phone's home-indicator inset, so it can pad itself clear of it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a35c8",
};

async function loadBill(visitId: string) {
  const now = Date.now();
  try {
    const data = await getBill(getRepo(), visitId, now);
    const { visit } = data;
    // Same cut-off the order route applies, so the page can say so before PayPal is opened.
    const expired = visit.status === "unmatched" && now - (visit.closedAt ?? visit.lastSettledAt) > LATE_PAY_MS;
    return { ...data, expired };
  } catch (e) {
    if (e instanceof CheckoutError) return null;
    throw e;
  }
}

async function Bill({ visitId }: { visitId: Promise<string> }) {
  const id = await visitId;
  const data = await loadBill(id);
  if (!data) return <PayNotFound />;
  return (
    <PayPanel
      visitId={id}
      initialVisit={data.visit}
      initialBill={data.bill}
      products={data.products}
      expired={data.expired}
      paypalClientId={process.env.PAYPAL_CLIENT_ID ?? null}
    />
  );
}

export default function PayPage({ params }: PageProps<"/pay/[visitId]">) {
  return (
    <div className="payx">
      <header className="payx-top void">
        <Wordmark />
        <span className="payx-top-note">Pay at the stand</span>
      </header>
      <main className="payx-main">
        <Suspense fallback={<PaySkeleton />}>
          <Bill visitId={params.then((p) => p.visitId)} />
        </Suspense>
      </main>
    </div>
  );
}
