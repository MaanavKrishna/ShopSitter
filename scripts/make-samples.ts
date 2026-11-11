// Composes the demo's sample shelf pictures from the product cut-outs in public/products/.
// They are not photographs of a real stand: each is a drawn two-board shelf with the cut-outs
// placed on it. Writes JPEG pairs and manifest.json into public/samples/.
// Usage: npx tsx scripts/make-samples.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const W = 1280;
const H = 960;
const OUT = path.join(process.cwd(), "public", "samples");
const PRODUCTS = path.join(process.cwd(), "public", "products");

/** Where the front edge of each board sits, and where items stand on it. */
const BOARDS = [
  { top: 392, stand: 418 },
  { top: 846, stand: 872 },
];
const BOARD_THICKNESS = 46;

/** Item height in pixels at scale 1, and the turn that stands each cut-out upright. */
const SHAPE: Record<string, { height: number; upright: number }> = {
  honey: { height: 250, upright: -13 },
  jam: { height: 240, upright: -12 },
  bread: { height: 215, upright: 0 },
  eggs: { height: 225, upright: 0 },
  apples: { height: 270, upright: 0 },
  flowers: { height: 300, upright: 0 },
};

type Item = { key: string; sku: string; board: 0 | 1; x: number; scale?: number; turn?: number };
type Light = { brightness: number; warmth: number };
type Scene = { items: Item[]; light?: Light };
type Pair = { id: string; caption: string; before: Scene; after: Scene };

/** Small repeatable random numbers, so the same script always draws the same pictures. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The empty shelf: a plastered back wall and two wooden boards, drawn as SVG. */
function backdrop(): Buffer {
  const rand = rng(7);
  const grain = (y0: number, y1: number) =>
    Array.from({ length: 26 }, () => {
      const y = y0 + rand() * (y1 - y0);
      const x = rand() * W;
      const len = 140 + rand() * 520;
      const bend = (rand() - 0.5) * 6;
      return `<path d="M${x.toFixed(0)} ${y.toFixed(1)} q${(len / 2).toFixed(0)} ${bend.toFixed(1)} ${len.toFixed(0)} 0" stroke="#5b3a1c" stroke-opacity="${(0.1 + rand() * 0.16).toFixed(2)}" stroke-width="${(1 + rand() * 1.6).toFixed(1)}" fill="none"/>`;
    }).join("");
  const board = (b: { top: number }) => `
    <rect x="0" y="${b.top - 4}" width="${W}" height="60" fill="url(#under)" transform="translate(0 ${BOARD_THICKNESS + 34})"/>
    <rect x="0" y="${b.top}" width="${W}" height="${BOARD_THICKNESS - 12}" fill="url(#top)"/>
    ${grain(b.top + 2, b.top + BOARD_THICKNESS - 14)}
    <rect x="0" y="${b.top + BOARD_THICKNESS - 12}" width="${W}" height="46" fill="url(#edge)"/>
    ${grain(b.top + BOARD_THICKNESS - 8, b.top + BOARD_THICKNESS + 30)}
    <rect x="0" y="${b.top + BOARD_THICKNESS - 13}" width="${W}" height="2" fill="#f1d3a4" opacity="0.55"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ece6da"/><stop offset="1" stop-color="#d6cdbd"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.3" cy="0.2" r="0.9">
        <stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#3a2c1a" stop-opacity="0.22"/>
      </radialGradient>
      <linearGradient id="top" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#b98952"/><stop offset="1" stop-color="#c99a62"/>
      </linearGradient>
      <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a87543"/><stop offset="1" stop-color="#7d5430"/>
      </linearGradient>
      <linearGradient id="under" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2b1d0e" stop-opacity="0.34"/><stop offset="1" stop-color="#2b1d0e" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#wall)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${BOARDS.map(board).join("")}
  </svg>`);
}

const cutouts = new Map<string, Promise<{ data: Buffer; width: number; height: number }>>();

