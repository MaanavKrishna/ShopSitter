import { DemoRunner } from "@/components/DemoRunner";
import { listSamples } from "@/lib/samples";

export const metadata = { title: "Try Shopsitter without a camera" };

export default function DemoPage() {
  return (
    <main className="demo">
      <h1>Try it without a camera</h1>
      <p className="demo-lede">
        Each pair is a real photo of the demo shelf before and after a visitor. Pick one and Shopsitter reads what
        was taken, writes the bill, and lets you pay it in the PayPal sandbox.
      </p>
      <DemoRunner samples={listSamples()} />
    </main>
  );
}
