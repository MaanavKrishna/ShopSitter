// Decides, for one shelf rectangle, when to read it: the same rules as the stand screen's camera
// (components/StandCamera.tsx), fed by ffmpeg's gray frames instead of a canvas.
import {
  DIFFERS_BLOCKS,
  MOVING_BLOCKS,
  compareGrids,
  initialDetector,
  stepDetector,
  toGrid,
  type DetectorState,
} from "../lib/frame-diff";
import type { BridgeChange } from "./core";

/** A still, unchanged shelf takes a new baseline this often, as on the stand screen. */
const REFRESH_IDLE_MS = 8000;

export class ShelfWatcher {
  private baselineGrid: Float32Array | null = null;
  private baselineJpeg: Uint8Array | null = null;
  private prev: Float32Array | null = null;
  private detector: DetectorState = initialDetector();
  private idleSince = 0;

  /** Feeds one SAMPLE_WIDTH x SAMPLE_HEIGHT gray frame and the matching JPEG still; returns a change to send, or null. */
  push(gray: Uint8Array, jpeg: Uint8Array, t: number): BridgeChange | null {
    const grid = toGrid(new Uint8ClampedArray(gray.buffer, gray.byteOffset, gray.byteLength));
    if (!this.baselineGrid || !this.baselineJpeg || !this.prev) {
      this.baselineGrid = grid;
      this.baselineJpeg = jpeg;
      this.prev = grid;
      this.idleSince = t;
      return null;
    }
    const vsPrev = compareGrids(this.prev, grid);
    const vsBaseline = compareGrids(this.baselineGrid, grid);
    this.prev = grid;
    const moving = vsPrev.changed >= MOVING_BLOCKS;
    const differs = vsBaseline.changed >= DIFFERS_BLOCKS;
    const { state, fire } = stepDetector(this.detector, { moving, differs, t });
    this.detector = state;

    if (!fire) {
      if (moving || differs || state.changeStartedAt !== null) this.idleSince = t;
      else if (t - this.idleSince >= REFRESH_IDLE_MS) {
        this.idleSince = t;
        this.baselineGrid = grid;
        this.baselineJpeg = jpeg;
      }
      return null;
    }
    const change = { before: this.baselineJpeg, after: jpeg, ...fire };
    // What was just read becomes the new "before".
    this.baselineGrid = grid;
    this.baselineJpeg = jpeg;
    this.detector = initialDetector();
    this.idleSince = t;
    return change;
  }
}
