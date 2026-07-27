import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DEFAULT_THRESHOLDS,
  METRIC_KEYS,
  evaluateAcceptance,
  gateResult,
  parseThresholds
} from "../scripts/benchmark-acceptance.mjs";

const groundTruth = JSON.parse(
  fs.readFileSync(new URL("../data/acceptance/260726-ground-truth.json", import.meta.url))
);
const ocrEntries = JSON.parse(
  fs.readFileSync(new URL("../data/acceptance/260726-ocr.json", import.meta.url))
);

test("2026-07-26 acceptance fixtures are complete and independent", () => {
  assert.equal(groundTruth.length, 15);
  assert.equal(ocrEntries.length, 15);
  assert.equal(new Set(groundTruth.map((item) => item.file)).size, 15);
  assert.equal(new Set(ocrEntries.map((item) => item.file.split("/").at(-1))).size, 15);
});

test("acceptance benchmark covers every required metric", () => {
  const result = evaluateAcceptance();
  assert.equal(result.fixture, "2026-07-26");
  assert.equal(result.samples, 15);
  assert.deepEqual(Object.keys(result.metrics), METRIC_KEYS);
  assert.equal(result.metrics.time.total, 15);
  assert.equal(result.metrics.route.total, 15);
  assert.equal(result.metrics.point.total, 13);
  assert.equal(result.metrics.include.total, 15);
  assert.equal(result.metrics.naming.total, 13);
  assert.equal(result.metrics.grouping.total, 13);
  for (const metric of Object.values(result.metrics)) {
    assert.ok(metric.accuracy >= 0 && metric.accuracy <= 1);
  }
});

test("ground-truth hints never enter classify or resolve", () => {
  const syntheticTruth = [
    {
      file: "a.jpg",
      route: "g6",
      semanticPoint: "A",
      place: "A",
      expectedTime: "08:00",
      include: true,
      recordHint: "secret-record",
      sessionHint: "secret-session",
      sequenceHint: 99,
      nameBase: "A"
    }
  ];
  const syntheticOcr = [{ file: "daily/260726/a.jpg", text: "08:00 A" }];
  const classifyCalls = [];
  const resolveCalls = [];

  const result = evaluateAcceptance({
    groundTruth: syntheticTruth,
    ocrEntries: syntheticOcr,
    classify(input) {
      classifyCalls.push(structuredClone(input));
      return {
        originalName: input.fileName,
        routeKey: "g6",
        place: "A",
        time: "08:00",
        include: true,
        proposedName: "A.jpg"
      };
    },
    resolve(photos) {
      resolveCalls.push(structuredClone(photos));
      return photos.map((photo) => ({ ...photo, patrolGroup: "opaque:1" }));
    },
    group(photos) {
      return { g6: photos, west: [], s101: [] };
    }
  });

  assert.deepEqual(classifyCalls, [{
    fileName: "a.jpg",
    ocrText: "08:00 A",
    timeOcrText: ""
  }]);
  assert.equal(resolveCalls.length, 1);
  assert.equal(resolveCalls[0][0].benchmarkSampleId, "a.jpg");
  for (const forbidden of [
    "truth",
    "route",
    "recordHint",
    "sessionHint",
    "sequenceHint",
    "nameBase",
    "expectedTime"
  ]) {
    assert.equal(forbidden in resolveCalls[0][0], false, `${forbidden} 泄漏至 resolve`);
  }
  assert.deepEqual(gateResult(result), []);
});

test("acceptance gate defaults to 95% and supports metric overrides", () => {
  assert.deepEqual(DEFAULT_THRESHOLDS, {
    time: 0.95,
    route: 0.95,
    point: 0.95,
    include: 0.95,
    naming: 0.95,
    grouping: 0.95
  });
  assert.deepEqual(parseThresholds(["--threshold=0.96"]), {
    time: 0.96,
    route: 0.96,
    point: 0.96,
    include: 0.96,
    naming: 0.96,
    grouping: 0.96
  });
  assert.equal(parseThresholds(["--threshold-time=0.99"]).time, 0.99);

  const result = {
    metrics: Object.fromEntries(METRIC_KEYS.map((key) => [
      key,
      { key, accuracy: key === "time" ? 0.9499 : 0.95 }
    ]))
  };
  assert.deepEqual(gateResult(result).map((metric) => metric.key), ["time"]);
});
