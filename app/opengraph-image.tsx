import { ImageResponse } from "next/og";

export const alt = "Shopsitter: the stand that rings you up";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The picture shown when a link to the site is shared. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "#ffffff",
          background: "radial-gradient(120% 140% at 30% 0%, #2152f2 0%, #0a35c8 50%, #0024a6 100%)",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>Shopsitter</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 112, fontWeight: 800, lineHeight: 1, letterSpacing: -4 }}>
            The stand that rings you up
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 36, color: "#c9d5ff", maxWidth: 900 }}>
            A camera counts what you take, your bill appears, and you pay with PayPal.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", fontSize: 28, color: "#c9d5ff" }}>
          <div style={{ display: "flex", width: 18, height: 18, borderRadius: 9, background: "#ffc439", marginRight: 14 }} />
          Built for the PayPal AI Hackathon 2026
        </div>
      </div>
    ),
    size,
  );
}
