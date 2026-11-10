"use client";

import { useEffect, useRef, useState } from "react";
import {
  DIFFERS_BLOCKS,
  MOVING_BLOCKS,
  SAMPLE_HEIGHT,
  SAMPLE_WIDTH,
  compareGrids,
  cropBox,
  initialDetector,
  stepDetector,
  toGray,
  toGrid,
} from "@/lib/frame-diff";
import { initialPresence, stepPresence } from "@/lib/presence";
import { loadPeopleDetector, type PeopleDetector, type Sighting } from "./people-detector";

export type ShelfChange = {
  before: Blob;
  after: Blob;
  /** Close-ups of the area that changed, cut from the sharpest frames the camera gives. */
  zoom?: { before: Blob; after: Blob };
  changeStartedAt: number;
  settledAt: number;
};

const SHARP_WIDTH = 1920; // frames are kept at up to this width, for close-ups
const STILL_WIDTH = 1024; // the whole-shelf photos that are sent
const ZOOM_WIDTH = 1024; // close-ups are sent no wider than this
const SAMPLE_EVERY_MS = 200;
const LOOK_EVERY_TICKS = 2; // hands and people are looked for on every second sample
const REFRESH_IDLE_MS = 8000; // a still, unchanged shelf is re-photographed this often, so slow light changes never add up

export type CameraPhase = "starting" | "watching" | "moving";

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Watches the shelf through the camera. When something changes and the shelf goes still,
 * calls onChange with a photo from before and after, plus close-ups of the changed area.
 * Frames are compared on this device; only the photos for a change ever leave it.
 */
