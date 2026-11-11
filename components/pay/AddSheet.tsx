"use client";

import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { easeOut, spring } from "@/lib/motion";
import { formatCents } from "@/lib/money";
type Product = { sku: string; name: string; priceCents: number };
import { CheckGlyph, CloseGlyph, PlusGlyph } from "./glyphs";

type ListProps = {
  products: Product[];
  /** The item whose add is on its way to the server, if any. */
  pendingSku: string | null;
  busy: boolean;
  /** Items that are on the bill now but stay listed, ticked, until the list is closed. */
  added?: ReadonlySet<string>;
  onAdd: (sku: string) => void;
};

/** Catalogue items that are not on the bill yet. Tapping one asks the server to add it. */
export function AddList({ products, pendingSku, busy, added, onAdd }: ListProps) {
  return (
    <ul className="payx-addlist">
      <AnimatePresence initial={false} mode="popLayout">
        {products.map((p) => {
          const done = added?.has(p.sku) ?? false;
          const pending = pendingSku === p.sku && !done;
          const price = `$${formatCents(p.priceCents)}`;
          return (
            <motion.li
              key={p.sku}
              layout="position"
              exit={{ opacity: 0, scale: 0.98 }}
              transition={spring}
              className="payx-addrow"
            >
              <button
                type="button"
                className="payx-additem ds-press"
                aria-label={done ? `${p.name} (${price}) added to the bill` : `Add ${p.name} (${price})`}
                aria-disabled={busy || done || undefined}
                data-pending={pending || undefined}
                data-added={done || undefined}
                onClick={() => {
                  if (!busy && !done) onAdd(p.sku);
                }}
              >
                <span className="payx-additem-name">{p.name}</span>
                <span className="num payx-additem-price">{price}</span>
                <span className="payx-additem-mark">
                  <PlusGlyph className="payx-additem-plus" />
                  <CheckGlyph className="payx-additem-check" />
                </span>
              </button>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

type SheetProps = Omit<ListProps, "added"> & {
  open: boolean;
  onClose: () => void;
  /** Skus on the bill right now. */
  onBill: ReadonlySet<string>;
};

/** The add list as a bottom sheet over the bill. */
export function AddSheet({ open, ...rest }: SheetProps) {
  return <AnimatePresence>{open && <SheetDialog key="add-sheet" {...rest} />}</AnimatePresence>;
}

function SheetDialog({ onClose, products, onBill, ...list }: Omit<SheetProps, "open">) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  // The rows offered when the sheet opened. An added row stays where it is and shows a tick,
  // so the list never shifts under the thumb.
  const [offered] = useState(() => products.filter((p) => !onBill.has(p.sku)).map((p) => p.sku));
  const rows = products.filter((p) => offered.includes(p.sku));
  const drag = useDragControls();

  // A modal <dialog> keeps focus inside, makes the page behind inert and handles Escape.
  useLayoutEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // The browser can close a dialog on its own (a second Escape); follow it. A close event left
    // over from an earlier mount arrives while the dialog is open again, and is ignored.
    const closed = () => {
      if (!dialog.open) onClose();
    };
    dialog.addEventListener("close", closed);
    return () => {
      dialog.removeEventListener("close", closed);
      if (dialog.open) dialog.close();
      opener?.focus();
    };
  }, [onClose]);

  return (
    <motion.dialog
      ref={ref}
      className="payx-sheetdlg"
      aria-labelledby={titleId}
      initial="closed"
      animate="open"
      exit="closed"
      onCancel={(e) => {
        // Keep it open long enough to animate out along the path it came in on.
        e.preventDefault();
        onClose();
      }}
    >
      <motion.div
        className="payx-scrim"
        variants={{ closed: { opacity: 0 }, open: { opacity: 1 } }}
        transition={{ duration: 0.24, ease: easeOut }}
        onClick={onClose}
      />
      <motion.div
        className="payx-sheet"
        variants={
          reduce
            ? { closed: { opacity: 0 }, open: { opacity: 1 } }
            : { closed: { y: "100%" }, open: { y: "0%" } }
        }
        transition={spring}
        drag={reduce ? false : "y"}
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.9 }}
        onDragEnd={(_, info) => {
          // A short flick is enough; so is a long slow pull.
          if (info.velocity.y > 500 || info.offset.y > 110) onClose();
        }}
      >
        <div className="payx-sheet-head" onPointerDown={(e) => drag.start(e)}>
          <span className="payx-sheet-grip" aria-hidden="true" />
          <h2 id={titleId} className="payx-sheet-title">
            Add what you took
          </h2>
          <button
            type="button"
            className="payx-sheet-close ds-press"
            aria-label="Close the list"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
          >
            <CloseGlyph />
          </button>
        </div>
        <div className="payx-sheet-body">
          <AddList products={rows} added={onBill} {...list} />
          <p className="payx-small">Tap an item to add one. You can change how many on the bill.</p>
        </div>
      </motion.div>
    </motion.dialog>
  );
}
