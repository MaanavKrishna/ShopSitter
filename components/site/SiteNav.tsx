"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { spring, springSnappy } from "@/lib/motion";
import "./site.css";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/owners", label: "For owners" },
  { href: "/trust", label: "Trust" },
  { href: "/demo", label: "Demo" },
  { href: "/owner/login", label: "Owner sign-in" },
];

const STAND = { href: "/stand", label: "Open the stand" };

/**
 * The floating navigation every public page shares. It is there from the start, unless the
 * page marks an element with `data-site-nav-after`: then the page's own top bar leads, and
 * this arrives once that element has scrolled up to the top.
 * `tone` names the surface under the bar at the top of the page; over cobalt it wears the
 * blue material until the page scrolls.
 */
export function SiteNav({ tone = "onLight" }: { tone?: "onBlue" | "onLight" }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const marker = document.querySelector("[data-site-nav-after]");
    let frame = 0;
    const check = () => {
      frame = 0;
      setVisible(marker ? marker.getBoundingClientRect().top < 72 : true);
      setAtTop(window.scrollY < 24);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pathname]);

  const menuOpen = open && visible;

  // While the menu is open: Escape closes it, Tab stays inside it, a press outside closes it.
  useEffect(() => {
    if (!menuOpen) return;
    const button = menuButton.current;
    const items = () => [button, ...(sheet.current?.querySelectorAll<HTMLElement>("a") ?? [])].filter(Boolean) as HTMLElement[];
    items()[1]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button?.focus();
        return;
      }
      if (e.key !== "Tab") return;
      const all = items();
      const at = all.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (at <= 0 ? all.length - 1 : at - 1) : at === all.length - 1 ? 0 : at + 1;
      e.preventDefault();
      all[next]?.focus();
    };
    const onPress = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!sheet.current?.contains(t) && !button?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPress);
    };
  }, [menuOpen]);

  const material = tone === "onBlue" && atTop ? "ds-material-blue" : "ds-material";
  const current = (href: string) => (href === pathname ? ("page" as const) : undefined);
  // No filter on the bar's wrapper: a filtered ancestor would stop the bar's own backdrop blur.
  const hidden = reduce ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.94 };
  const shown = reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 };

  return (
    <AnimatePresence>
      {visible && (
        <motion.header className="site-nav" initial={hidden} animate={shown} exit={hidden} transition={spring}>
          <div className={`site-nav-bar ${material}`}>
            <NextLink href="/" className="site-nav-mark ds-focus">
              Shopsitter
            </NextLink>
            <nav aria-label="Site" className="site-nav-links">
              {LINKS.map((l) => (
                <NextLink key={l.href} href={l.href} aria-current={current(l.href)} className="ds-focus">
                  {l.label}
                </NextLink>
              ))}
            </nav>
            <NextLink href={STAND.href} className="site-nav-cta ds-focus">
              {STAND.label}
            </NextLink>
            <button
              ref={menuButton}
              type="button"
              className="site-nav-menu ds-focus"
              aria-expanded={menuOpen}
              aria-controls="site-nav-sheet"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setOpen((o) => !o)}
            >
              <span data-open={menuOpen} aria-hidden="true" />
            </button>
          </div>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                ref={sheet}
                id="site-nav-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="Menu"
                className="site-nav-sheet ds-material"
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, filter: "blur(10px)" }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, filter: "blur(10px)" }}
                transition={springSnappy}
              >
                {LINKS.map((l) => (
                  <NextLink
                    key={l.href}
                    href={l.href}
                    aria-current={current(l.href)}
                    className="ds-focus"
                    onClick={() => setOpen(false)}
                  >
                    {l.label}
                  </NextLink>
                ))}
                <NextLink href={STAND.href} className="site-nav-sheet-cta ds-focus" onClick={() => setOpen(false)}>
                  {STAND.label}
                </NextLink>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.header>
      )}
    </AnimatePresence>
  );
}
