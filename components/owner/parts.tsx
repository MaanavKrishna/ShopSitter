"use client";

import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { type ReactNode, useState } from "react";
import { formatCents } from "@/lib/money";
import type { VisitRow } from "@/lib/owner";
import { statusLabel } from "@/lib/studio-report";
import { useOwner } from "./OwnerProvider";

export const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

export const whenLong = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export const takenText = (v: VisitRow) =>
  v.detectedBill.lines.map((l) => `${l.qty} × ${l.name}`).join(", ") || "Entered by hand";

export const refundable = (v: VisitRow) => (v.paidCents ?? 0) - v.refundedCents;

export const canRefund = (v: VisitRow) => v.status.startsWith("paid") && Boolean(v.captureId) && refundable(v) > 0;

/** "Paid another way" can be recorded for a visit that ended without a payment. */
export const canSettle = (v: VisitRow) => v.status === "unmatched";

export const paidText = (v: VisitRow) => (v.paidCents === null ? "—" : `$${formatCents(v.paidCents)}`);

/** Stored shelf photos are private and served to the owner; demo samples are public files. */
export function photoHref(url: string | null): string {
  if (!url) return "#";
  return url.startsWith("/") ? url : `/api/owner/photos/${encodeURIComponent(url)}`;
}

// Paid reads as cobalt; only the visits worth a second look get a warmer colour.
const STATUS_TONE: Record<string, string> = {
  paid: "paid",
  paid_late: "paid",
  paid_adjusted: "adjusted",
  unmatched: "unmatched",
  open: "open",
  settled_other: "settled",
};

/** A visit's status as a small dot and its name. */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="ow-status" data-tone={STATUS_TONE[status] ?? "settled"}>
      <i aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

/** Links to the shelf photos taken before and after a visit, when it has them. */
export function PhotoLinks({ visit }: { visit: VisitRow }) {
  if (!visit.afterUrl) return null;
  return (
    <span className="ow-photos" onClick={(e) => e.stopPropagation()}>
      <a href={photoHref(visit.beforeUrl)} target="_blank" rel="noreferrer">
        Before
      </a>
      <a href={photoHref(visit.afterUrl)} target="_blank" rel="noreferrer">
        After
      </a>
    </span>
  );
}

/** A small button for a list row or panel head. Shows a spinner and blocks repeat presses while its action runs. */
export function RowButton({
  children,
  busy = false,
  tone = "plain",
  onClick,
}: {
  children: ReactNode;
  busy?: boolean;
  tone?: "plain" | "strong";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="ow-rowbtn ds-press"
      data-tone={tone}
      aria-busy={busy || undefined}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {busy && <Spinner size="sm" shade="inherit" aria-label="Working" />}
      {children}
    </button>
  );
}

/** The action a visit offers, if any: settle an unmatched one, or refund a paid one. */
export function VisitAction({ visit, onRefund }: { visit: VisitRow; onRefund: (visit: VisitRow) => void }) {
  const { act, busy } = useOwner();
  if (canSettle(visit)) {
    return (
      <RowButton busy={busy === visit.id} onClick={() => void act(visit.id, { action: "settle" })}>
        Settled another way
      </RowButton>
    );
  }
  if (canRefund(visit)) {
    return (
      <RowButton busy={busy === visit.id} onClick={() => onRefund(visit)}>
        Refund
      </RowButton>
    );
  }
  return null;
}

type RefundDraft = { id: string; amount: string; invalid: boolean };

/** The refund dialog and the state that opens it. Render `dialog` once and call `open` from a row. */
export function useRefund() {
  const { data, act } = useOwner();
  const [draft, setDraft] = useState<RefundDraft | null>(null);
  const visit = draft ? data.visits.find((v) => v.id === draft.id) : undefined;

  function send() {
    if (!draft) return;
    const cents = Math.round(Number(draft.amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setDraft({ ...draft, invalid: true });
    setDraft(null);
    void act(draft.id, { action: "refund", cents });
  }

  const dialog = (
    <Dialog isOpen={draft !== null} onOpenChange={(open) => !open && setDraft(null)} purpose="form" width={420}>
      <DialogHeader
        title="Send a refund"
        subtitle={visit ? `${when(visit.openedAt)} · ${takenText(visit)}` : undefined}
        onOpenChange={() => setDraft(null)}
      />
      <form
        className="ow-dialog-body"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <VStack gap={5}>
          <TextInput
            label="Refund amount in dollars"
            description={visit ? `Up to $${formatCents(refundable(visit))} can go back through PayPal.` : undefined}
            inputMode="decimal"
            size="lg"
            width="100%"
            hasAutoFocus
            value={draft?.amount ?? ""}
            onChange={(amount) => draft && setDraft({ ...draft, amount, invalid: false })}
            statusVariant="detached"
            status={draft?.invalid ? { type: "error", message: "Enter an amount, like 4.50." } : undefined}
          />
          <HStack gap={2} hAlign="end">
            <Button label="Cancel" variant="ghost" onClick={() => setDraft(null)} />
            <Button type="submit" variant="primary" label="Send refund" />
          </HStack>
        </VStack>
      </form>
    </Dialog>
  );

  const open = (v: VisitRow) => setDraft({ id: v.id, amount: formatCents(refundable(v)), invalid: false });

  return { dialog, open };
}
