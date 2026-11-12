import type { Viewport } from "next";
import { EnterStore } from "@/components/basket/EnterStore";
import { Wordmark } from "@/components/Wordmark";
import "../pay/pay.css";
import "../basket/basket.css";

export const metadata = { title: "Start your basket", robots: { index: false } };

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a35c8",
};

export default function EnterPage() {
  return (
    <div className="payx">
      <header className="payx-top void">
        <Wordmark />
        <span className="payx-top-note">Your basket</span>
      </header>
      <main className="payx-main">
        <EnterStore />
      </main>
    </div>
  );
}
