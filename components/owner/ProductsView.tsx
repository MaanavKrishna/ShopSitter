"use client";

import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Spinner } from "@astryxdesign/core/Spinner";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useAnnounce } from "@astryxdesign/core/hooks";
import { IconPhoto, IconPlus, IconTrash } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { formatCents } from "@/lib/money";
import { spring } from "@/lib/motion";
import {
  checkProductForm,
  MAX_DESCRIPTION,
  type ProductForm,
  type ProductFormErrors,
  suggestSku,
} from "@/lib/products";
import type { Product } from "@/lib/types";
import { useOwner } from "./OwnerProvider";
import { type PhotoChoice, ProductPhotoField } from "./ProductPhotoField";
import { photoHref, useRestock } from "./parts";

type Draft = {
  /** Sku of the product being edited, or null for a new one. */
  editing: string | null;
  form: ProductForm;
  /** The owner typed their own id, so the name no longer rewrites it. */
  skuTouched: boolean;
  photo: PhotoChoice;
  errors: ProductFormErrors;
  /** Something the server refused that does not belong to one field. */
  problem: string | null;
};

const PROBLEMS: Record<string, string> = {
  demo_read_only: "The demo stand's products are fixed. Sign in to your own stand to edit.",
  sku_taken: "Another product already uses that id.",
  not_found: "That product is no longer on this stand.",
  bad_photo: "That photo couldn't be read. Choose another picture.",
  not_jpeg: "The photo has to be a JPEG picture. Choose it again and it is converted for you.",
  offline: "The stand couldn't be reached. Check the connection and try again.",
  photo_too_large: "That photo is over 3 MB.",
  bad_request: "Some of those details were not accepted. Check them and try again.",
};
const FALLBACK = "That didn't work. Nothing was changed.";

/** Sends a request and returns the server's error code, or null when it went through. */
async function send(url: string, init: RequestInit): Promise<{ ok: true; product?: Product } | { ok: false; code: string }> {
  try {
    const res = await fetch(url, init);
    const body = (await res.json().catch(() => ({}))) as { error?: string; product?: Product };
    if (res.status === 401) {
      // The sign-in ran out: leave through a full page load, as the rest of the owner area does.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/owner/login");
      return { ok: false, code: "unauthorized" };
    }
    return res.ok ? { ok: true, product: body.product } : { ok: false, code: body.error ?? "server_error" };
  } catch {
    return { ok: false, code: "offline" };
  }
}

const emptyDraft = (): Draft => ({
  editing: null,
  form: { sku: "", name: "", description: "", price: "", stock: "" },
  skuTouched: false,
  photo: { kind: "keep" },
  errors: {},
  problem: null,
});

const draftFor = (p: Product): Draft => ({
  editing: p.sku,
  form: { sku: p.sku, name: p.name, description: p.description, price: formatCents(p.priceCents), stock: String(p.stock) },
  skuTouched: true,
  photo: { kind: "keep" },
  errors: {},
  problem: null,
});

function Thumb({ product, preview }: { product: Product; preview?: string }) {
  const src = preview ?? (product.refImageUrl ? photoHref(product.refImageUrl) : null);
  return (
    <span className="ow-prod-thumb" data-empty={src ? undefined : true}>
      {src ? (
        // A private photo behind the owner sign-in: the image optimiser cannot fetch it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" />
      ) : (
        <IconPhoto size={18} stroke={1.5} aria-hidden="true" />
      )}
    </span>
  );
}

