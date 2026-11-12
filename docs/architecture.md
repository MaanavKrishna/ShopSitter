# Architecture

Shopsitter is one Next.js 16 app (App Router, React 19, TypeScript) deployed on Vercel. Browsers do the camera
work, the server owns every price and every PayPal call, and storage sits behind one interface with two back ends.

## Overview

```mermaid
flowchart LR
    subgraph Browsers
        Stand["Shelf camera page /stand<br/>frame-diff, hand and person detector"]
        Extra["Extra cameras /stand/camera/2 to 4"]
        Bridge["CCTV bridge (bridge/)<br/>ffmpeg, same frame-diff"]
        Shopper["Shopper phone<br/>/pay, /enter, /basket"]
        Owner["Owner dashboard /owner"]
        Sim["Store simulator /demo/store"]
    end
    subgraph Server["Next.js route handlers and lib/"]
        StandApi["/api/stand/* to lib/stand.ts"]
        Visits["/api/visits/* to lib/checkout.ts"]
        Session["/api/session/* to lib/sessions.ts"]
        OwnerApi["/api/owner/* to lib/owner.ts, store.ts, ask.ts"]
        Repo["lib/repo.ts: file or Postgres"]
    end
    VM["Vision model"]
    LM["Language model"]
    PP["PayPal sandbox"]
    Stand --> StandApi
    Extra --> StandApi
    Bridge --> StandApi
    Sim --> StandApi
    Sim --> Session
    Shopper --> Visits
    Shopper --> Session
    Owner --> OwnerApi
    StandApi --> VM
    OwnerApi --> LM
    Visits --> PP
    Session --> PP
    OwnerApi --> PP
    StandApi --> Repo
    Visits --> Repo
    Session --> Repo
    OwnerApi --> Repo
```

Route handlers are thin: they validate input (zod), identify the caller (owner cookie, stand code or key, session
id, door token) and rate-limit, then call one function in `lib/` with its dependencies passed in (storage, PayPal
gateway, model, clock). `lib/` is unit-tested with a fake PayPal gateway and the file store; one storage contract
suite runs against the file back end always and against Postgres when `DATABASE_URL` is set.

## Shops

