import type { Metadata } from "next";
import NextLink from "next/link";
import "./inner.css";

export const metadata: Metadata = {
  title: "Page not found — Shopsitter",
  description: "There is no page at this address.",
};

export default function NotFound() {
  return (
    <div className="void in-404">
      <header className="in-404-top">
        <NextLink href="/" className="wordmark ds-focus">
          Shopsitter
        </NextLink>
      </header>
      <main className="in-404-main">
        <span className="in-404-ghost" aria-hidden="true">
          404
        </span>
        <h1>Nothing on this shelf.</h1>
        <nav className="in-404-links" aria-label="Places to go">
          <NextLink href="/" className="in-btn in-btn-coral ds-focus">
            Home
          </NextLink>
          <NextLink href="/demo" className="in-btn in-btn-ghost ds-focus">
            Demo
          </NextLink>
          <NextLink href="/owner/login" className="in-btn in-btn-ghost ds-focus">
            Owner sign-in
          </NextLink>
        </nav>
      </main>
    </div>
  );
}
