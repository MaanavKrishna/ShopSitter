import Link from "next/link";
import { ExtraCamera } from "@/components/stand/ExtraCamera";
import "../../stand.css";

// The main stand screen is camera 1; a stand can have up to three more.
const EXTRA_ANGLES = ["2", "3", "4"];

export default async function StandCameraPage({ params }: PageProps<"/stand/camera/[angle]">) {
  const { angle } = await params;

  if (!EXTRA_ANGLES.includes(angle)) {
    return (
      <main className="void sd sd-nocam">
        <div className="sd-stage sd-angle-stage">
          <h1>No such camera</h1>
          <p>A stand has one main screen and up to three extra cameras, numbered 2 to 4.</p>
          <Link href="/stand" className="sd-glass-btn ds-press">
            Back to the stand screen
          </Link>
        </div>
      </main>
    );
  }

  return <ExtraCamera angle={Number(angle)} />;
}
