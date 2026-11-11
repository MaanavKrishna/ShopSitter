import Image from "next/image";
import { PRODUCT_PHOTOS } from "@/components/products";
import { formatCents } from "@/lib/money";

/** The few catalogue fields the public pages draw with. */
export type Item = { sku: string; name: string; priceCents: number };

export const usd = (cents: number) => `$${formatCents(cents)}`;

/** A product cut-out from the starter catalogue, sized by its container. */
export function Cutout({ sku, className }: { sku: string; className?: string }) {
  const photo = PRODUCT_PHOTOS[sku];
  if (!photo) return null;
  return <Image className={className} src={photo.src} width={photo.width} height={photo.height} alt="" sizes="120px" />;
}

export type Tone = "paid" | "unmatched" | "adjusted" | "open" | "settled";

/** A visit status, in the colour that status has everywhere in the product. */
export function StatusBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className="in-badge" data-tone={tone}>
      {children}
    </span>
  );
}

// Module pattern for the code drawn on the miniature stand screen. It has the three corner
// squares of a payment code but is only a drawing: it is not meant to be scanned.
const SIZE = 21;
const corner = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= SIZE - 7) || (r >= SIZE - 7 && c < 7);
const cornerOn = (r: number, c: number) => {
  const y = r >= SIZE - 7 ? r - (SIZE - 7) : r;
  const x = c >= SIZE - 7 ? c - (SIZE - 7) : c;
  return x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4);
};
const nearCorner = (r: number, c: number) =>
  !corner(r, c) && (corner(r - 1, c) || corner(r, c - 1) || corner(r + 1, c) || corner(r, c + 1));
const CODE: [number, number][] = [];
for (let r = 0; r < SIZE; r++) {
  for (let c = 0; c < SIZE; c++) {
    const on = corner(r, c) ? cornerOn(r, c) : (r * 5 + c * 11 + ((r * c) % 7) + ((r ^ c) % 4)) % 3 === 0;
    if (on && !nearCorner(r, c)) CODE.push([r, c]);
  }
}

export function DrawnCode({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" shapeRendering="crispEdges">
      {CODE.map(([r, c]) => (
        <rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill="currentColor" />
      ))}
    </svg>
  );
}
