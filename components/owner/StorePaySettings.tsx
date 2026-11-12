"use client";

import { Button } from "@astryxdesign/core/Button";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useAnnounce } from "@astryxdesign/core/hooks";
import { useState } from "react";
import { holdBasisText, type PayMode } from "@/lib/basket-view";
import { formatCents } from "@/lib/money";
import { centsFromDollars } from "@/lib/products";
import { ownerSignedOut } from "./OwnerProvider";
import { putSettings, type StoreData, storeProblem, type StoreSettings } from "./storeApi";

/** The most a hold may be, in cents. The server refuses more. */
const MAX_HOLD_CENTS = 50_000;

type Form = { payMode: PayMode; fixed: string; floor: string; cap: string };
type Errors = Partial<Record<"fixed" | "floor" | "cap", string>>;

const dollars = (cents: number) => formatCents(cents).replace(/\.00$/, "");

const formFor = (s: StoreSettings): Form => ({
  payMode: s.payMode,
  fixed: s.holdOverrideCents === null ? "" : dollars(s.holdOverrideCents),
  floor: dollars(s.holdFloorCents),
  cap: dollars(s.holdCapCents),
});

/** Reads the form into settings, or says which amounts need another look. Amounts are whole cents from $1 to $500. */
function check(form: Form): { ok: true; settings: StoreSettings } | { ok: false; errors: Errors } {
  const errors: Errors = {};
  const amount = (text: string, field: keyof Errors): number | null => {
    const cents = centsFromDollars(text);
    if (cents === null || cents < 100) errors[field] = "Enter an amount in dollars, 1 or more.";
    else if (cents > MAX_HOLD_CENTS) errors[field] = "The most a hold can be is $500.";
    return cents;
  };
  const floor = amount(form.floor, "floor");
  const cap = amount(form.cap, "cap");
  const fixed = form.fixed.trim() === "" ? null : amount(form.fixed, "fixed");
  if (!errors.floor && !errors.cap && floor !== null && cap !== null && floor > cap) {
    errors.cap = "The maximum can't be less than the minimum.";
  }
  if (Object.keys(errors).length > 0 || floor === null || cap === null) return { ok: false, errors };
  return { ok: true, settings: { payMode: form.payMode, holdOverrideCents: fixed, holdFloorCents: floor, holdCapCents: cap } };
}

/** How shoppers pay: after they shop, from a PayPal hold placed first, or whichever they pick. */
export function StorePaySettings({
  store,
  readOnly,
  onSaved,
}: {
  store: StoreData | null;
  readOnly: boolean;
  onSaved: (settings: StoreSettings, suggestedHoldCents: number) => void;
}) {
  const announce = useAnnounce();
  // The form follows what the server holds until the owner changes something.
  const [draft, setDraft] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!store) {
    return (
      <section className="ow-panel ow-payset" aria-busy="true" aria-label="How shoppers pay">
        <div className="ow-panel-head">
          <Skeleton width={150} height={20} />
        </div>
        <div className="ow-payset-body">
          <Skeleton height={132} />
          <Skeleton height={64} index={1} />
        </div>
      </section>
    );
  }

  const form = draft ?? formFor(store.settings);
  const dirty = draft !== null;
  const usesHold = form.payMode !== "after";
  const set = (patch: Partial<Form>) => {
    setDraft({ ...form, ...patch });
    setErrors({});
    setProblem(null);
    setSaved(false);
  };

  async function save() {
    if (saving) return;
    const checked = check(form);
    if (!checked.ok) {
      setErrors(checked.errors);
      announce("Some amounts need another look.", "assertive");
      return;
    }
    setSaving(true);
    setProblem(null);
    const answer = await putSettings(checked.settings);
    setSaving(false);
    if (!answer.ok) {
      if (answer.code === "unauthorized") return ownerSignedOut();
      const text = storeProblem(answer.code);
      setProblem(text);
      announce(text, "assertive");
      return;
    }
    onSaved(answer.data.settings, answer.data.suggestedHoldCents);
    setDraft(null);
    setSaved(true);
    announce("Pay settings saved.");
  }

  const fixedNow = store.settings.holdOverrideCents !== null;

  return (
    <section className="ow-panel ow-payset" aria-labelledby="payset-h">
      <div className="ow-panel-head">
        <h2 id="payset-h">How shoppers pay</h2>
        <p className="ow-panel-meta">For shoppers who scan the door QR</p>
      </div>
      <form
        className="ow-payset-body"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {problem && (
          <p className="ow-prod-notice" role="alert">
            {problem}
          </p>
        )}
        <RadioList
          label="How shoppers pay"
          isLabelHidden
          value={form.payMode}
          onChange={(value) => set({ payMode: value as PayMode })}
          isDisabled={readOnly}
          disabledMessage="The demo stand's pay settings are fixed."
          width="100%"
        >
          <RadioListItem value="after" label="Pay after" description="Shoppers take what they like, then pay the bill with PayPal." />
          <RadioListItem
            value="hold"
            label="Hold first"
            description="Shoppers approve a PayPal hold before the basket fills. They are charged only for what they take."
          />
          <RadioListItem value="choice" label="Shopper chooses" description="Each shopper picks one of the two when they come in." />
        </RadioList>

        <div className="ow-hold" data-off={!usesHold || undefined}>
          <p className="ow-hold-label">{fixedNow ? "Hold, fixed by you" : "Suggested hold"}</p>
          <p className="ow-hold-figure num">${formatCents(store.suggestedHoldCents)}</p>
          <p className="ow-hold-basis">
            {fixedNow
              ? "Your fixed amount is used in place of the suggestion."
              : holdBasisText(store.holdBasis.visits, store.holdBasis.days)}
          </p>
          {!usesHold && <p className="ow-hold-basis">Not used while shoppers pay after.</p>}
        </div>

        <div className="ow-payset-fields">
          <TextInput
            label="Fixed hold"
            description="Empty uses the suggestion."
            isOptional
            width="100%"
            inputMode="decimal"
            value={form.fixed}
            onChange={(fixed) => set({ fixed })}
            placeholder="25"
            autoComplete="off"
            isDisabled={readOnly}
            statusVariant="detached"
            status={errors.fixed ? { type: "error", message: errors.fixed } : undefined}
          />
          <TextInput
            label="Minimum"
            description="Never hold less."
            width="100%"
            inputMode="decimal"
            value={form.floor}
            onChange={(floor) => set({ floor })}
            autoComplete="off"
            isDisabled={readOnly}
            statusVariant="detached"
            status={errors.floor ? { type: "error", message: errors.floor } : undefined}
          />
          <TextInput
            label="Maximum"
            description="Never hold more."
            width="100%"
            inputMode="decimal"
            value={form.cap}
            onChange={(cap) => set({ cap })}
            autoComplete="off"
            isDisabled={readOnly}
            statusVariant="detached"
            status={errors.cap ? { type: "error", message: errors.cap } : undefined}
          />
        </div>

        <p className="ow-setup-note ow-payset-note">
          A hold sets money aside without taking it. When the shopper taps Done, or walks out, only the basket is
          charged and the rest is released. A basket above the hold pays the difference on a separate bill.
        </p>

        {!readOnly && (
          <div className="ow-payset-foot">
            <span role="status">{saved && !dirty ? "Saved" : ""}</span>
            <Button type="submit" variant="primary" label="Save" isLoading={saving} isDisabled={!dirty} />
          </div>
        )}
      </form>
    </section>
  );
}
