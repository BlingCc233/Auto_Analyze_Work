import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { recognizePpOcrWasm } from "../server/ppocrv6-wasm.mjs";

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