Every row and stored key belongs to one shop: `live` (the owner's stand: passcode plus a 6-digit stand code),
`demo` (public passcode, read-only catalogue, resets itself hourly) or a trial `t-` plus ten base32 characters
(anyone can start one from /demo; it is deleted after 24 hours). Stored keys start with the shop id and a dash;
`lib/shops.ts` decides ownership from that prefix.

## Zones (shelves)

A store record holds zones: each has an id (`z` plus six base32 characters), a name, an aisle and an order. Live
stores may have up to 24, trial stores 6. A product has a `zoneId` (or null for "any shelf"). A camera opened from a
shelf's link sends `x-stand-zone`; `resolveStand` accepts only one of that store's own zones, and the vision model is
shown only `productsForZone` for it. The owner's Store page shows taken, paid and unmatched value per shelf
(`byZone` in `lib/store.ts`).

## Cameras

- **Main camera** (`/stand`): one per shelf. It runs the change detector, the hand and person detector, and shows
  the bill and pay QR.
- **Extra cameras** (`/stand/camera/2` to `/stand/camera/4`): the same shelf from other sides. Each posts its newest
  still to `POST /api/stand/angle`; when the main camera reports a change, the newest still of each extra camera
  active in the last minute is paired with the one used at the last read and sent to the vision model too
  (`lib/angles.ts`).
- **Camera bridge** (`bridge/`, `npm run bridge -- shelf.json`): runs on a computer in the shop. One ffmpeg process
  per camera crops each shelf rectangle, `lib/frame-diff.ts` decides when to read, and it posts before and after
  stills to `/api/stand/change` with the stand code or trial key and the shelf's zone. Only the rectangles are sent.
  See [bridge/README.md](../bridge/README.md).

## Request flows

### A shelf change (pay after)
1. The stand page compares small grayscale frames (`lib/frame-diff.ts`) and waits for the shelf to settle; the hand
   detector holds the read while a hand is in view.
2. It posts before and after stills (and close-ups) to `POST /api/stand/change` with its stand code or key.
3. `resolveStand` identifies the shop (and zone, from `x-stand-zone`). Trials have a daily read allowance.
4. `handleShelfChange` sweeps stale visits, then asks the vision model what changed, showing it only the products
   for that zone, their reference photos and any extra-camera pairs. Output is sanitised to catalogue ids and whole
   quantities; negative quantities are items put back.
5. The change joins the open visit if it started within 60 s of the last one (put-backs always join), otherwise the
   old visit closes as unmatched and a new one opens. A failed read opens a visit marked `needsManual`.
6. The server prices the bill from the catalogue and the stand shows it with a QR code for `/pay/<visitId>`.
7. The shopper may correct the lines (`PUT /api/visits/[id]/lines`), then `POST …/order` creates a PayPal order for
   the server's total and `POST …/capture` captures it, only for that order and only if the total still matches.
   Create and capture carry a PayPal-Request-Id.

### A session with a hold
1. The owner prints the door QR (`GET /api/owner/door-link`): `/enter#store=<signed door token>`. The token carries
   the store's door number; `POST /api/owner/door-link/rotate` raises it, which cancels every code printed before.
2. The phone first asks `POST /api/session/peek` how this store takes payment (so "shopper chooses" can offer the
   choice), then posts the token to `POST /api/session`; the server creates a visit with `session` set. Its
   id (20 base32 characters) is the shopper's only credential, used in `/basket/<id>`.
3. If the shop's pay mode is "hold" (or "choice" and the shopper asks), the server makes a PayPal order with intent
   AUTHORIZE for the suggested hold; the phone approves it and `POST /api/session/[id]/hold` authorizes it.
4. Shelf changes go onto the session when exactly one checked-in shopper may receive items; otherwise they wait as
   pending changes that a shopper claims (`POST …/claim`, first claim wins via a conditional update).
5. `POST …/done` captures the basket from the authorization (never more than was held), moves what did not fit to an
   ordinary visit paid on `/pay`, or voids the hold when nothing was taken. A session idle for 10 minutes with money
   held is closed the same way the next time the shop is touched. While a session is open or money is held, the
   pay-page routes refuse that visit with `use_basket`.

### A trial store
1. `POST /api/trial` creates a trial record and signs the browser in with a cookie that lasts as long as the trial.
2. The owner adds products (or the starter set, `POST /api/trial/starter`) and opens the stand from
   `GET /api/owner/stand-link`: `/stand#key=<signed stand key>`. The key rides in the URL fragment, then in the
   `x-stand-token` header.
3. Everything else works as on the live stand, with smaller limits (products, zones, reads, photo sizes).
4. A trial past its expiry is deleted the next time it is touched; each new trial start also deletes up to three
   expired ones. `DELETE /api/trial` ends it at once. Ending a trial first tries to void holds still authorized on it (up to 20), then deletes it.

### The store simulator (/demo/store)
`components/simulator/StoreSimulator.tsx` drives the real routes from one browser, with the script and wording in
`lib/simulator.ts`:
1. It reuses this browser's trial or starts one (`POST /api/trial`), saves two shelves (`PUT /api/owner/store/zones`)
   and places the six starter products on them (`PUT /api/owner/products`).
2. It fetches the door link (`GET /api/owner/door-link`) and checks one shopper in (`POST /api/session`).
3. Each step posts a pair of sample shelf pictures from `public/samples/` to `POST /api/stand/change` with the trial's
   stand key and the shelf's zone, so the real vision model reads them and the change lands in the basket.
4. It shows the basket (`GET /api/session/[id]`) and the owner's figures (`GET /api/owner/visits`) side by side.
   Done calls `POST /api/session/[id]/done`; "Close the sample store" ends the trial.

## Data model

| Thing | Stored as | Key fields |
| --- | --- | --- |
| Product | row `(shop, sku)` | name, description, priceCents, stock, refImageUrl, archived, zoneId (null = any zone) |
| Visit | row by id, whole visit as JSON | shop, status, detected lines, paid lines, paidCents, refundedCents, paypalOrderId, orderCents, captureId, before/after photo keys, confidence, needsManual, openedAt, lastSettledAt, closedAt |
| Visit, optional parts | same JSON | zoneIds; session {checkedInAt, closedAt, restId}; holdOrder {orderId, cents}; hold {orderId, authorizationId, cents, status}; pending {zoneId, claimedBy}; money [{at, kind, cents, ref}] |
| Store record | key `<shop>-store.json` | zones [{id, name, aisle, order}], settings {payMode after/hold/choice, holdOverrideCents, holdFloorCents, holdCapCents} |
| Trial record | key `<trial>-trial.json` | createdAt, expiresAt |
| Footfall | key `<shop>-footfall-YYYY-MM-DD.json` | count |
| Photos | key `<shop>-<time>-before.jpg` etc. | bytes; served only to the signed-in owner of that shop |

## Scaling notes

- Zones keep the vision model's choice small: a camera is only ever shown its own shelf's products, so a store can
  hold many products while each read stays a choice among a few.
- What slows down first as data grows: the owner overview and the hold suggestion read every visit of the shop; each
  open basket polls every two seconds; shelf photos are kept as base64 in Postgres. All three are fine for a small
  shop and would need paging, a push channel and object storage beyond that.
- Several shoppers at once are handled without identifying anyone: a shelf change that cannot be tied to one
  checked-in shopper waits as a pending change until a shopper claims it on their phone.

## Visit states

| Status | Meaning | Reached from |
| --- | --- | --- |
| open | bill can still change and be paid | new change, check-in, pending change |
| paid | paid for what the camera saw | open, by capture |
| paid_adjusted | paid for a corrected bill | open, by capture |
| paid_late | paid after it went unmatched (within 24 h) | unmatched, by capture |
| unmatched | no payment 10 min after the last change, a new visit started, or the shopper removed every line the camera saw (also marked adjusted) | open |
| empty | nothing owed because the camera saw nothing left: all put back, a pending change that was claimed, a session that took nothing | open; unmatched (put-backs) |
| settled_other | the owner marked it settled another way | open or unmatched |

## Where things live

| Concern | Files |
| --- | --- |
| Shelf change and visit rules | `lib/stand.ts`, `lib/visits.ts`, `lib/frame-diff.ts`, `lib/angles.ts` |
| Vision model | `lib/vision.ts` |
| Pay after | `lib/checkout.ts`, `lib/paypal.ts`, `app/api/visits/**`, `components/PayPanel.tsx` |
| Sessions and holds | `lib/sessions.ts`, `lib/hold.ts`, `lib/door-token.ts`, `app/api/session/**`, `components/basket/` |
| Store record and zones | `lib/store.ts`, `app/api/owner/store/**` |
| Owner dashboard | `lib/owner.ts`, `lib/owner-view.ts`, `lib/catalogue.ts`, `components/owner/` |
| Ask your shop | `lib/ask.ts`, `lib/ask-model.ts`, `lib/paypal-read.ts` |
| Access and limits | `lib/auth.ts`, `lib/stand-access.ts`, `lib/stand-key.ts`, `lib/owner-http.ts`, `lib/trials.ts` |
| Storage | `lib/repo.ts`, `lib/repo-file.ts`, `lib/repo-postgres.ts` |
| Store simulator | `lib/simulator.ts`, `components/simulator/`, `app/demo/store/` |
| Extra cameras | `lib/angles.ts`, `app/api/stand/angle/`, `app/stand/camera/[angle]/` |
| Owner charts (AG Studio) | `components/owner/SalesStudio.tsx`, `lib/studio-report.ts` |
| Camera bridge (CCTV, webcams, video files) | `bridge/` : one ffmpeg process per camera crops each shelf rectangle, the same detector as the browser decides when to read, and it posts to `/api/stand/change` |

## Operations

- Environment: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `VISION_MODEL`, `ASK_MODEL`,
  `OWNER_PASSCODE`, `DEMO_PASSCODE`, `STAND_TOKEN`, `SESSION_SECRET` (signs owner cookies, trial stand keys and door
  tokens), `REPO` (`file` or `postgres`), `DATABASE_URL`.
- Storage: `REPO=file` keeps JSON files and photos in `.data/` (development, one process). `REPO=postgres` creates
  its three tables on first use; photos are stored in the database as base64.
- Timeouts: vision model 25 s, PayPal 15 s, PayPal read-only lookups 8 s.
- Rate limits are counted in memory per server instance, so on serverless hosting the real ceilings are higher and
  reset on a cold start. PayPal idempotency keys, not the limiters, prevent double charges.
- Nothing runs on a schedule. Stale visits, idle sessions, expired trials and the demo reset are all handled when a
  request next touches that shop.
- Shelf photos of the real stand are kept until deleted by hand.