export function StandCamera({
  onChange,
  onPhase,
  onStats,
  readNow = 0,
  onShot,
  onSighting,
  onVisitorLeft,
}: {
  onChange: (change: ShelfChange) => void;
  /** Tells the page whether the shelf is still or something is moving, so it can say so. */
  onPhase?: (phase: CameraPhase) => void;
  /** About once a second: how many small areas of the picture are moving, and how many differ from the last read. */
  onStats?: (stats: { moving: number; differs: number }) => void;
  /** Increase this number to read the shelf right now, whatever the detector thinks. */
  readNow?: number;
  /** Extra cameras: called with a still of the shelf whenever it has settled, and every few seconds while idle. */
  onShot?: (photo: Blob, takenAt: number) => void;
  /** Whether a hand or a person is in view, worked out on this device. Null while the detector is unavailable. */
  onSighting?: (sighting: (Sighting & { present: boolean }) | null) => void;
  /** Called once each time someone who was at the stand has gone. */
  onVisitorLeft?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onChangeRef = useRef(onChange);
  const onPhaseRef = useRef(onPhase);
  const onStatsRef = useRef(onStats);
  const onShotRef = useRef(onShot);
  const onSightingRef = useRef(onSighting);
  const onVisitorLeftRef = useRef(onVisitorLeft);
  const forceRef = useRef(false);
  const lastReadNow = useRef(readNow);
  const [problem, setProblem] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    onChangeRef.current = onChange;
    onPhaseRef.current = onPhase;
    onStatsRef.current = onStats;
    onShotRef.current = onShot;
    onSightingRef.current = onSighting;
    onVisitorLeftRef.current = onVisitorLeft;
  }, [onChange, onPhase, onStats, onShot, onSighting, onVisitorLeft]);

  useEffect(() => {
    if (readNow !== lastReadNow.current) {
      lastReadNow.current = readNow;
      forceRef.current = true;
    }
  }, [readNow]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let people: PeopleDetector | null = null;

    const small = document.createElement("canvas");
    small.width = SAMPLE_WIDTH;
    small.height = SAMPLE_HEIGHT;
    const smallCtx = small.getContext("2d", { willReadFrequently: true })!;
    // The shelf as it was last read, and as it is now, at full sharpness.
    let baseline = document.createElement("canvas");
    let latest = document.createElement("canvas");
    const out = document.createElement("canvas");

    const grabGrid = () => {
      smallCtx.drawImage(videoRef.current!, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      return toGrid(toGray(smallCtx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data));
    };
    const snapshot = (into: HTMLCanvasElement) => {
      const video = videoRef.current!;
      const scale = Math.min(1, SHARP_WIDTH / video.videoWidth);
      into.width = Math.round(video.videoWidth * scale);
      into.height = Math.round(video.videoHeight * scale);
      into.getContext("2d")!.drawImage(video, 0, 0, into.width, into.height);
    };
    /** A JPEG of all or part of a snapshot, no wider than maxWidth. */
    const jpeg = (from: HTMLCanvasElement, rect: Rect | null, maxWidth: number, quality: number) =>
      new Promise<Blob>((resolve, reject) => {
        const r = rect ?? { x: 0, y: 0, w: from.width, h: from.height };
        const scale = Math.min(1, maxWidth / r.w);
        out.width = Math.round(r.w * scale);
        out.height = Math.round(r.h * scale);
        out.getContext("2d")!.drawImage(from, r.x, r.y, r.w, r.h, 0, 0, out.width, out.height);
        out.toBlob((b) => (b ? resolve(b) : reject(new Error("no photo"))), "image/jpeg", quality);
      });

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem("This browser can't use the camera here. Open the stand page over https.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch {
        setProblem("The camera is blocked. Allow camera access for this page in your browser settings, then reload.");
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      // Let exposure settle before taking the first baseline.
      await new Promise((r) => setTimeout(r, 1200));
      if (stopped) return;

      let baselineGrid = grabGrid();
      snapshot(baseline);
      let prev = baselineGrid;
      let detector = initialDetector();
      let phase: CameraPhase = "watching";
      let ticks = 0;
      let idleSince = Date.now();
      let presence = initialPresence();
      let sighting: Sighting = { hand: false, person: false };
      let lastPresent: string | null = null;
      // Loads in the background; the stand watches the shelf meanwhile.
      void loadPeopleDetector().then((d) => {
        if (stopped) d?.close();
        else people = d;
        if (!d) onSightingRef.current?.(null);
      });
      const sendShot = async (from: HTMLCanvasElement, at: number) => {
        if (onShotRef.current) onShotRef.current(await jpeg(from, null, STILL_WIDTH, 0.8), at);
      };
      await sendShot(baseline, Date.now());
      onPhaseRef.current?.(phase);

      const tick = async () => {
        if (stopped) return;
        try {
          if (video.readyState < 2) return;
          const grid = grabGrid();
          const now = Date.now();
          const vsPrev = compareGrids(prev, grid);
          const vsBaseline = compareGrids(baselineGrid, grid);
          prev = grid;
          if (++ticks % 5 === 0) onStatsRef.current?.({ moving: vsPrev.changed, differs: vsBaseline.changed });

          if (people && ticks % LOOK_EVERY_TICKS === 0) {
            try {
              sighting = people.look(video, performance.now());
            } catch {
              sighting = { hand: false, person: false };
            }
            const stepped = stepPresence(presence, { seen: sighting.hand || sighting.person, t: now });
            presence = stepped.state;
            if (stepped.left) onVisitorLeftRef.current?.();
            const summary = `${sighting.hand}${sighting.person}${presence.present}`;
            if (summary !== lastPresent) {
              lastPresent = summary;
              onSightingRef.current?.({ ...sighting, present: presence.present });
            }
          }

          // A hand in the picture means someone is still choosing, however still it is.
          const moving = vsPrev.changed >= MOVING_BLOCKS || sighting.hand;
          const differs = vsBaseline.changed >= DIFFERS_BLOCKS;
          const result = stepDetector(detector, { moving, differs, t: now });
          detector = result.state;
          let fire = result.fire;
          if (forceRef.current) {
            forceRef.current = false;
            detector = initialDetector();
            fire = { changeStartedAt: now, settledAt: now };
          }

          const next: CameraPhase = detector.changeStartedAt === null ? "watching" : "moving";
          if (next !== phase) {
            phase = next;
            onPhaseRef.current?.(phase);
          }

          if (!fire) {
            // Keep the baseline fresh while nothing is happening.
            if (moving || differs || detector.changeStartedAt !== null) idleSince = now;
            else if (now - idleSince >= REFRESH_IDLE_MS) {
              idleSince = now;
              baselineGrid = grid;
              snapshot(baseline);
              await sendShot(baseline, now);
            }
            return;
          }

          snapshot(latest);
          const rect = vsBaseline.box ? cropBox(vsBaseline.box, latest.width, latest.height) : null;
          // A close-up only helps when it is a real enlargement of part of the picture.
          const useful = rect !== null && rect.w < latest.width * 0.8 && baseline.width === latest.width;
          await sendShot(latest, now);
          const before = await jpeg(baseline, null, STILL_WIDTH, 0.8);
          const after = await jpeg(latest, null, STILL_WIDTH, 0.8);
          const zoom = useful
            ? { before: await jpeg(baseline, rect, ZOOM_WIDTH, 0.85), after: await jpeg(latest, rect, ZOOM_WIDTH, 0.85) }
            : undefined;

          // What was just read becomes the new "before".
          [baseline, latest] = [latest, baseline];
          baselineGrid = grid;
          detector = initialDetector();
          idleSince = now;
          onChangeRef.current({ before, after, zoom, ...fire });
        } catch (e) {
          console.error("stand camera", e);
        } finally {
          if (!stopped) timer = setTimeout(tick, SAMPLE_EVERY_MS);
        }
      };
      timer = setTimeout(tick, SAMPLE_EVERY_MS);
    }

    void start();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      people?.close();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (problem) {
    return (
      <p role="alert" className="stand-problem">
        {problem}
      </p>
    );
  }

  return (
    <div className="stand-preview" data-hidden={!showPreview}>
      <video ref={videoRef} playsInline muted aria-label="Camera view of the shelf" />
      <button type="button" onClick={() => setShowPreview((v) => !v)}>
        {showPreview ? "Hide camera view" : "Show camera view"}
      </button>
    </div>
  );
}
