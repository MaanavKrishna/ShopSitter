import type { Viewport } from "next";
import { Basket } from "@/components/basket/Basket";
import { Wordmark } from "@/components/Wordmark";
import "../../pay/pay.css";
import "../basket.css";

export const dynamic = "force-dynamic";
// The address holds the shopper's only secret, so the page is kept out of search results.
export const metadata = { title: "Your basket", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a35c8",
};

export default async function BasketPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return (
    <div className="payx">
      <header className="payx-top void">
        <Wordmark />
        <span className="payx-top-note">Your basket</span>
      </header>
      <main className="payx-main">
        <Basket sessionId={sessionId} paypalClientId={process.env.PAYPAL_CLIENT_ID ?? null} />
      </main>
    </div>
  );
}
