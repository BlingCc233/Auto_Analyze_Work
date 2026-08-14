import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  classifyImage,
  groupRoutePhotos,
  resolvePhotoAssignments
} from "../src/domain.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const truth = JSON.parse(fs.readFileSync(path.join(ROOT, "data/known-daily-ground-truth.json"), "utf8"));
const ocr = new Map(
  JSON.parse(fs.readFileSync(path.join(ROOT, "data/known-daily-ppocrv6-ocr.json"), "utf8"))
    .map((item) => [item.file, item])
);

const aliases = {
  "海东收费站入口": "海东主线收费站",
  "海东收费站出口": "海东主线收费站"
};

function expectedNames(rows) {
  const groups = new Map();
  for (const row of rows) {
    const [, name, time, , place, include, recordGroup] = row;
    if (!include) continue;
    const base = aliases[place] || place;
    const key = `${recordGroup}\0${base}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ name, time, base });
  }
  const result = new Map();
  for (const items of groups.values()) {
    items.sort((left, right) => left.time.localeCompare(right.time) || left.name.localeCompare(right.name, "zh-CN"));
    items.forEach((item, index) => {
      const suffix = items.length > 1 ? index + 1 : "";
      result.set(item.name, `${item.base}${suffix}.jpg`);
    });
  }
  return result;
}

function check(metric, id, expected, actual, failures) {
  if (expected !== actual) failures.push({ metric, id, expected, actual });
}

export function evaluateKnownDaily() {
  const failures = [];
  let totals = { time: 0, route: 0, point: 0, include: 0, naming: 0, grouping: 0 };
  const expectedName = expectedNames(truth);
  for (const folder of [...new Set(truth.map((row) => row[0]))]) {
    const rows = truth.filter((row) => row[0] === folder);
    const classified = rows.map(([, name]) => {
      const entry = ocr.get(`daily/${folder}/${name}`);
      if (!entry) throw new Error(`缺少 PP-OCRv6 缓存：daily/${folder}/${name}`);
      return classifyImage({ fileName: name, ocrText: entry.text, timeOcrText: entry.timeText });
    });
    const resolved = resolvePhotoAssignments(classified);
    const normalized = Object.values(groupRoutePhotos(resolved)).flat();
    const normalizedByName = new Map(normalized.map((photo) => [photo.originalName, photo]));
    rows.forEach((row, index) => {
      const [, name, time, routeKey, place, include, recordGroup] = row;
      const prediction = normalizedByName.get(name) || resolved[index];
      const id = `${folder}/${name}`;
      totals.time += 1;
      totals.route += 1;
      totals.include += 1;
      check("time", id, time, prediction.time || "", failures);
      check("route", id, routeKey, prediction.routeKey || "", failures);
      check("include", id, include, prediction.include === true, failures);
      if (!include) return;
      totals.point += 1;
      totals.naming += 1;
      totals.grouping += 1;
      check("point", id, place, prediction.place || "", failures);
      check("naming", id, expectedName.get(name), prediction.proposedName || "", failures);
      check("grouping", id, recordGroup, prediction.recordGroup || "", failures);
    });
  }
  return {
    samples: truth.length,
    metrics: Object.fromEntries(Object.entries(totals).map(([key, total]) => {
      const metricFailures = failures.filter((failure) => failure.metric === key);
      return [key, { key, total, correct: total - metricFailures.length, failures: metricFailures }];
    }))
  };
}

function main() {
  const result = evaluateKnownDaily();
  console.log(`已知 daily 当前 PP-OCRv6 门禁：${result.samples} 张`);
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
