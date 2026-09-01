import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { recognizePpOcrWasm } from "../server/ppocrv6-wasm.mjs";
import { formatPpOcrResult } from "../server/ppocrv6-runtime.mjs";

test("prefers the detected watermark clock over an incorrect direct crop", () => {
  const result = formatPpOcrResult({
    engine: "ppocrv6-tiny-wasm",
    width: 2275,
    height: 1280,
    confidence: 0.95,
    lines: [
      { text: "12026-08-14", score: 0.98, x: 209, y: 813 },
      { text: "11:33", score: 0.99, x: 7, y: 824 },
      { text: "星期五小雨18C", score: 0.97, x: 190, y: 867 }
    ],
    timeLines: [{ text: "13:12", score: 0.91, x: 0, y: 0 }]
  });

  assert.equal(result.timeOcrText, "11:33");
  assert.match(result.ocrText, /^11:33\n12026-08-14/);
});

test("recognizes a watermark date when OCR drops the year-month separator", () => {
  const result = formatPpOcrResult({
    engine: "ppocrv6-tiny-wasm",
    width: 2275,
    height: 1280,
    confidence: 0.95,
    lines: [
      { text: "1202608-09", score: 0.93, x: 209, y: 813 },
      { text: "11:44", score: 0.99, x: 7, y: 824 },
      { text: "星期日晴26C", score: 0.97, x: 190, y: 867 }
    ],
    timeLines: [{ text: "08:09", score: 0.91, x: 0, y: 0 }]
  });

  assert.equal(result.timeOcrText, "11:44");
  assert.match(result.ocrText, /^11:44\n1202608-09/);
});

test("repairs a fused date separator and E used as a clock colon", () => {
  const result = formatPpOcrResult({
    engine: "ppocrv6-tiny-wasm",
    width: 2275,
    height: 1280,
    confidence: 0.9,
    lines: [
      { text: "2026-07126", score: 0.93, x: 200, y: 810 },
      { text: "09E20", score: 0.91, x: 4, y: 825 }
    ],
    timeLines: [{ text: "20:26", score: 0.85, x: 0, y: 0 }]
  });
  assert.equal(result.timeOcrText, "09:20");
});

test("uses the focused clock when a malformed date cannot define a watermark region", () => {
  const result = formatPpOcrResult({
    engine: "ppocrv6-tiny-wasm",
    width: 2275,
    height: 1280,
    confidence: 0.9,
    lines: [
      { text: "[20208-37", score: 0.92, x: 200, y: 810 },
      { text: "海东市 G0611张汶高速", score: 0.91, x: 200, y: 905 }
    ],
    timeLines: [{ text: "9.40", score: 0.86, x: 0, y: 780 }]
  });
  assert.equal(result.timeOcrText, "09:40");
});

test("PP-OCRv6 WASM reads a historical patrol watermark without native Paddle", {
  timeout: 30_000
}, async () => {
  const image = fs.readFileSync(new URL(
    "../daily/260726/微信图片_20260726221659_116_43.jpg",
    import.meta.url
  ));
  const result = await recognizePpOcrWasm(image, "image/jpeg", {
    root: fileURLToPath(new URL("..", import.meta.url))
  });
  assert.equal(result.engine, "ppocrv6-tiny-wasm");
  assert.match(result.lines.map((line) => line.text).join("\n"), /08[:：.]57/);
  assert.match(result.lines.map((line) => line.text).join("\n"), /2026-07-26/);
});
