"use client";

import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useAnnounce } from "@astryxdesign/core/hooks";
import { IconArrowDown, IconArrowUp, IconArrowUpRight, IconCamera, IconCopy, IconPencil, IconPlus } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { shelfConfigText } from "@/bridge/core";
import { byAisle, cameraPath, moveZone } from "@/lib/basket-view";
import { formatCents } from "@/lib/money";
import { spring } from "@/lib/motion";
import { ownerSignedOut, useOwner } from "./OwnerProvider";
import { PageCode } from "./SetupView";
import { StorePaySettings } from "./StorePaySettings";
import {
  getDoorLink,
  getStore,
  putZones,
  rotateDoorLink,
  setProductZone,
  type StoreData,
  storeProblem,
  type Zone,
  type ZoneDraft,
  type ZoneFigures,
  zoneOf,
} from "./storeApi";

const MAX_NAME = 40;

type Editing = {
  /** Null for a shelf that is being added. */
  id: string | null;
  name: string;
  aisle: string;
  /** Skus ticked for this shelf. */
  skus: Set<string>;
  error: string | null;
  problem: string | null;
  /** The owner pressed "Remove shelf" and is being asked to confirm. */
  confirmRemove?: boolean;
};

const money = (cents: number) => `$${formatCents(cents)}`;

/** A copy button that says "Copied" for a moment. */
function CopyLink({ path, label = "Copy link", text }: { path: string | null; label?: string; text?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className="ow-rowbtn ds-press"
      disabled={!path}
      onClick={() => {
        if (!path) return;
        void navigator.clipboard
          .writeText(text ?? `${window.location.origin}${path}`)
          .then(() => setCopied(true))
          .catch(() => {});
      }}
    >
      <IconCopy size={14} stroke={1.75} aria-hidden="true" />
      {copied ? "Copied" : label}
    </button>
  );
}

