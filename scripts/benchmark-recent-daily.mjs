import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { evaluateDailyFixtures } from "./benchmark-known-daily.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function evaluateRecentDaily() {
  return evaluateDailyFixtures({
    truthPath: path.join(root, "data/recent-daily-ground-truth.json"),
    ocrPath: path.join(root, "data/recent-daily-ppocrv6-ocr.json")
  });
}

function main() {
  const result = evaluateRecentDaily();
  console.log(`近期 daily PP-OCRv6 门禁：${result.samples} 张`);
  for (const metric of Object.values(result.metrics)) {
    const passed = metric.correct === metric.total;
    console.log(`${passed ? "PASS" : "FAIL"} ${metric.key}: ${metric.correct}/${metric.total}`);
    for (const failure of metric.failures) {
      console.log(`  - ${failure.id}: ${failure.expected} -> ${failure.actual}`);
    }
    if (!passed) process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
