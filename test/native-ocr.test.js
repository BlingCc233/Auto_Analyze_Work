import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { recognizeNativeImage } from "../server/native-ocr.mjs";
import { timeFromOcrEvidence } from "../src/domain.js";

test("PP-OCRv6 bridge reads a patrol watermark from raw image bytes", {
  timeout: 30_000
}, async () => {
  const buffer = await readFile(new URL(
    "../daily/260726/微信图片_20260726221659_116_43.jpg",
    import.meta.url
  ));
  const result = await recognizeNativeImage({
    mimeType: "image/jpeg",
    dataBase64: buffer.toString("base64")
  }, {
    root: fileURLToPath(new URL("..", import.meta.url))
  });
  assert.equal(result.ok, true);
  assert.equal(result.engine, "ppocrv6-tiny-wasm");
  assert.match(result.ocrText, /08:57/);
  assert.match(result.ocrText, /S1113宁贵高速/);
});

test("PP-OCRv6 time crop restores the 11:41 watermark", {
  timeout: 30_000
}, async () => {
  const buffer = await readFile(new URL(
    "../daily/260726/微信图片_20260726221709_122_43.jpg",
    import.meta.url
  ));
  const result = await recognizeNativeImage({
    mimeType: "image/jpeg",
    dataBase64: buffer.toString("base64")
  }, {
    root: fileURLToPath(new URL("..", import.meta.url))
  });
  assert.equal(
    timeFromOcrEvidence(result.ocrText, result.timeOcrText),
    "11:41"
  );
});
