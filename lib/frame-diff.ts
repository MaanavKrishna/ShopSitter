// Decides, from a stream of small grayscale frames, when the shelf has changed and gone still again.
// Pure functions so the rules can be tested without a camera.
//
// Frames are compared block by block, not as one whole picture, so a small item in a wide
// view still registers, and after removing the overall brightness shift, so a phone camera
// adjusting its exposure does not look like movement.

/** Frames are compared at this size. */
export const SAMPLE_WIDTH = 96;
export const SAMPLE_HEIGHT = 72;

const BLOCK = 4; // pixels per block side
export const GRID_COLS = SAMPLE_WIDTH / BLOCK;
export const GRID_ROWS = SAMPLE_HEIGHT / BLOCK;

const BLOCK_THRESHOLD = 12; // average brightness change (0..255) for a block to count as changed
/** Changed blocks between consecutive frames that mean something is moving. */
export const MOVING_BLOCKS = 2;
/** Changed blocks versus the last read that mean the shelf looks different. */
export const DIFFERS_BLOCKS = 2;

const SETTLE_MS = 1000; // how long the shelf must be still after movement before it is read
const MAX_UNREST_MS = 8000; // read anyway after this much unbroken movement
const UNSEEN_MS = 2400; // how long a difference with no visible movement must last before it is read

/** Average brightness of each block of a SAMPLE_WIDTH x SAMPLE_HEIGHT grayscale frame. */
export function toGrid(gray: Uint8ClampedArray): Float32Array {
  const grid = new Float32Array(GRID_COLS * GRID_ROWS);
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      let sum = 0;
      for (let y = 0; y < BLOCK; y++) {
        const start = (row * BLOCK + y) * SAMPLE_WIDTH + col * BLOCK;
        for (let x = 0; x < BLOCK; x++) sum += gray[start + x];
      }
      grid[row * GRID_COLS + col] = sum / (BLOCK * BLOCK);
    }
  }
  return grid;
}

export type GridBox = { col0: number; row0: number; col1: number; row1: number };

/**
 * How many blocks changed between two grids, and the area that holds them.
 * The typical (median) change across the picture is removed first, so a uniform
 * brightening or darkening counts as no change.
 */
export function compareGrids(a: Float32Array, b: Float32Array): { changed: number; box: GridBox | null } {
  const deltas = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) deltas[i] = b[i] - a[i];
  const sorted = Float32Array.from(deltas).sort();
  const shift = sorted[sorted.length >> 1];

  let changed = 0;
  let box: GridBox | null = null;
  for (let i = 0; i < deltas.length; i++) {
    if (Math.abs(deltas[i] - shift) <= BLOCK_THRESHOLD) continue;
    changed++;
    const col = i % GRID_COLS;
    const row = (i - col) / GRID_COLS;
    box = box
      ? { col0: Math.min(box.col0, col), row0: Math.min(box.row0, row), col1: Math.max(box.col1, col), row1: Math.max(box.row1, row) }
      : { col0: col, row0: row, col1: col, row1: row };
  }
  return { changed, box };
}

/**
 * The pixel rectangle of a photo to zoom in on for a changed grid area: padded so the item
 * has context, at least a third of the photo each way, and always inside the photo.
 */
export function cropBox(box: GridBox, width: number, height: number): { x: number; y: number; w: number; h: number } {
  const x0 = (box.col0 / GRID_COLS) * width;
  const x1 = ((box.col1 + 1) / GRID_COLS) * width;
  const y0 = (box.row0 / GRID_ROWS) * height;
  const y1 = ((box.row1 + 1) / GRID_ROWS) * height;

  const w = Math.min(width, Math.max((x1 - x0) * 2.2, width / 3));
  const h = Math.min(height, Math.max((y1 - y0) * 2.2, height / 3));
  const x = Math.min(Math.max(0, (x0 + x1) / 2 - w / 2), width - w);
  const y = Math.min(Math.max(0, (y0 + y1) / 2 - h / 2), height - h);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

export type DetectorState = {
  /** When movement began, or null while the shelf is still. */
  changeStartedAt: number | null;
  /** When the shelf went quiet after movement. */
  quietSince: number | null;
  /** When the shelf first looked different from the last read without any movement being seen. */
  differsSince: number | null;
  /** True after a read was asked for, until the shelf matches the last read again or something moves. */
  held: boolean;
};

export const initialDetector = (): DetectorState => ({
  changeStartedAt: null,
  quietSince: null,
  differsSince: null,
  held: false,
});
const heldDetector = (): DetectorState => ({ ...initialDetector(), held: true });

export type DetectorSample = {
  /** Something changed between this frame and the previous one. */
  moving: boolean;
  /** This frame differs from the shelf as it was last read. */
  differs: boolean;
  t: number;
};

type Step = { state: DetectorState; fire: null | { changeStartedAt: number; settledAt: number } };

/**
 * Advances the detector by one frame. `fire` is set once when the shelf should be read:
 * either movement has stopped for SETTLE_MS and the shelf differs from the last read, or the
 * shelf has differed for UNSEEN_MS with no movement seen (a grab too quick for the camera).
 * A hand that comes and goes without changing anything fires nothing.
 */
export function stepDetector(state: DetectorState, sample: DetectorSample): Step {
  if (sample.moving) {
    const startedAt = state.changeStartedAt ?? sample.t;
    // A picture that never goes still (flicker, a noisy camera) must not block reads for ever.
    if (sample.differs && sample.t - startedAt >= MAX_UNREST_MS) {
      return { state: heldDetector(), fire: { changeStartedAt: startedAt, settledAt: sample.t } };
    }
    return {
      state: { changeStartedAt: state.changeStartedAt ?? sample.t, quietSince: null, differsSince: null, held: false },
      fire: null,
    };
  }

  if (state.changeStartedAt === null) {
    if (!sample.differs) return { state: initialDetector(), fire: null };
    // Already asked for a read of this difference; wait for the caller to take a new baseline.
    if (state.held) return { state, fire: null };
    const differsSince = state.differsSince ?? sample.t;
    if (sample.t - differsSince < UNSEEN_MS) return { state: { ...state, differsSince }, fire: null };
    return { state: heldDetector(), fire: { changeStartedAt: differsSince, settledAt: sample.t } };
  }

  const quietSince = state.quietSince ?? sample.t;
  if (sample.t - quietSince < SETTLE_MS) return { state: { ...state, quietSince }, fire: null };

  if (!sample.differs) return { state: initialDetector(), fire: null };
  return { state: heldDetector(), fire: { changeStartedAt: state.changeStartedAt, settledAt: sample.t } };
}

/** RGBA pixels (as from canvas getImageData) to one brightness byte per pixel. */
export function toGray(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    gray[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return gray;
}
