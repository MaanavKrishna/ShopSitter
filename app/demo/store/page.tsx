import Link from "next/link";
import { StoreSimulator } from "@/components/simulator/StoreSimulator";
import { Wordmark } from "@/components/Wordmark";
import { SiteNav } from "@/components/site/SiteNav";
import "../../landing.css";
import "./store.css";

export const metadata = { title: "Watch a whole store run, live" };

export default function StoreSimulatorPage() {
  return (
    <>
      <SiteNav />
      <main className="void sim-page">
        <header className="topbar">
          <Wordmark />
          <nav aria-label="Main">
            <Link className="topbar-wide" href="/how-it-works">How it works</Link>
            <Link href="/demo">Demo</Link>
            <Link href="/">Home</Link>
          </nav>
        </header>
        <div data-site-nav-after />
        <div className="sim-wrap">
          <div className="sim-intro">
            <h1>Watch a whole store run, live</h1>
            <p>
              You are the shopper. Take things off two shelves and watch the cameras read them, the basket on your
              phone fill up, and the owner&apos;s ledger move, all on the real system.
            </p>
          </div>
          <StoreSimulator />
        </div>
      </main>
    </>
  );
}
