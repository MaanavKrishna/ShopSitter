import { CheckoutError, getBill } from "@/lib/checkout";
import { getRepo } from "@/lib/repo";
import { PayPanel } from "@/components/PayPanel";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

async function loadBill(visitId: string) {
  try {
    return await getBill(getRepo(), visitId, Date.now());
  } catch (e) {
    if (e instanceof CheckoutError) return null;
    throw e;
  }
}

export default async function PayPage({ params }: PageProps<"/pay/[visitId]">) {
  const { visitId } = await params;
  const data = await loadBill(visitId);
  if (!data) {
    return (
      <>
        <header className="pay-top grass">
          <Wordmark />
        </header>
        <main className="pay-shell">
          <h1>We can&apos;t find this bill</h1>
          <p>Scan the code on the stand again to get a fresh link.</p>
        </main>
      </>
    );
  }
  return (
    <>
      <header className="pay-top grass">
        <Wordmark />
      </header>
      <main className="pay-shell">
        <PayPanel
        visitId={visitId}
        initialVisit={data.visit}
        initialBill={data.bill}
        products={data.products}
          paypalClientId={process.env.PAYPAL_CLIENT_ID ?? null}
        />
      </main>
    </>
  );
}
