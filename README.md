# Shopsitter

**The stand that rings you up.** Shopsitter minds an unattended stand: a phone camera reads the shelf, works out
what was taken, shows the bill with a PayPal QR code, takes the payment, and tells the owner what sold, what was
paid and what is still unmatched.

Live: https://shopsitter.vercel.app (PayPal sandbox: no real money moves)

Built for the PayPal AI Hackathon 2026.

## The problem

Honesty boxes, farm stands, office snack shelves and church bake tables run on a cash tin and trust. Fewer people
carry cash, the owner never learns what actually sold, and a self-checkout kiosk costs more than the stand earns.
Shopsitter needs one phone propped beside the shelf.

## How a visit goes

1. A shopper takes what they like. No app, no barcode, no till.
2. The phone at the shelf notices the shelf changed and waits for it to go still. This runs on the device.
3. A before photo, an after photo and a close-up of the changed area go to a vision model. It returns product ids
   and counts, nothing else.
4. The server prices the items from the owner's catalogue and opens a visit.
5. The stand screen shows the bill and a PayPal QR code.
6. The shopper scans, can correct the bill on their own phone, and pays with PayPal.
7. A visit with nothing paid after ten minutes becomes "unmatched". It can still be paid for a day, and the owner
   can mark it settled another way.
8. The owner's dashboard shows what left the shelf, what PayPal captured, what is unmatched and what is running low.

## Try it

| What | Where | Notes |
| --- | --- | --- |
| Demo without a camera | [/demo](https://shopsitter.vercel.app/demo) | Sample shelf pictures read by the real vision model |
| Owner dashboard | [/owner/login](https://shopsitter.vercel.app/owner/login) | Passcode `demo` (example data, read-only products) |
| How it works | [/how-it-works](https://shopsitter.vercel.app/how-it-works) | The whole flow, step by step |
| What it stores | [/trust](https://shopsitter.vercel.app/trust) | Rules the stand keeps, and its limits |
| Stand screen | [/stand](https://shopsitter.vercel.app/stand) | Needs the stand code and a camera; run your own copy to try it |

Payments use the PayPal sandbox. To pay a demo bill, use a sandbox buyer account from your own PayPal developer
dashboard.

## Where PayPal is used

- **Orders v2** (`@paypal/paypal-server-sdk`): every bill becomes an itemised order; the amount is computed on the
  server from the catalogue, in cents. Create and capture carry a `PayPal-Request-Id`, so a retry never charges twice.
- **Capture**: checked against the order the server created for that visit before any money is taken.
- **Refunds**: the owner can refund all or part of a captured payment from the dashboard.
- **JavaScript SDK v6** (`@paypal/react-paypal-js`): the pay button on the shopper's phone.
- **Agent Toolkit** (`@paypal/agent-toolkit`, read-only): lets the owner's "Ask your stand" box look up PayPal-side
  facts.

## Where AI is used

- **Reading the shelf**: a vision model compares the before and after photos (plus a close-up of the changed area,
  each product's reference photo, and extra camera angles when present) and returns `{ sku, qty }` pairs. Its output
  is sanitised: only catalogue products, whole numbers, bounded quantities.
- **Ask your stand**: a language model answers the owner's questions by calling tools that return server-computed
  facts. It never does the arithmetic.
- **On the device**: a hand and person detector runs in the browser on the stand's phone. It holds the shelf read
  while a hand is in view and counts how many people stopped by. Nothing about a person is stored or sent; only a
  daily number.

The model never sets a price. Prices and totals are always computed by the server.

## Rules the product keeps

- It never accuses anyone. A visit with no payment is "unmatched", and nothing more.
- It counts items, not people.
- The shopper has the last word on the bill before paying.
- Photos of the shelf are visible only to the signed-in owner.

Accuracy and limits: see [docs/accuracy.md](docs/accuracy.md) and the [trust page](https://shopsitter.vercel.app/trust).
This is a prototype: one shelf, a handful of visually distinct products, good light.

## Architecture

```
Stand phone (browser)                Server (Next.js on Vercel)              PayPal sandbox
  camera frames                        /api/stand/change
  change detector  ── photos ───────▶    vision model ─▶ sanitise ─▶ price
  hand/person detector                   visit state machine ──────────────▶ Orders v2
  bill + QR  ◀──────── visit ────────                                        Capture / Refund
Shopper phone
  /pay/[visitId]  ── edit lines, pay ─▶ /api/visits/[id]/order|capture ───▶
Owner
  /owner/...      ── dashboard, ask ──▶ /api/owner/*  (Postgres or local files)
```

- `lib/frame-diff.ts`: decides when the shelf has changed and settled (block grid, exposure-proof).
- `lib/vision.ts`: the model call and the sanitiser.
- `lib/visits.ts`: the visit state machine (open, paid, adjusted, paid late, unmatched, settled another way).
- `lib/checkout.ts`, `lib/paypal.ts`: orders, capture, refunds, idempotency.
- `lib/angles.ts`: extra cameras on other sides of the shelf.
- `lib/presence.ts`, `lib/footfall.ts`: the on-device presence signal and the daily count.
- `lib/repo.ts`: storage behind one interface (local files for development, Postgres when hosted).
- `app/system.css`, `DESIGN.md`: the design system.

Stack: Next.js 16, React 19, TypeScript, Vercel AI SDK, PayPal Server SDK and JS SDK v6, PayPal Agent Toolkit,
AG Studio (the owner's charts, running on its trial licence, which prints a notice in the browser console), Astryx components, Motion, MediaPipe (on-device detection), Neon Postgres, Vitest.

## Run it yourself

Requirements: Node 22 or newer, a PayPal sandbox app (client id and secret), and a key for the model provider.

```bash
git clone <this repository>
cd shopsitter
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3210
```

`.env.local` values:

| Name | What it is |
| --- | --- |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Your own PayPal sandbox app |
| `ANTHROPIC_API_KEY` | Key for the vision and language models |
| `VISION_MODEL`, `ASK_MODEL` | Model ids (defaults are in `.env.example`) |
| `OWNER_PASSCODE` | Passcode for your stand's dashboard |
| `DEMO_PASSCODE` | Passcode for the demo stand (`demo`) |
| `STAND_TOKEN` | 6-digit code the stand screen asks for |
| `SESSION_SECRET` | A long random string |
| `REPO` | `file` (local `.data/` folder) or `postgres` (also set `DATABASE_URL`) |

Then:

```bash
npx tsx --env-file=.env.local scripts/seed.ts   # example data for the demo stand
npm test                                        # unit tests
```

Open `/stand` on a phone or laptop with a camera, enter the stand code, and point it at a shelf. Phone cameras need
https: deploy it, or run `npx next dev --experimental-https`. Add your products at `/owner/products`.

## Licence

MIT. See [LICENSE](LICENSE).
