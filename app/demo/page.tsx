import Link from "next/link";
import { DemoRunner } from "@/components/DemoRunner";
import { Wordmark } from "@/components/Wordmark";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { listSamples } from "@/lib/samples";
import "../landing.css";
import "./demo.css";

export const metadata = { title: "Try Shopsitter without a camera" };

export default function DemoPage() {
  const samples = listSamples();

  return (
    <>
      <SiteNav />
      <section className="void dm-head">
        <header className="topbar">
          <Wordmark />
          <nav aria-label="Main">
            <Link href="/">Home</Link>
            <Link href="/owner">Owner&apos;s view</Link>
          </nav>
        </header>
        <div className="ds-container dm-head-text">
          <h1 className="ds-h1">Try it without a camera</h1>
          <p className="ds-lead">
            {samples.length > 0
              ? "Each pair is a real photo of the demo shelf before and after a visitor. Pick one and Shopsitter reads what was taken, writes the bill, and lets you pay it in the PayPal sandbox."
              : "Shopsitter reads a before and after photo of the demo shelf, writes the bill, and lets you pay it in the PayPal sandbox."}
          </p>
        </div>
      </section>
      <div data-site-nav-after />
      <main className="dm">
        <div className="ds-container">
          <DemoRunner samples={samples} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
