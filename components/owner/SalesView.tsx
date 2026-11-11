"use client";

import { Skeleton } from "@astryxdesign/core/Skeleton";
import dynamic from "next/dynamic";
import { useOwner } from "./OwnerProvider";

// AG Studio draws on a canvas and measures the window, so it only runs in the browser.
const SalesStudio = dynamic(() => import("./SalesStudio"), {
  ssr: false,
  loading: () => (
    <section className="ow-panel ow-explore" aria-busy="true" aria-label="Explore sales, loading charts">
      <div className="ow-panel-head">
        <Skeleton width={150} height={20} />
        <Skeleton width={170} height={32} radius={2} />
      </div>
      <div className="ow-studio-skeleton">
        <Skeleton height={300} radius={3} />
        <Skeleton height={300} radius={3} />
        <Skeleton height={260} radius={3} />
      </div>
    </section>
  ),
});

/** The charts board, given the whole width of the content area. */
export function SalesView() {
  const { data, shown } = useOwner();
  if (shown.length === 0) {
    return (
      <section className="ow-panel" aria-label="Explore sales">
        <div className="ow-empty ow-empty-tall">
          <b>No sales to chart yet</b>
          <p>Charts appear here as soon as something leaves the shelf in this period.</p>
        </div>
      </section>
    );
  }
  return <SalesStudio visits={data.visits} stock={data.stock} />;
}
