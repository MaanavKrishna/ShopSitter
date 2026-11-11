import Link from "next/link";
import { DemoRunner } from "@/components/DemoRunner";
import { ExampleWeek, TrialStart } from "@/components/demo/TrialStart";
import { Wordmark } from "@/components/Wordmark";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { currentShop } from "@/lib/owner-http";
import { getRepo } from "@/lib/repo";
import { listSamples } from "@/lib/samples";
import { isTrial } from "@/lib/shops";
import { getTrial } from "@/lib/trials";
import "../landing.css";
import "./demo.css";

export const metadata = { title: "Run your own Shopsitter stand" };

/** The trial stand this browser already has, so the button reads right from the first paint. */
async function myTrial() {
  try {
    const shop = await currentShop();
    const trial = shop && isTrial(shop) ? await getTrial(getRepo(), shop, Date.now()) : null;
    return trial ? { expiresAt: trial.expiresAt } : null;
  } catch {
    return null;
  }
}

export default async function DemoPage() {
  const samples = listSamples();
  const trial = await myTrial();

  return (
    <>
      <SiteNav />
      <section className="void dm-head">
        <header className="topbar">
          <Wordmark />
          <nav aria-label="Main">
            <Link className="topbar-wide" href="/how-it-works">How it works</Link>
            <Link className="topbar-wide" href="/owners">For owners</Link>
            <Link className="topbar-wide" href="/trust">Trust</Link>
            <Link href="/" >Home</Link>
            <Link href="/owner/login">Owner sign-in</Link>
          </nav>
        </header>
        <div className="ds-container dm-head-text">
          <h1 className="ds-h1">Try it yourself</h1>
          <p className="ds-lead">
            Run a stand of your own with the things on your desk, or watch the vision model read sample shelves.
          </p>
        </div>
      </section>
      <div data-site-nav-after />
      <main className="dm">
        <div className="ds-container dm-stack">
          <TrialStart initial={trial} />
          <section className="dm-samples-part" aria-label="Sample shelves">
            <DemoRunner samples={samples} />
          </section>
          <ExampleWeek hasTrial={trial !== null} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
