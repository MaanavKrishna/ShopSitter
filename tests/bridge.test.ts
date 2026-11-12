import { describe, expect, it } from "vitest";
import {
  BridgeConfig,
  answerLine,
  changeForm,
  cropFilter,
  ffmpegArgs,
  inputArgs,
  jpegSize,
  JpegSplitter,
  parseConfig,
  shelfConfigText,
  standHeaders,
} from "../bridge/core";
import { ShelfWatcher } from "../bridge/watcher";
import { SAMPLE_HEIGHT, SAMPLE_WIDTH } from "../lib/frame-diff";

const good = {
  server: "https://shop.example",
  token: "123456",
  cameras: [{ name: "Front", source: "rtsp://cam/stream", shelves: [{ zoneId: "z1", rect: { x: 0, y: 0, w: 1, h: 1 } }] }],
};

describe("parseConfig", () => {
  it("fills defaults and keeps the shelves", () => {
    const c = parseConfig(good, {});
    expect(c.cameras[0].fps).toBe(2);
    expect(c.cameras[0].loop).toBe(false);
    expect(c.cameras[0].shelves[0].zoneId).toBe("z1");
    expect(c.server).toBe("https://shop.example");
  });

  it("takes the token from SHOPSITTER_TOKEN when the file has none", () => {
    const { token: _t, ...rest } = good;
    void _t;
    expect(parseConfig(rest, { SHOPSITTER_TOKEN: " 654321 " }).token).toBe("654321");
  });

  it("refuses a missing token, a rectangle outside the frame, and a bad server", () => {
    const { token: _t, ...rest } = good;
    void _t;
    expect(() => parseConfig(rest, {})).toThrow(/token/);
    const outside = structuredClone(good);
    outside.cameras[0].shelves[0].rect = { x: 0.5, y: 0, w: 0.6, h: 1 };
    expect(() => parseConfig(outside, {})).toThrow(/inside the frame/);
    expect(() => parseConfig({ ...good, server: "not a url" }, {})).toThrow();
  });

  it("drops a trailing slash from the server", () => {
    expect(parseConfig({ ...good, server: "http://localhost:3210/" }, {}).server).toBe("http://localhost:3210");
  });
});

describe("cropFilter", () => {
  it("crops by fractions of the frame to even sizes", () => {
    expect(cropFilter({ x: 0, y: 0, w: 1, h: 0.5 })).toBe(
      "crop=trunc(iw*1/2)*2:trunc(ih*0.5/2)*2:trunc(iw*0):trunc(ih*0)",
    );
  });
});

describe("inputArgs", () => {
  it("knows rtsp, http, devices and files", () => {
    expect(inputArgs({ source: "rtsp://cam/1", loop: false })).toEqual(["-rtsp_transport", "tcp", "-i", "rtsp://cam/1"]);
    expect(inputArgs({ source: "http://cam/video.mjpg", loop: false })).toEqual(["-i", "http://cam/video.mjpg"]);
    expect(inputArgs({ source: "avfoundation:0", loop: false })).toEqual(["-f", "avfoundation", "-framerate", "30", "-i", "0"]);
    expect(inputArgs({ source: "/dev/video0", loop: false })).toEqual(["-f", "v4l2", "-i", "/dev/video0"]);
    expect(inputArgs({ source: "shelf.mp4", loop: false })).toEqual(["-re", "-i", "shelf.mp4"]);
    expect(inputArgs({ source: "shelf.mp4", loop: true })).toEqual(["-re", "-stream_loop", "-1", "-i", "shelf.mp4"]);
  });
});

describe("ffmpegArgs", () => {
  it("writes a small gray stream and JPEG stills for each shelf on its own pipe", () => {
    const c = parseConfig(
      {
        ...good,
        cameras: [{ ...good.cameras[0], shelves: [good.cameras[0].shelves[0], { zoneId: null, rect: { x: 0, y: 0.5, w: 1, h: 0.5 } }] }],
      },
      {},
    );
    const args = ffmpegArgs(c.cameras[0]).join(" ");
    expect(args).toContain(`scale=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT},format=gray[g0]`);
    expect(args).toContain("-map [g0] -f rawvideo pipe:3");
    expect(args).toContain("-map [j0] -f image2pipe -c:v mjpeg");
    expect(args).toContain("pipe:4");
    expect(args).toContain("pipe:5");
    expect(args).toContain("pipe:6");
    expect(args).toContain("fps=2");
    expect(args).toContain("min(1024\\,iw)");
  });
});

