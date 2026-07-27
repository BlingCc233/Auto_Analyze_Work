import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
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

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return filesUnder(fullPath);
      return /\.(?:jpe?g|png)$/i.test(entry.name) ? [fullPath] : [];
    })
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function printResult(label, result, thresholds) {
  console.log(label);
  for (const metric of Object.values(result.metrics)) {
    const status = metric.accuracy >= thresholds[metric.key] ? "PASS" : "FAIL";
    console.log(
      `${status} ${metric.label}: ${(metric.accuracy * 100).toFixed(2)}% `
      + `(${metric.correct}/${metric.total})`
    );
    for (const failure of metric.failures) {
      console.log(`  - ${failure.id}: ${failure.expected} -> ${failure.actual}`);
    }
  }
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("原生Vision benchmark仅可在macOS运行");
  }
  const binary = path.join(os.tmpdir(), `qh-duty-native-benchmark-${process.pid}`);
  const historyFiles = filesUnder(path.join(ROOT, "data", "history"))
    .filter((file) => /\/0\d{4}\//.test(file));
  const acceptanceFiles = filesUnder(path.join(ROOT, "daily", "260726"));
  try {
    await execFileAsync("swiftc", [
      path.join(ROOT, "scripts", "apple-vision-ocr.swift"),
      "-o",
      binary
    ], {
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024
    });
    const { stdout } = await execFileAsync(binary, [
      ...historyFiles,
      ...acceptanceFiles
    ], {
      timeout: 180_000,
      maxBuffer: 64 * 1024 * 1024
    });
    const rows = JSON.parse(stdout);
    const historyOcr = rows
      .filter((entry) => entry.file.includes(`${path.sep}data${path.sep}history${path.sep}`))
      .map((entry) => ({
        file: entry.file
          .slice(entry.file.indexOf(`${path.sep}data${path.sep}history${path.sep}`) + 1)
          .split(path.sep)
          .join("/"),
        text: entry.text || "",
        timeText: entry.timeText || ""
      }));
    const acceptanceOcr = rows
      .filter((entry) => entry.file.includes(`${path.sep}daily${path.sep}260726${path.sep}`))
      .map((entry) => ({
        file: `daily/260726/${path.basename(entry.file)}`,
        text: entry.text || "",
        timeText: entry.timeText || ""
      }));
    const history = evaluateHistory({ ocrEntries: historyOcr });
    const acceptance = evaluateAcceptance({ ocrEntries: acceptanceOcr });
    printResult("原生Vision历史集：66张", history, HISTORY_THRESHOLDS);
    console.log("");
    printResult("原生Vision 2026-07-26独立集：15张", acceptance, ACCEPTANCE_THRESHOLDS);
    const failed = [
      ...gateHistory(history, HISTORY_THRESHOLDS),
      ...gateAcceptance(acceptance, ACCEPTANCE_THRESHOLDS)
    ];
    if (failed.length) process.exitCode = 1;
  } finally {
    try {
      fs.unlinkSync(binary);
    } catch {}
  }
}

await main();
