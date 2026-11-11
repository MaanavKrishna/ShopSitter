"use client";

import { type AgPanelConfig, studioTheme } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { easeOut } from "@/lib/motion";
import type { StockRow, VisitRow } from "@/lib/owner";
import { buildStudioData, salesReport } from "@/lib/studio-report";
import "@/app/owner/owner.css";

const FONT = "var(--font-body), system-ui, sans-serif";
const INK = "#0a1024";
const INK_SOFT = "#4b5570";
const LINE = "#d9e0f5";

// Charts in the stand's own colours: cobalt for paid, coral for unmatched, yellow for adjusted, ink and tints for the rest.
const chartTheme = studioTheme.withParams({
  fontFamily: FONT,
  textColor: INK,
  borderColor: LINE,
  studioCanvasFontFamily: FONT,
  studioCanvasBackgroundColor: "#f7f9ff",
  // The frame around the board is drawn by the page, so Studio's own wrapper stays invisible.
  studioWrapperBackgroundColor: "#f7f9ff",
  studioWrapperBorder: false,
  studioCanvasBorder: false,
  studioWidgetBorder: { width: 1, color: LINE },
  studioWidgetBorderRadius: 12,
  studioWidgetPadding: 12,
  studioWidgetTitleFontFamily: FONT,
  studioWidgetTitleFontSize: 17,
  studioWidgetTitleFontWeight: 600,
  studioWidgetTitleTextColor: INK,
  studioWidgetSubtitleFontFamily: FONT,
  studioWidgetSubtitleTextColor: INK_SOFT,
  studioWidgetCaptionFontFamily: FONT,
  studioWidgetCaptionTextColor: INK_SOFT,
  studioToggleButtonActiveBackgroundColor: "#0a35c8",
  studioToggleButtonActiveBorderColor: "#0a35c8",
  studioToggleButtonActiveColor: "#0a35c8",
  gridRowBorder: { width: 1, color: LINE },
  gridHeaderRowBorder: { width: 1, color: LINE },
  gridPinnedRowBorder: { width: 1, color: LINE },
  valueChangeUpColor: "#0a35c8",
  valueChangeDownColor: "#c2371c",
  valueChangeHighlightBackgroundColor: "#0a35c833",
  chartFontFamily: FONT,
  chartTextColor: INK,
  chartSubtleTextColor: INK_SOFT,
  chartAxisLineColor: "#b9c4e6",
  chartGridLineColor: "#e6ebfa",
  chartAxisLabelColor: INK_SOFT,
  chartAxisLabelFontFamily: FONT,
  chartAxisTitleColor: INK_SOFT,
  chartAxisTitleFontFamily: FONT,
  chartSeriesLabelFontFamily: FONT,
  chartSeriesLabelOutsideTextColor: INK,
  chartPaletteFills1Color: "#0a35c8",
  chartPaletteFills2Color: "#ff6b4a",
  chartPaletteFills3Color: "#ffc439",
  chartPaletteFills4Color: "#0a1024",
  chartPaletteFills5Color: "#7f9bff",
  chartPaletteFills6Color: "#c2371c",
  chartPaletteFills7Color: "#c9d5ff",
  chartPaletteFills8Color: "#8b93ab",
  chartPaletteFills9Color: "#f3d27a",
  chartPaletteFills10Color: "#4b5570",
});

// Nothing is filtered on first load, so the reading view shows the charts alone; the filters panel
// comes back with the others while rearranging.
const PANELS: AgPanelConfig = { view: { left: [], right: [] } };

/** Charts and tables the owner can rearrange, built with AG Studio from the visits. */
export default function SalesStudio({ visits, stock }: { visits: VisitRow[]; stock: StockRow[] }) {
  const data = useMemo(() => buildStudioData(visits, stock), [visits, stock]);
  const [mode, setMode] = useState<"view" | "edit">("view");

  return (
    <motion.section
      className="ow-panel ow-explore"
      aria-labelledby="studio-h"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: easeOut }}
    >
      <div className="ow-panel-head">
        <div>
          <h2 id="studio-h">Explore sales</h2>
          <p className="ow-panel-meta">Charts built from the visits in this period. Rearrange them or add your own.</p>
        </div>
        <button
          type="button"
          className="ow-rowbtn ds-press"
          data-tone={mode === "edit" ? "strong" : "plain"}
          aria-pressed={mode === "edit"}
          onClick={() => setMode(mode === "view" ? "edit" : "view")}
        >
          {mode === "view" ? "Rearrange or add charts" : "Done rearranging"}
        </button>
      </div>
      {/* AG Studio keeps a minimum canvas width, so on a phone it scrolls inside this frame. */}
      <div className="ow-studio-frame" tabIndex={0} role="group" aria-label="Sales charts, scrolls sideways on a small screen">
        <div className="ow-studio-canvas">
          <AgStudioProvider>
            <AgStudio
              style={{ height: "100%", width: "100%" }}
              layout={{ widgetBorderEnabled: true }}
              panels={PANELS}
              theme={chartTheme}
              data={data}
              initialState={salesReport}
              mode={mode}
            />
          </AgStudioProvider>
        </div>
      </div>
    </motion.section>
  );
}
