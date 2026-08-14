import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recognizeNativeImage } from "../server/native-ocr.mjs";
import {
  DEFAULT_THRESHOLDS as HISTORY_THRESHOLDS,
  evaluateHistory,
  gateResult as gateHistory
} from "./benchmark-history.mjs";
import {
  DEFAULT_THRESHOLDS as ACCEPTANCE_THRESHOLDS,
  evaluateAcceptance,
  gateResult as gateAcceptance
} from "./benchmark-acceptance.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY_OUTPUT = path.join(ROOT, "data/history/ppocrv6-ocr.json");
const ACCEPTANCE_OUTPUT = path.join(ROOT, "data/acceptance/260726-ppocrv6-ocr.json");
const acceptanceOnly = process.argv.includes("--acceptance-only");

function imageFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return imageFiles(fullPath);
      return /\.(?:jpe?g|png)$/i.test(entry.name) ? [fullPath] : [];
    })
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function relativeFile(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function printResult(label, result, thresholds) {
  console.log(label);
  for (const metric of Object.values(result.metrics)) {
    const passed = metric.accuracy >= thresholds[metric.key];
    console.log(
      `${passed ? "PASS" : "FAIL"} ${metric.label}: `
      + `${metric.correct}/${metric.total} (${(metric.accuracy * 100).toFixed(2)}%)`
    );
    for (const failure of metric.failures) {
      console.log(`  - ${failure.id}: ${failure.expected} -> ${failure.actual}`);
    }
  }
}

const historyFiles = imageFiles(path.join(ROOT, "data/history"))
  .filter((file) => /[\\/]0\d{4}[\\/]/.test(file));
const acceptanceFiles = imageFiles(path.join(ROOT, "daily/260726"));
const files = acceptanceOnly ? acceptanceFiles : [...historyFiles, ...acceptanceFiles];
const entries = [];

for (const [index, file] of files.entries()) {
  const mimeType = path.extname(file).toLowerCase() === ".png"
    ? "image/png"
    : "image/jpeg";
  const result = await recognizeNativeImage({
    mimeType,
    dataBase64: fs.readFileSync(file).toString("base64")
  }, { root: ROOT });
  entries.push({
    file: relativeFile(file),
    text: result.ocrText || "",
    timeText: result.timeOcrText || ""
  });
  if ((index + 1) % 10 === 0 || index + 1 === files.length) {
    console.error(`PP-OCRv6 ${index + 1}/${files.length}`);
  }
}

const historyEntries = entries.filter((entry) => entry.file.startsWith("data/history/"));
if (process.argv.includes("--write-history")) {
  fs.writeFileSync(HISTORY_OUTPUT, `${JSON.stringify(historyEntries, null, 2)}\n`);
  console.log(`已更新 ${path.relative(ROOT, HISTORY_OUTPUT)}`);
}
const acceptanceEntries = entries.filter((entry) => entry.file.startsWith("daily/260726/"));
if (process.argv.includes("--write-acceptance")) {
  fs.writeFileSync(ACCEPTANCE_OUTPUT, `${JSON.stringify(acceptanceEntries, null, 2)}\n`);
  console.log(`已更新 ${path.relative(ROOT, ACCEPTANCE_OUTPUT)}`);
}

const history = evaluateHistory({
  ocrEntries: historyEntries.length
    ? historyEntries
    : JSON.parse(fs.readFileSync(HISTORY_OUTPUT, "utf8"))
});
const acceptance = evaluateAcceptance({
  ocrEntries: acceptanceEntries
});
printResult("当前 PP-OCRv6 历史集", history, HISTORY_THRESHOLDS);
console.log("");
printResult("当前 PP-OCRv6 0726 独立集", acceptance, ACCEPTANCE_THRESHOLDS);

if (
  gateHistory(history, HISTORY_THRESHOLDS).length
  || gateAcceptance(acceptance, ACCEPTANCE_THRESHOLDS).length
) process.exitCode = 1;
