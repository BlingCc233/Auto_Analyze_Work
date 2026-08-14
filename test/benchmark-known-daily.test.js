import assert from "node:assert/strict";
import test from "node:test";
import { evaluateKnownDaily } from "../scripts/benchmark-known-daily.mjs";

test("current PP-OCRv6 known daily fixtures pass every metric at 100%", () => {
  const result = evaluateKnownDaily();
  assert.equal(result.samples, 47);
  for (const metric of Object.values(result.metrics)) {
    assert.equal(metric.correct, metric.total, `${metric.key}: ${JSON.stringify(metric.failures)}`);
  }
});