/** The stand's catalogue: every product the camera can bill for, with add, edit and delete. */
export function ProductsView() {
  const { shop, data, refresh } = useOwner();
  const announce = useAnnounce();
  const readOnly = shop === "demo";

  // The list as it will be once a change lands. It holds only until the shell's own data moves on.
  const [ahead, setAhead] = useState<{ base: Product[]; list: Product[] } | null>(null);
  const products = ahead && ahead.base === data.products ? ahead.list : data.products;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  /** Sku with a change on its way to the server. One change runs at a time. */
  const [working, setWorking] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const restock = useRestock();
  // What is on the shelf now: the stored count less what visits have taken.
  const leftBySku = new Map(data.stock.map((s) => [s.sku, s.left]));

  const editingProduct = draft?.editing ? products.find((p) => p.sku === draft.editing) : undefined;

  function setField(field: keyof ProductForm, value: string) {
    setDraft((d) => {
      if (!d) return d;
      const form = { ...d.form, [field]: value };
      let skuTouched = d.skuTouched;
      if (field === "sku") skuTouched = true;
      // Until the owner types an id of their own, it follows the name.
      if (field === "name" && !d.skuTouched) form.sku = suggestSku(value, products.map((p) => p.sku));
      const errors = { ...d.errors };
      delete errors[field];
      if (field === "name" && !d.skuTouched) delete errors.sku;
      return { ...d, form, skuTouched, errors, problem: null };
    });
  }

  function closeDraft() {
    if (draft?.photo.kind === "new") URL.revokeObjectURL(draft.photo.preview);
    setDraft(null);
  }

  async function save() {
    if (!draft || working) return;
    // An existing product's count is set from the shelf (Restock), never from this form.
    const checked = checkProductForm(draft.editing ? { ...draft.form, stock: "0" } : draft.form);
    const errors: ProductFormErrors = checked.ok ? {} : { ...checked.errors };
    if (!draft.editing && !errors.sku && products.some((p) => p.sku === draft.form.sku.trim())) {
      errors.sku = PROBLEMS.sku_taken;
    }
    if (!checked.ok || Object.keys(errors).length > 0) {
      setDraft({ ...draft, errors, problem: null });
      announce("Some details need another look.", "assertive");
      return;
    }

    const before = products.find((p) => p.sku === checked.value.sku);
    const fields = { ...checked.value, stock: draft.editing && before ? before.stock : checked.value.stock };
    const optimistic: Product = { ...fields, shop, refImageUrl: before?.refImageUrl ?? null };
    const base = data.products;
    const listWith = (p: Product) => (before ? products.map((x) => (x.sku === p.sku ? p : x)) : [...products, p]);

    // Show the change at once and close the form; it comes back with the details if the server refuses.
    setAhead({ base, list: listWith(optimistic) });
    setDraft(null);
    setNotice(null);
    setWorking(fields.sku);
    if (draft.photo.kind === "new") setPreviews((was) => ({ ...was, [fields.sku]: (draft.photo as { preview: string }).preview }));

    const reopen = (code: string, saved?: Product) => {
      // Rolls the list back to what the server has: nothing, or the details without the photo change.
      setAhead(saved ? { base, list: listWith(saved) } : null);
      setPreviews((was) => {
        const rest = { ...was };
        delete rest[fields.sku];
        return rest;
      });
      const text = PROBLEMS[code] ?? FALLBACK;
      setDraft({
        ...draft,
        editing: saved ? saved.sku : draft.editing,
        errors: code === "sku_taken" ? { sku: text } : {},
        problem: code === "sku_taken" ? null : saved ? `The details were saved, but the photo was not. ${text}` : text,
      });
      announce(text, "assertive");
      if (saved) refresh();
    };

    try {
      const put = await send("/api/owner/products", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sku: fields.sku,
          name: fields.name,
          description: fields.description,
          price: draft.form.price.trim(),
          ...(draft.editing ? {} : { stock: fields.stock }),
          create: !draft.editing,
        }),
      });
      if (!put.ok) return reopen(put.code);
      let saved = put.product ?? optimistic;

      if (draft.photo.kind === "new") {
        const body = new FormData();
        body.append("photo", draft.photo.blob, `${fields.sku}.jpg`);
        const photo = await send(`/api/owner/products/${fields.sku}/photo`, { method: "POST", body });
        if (!photo.ok) return reopen(photo.code, saved);
        saved = photo.product ?? saved;
      } else if (draft.photo.kind === "remove" && saved.refImageUrl) {
        const photo = await send(`/api/owner/products/${fields.sku}/photo`, { method: "DELETE" });
        if (!photo.ok) return reopen(photo.code, saved);
        saved = photo.product ?? saved;
      }

      setAhead({ base, list: listWith(saved) });
      setPreviews((was) => {
        const rest = { ...was };
        delete rest[fields.sku];
        return rest;
      });
      if (draft.photo.kind === "new") URL.revokeObjectURL(draft.photo.preview);
      announce(before ? `${saved.name} saved.` : `${saved.name} added.`);
      // Shelf and Overview read the same data, so they agree with this list.
      refresh();
    } finally {
      setWorking(null);
    }
  }

  async function remove(product: Product) {
    if (working) return;
    const base = data.products;
    setToDelete(null);
    setDraft(null);
    setNotice(null);
    setAhead({ base, list: products.filter((p) => p.sku !== product.sku) });
    setWorking(product.sku);
    try {
      const res = await send(`/api/owner/products/${product.sku}`, { method: "DELETE" });
      if (!res.ok && res.code !== "not_found") {
        setAhead(null);
        const text = `${product.name} was not deleted. ${PROBLEMS[res.code] ?? FALLBACK}`;
        setNotice(text);
        announce(text, "assertive");
        return;
      }
      announce(`${product.name} deleted.`);
      refresh();
    } finally {
      setWorking(null);
    }
  }

  const addButton = (
    <button type="button" className="ow-rowbtn ds-press" data-tone="strong" onClick={() => setDraft(emptyDraft())}>
      <IconPlus size={15} stroke={2} aria-hidden="true" />
      Add product
    </button>
  );

  return (
    <div className="ow-products">
      {readOnly && (
        <p className="ow-prod-fixed" role="note">
          The demo stand&apos;s products are fixed. Sign in to your own stand to edit.
        </p>
      )}
      {notice && (
        <p className="ow-prod-notice" role="alert">
          {notice}
        </p>
      )}

      <section className="ow-panel" aria-labelledby="products-h">
        <div className="ow-panel-head">
          <div className="ow-prod-heading">
            <h2 id="products-h">Products</h2>
            <p className="ow-panel-meta">
              {products.length === 0
                ? "Nothing on this stand yet"
                : `${products.length} on this stand · the camera bills for these`}
            </p>
          </div>
          {!readOnly && products.length > 0 && addButton}
        </div>

        {products.length === 0 ? (
          <div className="ow-empty ow-empty-tall ow-prod-empty">
            <b>Add your first product</b>
            <p>
              Give it a name, a price and a line about what it looks like. A photo helps the camera tell it from the
              others.
            </p>
            {!readOnly && (
              <button type="button" className="ow-cta ds-press" onClick={() => setDraft(emptyDraft())}>
                <IconPlus size={17} stroke={2} aria-hidden="true" />
                Add product
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="ow-prod-cols" aria-hidden="true">
              <span />
              <span>Product</span>
              <span>Id</span>
              <span data-end>On the shelf</span>
              <span data-end>Price</span>
              <span />
            </div>
            <ul className="ow-prod-list">
              <AnimatePresence initial={false}>
                {products.map((p) => {
                  const busy = working === p.sku;
                  return (
                    <motion.li
                      key={p.sku}
                      layout="position"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={spring}
                      className="ow-prod-row"
                      data-busy={busy || undefined}
                      data-static={readOnly || undefined}
                    >
                      <Thumb product={p} preview={previews[p.sku]} />
                      <span className="ow-prod-main">
                        {readOnly ? (
                          <span className="ow-prod-name">{p.name}</span>
                        ) : (
                          <button
                            type="button"
                            className="ow-prod-name ow-prod-open"
                            disabled={working !== null}
                            aria-label={`Edit ${p.name}`}
                            onClick={() => setDraft(draftFor(p))}
                          >
                            {p.name}
                          </button>
                        )}
                        {p.description && <small>{p.description}</small>}
                      </span>
                      <code className="ow-prod-sku">{p.sku}</code>
                      <span className="ow-prod-stock" data-end>
                        <span className="num">{leftBySku.get(p.sku) ?? p.stock}</span>
                        <span className="ow-prod-unit"> on the shelf</span>
                      </span>
                      <span className="ow-prod-price num" data-end>
                        ${formatCents(p.priceCents)}
                      </span>
                      <span className="ow-prod-actions">
                        {busy ? (
                          <span className="ow-prod-saving">
                            <Spinner size="sm" shade="inherit" aria-label="Saving" />
                          </span>
                        ) : (
                          !readOnly && (
                            <>
                              <button
                                type="button"
                                className="ow-rowbtn ow-prod-edit ds-press"
                                disabled={working !== null}
                                tabIndex={-1}
                                aria-hidden="true"
                                onClick={() => setDraft(draftFor(p))}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="ow-icon-btn ow-prod-delete ds-press"
                                disabled={working !== null}
                                aria-label={`Delete ${p.name}`}
                                onClick={() => setToDelete(p)}
                              >
                                <IconTrash size={17} stroke={1.75} aria-hidden="true" />
                              </button>
                            </>
                          )
                        )}
                      </span>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </>
        )}
      </section>

      <Dialog
        isOpen={draft !== null}
        onOpenChange={(open) => !open && closeDraft()}
        purpose="form"
        width={520}
        maxHeight="88dvh"
      >
        <DialogHeader
          title={draft?.editing ? "Edit product" : "Add a product"}
          subtitle={draft?.editing ? editingProduct?.name : "It can be billed as soon as it is saved."}
          onOpenChange={closeDraft}
        />
        {draft && (
          <form
            className="ow-dialog-body ow-prod-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {draft.problem && (
              <p className="ow-prod-notice" role="alert">
                {draft.problem}
              </p>
            )}
            <TextInput
              label="Name"
              width="100%"
              hasAutoFocus
              value={draft.form.name}
              onChange={(v) => setField("name", v)}
              placeholder="Wildflower honey"
              autoComplete="off"
              statusVariant="detached"
              status={draft.errors.name ? { type: "error", message: draft.errors.name } : undefined}
            />
            <TextArea
              label="What it looks like"
              description="Shape, colour, label, lid. This helps the camera tell products apart."
              width="100%"
              rows={2}
              maxLength={MAX_DESCRIPTION}
              value={draft.form.description}
              onChange={(v) => setField("description", v)}
              placeholder="Small glass jar, gold lid, yellow label"
              statusVariant="detached"
              status={draft.errors.description ? { type: "error", message: draft.errors.description } : undefined}
            />
            <div className="ow-prod-pair">
              <TextInput
                label="Price in dollars"
                width="100%"
                inputMode="decimal"
                value={draft.form.price}
                onChange={(v) => setField("price", v)}
                placeholder="7.50"
                autoComplete="off"
                statusVariant="detached"
                status={draft.errors.price ? { type: "error", message: draft.errors.price } : undefined}
              />
              {editingProduct ? (
                <div className="ow-prod-count">
                  <span className="ow-prod-count-label">On the shelf now</span>
                  <span className="ow-prod-count-row">
                    <span className="num">{leftBySku.get(editingProduct.sku) ?? editingProduct.stock}</span>
                    <button
                      type="button"
                      className="ow-rowbtn ds-press"
                      onClick={() => {
                        closeDraft();
                        restock.open(editingProduct);
                      }}
                    >
                      Restock
                    </button>
                  </span>
                </div>
              ) : (
                <TextInput
                  label="Units on the shelf"
                  width="100%"
                  inputMode="numeric"
                  value={draft.form.stock}
                  onChange={(v) => setField("stock", v)}
                  placeholder="6"
                  autoComplete="off"
                  statusVariant="detached"
                  status={draft.errors.stock ? { type: "error", message: draft.errors.stock } : undefined}
                />
              )}
            </div>
            <ProductPhotoField
              current={editingProduct?.refImageUrl ? photoHref(editingProduct.refImageUrl) : null}
              choice={draft.photo}
              onChoice={(photo) => setDraft((d) => (d ? { ...d, photo, problem: null } : d))}
            />
            <TextInput
              label="Id"
              description={
                draft.editing
                  ? "The id stays the same for the life of the product."
                  : "A short name the stand uses for this product. Suggested from the name; it cannot change later."
              }
              width="100%"
              isReadOnly={draft.editing !== null}
              value={draft.form.sku}
              onChange={(v) => setField("sku", v)}
              autoComplete="off"
              autoCapitalize="none"
              hasAutoCorrect={false}
              hasSpellCheck={false}
              statusVariant="detached"
              status={draft.errors.sku ? { type: "error", message: draft.errors.sku } : undefined}
            />
            <div className="ow-prod-foot">
              {editingProduct && (
                <Button
                  label="Delete product"
                  variant="ghost"
                  onClick={() => {
                    closeDraft();
                    setToDelete(editingProduct);
                  }}
                />
              )}
              <span className="ow-prod-foot-end">
                <Button label="Cancel" variant="ghost" onClick={closeDraft} />
                <Button type="submit" variant="primary" label={draft.editing ? "Save changes" : "Add product"} />
              </span>
            </div>
          </form>
        )}
      </Dialog>

      <AlertDialog
        isOpen={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={toDelete ? `Delete ${toDelete.name}?` : "Delete this product?"}
        description={`This takes ${toDelete?.name ?? "it"} off your product list and your shelf, and deletes its photo. Past visits keep it, with its name and price.`}
        actionLabel="Delete product"
        onAction={() => toDelete && void remove(toDelete)}
        width={440}
      />
      {restock.dialog}
    </div>
  );
}
