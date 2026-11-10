// Small flat drawings of the starter products, in one style, so the shelf reads without photos.

const art: Record<string, React.ReactNode> = {
  honey: (
    <>
      <rect x="22" y="26" width="36" height="42" rx="8" fill="#f2a200" />
      <rect x="20" y="16" width="40" height="12" rx="3" fill="#ffe500" />
      <rect x="28" y="40" width="24" height="16" rx="2" fill="#fff" />
      <path d="M33 48h14" stroke="#0c1a12" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  jam: (
    <>
      <rect x="24" y="30" width="32" height="38" rx="7" fill="#c4122f" />
      <path d="M20 30q20-18 40 0z" fill="#ff4f9a" />
      <path d="M26 25h28M30 20h20" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <rect x="30" y="42" width="20" height="14" rx="2" fill="#fff" />
    </>
  ),
  bread: (
    <>
      <path d="M12 46c0-16 12-24 28-24s28 8 28 24c0 12-8 18-28 18S12 58 12 46z" fill="#c9833a" />
      <path d="M26 34l6 10M38 31l6 11M50 33l6 10" stroke="#f4d9ae" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  eggs: (
    <>
      <rect x="10" y="38" width="60" height="26" rx="5" fill="#9aa39d" />
      <ellipse cx="24" cy="36" rx="9" ry="11" fill="#fff" />
      <ellipse cx="40" cy="36" rx="9" ry="11" fill="#f4d9ae" />
      <ellipse cx="56" cy="36" rx="9" ry="11" fill="#fff" />
      <rect x="10" y="44" width="60" height="20" rx="5" fill="#7d8780" />
    </>
  ),
  apples: (
    <>
      <circle cx="28" cy="46" r="15" fill="#e02424" />
      <circle cx="52" cy="46" r="15" fill="#c4122f" />
      <circle cx="40" cy="32" r="14" fill="#ff3b30" />
      <path d="M40 18q8-8 14-2" stroke="#b6f000" strokeWidth="5" strokeLinecap="round" fill="none" />
    </>
  ),
  flowers: (
    <>
      <path d="M40 70V40M30 70l6-24M50 70l-6-24" stroke="#b6f000" strokeWidth="4" strokeLinecap="round" />
      <circle cx="40" cy="26" r="12" fill="#ff4f9a" />
      <circle cx="24" cy="34" r="10" fill="#ffe500" />
      <circle cx="56" cy="34" r="10" fill="#ff6a13" />
      <circle cx="40" cy="26" r="4" fill="#ffe500" />
    </>
  ),
};

const fallback = <rect x="18" y="22" width="44" height="40" rx="6" fill="#fff" />;

export function ProductArt({ sku, className }: { sku: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      {art[sku] ?? fallback}
    </svg>
  );
}
