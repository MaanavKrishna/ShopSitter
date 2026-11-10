import { CheckoutError, getBill } from "@/lib/checkout";
import { getRepo } from "@/lib/repo";
import { PayPanel } from "@/components/PayPanel";

export const dynamic = "force-dynamic";

export default async function PayPage({ params }: PageProps<"/pay/[visitId]">) {
  const { visitId } = await params;
  let data;
  try {
    data = await getBill(getRepo(), visitId, Date.now());
  } catch (e) {
    if (!(e instanceof CheckoutError)) throw e;
    return (
      <main className="pay-shell">
        <h1>We can&apos;t find this bill</h1>
        <p>Scan the code on the stand again to get a fresh link.</p>
      </main>
    );
  }
  return (
    <main className="pay-shell">
      <PayPanel
        visitId={visitId}
        initialVisit={data.visit}
        initialBill={data.bill}
        products={data.products}
        paypalClientId={process.env.PAYPAL_CLIENT_ID ?? null}
      />
    </main>
  );
}