/** The store as the owner lays it out: shelves by aisle with their cameras, the door code, and how shoppers pay. */
export function StoreView() {
  const { shop, kind, data, trialStand, refresh, reloadQuietly } = useOwner();
  const announce = useAnnounce();
  const readOnly = shop === "demo";
  const trial = kind === "trial";

  const [store, setStore] = useState<StoreData | null>(null);
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  const [doorLink, setDoorLink] = useState<string | null>(null);
  const [doorProblem, setDoorProblem] = useState<string | null>(null);
  /** "ask" while the owner confirms a new door QR, "busy" while it is being made. */
  const [doorRenew, setDoorRenew] = useState<"ask" | "busy" | null>(null);
  const [doorNote, setDoorNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [cameraFor, setCameraFor] = useState<Zone | null>(null);
  const [cameraKind, setCameraKind] = useState<"phone" | "cctv">("phone");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const answer = await getStore();
    if (answer.ok) {
      setStore(answer.data);
      setLoadProblem(null);
    } else if (answer.code === "unauthorized") ownerSignedOut();
    else setLoadProblem(storeProblem(answer.code));
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    if (readOnly) return;
    let live = true;
    void getDoorLink().then((answer) => {
      if (!live) return;
      if (answer.ok && answer.data.doorLink) setDoorLink(answer.data.doorLink);
      else if (!answer.ok && answer.code === "unauthorized") ownerSignedOut();
      else setDoorProblem("The door code couldn't be loaded. Refresh to try again.");
    });
    return () => {
      live = false;
    };
  }, [readOnly]);

  const zones = store?.zones ?? data.zones ?? [];
  const figures = new Map<string | null, ZoneFigures>((data.byZone ?? []).map((f) => [f.zoneId, f]));
  const products = data.products.filter((p) => !p.archived);
  const countFor = (zoneId: string) => products.filter((p) => zoneOf(p) === zoneId).length;
  const anywhere = products.filter((p) => zoneOf(p) === null).length;
  const groups = byAisle(zones);
  const standKey = trial ? (trialStand?.key ?? null) : null;
  // A trial's camera links need its key; until it has loaded there is no link to show.
  const linkReady = !trial || standKey !== null;

  const asDrafts = (list: Zone[]): ZoneDraft[] => list.map(({ id, name, aisle, order }) => ({ id, name, aisle, order }));

  /** Sends the whole list of shelves and shows what the server kept. */
  async function saveZones(next: ZoneDraft[]): Promise<Zone[] | null> {
    setSaving(true);
    setNotice(null);
    const answer = await putZones(next);
    setSaving(false);
    if (!answer.ok) {
      if (answer.code === "unauthorized") ownerSignedOut();
      return null;
    }
    setStore((was) => (was ? { ...was, zones: answer.data.zones } : was));
    return answer.data.zones;
  }

  async function move(zone: Zone, by: -1 | 1) {
    if (saving) return;
    const moved = moveZone(zones, zone.id, by);
    if (moved.every((z, i) => z.id === [...zones].sort((a, b) => a.order - b.order)[i]?.id)) return;
    const saved = await saveZones(asDrafts(moved));
    if (!saved) setNotice("The order couldn't be saved. Nothing was changed.");
    else void reloadQuietly();
  }

  function openEditor(zone: Zone | null) {
    setEditing({
      id: zone?.id ?? null,
      name: zone?.name ?? "",
      aisle: zone?.aisle ?? (zones[zones.length - 1]?.aisle ?? ""),
      skus: new Set(zone ? products.filter((p) => zoneOf(p) === zone.id).map((p) => p.sku) : []),
      error: null,
      problem: null,
    });
  }

  async function saveEditing() {
    if (!editing || saving) return;
    const name = editing.name.trim();
    if (!name) return setEditing({ ...editing, error: "Give the shelf a name." });
    if (zones.some((z) => z.id !== editing.id && z.name.trim().toLowerCase() === name.toLowerCase())) {
      return setEditing({ ...editing, error: "Another shelf already has that name." });
    }
    const aisle = editing.aisle.trim();
    const sorted = [...zones].sort((a, b) => a.order - b.order);
    const next: ZoneDraft[] = editing.id
      ? asDrafts(sorted).map((z) => (z.id === editing.id ? { ...z, name, aisle } : z))
      : [...asDrafts(sorted), { name, aisle, order: sorted.length }];
    const known = new Set(zones.map((z) => z.id));
    setSaving(true);
    const answer = await putZones(next.map((z, order) => ({ ...z, order })));
    if (!answer.ok) {
      setSaving(false);
      if (answer.code === "unauthorized") return ownerSignedOut();
      return setEditing({ ...editing, problem: storeProblem(answer.code) });
    }
    const saved = answer.data.zones;
    setStore((was) => (was ? { ...was, zones: saved } : was));
    const zoneId = editing.id ?? saved.find((z) => !known.has(z.id))?.id ?? null;

    // Products ticked here move to this shelf; ones unticked go back to "anywhere".
    let failed = 0;
    if (zoneId) {
      for (const product of products) {
        const here = zoneOf(product) === zoneId;
        const wanted = editing.skus.has(product.sku);
        if (here === wanted) continue;
        const moved = await setProductZone(product, wanted ? zoneId : null);
        if (!moved.ok) failed++;
      }
    }
    setSaving(false);
    refresh();
    if (failed > 0) {
      return setEditing({
        ...editing,
        id: zoneId,
        problem: `The shelf was saved, but ${failed} ${failed === 1 ? "product" : "products"} couldn't be moved. Try again.`,
      });
    }
    announce(editing.id ? `${name} saved.` : `${name} added.`);
    setEditing(null);
  }

  async function removeEditing() {
    if (!editing?.id || saving) return;
    const rest = [...zones].sort((a, b) => a.order - b.order).filter((z) => z.id !== editing.id);
    setSaving(true);
    const answer = await putZones(asDrafts(rest).map((z, order) => ({ ...z, order })));
    setSaving(false);
    if (!answer.ok) {
      if (answer.code === "unauthorized") return ownerSignedOut();
      return setEditing({ ...editing, confirmRemove: false, problem: storeProblem(answer.code) });
    }
    setStore((was) => (was ? { ...was, zones: answer.data.zones } : was));
    announce(`${editing.name} removed. Its products are kept anywhere.`);
    setEditing(null);
    refresh();
  }

  async function renewDoor() {
    setDoorRenew("busy");
    const answer = await rotateDoorLink();
    setDoorRenew(null);
    if (answer.ok) {
      setDoorLink(answer.data.doorLink);
      setDoorNote("New door QR made. Print it: the old one no longer works.");
      announce("New door QR made. The old one no longer works.");
    } else if (answer.code === "unauthorized") ownerSignedOut();
    else setDoorNote(storeProblem(answer.code));
  }

  const camera = cameraFor && linkReady ? cameraPath(cameraFor.id, standKey) : null;

  return (
    <div className="ow-store">
      {readOnly && (
        <p className="ow-prod-notice ow-prod-fixed">
          The demo stand&apos;s shelves and pay settings are fixed. Start a trial stand to change them.
        </p>
      )}
      {(notice || loadProblem) && (
        <p className="ow-prod-notice" role="alert">
          {notice ?? loadProblem}
        </p>
      )}

      <section className="ow-panel" aria-labelledby="map-h">
        <div className="ow-panel-head">
          <h2 id="map-h">Shelves</h2>
          <p className="ow-panel-meta">
            {zones.length === 0
              ? "One shelf, one camera"
              : `${zones.length} ${zones.length === 1 ? "shelf" : "shelves"} · ${anywhere} ${anywhere === 1 ? "product" : "products"} kept anywhere`}
          </p>
          {!readOnly && (
            <button type="button" className="ow-rowbtn ds-press ow-store-add" data-tone="strong" disabled={!store} onClick={() => openEditor(null)}>
              <IconPlus size={14} stroke={2} aria-hidden="true" />
              Add shelf
            </button>
          )}
        </div>

        {!store && !loadProblem ? (
          <div className="ow-store-map" aria-busy="true">
            <Skeleton height={148} />
            <Skeleton height={148} index={1} />
          </div>
        ) : zones.length === 0 ? (
          <div className="ow-empty ow-store-empty">
            <b>No shelves yet</b>
            <p>
              Without shelves the stand works as it always has: one camera reads everything. Add a shelf for each
              camera, give it its products, and each camera is shown only what is on its own shelf.
            </p>
          </div>
        ) : (
          <div className="ow-store-map">
            {groups.map((group) => (
              <div key={group.aisle || "none"} className="ow-aisle" role="group" aria-label={group.aisle || "No aisle"}>
                <p className="ow-aisle-name">{group.aisle || "No aisle"}</p>
                <ul>
                  <AnimatePresence initial={false}>
                    {group.zones.map((zone, i) => {
                      const f = figures.get(zone.id);
                      const count = countFor(zone.id);
                      return (
                        <motion.li
                          key={zone.id}
                          layout="position"
                          className="ow-zone"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={spring}
                        >
                          <div className="ow-zone-top">
                            <b>{zone.name}</b>
                            <span>
                              {count} {count === 1 ? "product" : "products"}
                            </span>
                          </div>
                          <dl className="ow-zone-figures">
                            <div>
                              <dt>Taken</dt>
                              <dd className="num">{money(f?.takenCents ?? 0)}</dd>
                            </div>
                            <div>
                              <dt>Paid</dt>
                              <dd className="num">{money(f?.paidCents ?? 0)}</dd>
                            </div>
                            <div data-look={(f?.unmatchedCents ?? 0) > 0 || undefined}>
                              <dt>Unmatched</dt>
                              <dd className="num">{money(f?.unmatchedCents ?? 0)}</dd>
                            </div>
                          </dl>
                          <div className="ow-zone-actions">
                            <button type="button" className="ow-rowbtn ds-press" onClick={() => setCameraFor(zone)}>
                              <IconCamera size={14} stroke={1.75} aria-hidden="true" />
                              Camera link
                            </button>
                            {!readOnly && (
                              <>
                                <button type="button" className="ow-rowbtn ds-press" onClick={() => openEditor(zone)}>
                                  <IconPencil size={14} stroke={1.75} aria-hidden="true" />
                                  Edit
                                </button>
                                <span className="ow-zone-move">
                                  <button
                                    type="button"
                                    className="ow-icon-btn ds-press"
                                    aria-label={`Move ${zone.name} up`}
                                    disabled={saving || i === 0}
                                    onClick={() => void move(zone, -1)}
                                  >
                                    <IconArrowUp size={16} stroke={1.75} aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    className="ow-icon-btn ds-press"
                                    aria-label={`Move ${zone.name} down`}
                                    disabled={saving || i === group.zones.length - 1}
                                    onClick={() => void move(zone, 1)}
                                  >
                                    <IconArrowDown size={16} stroke={1.75} aria-hidden="true" />
                                  </button>
                                </span>
                              </>
                            )}
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="ow-store-pair">
        <section className="ow-panel ow-door" aria-labelledby="door-h">
          <div className="ow-panel-head">
            <h2 id="door-h">Door QR</h2>
            <p className="ow-panel-meta">Shoppers scan it to start a basket</p>
          </div>
          <div className="ow-door-body">
            {doorLink ? <PageCode path={doorLink} label="QR code shoppers scan at the door" /> : <span className="ow-qr" aria-hidden="true" />}
            <div>
              {readOnly ? (
                <p>The demo stand has no door code. Start a trial stand to get one of your own.</p>
              ) : doorProblem ? (
                <p role="alert">{doorProblem}</p>
              ) : (
                <>
                  <p>
                    Print this and put it where shoppers come in. Scanning it opens a basket on their phone that fills as
                    the shelves are read.
                  </p>
                  <p className="ow-setup-note">
                    {trial ? "It works until this trial ends, or until you make a new one." : "It stays the same until you make a new one."}
                  </p>
                  {doorNote && (
                    <p className="ow-setup-note" role="status">
                      {doorNote}
                    </p>
                  )}
                  {doorRenew === "ask" || doorRenew === "busy" ? (
                    <div className="ow-zone-remove" role="alert">
                      <p>Make a new door QR? The printed code stops working, so shoppers need the new print.</p>
                      <span className="ow-prod-foot-end">
                        <button type="button" className="ow-rowbtn ds-press" disabled={doorRenew === "busy"} onClick={() => setDoorRenew(null)}>
                          Keep this code
                        </button>
                        <button type="button" className="ow-rowbtn ds-press" disabled={doorRenew === "busy"} onClick={() => void renewDoor()}>
                          {doorRenew === "busy" ? "Making a new code" : "Make a new code"}
                        </button>
                      </span>
                    </div>
                  ) : (
                    <div className="ow-go-actions">
                      <CopyLink path={doorLink} />
                      <button type="button" className="ow-rowbtn ds-press" disabled={!doorLink} onClick={() => window.print()}>
                        Print this page
                      </button>
                      <button
                        type="button"
                        className="ow-rowbtn ds-press"
                        disabled={!doorLink}
                        onClick={() => {
                          setDoorNote(null);
                          setDoorRenew("ask");
                        }}
                      >
                        New door QR
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        <StorePaySettings store={store} readOnly={readOnly} onSaved={(settings, suggestedHoldCents) => setStore((was) => (was ? { ...was, settings, suggestedHoldCents } : was))} />
      </div>

      <Dialog isOpen={cameraFor !== null} onOpenChange={(open) => !open && setCameraFor(null)} purpose="form" width={440} maxHeight="88dvh">
        <DialogHeader title="Camera link" subtitle={cameraFor?.name} onOpenChange={() => setCameraFor(null)} />
        {cameraFor && !readOnly && (
          <div className="ow-dialog-body ow-cctv-tabs">
            <SegmentedControl label="Kind of camera" value={cameraKind} onChange={(v) => setCameraKind(v === "cctv" ? "cctv" : "phone")} size="sm">
              <SegmentedControlItem value="phone" label="Phone" />
              <SegmentedControlItem value="cctv" label="CCTV or webcam" />
            </SegmentedControl>
          </div>
        )}
        {cameraFor && !readOnly && cameraKind === "cctv" && (
          <CctvSetup zone={cameraFor} standKey={trial ? standKey : null} trial={trial} />
        )}
        {cameraFor && (readOnly || cameraKind === "phone") && (
          <div className="ow-dialog-body ow-camlink">
            {camera ? <PageCode path={camera} label={`QR code that opens the camera for ${cameraFor.name}`} /> : <span className="ow-qr" aria-hidden="true" />}
            <p>
              Scan this with the phone that watches <b>{cameraFor.name}</b>, or open it on this device. It runs the stand
              screen for this shelf only.
            </p>
            <p className="ow-setup-note">
              {readOnly
                ? "The demo stand has no camera of its own."
                : trial
                  ? "The link holds this trial's key, so there is nothing to type. Keep it to yourself."
                  : "The screen asks for the stand's 6-digit code before it starts."}
            </p>
            {!readOnly && (
              <div className="ow-go-actions">
                <a href={camera ?? undefined} target="_blank" rel="noreferrer" className="ow-rowbtn ds-press" data-tone="strong" aria-disabled={!camera || undefined}>
                  Open here
                  <IconArrowUpRight size={14} aria-hidden="true" />
                </a>
                <CopyLink path={camera} />
              </div>
            )}
          </div>
        )}
      </Dialog>

      <Dialog isOpen={editing !== null} onOpenChange={(open) => !open && setEditing(null)} purpose="form" width={520} maxHeight="88dvh">
        <DialogHeader
          title={editing?.id ? "Edit shelf" : "Add a shelf"}
          subtitle={editing?.id ? undefined : "One shelf for each camera."}
          onOpenChange={() => setEditing(null)}
        />
        {editing && (
          <form
            className="ow-dialog-body ow-prod-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void saveEditing();
            }}
          >
            {editing.problem && (
              <p className="ow-prod-notice" role="alert">
                {editing.problem}
              </p>
            )}
            <div className="ow-prod-pair">
              <TextInput
                label="Name"
                width="100%"
                hasAutoFocus
                value={editing.name}
                onChange={(name) => setEditing({ ...editing, name: name.slice(0, MAX_NAME), error: null, problem: null })}
                placeholder="Shelf 1"
                autoComplete="off"
                statusVariant="detached"
                status={editing.error ? { type: "error", message: editing.error } : undefined}
              />
              <TextInput
                label="Aisle"
                isOptional
                width="100%"
                value={editing.aisle}
                onChange={(aisle) => setEditing({ ...editing, aisle: aisle.slice(0, MAX_NAME), problem: null })}
                placeholder="Aisle 1"
                autoComplete="off"
              />
            </div>
            <fieldset className="ow-zone-products">
              <legend>Products on this shelf</legend>
              <p className="ow-setup-note">
                Its camera is shown these, plus any product kept anywhere. Ticking one moves it here from another shelf.
              </p>
              {products.length === 0 ? (
                <p className="ow-setup-note">This stand has no products yet.</p>
              ) : (
                <ul>
                  {products.map((p) => {
                    const other = zoneOf(p) && zoneOf(p) !== editing.id ? zones.find((z) => z.id === zoneOf(p))?.name : undefined;
                    return (
                      <li key={p.sku}>
                        <CheckboxInput
                          label={p.name}
                          description={other ? `Now on ${other}` : undefined}
                          value={editing.skus.has(p.sku)}
                          onChange={(checked) => {
                            const skus = new Set(editing.skus);
                            if (checked) skus.add(p.sku);
                            else skus.delete(p.sku);
                            setEditing({ ...editing, skus, problem: null });
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>
            <div className="ow-prod-foot">
              {editing.confirmRemove ? (
                <div className="ow-zone-remove" role="alert">
                  <p>
                    Remove {editing.name.trim() || "this shelf"}? Its products stay in your catalogue with no shelf, and its
                    camera link stops working.
                  </p>
                  <span className="ow-prod-foot-end">
                    <Button label="Keep shelf" variant="ghost" isDisabled={saving} onClick={() => setEditing({ ...editing, confirmRemove: false })} />
                    <Button label="Remove shelf" variant="primary" isLoading={saving} onClick={() => void removeEditing()} />
                  </span>
                </div>
              ) : (
                <>
                  {editing.id && (
                    <Button
                      label="Remove shelf"
                      variant="ghost"
                      isDisabled={saving}
                      onClick={() => setEditing({ ...editing, confirmRemove: true, problem: null })}
                    />
                  )}
                  <span className="ow-prod-foot-end">
                    <Button label="Cancel" variant="ghost" onClick={() => setEditing(null)} />
                    <Button type="submit" variant="primary" isLoading={saving} label={editing.id ? "Save shelf" : "Add shelf"} />
                  </span>
                </>
              )}
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}

/* cctv: the bridge config for one shelf, for a CCTV camera, an IP camera or a USB webcam. */
function CctvSetup({ zone, standKey, trial }: { zone: Zone; standKey: string | null; trial: boolean }) {
  // A trial's key is already in the owner's hands; the live stand's code is never written here.
  const token = trial ? (standKey ?? "<loading>") : "<your 6-digit stand code>";
  const config = shelfConfigText({
    server: typeof window === "undefined" ? "" : window.location.origin,
    zoneId: zone.id,
    shelfName: zone.name,
    token,
  });
  const command = "npx tsx bridge/index.ts shelf.json";
  return (
    <div className="ow-dialog-body ow-camlink ow-cctv">
      <p>
        Run the camera bridge on a computer in the shop that can see the camera. It watches <b>{zone.name}</b> and sends only
        the shelf, never the whole picture.
      </p>
      <p className="ow-setup-note">
        Save this as <code>shelf.json</code>, put your camera&apos;s address in <code>source</code> (rtsp://, an MJPEG http address,
        avfoundation:0 for a Mac webcam, /dev/video0 on Linux, or a video file), and narrow <code>rect</code> to the shelf.
      </p>
      <pre className="ow-cctv-code" tabIndex={0} aria-label="Bridge config for this shelf">{config}</pre>
      <p className="ow-setup-note">
        {trial
          ? "The config holds this trial's key. Keep it to yourself."
          : "Replace the token with the stand's 6-digit code, or leave it out and set SHOPSITTER_TOKEN instead."}{" "}
        Then run, from the Shopsitter folder (ffmpeg must be installed):
      </p>
      <pre className="ow-cctv-code">{command}</pre>
      <div className="ow-go-actions">
        <CopyLink path="" text={config} label="Copy config" />
        <CopyLink path="" text={command} label="Copy command" />
      </div>
    </div>
  );
}
