// Turns ordinary cameras (CCTV, IP cameras, USB webcams, a recorded video) into shelf cameras.
// Usage: npx tsx bridge/index.ts <config.json> [--dry-run <folder>] [--once]
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { readJson, sendWithRetry } from "../lib/client-retry";
import { SAMPLE_HEIGHT, SAMPLE_WIDTH } from "../lib/frame-diff";
import {
  MAX_STILL_BYTES,
  JpegSplitter,
  answerLine,
  changeForm,
  ffmpegArgs,
  jpegSize,
  parseConfig,
  pipesFor,
  standHeaders,
  type BridgeChange,
  type BridgeConfig,
  type CameraConfig,
} from "./core";
import { ShelfWatcher } from "./watcher";

const FRAME_BYTES = SAMPLE_WIDTH * SAMPLE_HEIGHT;
const RESTART_MS = 3000;

const log = (msg: string) => console.log(`${new Date().toLocaleTimeString()} ${msg}`);
function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function readArgs(argv: string[]) {
  const args = [...argv];
  let dryRun: string | null = null;
  let once = false;
  const files: string[] = [];
  while (args.length) {
    const a = args.shift()!;
    if (a === "--dry-run") dryRun = args.shift() ?? fail("--dry-run needs a folder to save the stills in");
    else if (a === "--once") once = true;
    else files.push(a);
  }
  if (files.length !== 1) fail("Usage: npx tsx bridge/index.ts <config.json> [--dry-run <folder>] [--once]");
  return { file: files[0], dryRun, once };
}

/** Checks the token once, and learns the shelves' names. */
async function checkStand(config: BridgeConfig): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const zones = [...new Set(config.cameras.flatMap((c) => c.shelves.map((s) => s.zoneId)))];
  for (const zoneId of zones) {
    const res = await fetch(`${config.server}/api/stand/check`, { headers: standHeaders(config.token, zoneId) }).catch((e) =>
      fail(`Could not reach ${config.server}: ${(e as Error).message}`),
    );
    if (res.status === 401) {
      const error = (await readJson<{ error?: string }>(res))?.error;
      fail(error === "trial_ended" ? "This trial has ended. Start a new one and use its stand key." : "The server refused the token. Check the stand code or key on the Store page.");
    }
    if (res.status === 400) fail(`The store has no shelf with id ${zoneId}. Copy the shelf id from the Store page.`);
    if (res.status === 429) fail("Too many wrong codes from this address. Wait a few minutes, then try again.");
    if (res.status !== 204) fail(`The server answered ${res.status} to the token check.`);
    if (names.size === 0) log(`Connected to ${config.server}: ${res.headers.get("x-stand-kind") === "trial" ? "trial store" : "live store"}`);
    const name = res.headers.get("x-stand-zone-name");
    if (zoneId) names.set(zoneId, name ? decodeURIComponent(name) : zoneId);
  }
  return names;
}

