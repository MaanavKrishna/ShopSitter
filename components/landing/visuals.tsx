import Image from "next/image";
import { PRODUCT_PHOTOS } from "@/components/products";

// Module pattern for the code drawn on the miniature stand screen. It has the three corner
// squares of a payment code but is only a drawing: it is not meant to be scanned.
const SIZE = 21;
const inFinder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= SIZE - 7) || (r >= SIZE - 7 && c < 7);
const finderOn = (r: number, c: number) => {
  const y = r >= SIZE - 7 ? r - (SIZE - 7) : r;
  const x = c >= SIZE - 7 ? c - (SIZE - 7) : c;
  const edge = x === 0 || x === 6 || y === 0 || y === 6;
  const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
  return edge || core;
};
const MODULES: [number, number][] = [];
for (let r = 0; r < SIZE; r++) {
  for (let c = 0; c < SIZE; c++) {
    const on = inFinder(r, c) ? finderOn(r, c) : (r * 7 + c * 13 + ((r * c) % 5) + ((r ^ c) % 3)) % 3 === 0;
    const gap = !inFinder(r, c) && (inFinder(r - 1, c) || inFinder(r, c - 1) || inFinder(r + 1, c) || inFinder(r, c + 1));
    if (on && !gap) MODULES.push([r, c]);
  }
}

/** A drawn stand-in for the payment code on the stand screen. */
export function MiniCode({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" shapeRendering="crispEdges">
      {MODULES.map(([r, c]) => (
        <rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill="currentColor" />
      ))}
    </svg>
  );
}

/** A product cut-out from the starter catalogue, sized by its container. */
export function Cutout({ sku, className }: { sku: string; className?: string }) {
  const photo = PRODUCT_PHOTOS[sku];
  if (!photo) return null;
  return <Image className={className} src={photo.src} width={photo.width} height={photo.height} alt="" sizes="160px" />;
}

const SHELF = ["jam", "honey", "bread"];

/** Three products on a plank; with `gone`, the middle one has left an empty place. */
export function ShelfDrawing({ gone }: { gone?: boolean }) {
  return (
    <div className="lp-shelf">
      {SHELF.map((sku) => (
        <span key={sku} className="lp-shelf-slot" data-empty={(gone && sku === "honey") || undefined}>
          {!(gone && sku === "honey") && (
            <span className="lp-shelf-item">
              <Cutout sku={sku} />
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