/** A product cut-out, turned and sized, with the coloured fringe of its outline trimmed off. */
function cutout(sku: string, scale: number, turn: number) {
  const id = `${sku}:${scale}:${turn}`;
  let hit = cutouts.get(id);
  if (!hit) {
    hit = (async () => {
      const shape = SHAPE[sku];
      const tight = await sharp(path.join(PRODUCTS, `${sku}.png`)).ensureAlpha().extractChannel("alpha").blur(1.6).linear(4, -640).toBuffer();
      const colour = await sharp(path.join(PRODUCTS, `${sku}.png`)).removeAlpha().png().toBuffer();
      const clean = await sharp(colour).joinChannel(tight).png().toBuffer();
      const { data, info } = await sharp(clean)
        .rotate(shape.upright + turn, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .trim()
        .resize({ height: Math.round(shape.height * scale) })
        .png()
        .toBuffer({ resolveWithObject: true });
      return { data, width: info.width, height: info.height };
    })();
    cutouts.set(id, hit);
  }
  return hit;
}

/** A soft dark patch where an item meets the board. */
function contactShadow(width: number): Promise<Buffer> {
  const w = Math.round(width * 1.25);
  const h = 44;
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><ellipse cx="${w / 2}" cy="${h / 2}" rx="${width * 0.47}" ry="9" fill="#1d1206" fill-opacity="0.62"/></svg>`,
    ),
  )
    .blur(6)
    .png()
    .toBuffer();
}

async function render(scene: Scene, seed: number): Promise<Buffer> {
  const layers: { input: Buffer; left: number; top: number }[] = [];
  // Items further left are drawn first; none overlap by more than a few pixels.
  for (const it of [...scene.items].sort((a, b) => a.x - b.x)) {
    const img = await cutout(it.sku, it.scale ?? 1, it.turn ?? 0);
    const base = BOARDS[it.board].stand;
    const shadow = await contactShadow(img.width);
    const shadowWidth = Math.round(img.width * 1.25);
    layers.push({ input: shadow, left: Math.round(it.x - shadowWidth / 2 + 8), top: base - 26 });
    layers.push({ input: img.data, left: Math.round(it.x - img.width / 2), top: base - img.height });
  }
  const light = scene.light ?? { brightness: 1, warmth: 0 };
  const { data, info } = await sharp(backdrop())
    .composite(layers)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Lighting and mild sensor-like noise, different in every picture as it is between two real stills.
  const rand = rng(seed);
  const gain = [light.brightness * (1 + light.warmth), light.brightness, light.brightness * (1 - light.warmth)];
  for (let i = 0; i < data.length; i += 3) {
    const n = (rand() + rand() + rand() - 1.5) * 9;
    for (let c = 0; c < 3; c++) {
      const v = data[i + c] * gain[c] + n;
      data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } })
    .blur(0.5)
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

const it = (key: string, board: 0 | 1, x: number, scale = 1, turn = 0): Item => ({
  key,
  sku: key.replace(/\d+$/, ""),
  board,
  x,
  scale,
  turn,
});
const without = (items: Item[], ...keys: string[]) => items.filter((i) => !keys.includes(i.key));
const moved = (items: Item[], key: string, x: number, turn?: number) =>
  items.map((i) => (i.key === key ? { ...i, x, turn: turn ?? i.turn } : i));

// Three starting shelves. Units of one product stand side by side with a clear gap between them.
const shelfA: Item[] = [
  it("honey1", 0, 150, 1, 2),
  it("honey2", 0, 372, 0.96, -3),
  it("honey3", 0, 594, 1.02, 1),
  it("flowers1", 0, 1070, 1, -2),
  it("jam1", 1, 150, 1, -2),
  it("jam2", 1, 368, 0.97, 3),
  it("eggs1", 1, 690, 1, 0),
  it("bread1", 1, 1060, 1, 2),
];
const shelfB: Item[] = [
  it("apples1", 0, 190, 1, 0),
  it("apples2", 0, 470, 0.95, 4),
  it("bread1", 0, 800, 1, -3),
  it("bread2", 0, 1090, 0.96, 5),
  it("eggs1", 1, 210, 1, 0),
  it("eggs2", 1, 520, 0.96, 0),
  it("honey1", 1, 820, 1, -2),
  it("jam1", 1, 1050, 1, 2),
];
const shelfC: Item[] = [
  it("jam1", 0, 140, 1, 1),
  it("jam2", 0, 350, 0.97, -3),
  it("jam3", 0, 560, 1.02, 2),
  it("apples1", 0, 1040, 1, -3),
  it("flowers1", 1, 170, 1, 3),
  it("flowers2", 1, 450, 0.95, -4),
  it("honey1", 1, 790, 1, 2),
  it("honey2", 1, 1010, 0.97, -2),
];

const PAIRS: Pair[] = [
  {
    id: "one-jar",
    caption: "A jar leaves the top board",
    before: { items: shelfA },
    after: { items: without(shelfA, "honey2") },
  },
  {
    id: "two-alike",
    caption: "Two boxes from the lower board are gone",
    before: { items: shelfB },
    after: { items: without(shelfB, "eggs1", "eggs2") },
  },
  {
    id: "two-kinds",
    caption: "Gaps open on both boards",
    before: { items: shelfC },
    after: { items: without(shelfC, "apples1", "flowers2") },
  },
  {
    id: "slid-along",
    caption: "A loaf is slid along the board",
    before: { items: shelfA },
    after: { items: moved(shelfA, "bread1", 900, -6) },
  },
  {
    id: "light-change",
    caption: "The light dims between the two pictures",
    before: { items: shelfB },
    after: { items: shelfB, light: { brightness: 0.84, warmth: 0.035 } },
  },
  {
    id: "gone-and-shifted",
    caption: "One thing goes and a jar is nudged sideways",
    before: { items: shelfC },
    after: { items: moved(without(shelfC, "jam2"), "honey1", 690, -5) },
  },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest = [];
  let seed = 100;
  for (const pair of PAIRS) {
    const files = { before: `${pair.id}-before.jpg`, after: `${pair.id}-after.jpg` };
    for (const side of ["before", "after"] as const) {
      const jpeg = await render(pair[side], seed++);
      writeFileSync(path.join(OUT, files[side]), jpeg);
      console.log(`${files[side]} ${(jpeg.length / 1024).toFixed(0)} KB`);
    }
    manifest.push({ id: pair.id, caption: pair.caption, ...files });
  }
  writeFileSync(path.join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

main();