// A minimal JPEG: SOI, an SOF0 segment saying 300 x 200, EOI.
const tinyJpeg = () =>
  Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 200, 1, 44, 1, 1, 0x11, 0, 0xff, 0xd9]);

describe("JPEG stream", () => {
  it("splits a byte stream into whole JPEGs, across chunk boundaries", () => {
    const a = tinyJpeg();
    const both = new Uint8Array([...a, ...a]);
    const s = new JpegSplitter();
    const out = [...s.push(both.subarray(0, 5)), ...s.push(both.subarray(5, 25)), ...s.push(both.subarray(25))];
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(a);
  });

  it("reads the size of a JPEG", () => {
    expect(jpegSize(tinyJpeg())).toEqual({ width: 300, height: 200 });
    expect(jpegSize(Uint8Array.from([1, 2, 3]))).toBeNull();
  });
});

describe("requests", () => {
  it("names the shelf only when it has one", () => {
    expect(standHeaders("k", "z1")).toEqual({ "x-stand-token": "k", "x-stand-zone": "z1" });
    expect(standHeaders("k", null)).toEqual({ "x-stand-token": "k" });
  });

  it("builds the same form the stand screen sends", async () => {
    const form = changeForm({ before: tinyJpeg(), after: tinyJpeg(), changeStartedAt: 10, settledAt: 20 });
    expect(form.get("changeStartedAt")).toBe("10");
    expect(form.get("settledAt")).toBe("20");
    const before = form.get("before") as File;
    expect(before.type).toBe("image/jpeg");
    expect(before.size).toBe(tinyJpeg().length);
    expect(form.get("beforeZoom")).toBeNull();
  });

  it("says what the server made of a read", () => {
    const line = { sku: "honey", name: "Honey", qty: 1, unitCents: 700, lineCents: 700 };
    expect(answerLine({ visit: { status: "open" }, bill: { lines: [line], totalCents: 700 } })).toBe("1 x Honey ($7.00)");
    expect(answerLine({ visit: null, bill: null, assigned: "session" })).toBe("added to a basket");
    expect(answerLine({ visit: null, bill: null, assigned: "pending" })).toBe("waiting for a shopper to claim it");
    expect(answerLine({ visit: null, bill: null, returned: { id: "v" } })).toBe("put back on the shelf");
    expect(answerLine({ visit: null, bill: null })).toBe("nothing taken");
    expect(answerLine(null)).toBe("nothing taken");
  });
});

describe("ShelfWatcher", () => {
  const frame = (v: number) => new Uint8Array(SAMPLE_WIDTH * SAMPLE_HEIGHT).fill(v);
  const withSquare = () => {
    const f = frame(100);
    for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) f[y * SAMPLE_WIDTH + x] = 220;
    return f;
  };
  const jpg = (n: number) => Uint8Array.from([n]);

  it("fires once when the shelf changes and goes still, with the old and new stills", () => {
    const w = new ShelfWatcher();
    const fires = [];
    let t = 0;
    for (let i = 0; i < 4; i++, t += 500) expect(w.push(frame(100), jpg(1), t)).toBeNull();
    for (let i = 0; i < 10; i++, t += 500) {
      const f = w.push(withSquare(), jpg(2), t);
      if (f) fires.push(f);
    }
    expect(fires).toHaveLength(1);
    expect(fires[0].before).toEqual(jpg(1));
    expect(fires[0].after).toEqual(jpg(2));
    expect(fires[0].settledAt).toBeGreaterThan(fires[0].changeStartedAt);
  });

  it("stays quiet on a still, unchanged shelf with a uniform brightness shift", () => {
    const w = new ShelfWatcher();
    let t = 0;
    for (let i = 0; i < 20; i++, t += 500) expect(w.push(frame(i < 10 ? 100 : 130), jpg(1), t)).toBeNull();
  });
});

describe("shelfConfigText", () => {
  it("is a config the bridge accepts, for that shelf and the whole picture", () => {
    const text = shelfConfigText({ server: "http://localhost:3210", zoneId: "zabc", shelfName: "Front", token: "<your 6-digit stand code>" });
    const c = parseConfig(JSON.parse(text), {});
    expect(c.cameras[0].shelves).toEqual([{ zoneId: "zabc", rect: { x: 0, y: 0, w: 1, h: 1 } }]);
    expect(c.token).toBe("<your 6-digit stand code>");
  });
});

export type { BridgeConfig };
