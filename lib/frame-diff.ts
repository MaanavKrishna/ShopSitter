// Decides, from a stream of small grayscale frames, when the shelf has changed and gone still again.
// Pure functions so the timing rules can be tested without a camera.

/** Frames are compared at this size; small enough to run several times a second on a phone. */
export const SAMPLE_WIDTH = 64;
export const SAMPLE_HEIGHT = 48;

const PIXEL_THRESHOLD = 18; // brightness change (0..255) that counts as "this pixel changed"
const MOVING_FRACTION = 0.01; // share of changed pixels between consecutive frames that means movement
const CHANGED_FRACTION = 0.005; // share of changed pixels versus the baseline that means the shelf differs
const SETTLE_MS = 2000; // how long the shelf must be still after movement before it is read
const UNSEEN_MS = 3000; // how long a difference with no visible movement must last before it is read

/** Fraction of pixels whose brightness differs noticeably between two equal-sized grayscale frames. */
export function frameDistance(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let changed = 0;
  for (let i = 0; i < n; i++) if (Math.abs(a[i] - b[i]) > PIXEL_THRESHOLD) changed++;
  return changed / n;
}

export type DetectorState = {
  /** When movement began, or null while the shelf is still. */
  changeStartedAt: number | null;
  /** When the shelf went quiet after movement. */
  quietSince: number | null;
  /** When the shelf first looked different from the baseline without any movement being seen. */
  differsSince: number | null;
};

export const initialDetector = (): DetectorState => ({ changeStartedAt: null, quietSince: null, differsSince: null });

export type DetectorSample = {
  /** frameDistance to the previous frame */
  vsPrev: number;
  /** frameDistance to the baseline (the shelf as last read) */
  vsBaseline: number;
  t: number;
};

type Step = { state: DetectorState; fire: null | { changeStartedAt: number; settledAt: number } };

/**
 * Advances the detector by one frame. `fire` is set once when the shelf should be read:
 * either movement has stopped for SETTLE_MS and the shelf no longer matches the baseline,
 * or the shelf has differed from the baseline for UNSEEN_MS with no movement seen (a grab
 * too quick for the camera). A hand that comes and goes without changing anything fires nothing.
 */
export function stepDetector(state: DetectorState, sample: DetectorSample): Step {
  const moving = sample.vsPrev > MOVING_FRACTION;
  const differs = sample.vsBaseline > CHANGED_FRACTION;

  if (moving) {
    return {
      state: { changeStartedAt: state.changeStartedAt ?? sample.t, quietSince: null, differsSince: null },
      fire: null,
    };
  }

  if (state.changeStartedAt === null) {
    if (!differs) return { state: initialDetector(), fire: null };
    const differsSince = state.differsSince ?? sample.t;
    if (sample.t - differsSince < UNSEEN_MS) return { state: { ...state, differsSince }, fire: null };
    return { state: initialDetector(), fire: { changeStartedAt: differsSince, settledAt: sample.t } };
  }

  const quietSince = state.quietSince ?? sample.t;
  if (sample.t - quietSince < SETTLE_MS) return { state: { ...state, quietSince }, fire: null };

  const fire = differs ? { changeStartedAt: state.changeStartedAt, settledAt: sample.t } : null;
  return { state: initialDetector(), fire };
}

/** RGBA pixels (as from canvas getImageData) to one brightness byte per pixel. */
export function toGray(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    gray[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return gray;
}
