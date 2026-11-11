"use client";

import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Spinner } from "@astryxdesign/core/Spinner";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useAnnounce } from "@astryxdesign/core/hooks";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { checkRefund, focusAfterRemoval, readJson } from "@/lib/client-retry";
import { formatCents } from "@/lib/money";
import type { VisitRow } from "@/lib/owner";
import { MAX_STOCK } from "@/lib/products";
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

/**
 * A visit's status as a small dot and its name. A visit whose customer paid for different lines
 * than the camera saw also says "Adjusted" when its status does not, as with one paid late.
 */
export function StatusBadge({ status, adjusted = false }: { status: string; adjusted?: boolean }) {
  const badge = (
    <span className="ow-status" data-tone={STATUS_TONE[status] ?? "settled"}>
      <i aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
  // "Paid (adjusted)" already says so in its own name.
  if (!adjusted || status === "paid_adjusted") return badge;
  return (
    <span className="ow-status-set">
      {badge}
      <span className="ow-adjusted">Adjusted</span>
    </span>
  );
}

/** The badge for a visit row, with the "Adjusted" mark when it applies. */
export function VisitStatus({ visit }: { visit: VisitRow }) {
  return <StatusBadge status={visit.status} adjusted={visit.adjusted === true} />;
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
  disabled = false,
  tone = "plain",
  mark,
  describedBy,
  onClick,
}: {
  children: ReactNode;
  busy?: boolean;
  /** Switched off for a reason said elsewhere (see `describedBy`). */
  disabled?: boolean;
  tone?: "plain" | "strong";
  /** A name other code can find this button by. */
  mark?: string;
  describedBy?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="ow-rowbtn ds-press"
      data-tone={tone}
      data-mark={mark}
      data-off={disabled || undefined}
      aria-busy={busy || undefined}
      aria-describedby={describedBy}
      disabled={busy || disabled}
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

/* ---------- Keeping keyboard focus when a row changes or leaves ---------- */

const onScreen = (el: HTMLElement) => el.offsetParent !== null;

type ListSnapshot = { root: HTMLElement; ids: string[] } | null;

/**
 * Notes the list an element sits in (the nearest `data-focus-list`) and the order of its rows
 * (`data-visit-row`), so focus can be placed sensibly after the list has changed.
 */
function snapshotList(from: Element | null): ListSnapshot {
  const root = from?.closest<HTMLElement>("[data-focus-list]");
  if (!root) return null;
  const ids: string[] = [];
  for (const row of root.querySelectorAll<HTMLElement>("[data-visit-row]")) {
    const id = row.dataset.visitRow!;
    if (onScreen(row) && !ids.includes(id)) ids.push(id);
  }
  return { root, ids };
}

function focusRow(root: HTMLElement, id: string): boolean {
  const row = [...root.querySelectorAll<HTMLElement>(`[data-visit-row="${CSS.escape(id)}"]`)].find(onScreen);
  const target =
    row?.querySelector<HTMLElement>("[data-visit-action] button:not(:disabled)") ??
    row?.querySelector<HTMLElement>("a[href^='/owner/visits/']") ??
    row?.querySelector<HTMLElement>("[data-focus-heading]");
  target?.focus();
  return Boolean(target);
}

/**
 * After an action on a visit: focus stays with that visit if it is still listed, else moves to
 * the row that took its place, else to the list's heading.
 */
function refocus(snapshot: ListSnapshot, id: string) {
  if (!snapshot || !snapshot.root.isConnected) return;
  const { root, ids } = snapshot;
  if (focusRow(root, id)) return;
  const next = focusAfterRemoval(ids, id);
  if (next && focusRow(root, next)) return;
  root.querySelector<HTMLElement>("[data-focus-heading]")?.focus();
}

/** Long enough for the list to have redrawn after the figures were reloaded. */
const AFTER_REDRAW_MS = 80;

/* ---------- Settled another way: ask once more, in place ---------- */

/** The question stays this long, then the button goes back to how it was. */
const CONFIRM_MS = 5000;
/** A second tap sooner than this after the first is taken as the same tap. */
const DOUBLE_TAP_MS = 300;

function SettleButton({ visit }: { visit: VisitRow }) {
  const { act, busy } = useOwner();
  const announce = useAnnounce();
  const [asking, setAsking] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const askedAt = useRef(0);
  const focusWanted = useRef<"confirm" | "settle" | null>(null);

  useEffect(() => {
    if (!asking) return;
    const timer = setTimeout(() => {
      // Only take focus back to the first button if it was on the question.
      if (wrap.current?.contains(document.activeElement)) focusWanted.current = "settle";
      setAsking(false);
    }, CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [asking]);

  useLayoutEffect(() => {
    const want = focusWanted.current;
    focusWanted.current = null;
    if (want) wrap.current?.querySelector<HTMLElement>(`[data-mark="${want}"]`)?.focus();
  }, [asking]);

  function cancel() {
    focusWanted.current = "settle";
    setAsking(false);
  }

  async function confirm() {
    if (performance.now() - askedAt.current < DOUBLE_TAP_MS) return;
    const snapshot = snapshotList(wrap.current);
    setAsking(false);
    await act(visit.id, { action: "settle" });
    setTimeout(() => refocus(snapshot, visit.id), AFTER_REDRAW_MS);
  }

  return (
    <span
      ref={wrap}
      className="ow-confirm"
      data-visit-action
      data-asking={asking || undefined}
      role="group"
      aria-label="Settled another way"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !asking) return;
        e.stopPropagation();
        cancel();
      }}
    >
      {asking ? (
        <>
          <RowButton mark="cancel" onClick={cancel}>
            Cancel
          </RowButton>
          <RowButton mark="confirm" tone="strong" onClick={() => void confirm()}>
            Confirm settled
          </RowButton>
        </>
      ) : (
        <RowButton
          mark="settle"
          busy={busy === visit.id}
          onClick={() => {
            askedAt.current = performance.now();
            focusWanted.current = "confirm";
            setAsking(true);
            announce("Mark this visit as settled another way? Confirm settled, or cancel.");
          }}
        >
          Settled another way
        </RowButton>
      )}
    </span>
  );
}

/** The action a visit offers, if any: settle an unmatched one, or refund a paid one. */
export function VisitAction({ visit, onRefund }: { visit: VisitRow; onRefund: (visit: VisitRow) => void }) {
  const { busy } = useOwner();
  if (canSettle(visit)) return <SettleButton visit={visit} />;
  if (canRefund(visit)) {
    return (
      <span data-visit-action onClick={(e) => e.stopPropagation()}>
        <RowButton busy={busy === visit.id} onClick={() => onRefund(visit)}>
          Refund
        </RowButton>
      </span>
    );
  }
  return null;
}

type RefundDraft = { id: string; amount: string; error: string | null };

/** The refund dialog and the state that opens it. Render `dialog` once and call `open` from a row. */
export function useRefund() {
  const { data, act } = useOwner();
  const [draft, setDraft] = useState<RefundDraft | null>(null);
  const visit = draft ? data.visits.find((v) => v.id === draft.id) : undefined;
  // What had focus when the dialog opened, and the list it sits in.
  const opener = useRef<{ el: HTMLElement | null; list: ListSnapshot }>({ el: null, list: null });

  /** Closes without sending and hands focus back to the button that opened the dialog. */
  function close() {
    setDraft(null);
    const { el } = opener.current;
    setTimeout(() => el?.isConnected && el.focus(), AFTER_REDRAW_MS);
  }

  function send() {
    if (!draft) return;
    const left = visit ? refundable(visit) : 0;
    const checked = checkRefund(draft.amount, left);
    if (!checked.ok) {
      return setDraft({
        ...draft,
        error:
          checked.reason === "too_much"
            ? `That is more than the $${formatCents(left)} left of this payment.`
            : "Enter an amount, like 4.50.",
      });
    }
    const { id } = draft;
    const { list } = opener.current;
    setDraft(null);
    void act(id, { action: "refund", cents: checked.cents }).then(() =>
      setTimeout(() => refocus(list, id), AFTER_REDRAW_MS),
    );
  }

  const dialog = (
    <Dialog isOpen={draft !== null} onOpenChange={(open) => !open && close()} purpose="form" width={420}>
      <DialogHeader
        title="Send a refund"
        subtitle={visit ? `${when(visit.openedAt)} · ${takenText(visit)}` : undefined}
        onOpenChange={close}
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
            onChange={(amount) => draft && setDraft({ ...draft, amount, error: null })}
            statusVariant="detached"
            status={draft?.error ? { type: "error", message: draft.error } : undefined}
          />
          <HStack gap={2} hAlign="end">
            <Button label="Cancel" variant="ghost" onClick={close} />
            <Button type="submit" variant="primary" label="Send refund" />
          </HStack>
        </VStack>
      </form>
    </Dialog>
  );

  const open = (v: VisitRow) => {
    const el = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    opener.current = { el, list: snapshotList(el) };
    setDraft({ id: v.id, amount: formatCents(refundable(v)), error: null });
  };

  return { dialog, open };
}

/* ---------- Restock: say how many are on the shelf now ---------- */

export const DEMO_FIXED = "The demo stand's products are fixed. Sign in to your own stand to edit.";

const RESTOCK_PROBLEMS: Record<string, string> = {
  demo_read_only: DEMO_FIXED,
  not_found: "That product is no longer on this stand.",
  bad_request: "Enter a whole number, 0 or more.",
};

type RestockDraft = { sku: string; name: string; count: string; error: string | null; sending: boolean };

/** The restock dialog and the state that opens it. Render `dialog` once and call `open` from a row. */
export function useRestock() {
  const { refresh } = useOwner();
  const announce = useAnnounce();
  const [draft, setDraft] = useState<RestockDraft | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  function close() {
    setDraft(null);
    const el = opener.current;
    setTimeout(() => el?.isConnected && el.focus(), AFTER_REDRAW_MS);
  }

  async function send() {
    if (!draft || draft.sending) return;
    const text = draft.count.trim();
    if (!/^\d{1,4}$/.test(text)) return setDraft({ ...draft, error: "Enter a whole number, 0 or more." });
    const left = Number(text);
    if (left > MAX_STOCK) return setDraft({ ...draft, error: `The most a shelf can hold here is ${MAX_STOCK}.` });

    setDraft({ ...draft, error: null, sending: true });
    const res = await fetch(`/api/owner/products/${encodeURIComponent(draft.sku)}/restock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ left }),
    }).catch(() => null);
    if (res?.status === 401) {
      // The sign-in ran out: leave through a full page load, as the rest of the owner area does.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      return window.location.assign("/owner/login");
    }
    if (!res?.ok) {
      const code = res ? (await readJson<{ error?: string }>(res))?.error : undefined;
      const error = !res
        ? "The stand couldn't be reached. Check the connection and try again."
        : ((code && RESTOCK_PROBLEMS[code]) ?? (res.status === 403 ? DEMO_FIXED : "That didn't work. Nothing was changed."));
      announce(error, "assertive");
      return setDraft({ ...draft, error, sending: false });
    }
    announce(`${draft.name}: ${left} on the shelf now.`);
    refresh();
    close();
  }

  const dialog = (
    <Dialog isOpen={draft !== null} onOpenChange={(open) => !open && close()} purpose="form" width={400}>
      <DialogHeader title="Restock" subtitle={draft?.name} onOpenChange={close} />
      <form
        className="ow-dialog-body"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <VStack gap={5}>
          <TextInput
            label="How many are on the shelf now?"
            description="Count what is there after you have topped it up."
            inputMode="numeric"
            size="lg"
            width="100%"
            hasAutoFocus
            autoComplete="off"
            value={draft?.count ?? ""}
            onChange={(count) => draft && setDraft({ ...draft, count, error: null })}
            statusVariant="detached"
            status={draft?.error ? { type: "error", message: draft.error } : undefined}
          />
          <HStack gap={2} hAlign="end">
            <Button label="Cancel" variant="ghost" onClick={close} />
            <Button type="submit" variant="primary" label="Save count" isLoading={draft?.sending} />
          </HStack>
        </VStack>
      </form>
    </Dialog>
  );

  const open = (product: { sku: string; name: string }) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDraft({ sku: product.sku, name: product.name, count: "", error: null, sending: false });
  };

  return { dialog, open };
}
