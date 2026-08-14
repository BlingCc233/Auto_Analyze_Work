import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  classifyImage,
  groupRoutePhotos,
  resolvePhotoAssignments
} from "../src/domain.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GROUND_TRUTH_PATH = path.join(ROOT, "data/history/ground-truth.json");
const OCR_PATH = path.join(ROOT, "data/history/vision-ocr.json");
const MANIFEST_PATH = path.join(ROOT, "data/history/manifest.json");

export const DEFAULT_THRESHOLDS = {
  time: 1,
  route: 1,
  point: 1,
  include: 1,
  naming: 1,
  grouping: 1
};

const METRIC_LABELS = {
  time: "时间准确率",
  route: "线路准确率",
  point: "点位准确率",
  include: "include准确率",
  naming: "规范命名准确率",
  grouping: "记录/并行分组准确率"
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sampleId(item) {
  return `${item.recordId}/${item.file}`;
}

function dateFor(item, recordDates) {
  return item.expectedTime?.slice(0, 10) ?? recordDates.get(item.recordId);
}

function expectedMinute(value) {
  return value?.slice(11, 16) ?? null;
}

export function benchmarkPointFromSemantic(item) {
  const point = item.semanticPoint;
  if (point === "G6曹家堡附近路段") return null;
  if (point.includes("韵家口端入口匝道")) return "互助匝道入口";
  if (point.includes("韵家口端出口匝道")) return "互助匝道出口";
  if (point.includes("朝阳互通")) return "朝阳立交";
  if (point.includes("柴达木路")) return "柴达木路高速路口";
  if (point.includes("同仁路口市区方向")) return "柴达木路高速路口";
  if (point.includes("同仁路口离开高速")) return "柴达木路高速路口";
  if (point.includes("西过境段高速入口")) return "高速入口";
  if (point.includes("大酉山隧道")) return "大酉山隧道";
  if (point.includes("西宁西收费站")) return "西宁西收费站";
  if (point.includes("西过境段东端出口")) return "西过境出口";
  if (point.includes("海东主线收费站")) return "海东主线收费站";
  if (point.includes("K177")) return "施工监管点";
  if (point.includes("余家村施工点")) return "施工监管点";
  if (point.includes("西宁东收费站")) return "西宁东收费口";
  if (point.includes("峡口匝道")) return "峡口立交";
  if (point.includes("同仁路口驶入高速")) return "同仁路口驶入高速";
  return point;
}

function namingBase(item) {
  if (!item.benchmarkPoint) return null;
  if (item.eventType === "construction_supervision") return "施工监管";
  if (item.eventType === "overload_control") return "治超";
  return item.benchmarkPoint;
}

function compareTruthOrder(left, right) {
  const leftSequence = left.sequenceIndex ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = right.sequenceIndex ?? Number.MAX_SAFE_INTEGER;
  if (leftSequence !== rightSequence) return leftSequence - rightSequence;
  const leftTime = left.expectedTime ?? "9999";
  const rightTime = right.expectedTime ?? "9999";
  return leftTime.localeCompare(rightTime) || left.file.localeCompare(right.file);
}

export function enrichGroundTruth(entries) {
  const enriched = entries.map((item) => {
    let sessionId = `${item.recordId}-1`;
    if (item.recordId === "01592") {
      if (["04.jpg", "06.jpg", "08.jpg", "09.jpg", "10.jpg", "12.jpg"].includes(item.file)) sessionId = "01592-1";
      else if (["01.jpg", "02.jpg", "03.jpg", "07.jpg"].includes(item.file)) sessionId = "01592-2";
      else sessionId = null;
    } else if (item.recordId === "01598") {
      sessionId = (item.sequenceIndex ?? 0) <= 6 ? "01598-1" : "01598-2";
    }
    return {
      ...item,
      groupId: item.recordId,
      sessionId,
      benchmarkPoint: benchmarkPointFromSemantic(item)
    };
  });

  const groups = new Map();
  for (const item of enriched) {
    const base = namingBase(item);
    if (!base) continue;
    const key = `${item.groupId}\0${base}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const expectedNames = new Map();
  for (const items of groups.values()) {
    items.sort(compareTruthOrder);
    const base = namingBase(items[0]);
    for (const [index, item] of items.entries()) {
      const suffix = items.length > 1 ? `${index + 1}` : "";
      expectedNames.set(sampleId(item), `${base}${suffix}.jpg`);
    }
  }

  return enriched.map((item) => ({
    ...item,
    expectedNormalizedName: expectedNames.get(sampleId(item)) ?? null
  }));
}

function validateGroundTruth(entries) {
  const required = [
    "recordId",
    "file",
    "route",
    "semanticPoint",
    "eventType",
    "expectedTime",
    "include",
    "sequenceIndex",
    "direction",
    "evidence",
    "confidence",
    "groupId",
    "sessionId",
    "benchmarkPoint",
    "expectedNormalizedName"
  ];
  const errors = [];
  for (const item of entries) {
    for (const key of required) {
      if (!(key in item)) errors.push(`${sampleId(item)} 缺少字段 ${key}`);
    }
  }
  if (errors.length) throw new Error(`ground truth 不完整：\n${errors.join("\n")}`);
}

function predictedPoint(place) {
  if (["海东收费站入口", "海东收费站出口"].includes(place)) return "海东主线收费站";
  if (place === "峡口匝道") return "峡口立交";
  return place;
}

function collectInputs(groundTruth, ocrEntries, manifest, basePath) {
  const ocrByFile = new Map(ocrEntries.map((item) => [item.file, item]));
  const recordDates = new Map(manifest.map((record) => [record.recordNum, record.startTime.slice(0, 10)]));
  return groundTruth.map((truth) => {
    const relativePath = `${basePath}/${truth.recordId}/${truth.file}`;
    if (!ocrByFile.has(relativePath)) throw new Error(`缺少 OCR：${relativePath}`);
    const ocr = ocrByFile.get(relativePath);
    return {
      id: sampleId(truth),
      date: dateFor(truth, recordDates),
      truth,
      ocrText: ocr.text,
      classified: classifyImage({
        fileName: truth.file,
        ocrText: ocr.text,
        timeOcrText: ocr.timeText ?? ""
      })
    };
  });
}

function runDailyPipeline(inputs) {
  const days = new Map();
  for (const input of inputs) {
    if (!days.has(input.date)) days.set(input.date, []);
    days.get(input.date).push(input);
  }

  const predictions = new Map();
  for (const [date, dayInputs] of days) {
    const tagged = dayInputs.map((input) => ({
      ...input.classified,
      benchmarkId: input.id
    }));
    const resolved = resolvePhotoAssignments(tagged);
    const normalizedById = new Map();
    const grouped = groupRoutePhotos(resolved);
    for (const [routeKey, photos] of Object.entries(grouped)) {
      for (const photo of photos) {
        normalizedById.set(photo.benchmarkId, {
          ...photo,
          predictedGroup: `${date}:${photo.patrolGroup || routeKey}`
        });
      }
    }

    for (const photo of resolved) {
      predictions.set(photo.benchmarkId, normalizedById.get(photo.benchmarkId) ?? {
        ...photo,
        predictedGroup: `unassigned:${photo.benchmarkId}`
      });
    }
  }
  return predictions;
}

function metricResult(key, checks) {
  const failures = checks.filter((check) => !check.ok);
  const total = checks.length;
  return {
    key,
    label: METRIC_LABELS[key],
    correct: total - failures.length,
    total,
    accuracy: total ? (total - failures.length) / total : 1,
    failures
  };
}

function bestClusterMapping(samples) {
  const predictedKeys = [...new Set(samples.map((sample) => sample.predictedGroup))];
  const truthKeys = [...new Set(samples.map((sample) => sample.truth.sessionId))];
  const overlap = predictedKeys.map((predicted) => truthKeys.map((truth) =>
    samples.filter((sample) => sample.predictedGroup === predicted && sample.truth.sessionId === truth).length
  ));
  const memo = new Map();

  function solve(index, usedMask) {
    if (index === predictedKeys.length) return { score: 0, choices: [] };
    const cacheKey = `${index}:${usedMask}`;
    if (memo.has(cacheKey)) return memo.get(cacheKey);
    let best = solve(index + 1, usedMask);
    best = { score: best.score, choices: [null, ...best.choices] };
    for (let truthIndex = 0; truthIndex < truthKeys.length; truthIndex += 1) {
      if (usedMask & (1 << truthIndex)) continue;
      const next = solve(index + 1, usedMask | (1 << truthIndex));
      const candidate = {
        score: overlap[index][truthIndex] + next.score,
        choices: [truthIndex, ...next.choices]
      };
      if (candidate.score > best.score) best = candidate;
    }
    memo.set(cacheKey, best);
    return best;
  }

  const best = solve(0, 0);
  const mapping = new Map();
  best.choices.forEach((truthIndex, predictedIndex) => {
    if (truthIndex !== null) mapping.set(predictedKeys[predictedIndex], truthKeys[truthIndex]);
  });
  return mapping;
}

function groupingChecks(inputs, predictions) {
  const evaluable = inputs
    .filter((input) => input.truth.sessionId)
    .map((input) => ({
      ...input,
      predictedGroup: predictions.get(input.id).predictedGroup
    }));
  const byDate = new Map();
  for (const sample of evaluable) {
    if (!byDate.has(sample.date)) byDate.set(sample.date, []);
    byDate.get(sample.date).push(sample);
  }

  const checks = [];
  for (const samples of byDate.values()) {
    const mapping = bestClusterMapping(samples);
    for (const sample of samples) {
      const actualSession = mapping.get(sample.predictedGroup) ?? null;
      checks.push({
        id: sample.id,
        ok: actualSession === sample.truth.sessionId,
        expected: sample.truth.sessionId,
        actual: actualSession
          ? `${sample.predictedGroup} -> ${actualSession}`
          : `${sample.predictedGroup} -> 未匹配`
      });
    }
  }
  return checks;
}

export function evaluateHistory({
  groundTruth = readJson(GROUND_TRUTH_PATH),
  ocrEntries = readJson(OCR_PATH),
  manifest = readJson(MANIFEST_PATH),
  basePath = "data/history"
} = {}) {
  validateGroundTruth(groundTruth);
  const inputs = collectInputs(groundTruth, ocrEntries, manifest, basePath);
  const predictions = runDailyPipeline(inputs);

  const timeChecks = inputs
    .filter((input) => input.truth.expectedTime)
    .map((input) => {
      const actual = predictions.get(input.id).time || "";
      const expected = expectedMinute(input.truth.expectedTime);
      return { id: input.id, ok: actual === expected, expected, actual: actual || "未识别" };
    });

  const routeChecks = inputs.map((input) => {
    const actual = predictions.get(input.id).routeKey || "";
    return { id: input.id, ok: actual === input.truth.route, expected: input.truth.route, actual: actual || "未识别" };
  });

  const pointChecks = inputs
    .filter((input) => input.truth.benchmarkPoint)
    .map((input) => {
      const actual = predictedPoint(predictions.get(input.id).place);
      return {
        id: input.id,
        ok: actual === input.truth.benchmarkPoint,
        expected: input.truth.benchmarkPoint,
        actual: actual || "未识别"
      };
    });

  const includeChecks = inputs.map((input) => {
    const actual = predictions.get(input.id).include === true;
    return { id: input.id, ok: actual === input.truth.include, expected: input.truth.include, actual };
  });

  const namingChecks = inputs
    .filter((input) => input.truth.expectedNormalizedName)
    .map((input) => {
      const prediction = predictions.get(input.id);
      const actual = prediction.include ? prediction.proposedName : "";
      return {
        id: input.id,
        ok: actual === input.truth.expectedNormalizedName,
        expected: input.truth.expectedNormalizedName,
        actual: actual || "未生成"
      };
    });

  const metrics = {
    time: metricResult("time", timeChecks),
    route: metricResult("route", routeChecks),
    point: metricResult("point", pointChecks),
    include: metricResult("include", includeChecks),
    naming: metricResult("naming", namingChecks),
    grouping: metricResult("grouping", groupingChecks(inputs, predictions))
  };

  return {
    samples: inputs.length,
    metrics,
    predictions
  };
}

function percent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function printReport(result, thresholds) {
  console.log(`历史识别 benchmark：${result.samples} 张图片`);
  console.log("输入：匿名文件名 + Vision OCR；按日期混合后运行当前 domain 流程。");
  console.log("");
  for (const metric of Object.values(result.metrics)) {
    const threshold = thresholds[metric.key];
    const status = metric.accuracy >= threshold ? "PASS" : "FAIL";
    console.log(`${status} ${metric.label}: ${percent(metric.accuracy)} (${metric.correct}/${metric.total})，门槛 ${percent(threshold)}`);
    if (metric.failures.length) {
      for (const failure of metric.failures) {
        console.log(`  - ${failure.id}: 期望=${failure.expected}；实际=${failure.actual}`);
      }
    }
  }
}

function parseThresholds(args) {
  const thresholds = { ...DEFAULT_THRESHOLDS };
  for (const arg of args) {
    const match = arg.match(/^--threshold(?:-([a-z]+))?=(0(?:\.\d+)?|1(?:\.0+)?)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = Number(rawValue);
    if (key) {
      if (!(key in thresholds)) throw new Error(`未知指标：${key}`);
      thresholds[key] = value;
    } else {
      for (const metricKey of Object.keys(thresholds)) thresholds[metricKey] = value;
    }
  }
  return thresholds;
}

export function gateResult(result, thresholds = DEFAULT_THRESHOLDS) {
  return Object.values(result.metrics).filter((metric) => metric.accuracy < thresholds[metric.key]);
}

async function main() {
  const args = process.argv.slice(2);
  const thresholds = parseThresholds(args);
  const reportOnly = args.includes("--report-only");
  const result = evaluateHistory();
  printReport(result, thresholds);
  const failed = gateResult(result, thresholds);
  if (failed.length && !reportOnly) {
    console.error(`\n门禁失败：${failed.map((metric) => metric.label).join("、")}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
