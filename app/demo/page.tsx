import Link from "next/link";
import { DemoRunner } from "@/components/DemoRunner";
import { Wordmark } from "@/components/Wordmark";
import { listSamples } from "@/lib/samples";
import "./demo.css";

export const metadata = { title: "Try Shopsitter without a camera" };

export default function DemoPage() {
  const samples = listSamples();

  return (
    <>
      <section className="void dm-head">
        <header className="topbar">
          <Wordmark />
          <nav aria-label="Main">
            <Link href="/owner">Owner&apos;s view</Link>
          </nav>
        </header>
        <div className="dm-head-text">
          <h1>Try it without a camera</h1>
          <p>
            {samples.length > 0
              ? "Each pair is a real photo of the demo shelf before and after a visitor. Pick one and Shopsitter reads what was taken, writes the bill, and lets you pay it in the PayPal sandbox."
              : "Shopsitter reads a before and after photo of the demo shelf, writes the bill, and lets you pay it in the PayPal sandbox. The photos are on their way."}
          </p>
        </div>
      </section>
      <main className="dm">
        <DemoRunner samples={samples} />
      </main>
    </>
  );
}
