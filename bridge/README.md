# Camera bridge

Turns ordinary cameras into Shopsitter shelf cameras: a CCTV or IP camera, a USB webcam, or a
recorded video. It runs on a computer in the shop, watches one or more shelf rectangles in each
camera's picture with the same change detector as the stand screen (`lib/frame-diff.ts`), and when
a shelf changes and goes still it sends a before and an after photo of that rectangle to
`/api/stand/change`, exactly as a phone on the stand would.

```
npx tsx bridge/index.ts shelf.json            # or: npm run bridge -- shelf.json
npx tsx bridge/index.ts shelf.json --dry-run stills   # everything except sending; saves the stills
npx tsx bridge/index.ts shelf.json --once             # stop after the first read
```

Needs Node 20+ and `ffmpeg` on PATH (macOS `brew install ffmpeg`, Debian/Ubuntu `apt install ffmpeg`).

## Config

See `config.example.json`. Fields:

- `server`: your Shopsitter address, for example `https://shop.example` or `http://localhost:3210`.
- `token`: the stand's 6-digit code (live store) or a trial's stand key. Leave it out of the file and
  set `SHOPSITTER_TOKEN` instead so it is never written to disk:
  `SHOPSITTER_TOKEN=123456 npx tsx bridge/index.ts shelf.json`.
- `cameras[]`: `name`, `source`, `fps` (frames looked at per second, default 2), `loop` (video files
  only, default false), and `shelves[]`.
- `shelves[]`: `zoneId` (the shelf id, or `null` for a store without shelves) and `rect`, the shelf's
  rectangle as fractions of the picture: `{ "x": 0, "y": 0, "w": 1, "h": 1 }` is the whole picture,
  `{ "x": 0, "y": 0, "w": 1, "h": 0.5 }` the top half.

Where to find them: on the owner's Store page, press **Camera link** on a shelf and choose
**CCTV or webcam**. It shows a ready config for that shelf (with the trial's key for a trial, or a
placeholder for the live store's code) and the command to run.

## Sources

`source` is anything ffmpeg can read:

| Camera | `source` |
|---|---|
| CCTV / IP camera (RTSP) | `rtsp://user:password@192.168.1.20:554/stream1` (read over TCP) |
| IP camera MJPEG stream | `http://192.168.1.21/video.mjpg` |
| USB webcam on macOS | `avfoundation:0` (list them: `ffmpeg -f avfoundation -list_devices true -i ""`) |
| USB webcam on Linux | `/dev/video0` (list them: `v4l2-ctl --list-devices`) |
| Recorded video | `/path/to/shelf.mp4`, with `"loop": true` to play it again and again |

A live camera that drops is reconnected after 3 seconds. A video without `loop` stops the bridge at its end.
Snapshot-only URLs (one JPEG per request) are not supported: use the camera's RTSP or MJPEG stream.

## How it works

One ffmpeg per camera. For each shelf rectangle it crops the picture and writes two streams on
their own pipes: a 96 x 72 grayscale stream for the detector and JPEG stills of the rectangle, at
most 1024 pixels wide. The bridge keeps the last read still as the "before"; when the detector fires
it sends that and the newest still. Sends are retried with backoff (`lib/client-retry.ts`), wait as
asked on "too many requests", and the bridge stops with a message if the code or key is refused.
Each read prints one line: the shelf and what the server made of it (bill lines, "nothing taken",
"added to a basket"). The token is never printed.

## Privacy

Only the shelf rectangles leave the building. The full picture, which may show people, never
leaves the computer the bridge runs on: draw each `rect` tight around the shelf.

## Limits

- Needs ffmpeg.
- Night and infrared footage is gray and grainy, so it reads worse than daylight colour.
- There is no hand detector here (the stand screen has one): the bridge waits for the shelf to go
  still before reading, and reads anyway after 8 seconds of unbroken movement.
- No close-up photos are sent; draw the rectangle around the shelf instead.
