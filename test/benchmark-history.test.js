import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DEFAULT_THRESHOLDS,
  enrichGroundTruth,
  evaluateHistory,
  gateResult
} from "../scripts/benchmark-history.mjs";

const groundTruth = JSON.parse(fs.readFileSync(new URL("../data/history/ground-truth.json", import.meta.url)));

test("history ground truth contains complete benchmark labels", () => {
  assert.equal(groundTruth.length, 66);
  for (const sample of groundTruth) {
    assert.ok("groupId" in sample);
    assert.ok("sessionId" in sample);
    assert.ok("benchmarkPoint" in sample);
    assert.ok("expectedNormalizedName" in sample);
  }
  assert.deepEqual(enrichGroundTruth(groundTruth), groundTruth);
});

test("history benchmark evaluates every required metric", () => {
  const result = evaluateHistory();
  assert.equal(result.samples, 66);
  assert.deepEqual(Object.keys(result.metrics), [
    "time",
    "route",
    "point",
    "include",
    "naming",
    "grouping"
  ]);
  assert.equal(result.metrics.time.total, 62);
  assert.equal(result.metrics.route.total, 66);
  assert.equal(result.metrics.include.total, 66);
  assert.equal(result.metrics.grouping.total, 64);
  assert.deepEqual(gateResult(result, DEFAULT_THRESHOLDS), []);
});
