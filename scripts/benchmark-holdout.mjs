import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DEFAULT_THRESHOLDS,
  evaluateHistory,
  gateResult
} from "./benchmark-history.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ROOT = path.join(ROOT, "data", "history-corpus");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, name), "utf8"));
}

export function evaluateHoldout() {
  return evaluateHistory({
    groundTruth: readJson("ground-truth.json"),
    ocrEntries: readJson("vision-ocr.json"),
    manifest: readJson("manifest.json"),
    basePath: "data/history-corpus"
  });
}

function percent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function main() {
  const result = evaluateHoldout();
  console.log(`7月14日独立留出集：${result.samples} 张图片`);
  for (const metric of Object.values(result.metrics)) {
    const threshold = DEFAULT_THRESHOLDS[metric.key];
    const status = metric.accuracy >= threshold ? "PASS" : "FAIL";
    console.log(
      `${status} ${metric.label}: ${percent(metric.accuracy)} `
      + `(${metric.correct}/${metric.total})，门槛 ${percent(threshold)}`
    );
    for (const failure of metric.failures) {
      console.log(`  - ${failure.id}: 期望=${failure.expected}；实际=${failure.actual}`);
    }
  }
  const failed = gateResult(result, DEFAULT_THRESHOLDS);
  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
