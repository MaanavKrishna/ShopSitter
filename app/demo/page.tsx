import Link from "next/link";
import { DemoRunner } from "@/components/DemoRunner";
import { Wordmark } from "@/components/Wordmark";
import { listSamples } from "@/lib/samples";

export const metadata = { title: "Try Shopsitter without a camera" };

export default function DemoPage() {
  return (
    <>
      <section className="void demo-head">
        <header className="topbar">
          <Wordmark />
          <nav aria-label="Main">
            <Link href="/owner">Owner&apos;s view</Link>
          </nav>
        </header>
        <div className="demo-head-text">
          <h1>Try it without a camera</h1>
          <p className="demo-lede">
            Each pair is a real photo of the demo shelf before and after a visitor. Pick one and Shopsitter reads what
            was taken, writes the bill, and lets you pay it in the PayPal sandbox.
          </p>
        </div>
      </section>
      <main className="demo">
        <DemoRunner samples={listSamples()} />
      </main>
    </>
  );
}
