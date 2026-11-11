"use client";

import { useEffect, useState } from "react";

export type Chapter = { id: string; label: string };

/**
 * A thin rail at the side of the page: one mark per chapter, the current one drawn longer.
 * Each chapter element carries `data-tone` ("light" or "dark") so the rail stays legible over it.
 */
export function ChapterRail({ chapters }: { chapters: Chapter[] }) {
  const [active, setActive] = useState(0);
  const [tone, setTone] = useState("dark");

  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const mid = window.innerHeight / 2;
      let at = 0;
      chapters.forEach((c, i) => {
        const el = document.getElementById(c.id);
        if (el && el.getBoundingClientRect().top <= mid) at = i;
      });
      setActive(at);
      setTone(document.getElementById(chapters[at].id)?.dataset.tone ?? "light");
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
  }, [chapters]);

  const jump = (id: string) => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  };

  return (
    <nav className="lp-rail" aria-label="Chapters" data-tone={tone}>
      <ol>
        {chapters.map((c, i) => (
          <li key={c.id}>
            <button type="button" aria-current={i === active ? "step" : undefined} onClick={() => jump(c.id)}>
              <span className="lp-rail-label">{c.label}</span>
              <span className="lp-rail-mark" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
