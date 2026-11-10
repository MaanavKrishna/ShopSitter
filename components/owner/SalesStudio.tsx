"use client";

import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { useMemo, useState } from "react";
import type { StockRow, VisitRow } from "@/lib/owner";
import { buildStudioData, salesReport } from "@/lib/studio-report";

/** Charts and tables the owner can rearrange, built with AG Studio from the visits. */
export default function SalesStudio({ visits, stock }: { visits: VisitRow[]; stock: StockRow[] }) {
  const data = useMemo(() => buildStudioData(visits, stock), [visits, stock]);
  const [mode, setMode] = useState<"view" | "edit">("view");

  return (
    <section className="owner-studio" aria-labelledby="studio-h">
      <div className="owner-studio-head">
        <h2 id="studio-h">Sales</h2>
        <button type="button" className="btn" onClick={() => setMode(mode === "view" ? "edit" : "view")}>
          {mode === "view" ? "Rearrange or add charts" : "Done rearranging"}
        </button>
      </div>
      <div className="owner-studio-canvas">
        <AgStudioProvider>
          <AgStudio
            style={{ height: "100%", width: "100%" }}
            layout={{ widgetBorderEnabled: true }}
            data={data}
            initialState={salesReport}
            mode={mode}
          />
        </AgStudioProvider>
      </div>
    </section>
  );
}
