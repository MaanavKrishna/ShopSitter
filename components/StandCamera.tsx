"use client";

import { useEffect, useRef, useState } from "react";
import {
  SAMPLE_HEIGHT,
  SAMPLE_WIDTH,
  frameDistance,
  initialDetector,
  stepDetector,
  toGray,
} from "@/lib/frame-diff";

export type ShelfChange = { before: Blob; after: Blob; changeStartedAt: number; settledAt: number };

const STILL_WIDTH = 1280;
const SAMPLE_EVERY_MS = 250;

/**
 * Watches the shelf through the camera. When something changes and the shelf goes still,
 * calls onChange with a photo from before and after. Frames are compared on this device;
 * only the two stills for a change ever leave it.
 */
export function StandCamera({ onChange }: { onChange: (change: ShelfChange) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onChangeRef = useRef(onChange);
  const [problem, setProblem] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const small = document.createElement("canvas");
    small.width = SAMPLE_WIDTH;
    small.height = SAMPLE_HEIGHT;
    const smallCtx = small.getContext("2d", { willReadFrequently: true })!;
    const full = document.createElement("canvas");

    const grab = () => {
      smallCtx.drawImage(videoRef.current!, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      return toGray(smallCtx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data);
    };
    const still = () =>
      new Promise<Blob>((resolve, reject) => {
        const video = videoRef.current!;
        const scale = Math.min(1, STILL_WIDTH / video.videoWidth);
        full.width = Math.round(video.videoWidth * scale);
        full.height = Math.round(video.videoHeight * scale);
        full.getContext("2d")!.drawImage(video, 0, 0, full.width, full.height);
        full.toBlob((b) => (b ? resolve(b) : reject(new Error("no still"))), "image/jpeg", 0.82);
      });

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem("This browser can't use the camera here. Open the stand page over https.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
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
      await new Promise((r) => setTimeout(r, 1500));
      if (stopped) return;

      let baselineGray = grab();
      let baselineStill = await still();
      let prev = baselineGray;
      let detector = initialDetector();

      timer = setInterval(async () => {
        if (stopped || video.readyState < 2) return;
        const gray = grab();
        const result = stepDetector(detector, {
          vsPrev: frameDistance(gray, prev),
          vsBaseline: frameDistance(gray, baselineGray),
          t: Date.now(),
        });
        prev = gray;
        detector = result.state;
        if (!result.fire) return;

        const before = baselineStill;
        const after = await still();
        baselineGray = gray;
        baselineStill = after;
        onChangeRef.current({ before, after, ...result.fire });
      }, SAMPLE_EVERY_MS);
    }

    void start();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
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
