"use client";

import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { IconSearch } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatCents } from "@/lib/money";
import { easeOut } from "@/lib/motion";
import type { VisitRow } from "@/lib/owner";
import { countByFilter, matchesFilter, matchesSearch, type VisitFilter } from "@/lib/owner-view";
import { useOwner } from "./OwnerProvider";
import { paidText, PhotoLinks, RowButton, takenText, useRefund, VisitAction, VisitStatus, when } from "./parts";
import { PillSwitch } from "./PillSwitch";

const FILTERS: { value: VisitFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "unmatched", label: "Unmatched" },
  { value: "open", label: "Open" },
];

/** Rows shown before the owner asks for the rest. */
const FIRST_ROWS = 12;
/** Rows that arrive one after another when the list grows; the rest come with the last of them. */
const STAGGERED = 10;

/** Every visit of the period: filter, search by item, settle or refund, and open one for the detail. */
export function VisitsView() {
  const router = useRouter();
  const { kind, shown, dataDays, period, loading, hydrated, flash, filter, setFilter, refreshing } = useOwner();
  const refund = useRefund();
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const counts = useMemo(() => countByFilter(shown), [shown]);
  const filtered = useMemo(
    () => shown.filter((v) => matchesFilter(v, filter) && matchesSearch(v, search)),
    [shown, filter, search],
  );
  const listed = showAll ? filtered : filtered.slice(0, FIRST_ROWS);

  // Times are written in the viewer's own zone and format, which only the browser knows.
  const time = (ms: number) => (hydrated ? when(ms) : " ");
  const open = (v: VisitRow) => router.push(`/owner/visits/${v.id}`);
  // Rows already on screen stay put; the ones "Show all" adds arrive in a short run.
  const arrive = (i: number) => ({
    initial: hydrated ? { opacity: 0, y: 6 } : false,
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: easeOut, delay: i >= FIRST_ROWS ? Math.min(i - FIRST_ROWS, STAGGERED) * 0.025 : 0 },
  });

  const title = (v: VisitRow) => (
    <Link href={`/owner/visits/${v.id}`} className="ow-visit-link" onClick={(e) => e.stopPropagation()}>
      {takenText(v)}
    </Link>
  );

  return (
    <section
      className="ow-panel ow-visits"
      aria-labelledby="visits-h"
      aria-busy={refreshing || loading || undefined}
      data-focus-list
    >
      <div className="ow-panel-head ow-visits-head">
        <h2 id="visits-h" className="sr-only" tabIndex={-1} data-focus-heading>
          Visits, {period.subtitle.toLowerCase()}
        </h2>
        {/* Said to screen readers each time a filter or search changes what is listed. */}
        <p className="sr-only" role="status">
          {loading ? "" : filtered.length === 0 ? "No visits" : `${filtered.length} ${filtered.length === 1 ? "visit" : "visits"}`}
        </p>
        <PillSwitch
          label="Show visits"
          className="ow-filter"
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setShowAll(false);
          }}
          options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))}
        />
        <Tooltip
          content={
            <>
              Find a visit <kbd className="ow-kbd">/</kbd>
            </>
          }
          placement="below"
        >
          <label className="ow-search">
            <IconSearch size={16} stroke={1.75} aria-hidden="true" />
            <span className="sr-only">Find visits by item</span>
            <input
              type="search"
              placeholder="Find by item"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowAll(false);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Escape") return;
                setSearch("");
                e.currentTarget.blur();
              }}
            />
          </label>
        </Tooltip>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={loading ? "loading" : dataDays}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: easeOut }}
        >
          {loading ? (
            <div className="ow-table-skeleton" aria-label="Loading visits">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i}>
                  <Skeleton width={76} height={14} index={i} />
                  <Skeleton width={`${58 - (i % 3) * 12}%`} height={14} index={i} />
                  <Skeleton width={52} height={14} index={i} />
                  <Skeleton width={52} height={14} index={i} />
                  <Skeleton width={84} height={20} radius={4} index={i} />
                </div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="ow-empty ow-empty-tall">
              <b>No visits yet</b>
              <p>They appear here as soon as something leaves the shelf.</p>
              {kind === "trial" && (
                <Link href="/owner" className="ow-rowbtn ds-press">
                  Back to Get going
                </Link>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <div className="ow-empty ow-empty-tall">
              <b>{search.trim() ? `No visits with "${search.trim()}"` : `No ${filter} visits in this period`}</b>
              <p>
                {search.trim() ? "Try part of a product name, or clear the search." : "Pick another filter or a longer period."}
              </p>
              {search.trim() && <RowButton onClick={() => setSearch("")}>Clear search</RowButton>}
            </div>
          ) : (
            <>
              <table className="ow-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Taken</th>
                    <th scope="col" data-end>
                      Value
                    </th>
                    <th scope="col" data-end>
                      Paid
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((v, i) => (
                    <motion.tr key={v.id} data-visit-row={v.id} data-flash={flash === v.id || undefined} onClick={() => open(v)} {...arrive(i)}>
                      <td className="ow-cell-when">{time(v.openedAt)}</td>
                      <td className="ow-cell-taken">
                        <span>
                          {title(v)}
                          <PhotoLinks visit={v} />
                        </span>
                      </td>
                      <td className="num" data-end>
                        ${formatCents(v.detectedCents)}
                      </td>
                      <td className="num" data-end data-none={v.paidCents === null || undefined}>
                        {paidText(v)}
                        {v.refundedCents > 0 && <small>−${formatCents(v.refundedCents)} refunded</small>}
                      </td>
                      <td>
                        <VisitStatus visit={v} />
                      </td>
                      <td className="ow-cell-action" data-end>
                        <VisitAction visit={v} onRefund={refund.open} />
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>

              <ul className="ow-cards">
                {listed.map((v, i) => (
                  <motion.li key={v.id} data-visit-row={v.id} data-flash={flash === v.id || undefined} onClick={() => open(v)} {...arrive(i)}>
                    <div className="ow-card-top">
                      <span>{time(v.openedAt)}</span>
                      <VisitStatus visit={v} />
                    </div>
                    <div className="ow-card-taken">
                      {title(v)}
                      <PhotoLinks visit={v} />
                    </div>
                    <div className="ow-card-foot">
                      <dl>
                        <div>
                          <dt>Value</dt>
                          <dd className="num">${formatCents(v.detectedCents)}</dd>
                        </div>
                        <div>
                          <dt>Paid</dt>
                          <dd className="num" data-none={v.paidCents === null || undefined}>
                            {paidText(v)}
                          </dd>
                        </div>
                        {v.refundedCents > 0 && (
                          <div>
                            <dt>Refunded</dt>
                            <dd className="num">${formatCents(v.refundedCents)}</dd>
                          </div>
                        )}
                      </dl>
                      <VisitAction visit={v} onRefund={refund.open} />
                    </div>
                  </motion.li>
                ))}
              </ul>

              <div className="ow-table-foot">
                <span>
                  {listed.length} of {filtered.length} {filtered.length === 1 ? "visit" : "visits"}
                </span>
                {filtered.length > FIRST_ROWS && (
                  <RowButton onClick={() => setShowAll(!showAll)}>
                    {showAll ? `Show the first ${FIRST_ROWS}` : `Show all ${filtered.length}`}
                  </RowButton>
                )}
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      {refund.dialog}
    </section>
  );
}
