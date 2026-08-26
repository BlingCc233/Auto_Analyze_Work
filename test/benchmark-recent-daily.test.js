import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRecentDaily } from "../scripts/benchmark-recent-daily.mjs";

test("recent PP-OCRv6 daily fixtures pass every metric at 100%", () => {
  const result = evaluateRecentDaily();
  assert.equal(result.samples, 44);
  for (const metric of Object.values(result.metrics)) {
    assert.equal(metric.correct, metric.total, `${metric.key}: ${JSON.stringify(metric.failures)}`);
  }
});
