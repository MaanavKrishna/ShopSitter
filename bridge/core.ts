// The pure parts of the camera bridge: reading the config, building the ffmpeg command, cutting
// ffmpeg's JPEG stream into pictures, and building the requests the stand screen also sends.
import { z } from "zod";
import { SAMPLE_HEIGHT, SAMPLE_WIDTH } from "../lib/frame-diff";

/** Stills sent to the server are no wider than this, like the stand screen's. */
export const STILL_WIDTH = 1024;
/** The server refuses a trial's stills above this size. */
export const MAX_STILL_BYTES = 1_000_000;

const Fraction = z.number().min(0).max(1);
const Rect = z
  .object({ x: Fraction, y: Fraction, w: Fraction.refine((v) => v > 0), h: Fraction.refine((v) => v > 0) })
  .refine((r) => r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001, { message: "rect must be inside the frame (x + w and y + h at most 1)" });
export type Rect = z.infer<typeof Rect>;

const Shelf = z.object({ zoneId: z.string().trim().min(1).max(64).nullable(), rect: Rect });
const Camera = z.object({
  name: z.string().trim().min(1).max(60),
  /** Anything ffmpeg can read: rtsp://, http(s):// MJPEG, avfoundation:<n>, /dev/videoN, or a video file. */
  source: z.string().trim().min(1),
  fps: z.number().min(0.5).max(10).default(2),
  /** For a video file: play it again and again (demos). */
  loop: z.boolean().default(false),
  shelves: z.array(Shelf).min(1).max(8),
});
export type CameraConfig = z.infer<typeof Camera>;

const Config = z.object({
  server: z.url().transform((s) => s.replace(/\/+$/, "")),
  token: z.string().trim().min(1, "token is missing: put it in the config or in SHOPSITTER_TOKEN"),
  cameras: z.array(Camera).min(1),
});
export type BridgeConfig = z.infer<typeof Config>;

