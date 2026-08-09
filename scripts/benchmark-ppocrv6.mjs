import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateHistory
} from "./benchmark-history.mjs";
import {
  evaluateAcceptance
} from "./benchmark-acceptance.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = process.argv[2] || "/tmp/ppocrv6-tiny-geometry.json";

function isDate(text) {
  return /20\d{2}[-=./:]\d{1,2}[-=./:]\d{1,2}/.test(text);
}

function isClock(text) {
  return /(?:^|\D)[0-2]?\d\s*[:.·-]\s*[0-5]\d/.test(text)
    || /^\s*[0-2]\d[0-5]\d\s*$/.test(text);
}

function normalizedClock(text) {
  for (const rawLine of String(text).split(/\r?\n/)) {
    if (isDate(rawLine)) continue;
    const source = rawLine.replace(/[Oo]/g, "0").replace(/[：·.-]/g, ":");
    const separated = source.match(/(?:^|\D)([0-2]?\d)\s*:\s*([0-5]\d)/);
    if (separated && Number(separated[1]) <= 23) {
      return `${separated[1].padStart(2, "0")}:${separated[2]}`;
    }
    const compact = source.replace(/\D/g, "").match(/^([0-2]\d)([0-5]\d)/);
    if (compact && Number(compact[1]) <= 23) return `${compact[1]}:${compact[2]}`;
  }
  return "";
}

function spatialOcr(row) {
  const lines = Array.isArray(row.lines) ? row.lines : [];
  const date = lines
    .filter((line) => isDate(line.text))
    .sort((left, right) => right.score - left.score)[0];
  if (!date || !row.width || !row.height) {
    return { file: row.file, text: row.text || "", timeText: "" };
  }

  const sameRowTolerance = Math.max(22, row.height * 0.035);
  const timeLine = lines
    .filter((line) =>
      isClock(line.text)
      && line.x < date.x
      && Math.abs(line.y - date.y) <= sameRowTolerance
    )
    .sort((left, right) =>
      Math.abs(left.y - date.y) - Math.abs(right.y - date.y)
      || right.score - left.score
    )[0];

  const watermark = lines.filter((line) =>
    line.x < row.width * 0.72
    && line.y >= date.y - row.height * 0.055
    && line.y <= row.height * 0.995
  );
  const watermarkSet = new Set(watermark);
  const scene = lines.filter((line) => !watermarkSet.has(line));
  const orderedWatermark = [
    ...(timeLine ? [timeLine] : []),
    date,
    ...watermark
      .filter((line) => line !== timeLine && line !== date)
      .sort((left, right) => left.y - right.y || left.x - right.x)
  ];

  return {
    file: row.file,
    text: [...orderedWatermark, ...scene].map((line) => line.text).join("\n"),
    timeText: normalizedClock(row.timeText) || normalizedClock(timeLine?.text)
  };
}

function print(label, result) {
  console.log(label);
  for (const metric of Object.values(result.metrics)) {
    console.log(
      `${metric.label}: ${(metric.accuracy * 100).toFixed(2)}% `
      + `(${metric.correct}/${metric.total})`
    );
    for (const failure of metric.failures.slice(0, 12)) {
      console.log(`  - ${failure.id}: ${failure.expected} -> ${failure.actual}`);
    }
    if (metric.failures.length > 12) {
      console.log(`  - 其余 ${metric.failures.length - 12} 项省略`);
    }
  }
}

const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const entries = payload.rows.map(spatialOcr);
const history = evaluateHistory({
  ocrEntries: entries.filter((entry) => entry.file.startsWith("data/history/"))
});
const acceptance = evaluateAcceptance({
  ocrEntries: entries.filter((entry) => entry.file.startsWith("daily/260726/"))
});

print("PP-OCRv6 tiny 历史集（空间水印分层）", history);
console.log("");
print("PP-OCRv6 tiny 2026-07-26 独立集（空间水印分层）", acceptance);

const output = path.join(ROOT, "data", "ppocrv6-spatial-sample.json");
fs.writeFileSync(output, JSON.stringify(entries, null, 2));
console.log(`\n空间分层OCR样本已写入 ${path.relative(ROOT, output)}`);