async function main() {
  const { file, dryRun, once } = readArgs(process.argv.slice(2));
  let config: BridgeConfig;
  try {
    config = parseConfig(JSON.parse(readFileSync(file, "utf8")), process.env);
  } catch (e) {
    fail(`The config ${file} is not right:\n${(e as Error).message}`);
  }
  const probe = spawnSync("ffmpeg", ["-version"]);
  if (probe.error) fail("ffmpeg was not found. Install it (macOS: brew install ffmpeg; Debian/Ubuntu: apt install ffmpeg) and make sure it is on PATH.");

  const names = await checkStand(config);
  for (const cam of config.cameras) {
    for (const s of cam.shelves) log(`${cam.name}: watching ${s.zoneId ? names.get(s.zoneId) : "the whole store (no shelf)"}`);
  }
  if (dryRun) {
    mkdirSync(dryRun, { recursive: true });
    log(`Dry run: nothing is sent; stills are saved in ${path.resolve(dryRun)}`);
  }

  const children = new Set<ChildProcess>();
  let stopping = false;
  const stop = (code = 0) => {
    stopping = true;
    for (const c of children) c.kill("SIGTERM");
    process.exitCode = code;
  };
  process.on("SIGINT", () => stop(0));
  process.on("SIGTERM", () => stop(0));

  let reads = 0;
  let running = config.cameras.length;

  const runCamera = (cam: CameraConfig) => {
    const label = (i: number) => {
      const z = cam.shelves[i].zoneId;
      return `${cam.name} / ${z ? (names.get(z) ?? z) : "store"}`;
    };
    const pipes = cam.shelves.flatMap(() => ["pipe", "pipe"] as const);
    const child = spawn("ffmpeg", ffmpegArgs(cam), { stdio: ["ignore", "ignore", "pipe", ...pipes] });
    children.add(child);
    let errText = "";
    child.stderr!.on("data", (d: Buffer) => (errText = (errText + d.toString()).slice(-2000)));

    cam.shelves.forEach((shelf, i) => {
      const watcher = new ShelfWatcher();
      const grays: Uint8Array[] = [];
      const jpegs: Uint8Array[] = [];
      let pending = Buffer.alloc(0);
      const splitter = new JpegSplitter();
      // A change the server never received is carried forward, as the stand screen does.
      let unsent: BridgeChange | null = null;
      let queue = Promise.resolve();

      const send = (change: BridgeChange) => {
        queue = queue.then(async () => {
          const sending = unsent ? { ...change, before: unsent.before, changeStartedAt: unsent.changeStartedAt } : change;
          const size = jpegSize(sending.after);
          const dims = size ? `${size.width}x${size.height}` : "?";
          if (sending.before.length > MAX_STILL_BYTES || sending.after.length > MAX_STILL_BYTES) {
            log(`${label(i)}: still too large (${sending.after.length} bytes), not sent`);
            return;
          }
          if (dryRun) {
            const n = ++reads;
            const base = path.join(dryRun, `${cam.name}-${i}-${n}`.replace(/[^\w.-]+/g, "_"));
            writeFileSync(`${base}-before.jpg`, sending.before);
            writeFileSync(`${base}-after.jpg`, sending.after);
            log(`${label(i)}: change seen (dry run), stills ${dims}, ${sending.before.length}+${sending.after.length} bytes, saved ${base}-{before,after}.jpg`);
          } else {
            log(`${label(i)}: change seen, sending ${dims} stills (${sending.before.length}+${sending.after.length} bytes)`);
            let refusal: string | undefined;
            const sent = await sendWithRetry(
              async () => {
                const res = await fetch(`${config.server}/api/stand/change`, {
                  method: "POST",
                  headers: standHeaders(config.token, shelf.zoneId),
                  body: changeForm(sending),
                });
                refusal = res.ok ? undefined : (await readJson<{ error?: string }>(res.clone()))?.error;
                return res;
              },
              { onWaiting: (tries, ms) => log(`${label(i)}: try ${tries} failed${refusal ? ` (${refusal})` : ""}, trying again in ${ms / 1000}s`) },
            );
            if (!sent.ok) {
              if (sent.reason === "wrong_code") {
                console.error(refusal === "trial_ended" ? "This trial has ended. The bridge stops." : "The server refused the token. The bridge stops: check the stand code or key.");
                return stop(1);
              }
              unsent = sending;
              log(`${label(i)}: not sent${refusal ? ` (${refusal})` : ""}; it goes with the next change`);
              return;
            }
            unsent = null;
            reads++;
            log(`${label(i)}: ${answerLine(await readJson(sent.response))}`);
          }
          if (once) {
            log("First read done (--once): stopping.");
            stop(0);
          }
        });
      };

      const drain = () => {
        while (grays.length && jpegs.length && !stopping) {
          const change = watcher.push(grays.shift()!, jpegs.shift()!, Date.now());
          if (change) send(change);
        }
      };
      const p = pipesFor(i);
      (child.stdio[p.gray] as Readable).on("data", (d: Buffer) => {
        pending = Buffer.concat([pending, d]);
        while (pending.length >= FRAME_BYTES) {
          grays.push(new Uint8Array(pending.subarray(0, FRAME_BYTES)));
          pending = pending.subarray(FRAME_BYTES);
        }
        drain();
      });
      (child.stdio[p.jpeg] as Readable).on("data", (d: Buffer) => {
        jpegs.push(...splitter.push(d));
        drain();
      });
      child.on("close", () => void queue.then(() => done()));
    });

    let closed = false;
    const done = () => {
      if (closed) return;
      closed = true;
      children.delete(child);
      if (stopping) return;
      const isFile = !/^(rtsps?|https?):\/\//i.test(cam.source) && !cam.source.startsWith("avfoundation:") && !cam.source.startsWith("/dev/video");
      if (isFile && !cam.loop) {
        log(`${cam.name}: the video ended${errText.trim() ? `: ${errText.trim()}` : ""}`);
        if (--running === 0) stop(0);
        return;
      }
      log(`${cam.name}: the camera stopped${errText.trim() ? ` (${errText.trim().split("\n").pop()})` : ""}; starting again in ${RESTART_MS / 1000}s`);
      setTimeout(() => !stopping && runCamera(cam), RESTART_MS);
    };
  };

  config.cameras.forEach(runCamera);
}

void main();
