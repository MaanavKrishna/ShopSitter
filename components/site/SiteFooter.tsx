import NextLink from "next/link";
import "./site.css";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/owners", label: "For owners" },
      { href: "/trust", label: "Trust" },
      { href: "/demo", label: "Demo" },
    ],
  },
  {
    title: "Use it",
    links: [
      { href: "/stand", label: "Open the stand" },
      { href: "/owner/login", label: "Owner sign-in" },
    ],
  },
];

/** The footer every public page shares: the whole site map, then where the project stands. */
export function SiteFooter() {
  return (
    <footer className="void site-foot">
      <div className="ds-container site-foot-in">
        <div className="site-foot-brand">
          <NextLink href="/" className="wordmark ds-focus">
            Shopsitter
          </NextLink>
          <p>Built for the PayPal AI Hackathon 2026. Payments run in the PayPal sandbox.</p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2>{col.title}</h2>
            <ul>
              {col.links.map((l) => (
                <li key={l.href}>
                  <NextLink href={l.href} className="ds-focus">
                    {l.label}
                  </NextLink>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
