import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_THRESHOLDS, gateResult } from "../scripts/benchmark-history.mjs";
import { evaluateHoldout } from "../scripts/benchmark-holdout.mjs";

const groundTruth = JSON.parse(
  fs.readFileSync(new URL("../data/history-corpus/ground-truth.json", import.meta.url))
);
const ocrEntries = JSON.parse(
  fs.readFileSync(new URL("../data/history-corpus/vision-ocr.json", import.meta.url))
);

test("July 14 holdout stays separate from the trained history knowledge", () => {
  assert.equal(groundTruth.length, 14);
  assert.equal(ocrEntries.length, 14);
  assert.deepEqual(
    [...new Set(groundTruth.map((item) => item.recordId))],
    ["01568", "01569", "01570"]
  );
  assert.ok(
    ocrEntries.every((item) => item.file.startsWith("data/history-corpus/"))
  );
});

test("July 14 holdout clears every 95 percent recognition gate", () => {
  const result = evaluateHoldout();
  assert.equal(result.samples, 14);
  assert.deepEqual(gateResult(result, DEFAULT_THRESHOLDS), []);
});