/** Reads a config, taking the token from SHOPSITTER_TOKEN when the file has none. Throws with a readable message. */
export function parseConfig(raw: unknown, env: Record<string, string | undefined>): BridgeConfig {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const token = typeof obj.token === "string" && obj.token.trim() ? obj.token : (env.SHOPSITTER_TOKEN ?? "");
  const parsed = Config.safeParse({ ...obj, token });
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`).join("\n"),
    );
  }
  return parsed.data;
}

/** An ffmpeg crop filter for a rectangle given as fractions of the frame, kept to even sizes. */
export function cropFilter(r: Rect): string {
  return `crop=trunc(iw*${r.w}/2)*2:trunc(ih*${r.h}/2)*2:trunc(iw*${r.x}):trunc(ih*${r.y})`;
}

/** The ffmpeg input options for a source. */
export function inputArgs({ source, loop }: { source: string; loop: boolean }): string[] {
  if (/^rtsps?:\/\//i.test(source)) return ["-rtsp_transport", "tcp", "-i", source];
  if (/^https?:\/\//i.test(source)) return ["-i", source];
  if (source.startsWith("avfoundation:")) return ["-f", "avfoundation", "-framerate", "30", "-i", source.slice("avfoundation:".length)];
  if (source.startsWith("/dev/video")) return ["-f", "v4l2", "-i", source];
  // A file is played at its own speed, so the detector's timing holds.
  return loop ? ["-re", "-stream_loop", "-1", "-i", source] : ["-re", "-i", source];
}

/** The pipe numbers ffmpeg writes shelf `i`'s gray frames and JPEG stills to. */
export const pipesFor = (i: number) => ({ gray: 3 + 2 * i, jpeg: 4 + 2 * i });

/**
 * One ffmpeg per camera. Each shelf rectangle gets two outputs on its own pipes: a small grayscale
 * stream for the detector and JPEG stills of the rectangle at up to STILL_WIDTH. The full frame is
 * never written anywhere.
 */
export function ffmpegArgs(camera: CameraConfig): string[] {
  const n = camera.shelves.length;
  const parts = [`[0:v]fps=${camera.fps},split=${n}${camera.shelves.map((_, i) => `[s${i}]`).join("")}`];
  camera.shelves.forEach((s, i) => {
    parts.push(`[s${i}]${cropFilter(s.rect)},split=2[a${i}][b${i}]`);
    parts.push(`[a${i}]scale=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT},format=gray[g${i}]`);
    parts.push(`[b${i}]scale=w=trunc(min(${STILL_WIDTH}\\,iw)/2)*2:h=-2,format=yuvj420p[j${i}]`);
  });
  const outputs = camera.shelves.flatMap((_, i) => {
    const p = pipesFor(i);
    return [
      "-fps_mode", "passthrough", "-map", `[g${i}]`, "-f", "rawvideo", `pipe:${p.gray}`,
      "-fps_mode", "passthrough", "-map", `[j${i}]`, "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "4", `pipe:${p.jpeg}`,
    ];
  });
  return ["-hide_banner", "-loglevel", "error", "-nostdin", ...inputArgs(camera), "-an", "-filter_complex", parts.join(";"), ...outputs];
}

/** Cuts ffmpeg's stream of back-to-back JPEGs into whole pictures. */
export class JpegSplitter {
  private buf = new Uint8Array(0);

  push(chunk: Uint8Array): Uint8Array[] {
    const joined = new Uint8Array(this.buf.length + chunk.length);
    joined.set(this.buf);
    joined.set(chunk, this.buf.length);
    const out: Uint8Array[] = [];
    let start = 0;
    // 0xFF 0xD9 (end of image) never appears inside the coded data: there 0xFF is always followed by 0x00.
    for (let i = 1; i < joined.length; i++) {
      if (joined[i - 1] === 0xff && joined[i] === 0xd9) {
        out.push(joined.slice(start, i + 1));
        start = i + 1;
      }
    }
    this.buf = joined.slice(start);
    return out;
  }
}

/** The width and height a JPEG says it has, or null when it is not one. */
export function jpegSize(jpg: Uint8Array): { width: number; height: number } | null {
  if (jpg[0] !== 0xff || jpg[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < jpg.length) {
    if (jpg[i] !== 0xff) return null;
    const marker = jpg[i + 1];
    const len = (jpg[i + 2] << 8) | jpg[i + 3];
    // Start-of-frame markers, apart from the ones that are not frames.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (jpg[i + 5] << 8) | jpg[i + 6], width: (jpg[i + 7] << 8) | jpg[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}

export function standHeaders(token: string, zoneId: string | null): Record<string, string> {
  return zoneId ? { "x-stand-token": token, "x-stand-zone": zoneId } : { "x-stand-token": token };
}

export type BridgeChange = { before: Uint8Array; after: Uint8Array; changeStartedAt: number; settledAt: number };

/** The multipart body of /api/stand/change, as the stand screen sends it (without close-ups: the rectangle is already the shelf). */
export function changeForm(change: BridgeChange): FormData {
  const form = new FormData();
  form.append("before", new Blob([change.before as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), "before.jpg");
  form.append("after", new Blob([change.after as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), "after.jpg");
  form.append("changeStartedAt", String(change.changeStartedAt));
  form.append("settledAt", String(change.settledAt));
  return form;
}

type Answer = {
  visit?: { status?: string; needsManual?: boolean } | null;
  bill?: { lines: { name: string; qty: number; lineCents: number }[]; totalCents: number } | null;
  assigned?: string;
  returned?: unknown;
} | null;

/** One line saying what the server made of a read. */
export function answerLine(answer: Answer): string {
  if (answer?.visit?.status === "open" && answer.bill) {
    if (answer.bill.lines.length === 0) return answer.visit.needsManual ? "could not be read: the stand asks the shopper" : "nothing owed";
    return answer.bill.lines.map((l) => `${l.qty} x ${l.name} ($${(l.lineCents / 100).toFixed(2)})`).join(", ");
  }
  if (answer?.assigned === "session") return "added to a basket";
  if (answer?.assigned === "pending") return "waiting for a shopper to claim it";
  if (answer?.returned) return "put back on the shelf";
  return "nothing taken";
}

/** A ready-to-run config for one shelf, watching the whole picture of one camera, as the Store page shows it. */
export function shelfConfigText({ server, zoneId, shelfName, token }: { server: string; zoneId: string; shelfName: string; token: string }): string {
  const config = {
    server,
    token,
    cameras: [{ name: shelfName, source: "rtsp://user:password@192.168.1.20:554/stream1", fps: 2, shelves: [{ zoneId, rect: { x: 0, y: 0, w: 1, h: 1 } }] }],
  };
  // The rectangle on one line, so the whole config fits on a phone screen.
  return JSON.stringify(config, null, 2).replace(/\{\s+"x": (\S+),\s+"y": (\S+),\s+"w": (\S+),\s+"h": (\S+)\s+\}/, '{ "x": $1, "y": $2, "w": $3, "h": $4 }');
}
