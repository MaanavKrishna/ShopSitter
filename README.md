# Shopsitter

**Walk-out checkout for small shops, with phones for cameras.** Shopsitter minds an unattended shop: phone cameras
read the shelves, a vision model works out what was taken, the shopper sees the bill and pays with PayPal, and the
owner sees what sold, what was paid and what is still unmatched.

Live: https://shopsitter.vercel.app (PayPal sandbox: no real money moves)

Built for the PayPal AI Hackathon 2026.

## The problem

Honesty boxes, farm shops, office markets and hotel pantries run on a cash tin and trust. Fewer people carry cash,
the owner never learns what actually sold, and a self-checkout kiosk or a sensor-fitted store costs more than the
shop earns. Shopsitter needs a phone per shelf and a PayPal account.

## Try it

| What | Where | Notes |
| --- | --- | --- |
| Run your own shop | [/demo](https://shopsitter.vercel.app/demo), "Start my stand" | A private trial: add your own products with photos, point a phone or laptop camera at them, take one, pay. No account. Deleted after 24 hours. |
| Watch it read sample shelves | [/demo](https://shopsitter.vercel.app/demo), lower on the page | Seven sample shelf pictures read by the real vision model |
| An example week | [/owner/login](https://shopsitter.vercel.app/owner/login), passcode `demo` | Example data, read-only |
| How it works | [/how-it-works](https://shopsitter.vercel.app/how-it-works) | The flow, step by step |
| What it stores | [/trust](https://shopsitter.vercel.app/trust) | Rules the shop keeps, and its limits |

Payments use the PayPal sandbox. To pay a bill, use a sandbox buyer account from your own PayPal developer dashboard.

## How it works

**Shelves.** A shop is made of shelves grouped by aisle. Each shelf has its own camera (a phone opened from that
shelf's link) and its own list of products, so the vision model only ever chooses among the few products on that
shelf. The phone notices on its own when the shelf changed and went still, then sends a before photo, an after
photo and a close-up of the changed area.

**Two ways to shop.** The owner picks one, or lets the shopper choose:

1. **Pay after.** Take what you like. The shelf's screen shows the bill and a PayPal QR code. Scan, fix the bill if
   the camera got it wrong, pay.
2. **Hold first.** Scan the QR at the door. PayPal holds an amount sized from what shoppers at this shop really
   spend (it covers nine in ten baskets of the last 30 days, within the owner's minimum and maximum). Your basket
   fills on your phone as the shelves are read. Tap Done, or just leave: you are charged for what you took and the
   rest of the hold is released.

**Several shoppers at once.** Nobody is identified. If one shopper is checked in, shelf changes go to their
basket. If several are, a change shows on their phones as "Shelf 3 saw 1 x Honey leave. Yours?" and the first to
claim it gets it.

**Putting things back.** A returned item comes off the bill, or off the visit it belonged to.

**Unmatched, never accused.** A visit with nothing paid after ten minutes is "unmatched". It can still be paid for
a day, and the owner can mark it settled another way. The owner sees unmatched value per shelf.

**The owner's side.** Money taken through PayPal, a ledger of where the shelf value went, visits with before and
after photos, refunds, shelf levels and restocking, a product editor with reference photos, the store map with a
QR per shelf and for the door, charts they can rearrange, and a question box ("what sold best this week?").

## Cameras

A shelf camera can be a phone, a USB webcam, or a CCTV / IP camera you already own.

- **Phone or browser webcam:** open the shelf's camera link from the Store page. With several webcams on one
  computer, pick one under the camera picture; each shelf remembers its choice.
- **CCTV, IP cameras, or a recorded video:** run the camera bridge, `npx tsx bridge/index.ts shelf.json` (needs
  ffmpeg). The Store page gives a ready `shelf.json` for each shelf; set `source` (an `rtsp://` stream, an MJPEG
  address, a device, or a file) and draw `rect` around the shelf. One camera can watch several shelves.
- The bridge runs the same change detector as the phone (`lib/frame-diff.ts`) and posts to the same route.
- **Privacy:** only each shelf's rectangle is sent, never the full picture.
- Details and limits: [bridge/README.md](bridge/README.md). Proven with a video file; no real CCTV stream has been
  tried yet.

## Where PayPal is used

- **Orders v2** (`@paypal/paypal-server-sdk`): every bill becomes an itemised order whose amount the server
  computed from the catalogue, in cents.
- **Capture**, checked against the order the server created for that bill.
- **Authorize, capture and void** for holds: the server authorises the hold, captures only the basket total (never
  more than was held) and releases the rest.
- **Refunds** from the owner's dashboard.
- **Idempotency keys and timeouts** on every write.
- **JavaScript SDK v6** (`@paypal/react-paypal-js`): the pay and hold buttons on the shopper's phone.
- **Agent Toolkit** (`@paypal/agent-toolkit`, read-only): lets the owner's question box look up the shop's own
  PayPal orders.

## Where AI is used

- **Reading the shelf.** A vision model compares the before and after photos, with each product's reference photo,
  a close-up of the changed area and extra camera angles when present, and returns product ids and counts. Its
  output is sanitised: only that shelf's products, whole numbers, bounded quantities. It never sets a price.
- **Ask your shop.** A language model answers the owner's questions by calling tools that return server-computed
  facts. An answer containing an amount that is not in the records is rejected.
- **On the device.** A hand and person detector runs in the camera phone's browser. It holds the shelf read while a
  hand is in view and counts how many people stopped by. Nothing about a person is stored or sent.

Measured accuracy and its limits: [docs/accuracy.md](docs/accuracy.md) (15 of 15 reads correct on seven composed
sample pairs; composed pictures are easier than real photos).

## Documents

| Document | What is in it |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | System overview, request flows, data model, visit states, where things live |
| [docs/security.md](docs/security.md) | Who can do what, every token, money rules, privacy, known limits |
| [docs/accuracy.md](docs/accuracy.md) | How the shelf reader was measured and what the numbers do not show |
| [bridge/README.md](bridge/README.md) | Using CCTV, IP cameras, webcams or recorded video as shelf cameras |
| [DESIGN.md](DESIGN.md) | The design system: colour, type, materials, motion |

## Stack

Next.js 16, React 19, TypeScript, Vercel AI SDK, PayPal Server SDK, PayPal JS SDK v6, PayPal Agent Toolkit,
AG Studio (the owner's charts, on its trial licence, which prints a notice in the browser console), Astryx
components, Motion, MediaPipe (on-device detection), ffmpeg (camera bridge), Neon Postgres, Vitest.

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
| `OWNER_PASSCODE` | Passcode for your shop's dashboard |
| `DEMO_PASSCODE` | Passcode for the demo shop (`demo`) |
| `STAND_TOKEN` | 6-digit code your shelf cameras ask for |
| `SESSION_SECRET` | A long random string; signs cookies, camera keys and door codes |
| `REPO` | `file` (local `.data/` folder) or `postgres` (also set `DATABASE_URL`) |

Then:

```bash
npx tsx --env-file=.env.local scripts/seed.ts demo --examples   # example week for the demo shop
npm test                                                        # unit tests
```

Sign in at `/owner/login`, add products at `/owner/products`, add shelves and print the QR codes at `/owner/store`,
and open each shelf's camera link on a phone. Phone cameras need https: deploy it, or run
`npx next dev --experimental-https`.

## Limits

A prototype. Phones as cameras suit a small shop of a few aisles, not a supermarket: products on a shelf should
look different from each other, the light should be reasonable, and several shoppers at once rely on people
claiming their own items. Rate limits are counted per server instance. PayPal runs in sandbox mode only. The full
list is in [docs/security.md](docs/security.md).

## Licence

MIT. See [LICENSE](LICENSE).
