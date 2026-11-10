"use client";

import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { useMemo, useState } from "react";
import type { StockRow, VisitRow } from "@/lib/owner";
import { buildStudioData, salesReport } from "@/lib/studio-report";
import "@/app/owner/owner.css";

/** Charts and tables the owner can rearrange, built with AG Studio from the visits. */
export default function SalesStudio({ visits, stock }: { visits: VisitRow[]; stock: StockRow[] }) {
  const data = useMemo(() => buildStudioData(visits, stock), [visits, stock]);
  const [mode, setMode] = useState<"view" | "edit">("view");

  return (
    <section className="ow-section" aria-labelledby="studio-h">
      <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap" className="ow-section-head">
        <Heading level={2} id="studio-h">
          Sales
        </Heading>
        <Button
          label={mode === "view" ? "Rearrange or add charts" : "Done rearranging"}
          variant={mode === "view" ? "secondary" : "primary"}
          onClick={() => setMode(mode === "view" ? "edit" : "view")}
        />
      </HStack>
      {/* AG Studio keeps a minimum canvas width, so on a phone it scrolls inside this frame. */}
      <div className="ow-studio-frame" tabIndex={0} role="group" aria-label="Sales charts">
        <div className="ow-studio-canvas">
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
      </div>
    </section>
  );
}
