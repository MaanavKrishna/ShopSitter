"use client";

import { IconCamera, IconPhotoPlus } from "@tabler/icons-react";
import { useId, useRef, useState } from "react";
import { MAX_PHOTO_BYTES } from "@/lib/products";

/** What the form will do with the product's reference photo when it is saved. */
export type PhotoChoice =
  | { kind: "keep" }
  | { kind: "remove" }
  | { kind: "new"; blob: Blob; preview: string };

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
/** Longest side of the stored photo. Enough for the vision model, small enough to send quickly. */
const MAX_SIDE = 1600;

/** Redraws a picture as a JPEG no larger than MAX_SIDE, which is the format the shelf reader is sent. */
async function toJpeg(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // JPEG has no transparency: see-through parts become white, not black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  } catch {
    return null;
  }
}

/** Pick or drop a reference photo, see it, replace it or take it away. */
export function ProductPhotoField({
  current,
  choice,
  onChoice,
  disabled,
}: {
  /** Address of the photo the product has now, if any. */
  current: string | null;
  choice: PhotoChoice;
  onChoice: (choice: PhotoChoice) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = choice.kind === "new" ? choice.preview : choice.kind === "keep" ? current : null;

  async function take(file: File | undefined) {
    if (!file || disabled) return;
    setError(null);
    if (!ACCEPT.includes(file.type)) return setError("Use a JPEG, PNG or WebP picture.");
    setReading(true);
    const blob = await toJpeg(file);
    setReading(false);
    if (!blob) return setError("That file could not be read as a picture.");
    if (blob.size > MAX_PHOTO_BYTES) return setError("That picture is too large. Try one under 3 MB.");
    if (choice.kind === "new") URL.revokeObjectURL(choice.preview);
    onChoice({ kind: "new", blob, preview: URL.createObjectURL(blob) });
  }

  function remove() {
    if (choice.kind === "new") URL.revokeObjectURL(choice.preview);
    setError(null);
    onChoice(current ? { kind: "remove" } : { kind: "keep" });
  }

  return (
    <div className="ow-photo-field">
      <span className="ow-photo-label" id={`${id}-label`}>
        Reference photo <small>Optional</small>
      </span>
      <p className="ow-photo-hint" id={`${id}-hint`}>
        One clear picture of the product on its own. The camera compares the shelf against it.
      </p>
      <div
        className="ow-photo-drop"
        data-over={over || undefined}
        data-filled={shown ? true : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files[0]);
        }}
      >
        {shown ? (
          // A private or just-picked picture: there is nothing for the image optimiser to do.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="Reference photo for this product" />
        ) : (
          <span className="ow-photo-empty" aria-hidden="true">
            <IconPhotoPlus size={22} stroke={1.6} />
          </span>
        )}
        <div className="ow-photo-actions">
          <span className="ow-photo-text">
            {reading ? "Reading the picture…" : shown ? "Drop a new picture here to replace it." : "Drop a picture here, or"}
          </span>
          <span className="ow-photo-buttons">
            {/* Shown on touch devices only (see the stylesheet): elsewhere the browser would just open the file picker. */}
            <button
              type="button"
              className="ow-rowbtn ow-photo-take ds-press"
              data-tone="strong"
              disabled={disabled || reading}
              aria-describedby={`${id}-hint`}
              onClick={() => camera.current?.click()}
            >
              <IconCamera size={15} stroke={1.75} aria-hidden="true" />
              Take a photo
            </button>
            <button
              type="button"
              className="ow-rowbtn ds-press"
              disabled={disabled || reading}
              aria-describedby={`${id}-hint`}
              onClick={() => input.current?.click()}
            >
              {shown ? "Replace photo" : "Choose a photo"}
            </button>
            {shown && (
              <button type="button" className="ow-rowbtn ds-press" disabled={disabled || reading} onClick={remove}>
                Remove
              </button>
            )}
          </span>
        </div>
        <input
          ref={camera}
          type="file"
          accept={ACCEPT.join(",")}
          capture="environment"
          hidden
          aria-label="Take a reference photo with the camera"
          onChange={(e) => {
            void take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={input}
          type="file"
          accept={ACCEPT.join(",")}
          hidden
          aria-labelledby={`${id}-label`}
          onChange={(e) => {
            void take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p className="ow-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
