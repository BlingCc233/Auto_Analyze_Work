import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  classifyImage,
  groupRoutePhotos,
  resolvePhotoAssignments
} from "../src/domain.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GROUND_TRUTH_PATH = path.join(ROOT, "data/acceptance/260726-ground-truth.json");
const OCR_PATH = path.join(ROOT, "data/acceptance/260726-ocr.json");

export const METRIC_KEYS = [
  "time",
  "route",
  "point",
  "include",
  "naming",
  "grouping"
];

export const DEFAULT_THRESHOLDS = Object.freeze(
  Object.fromEntries(METRIC_KEYS.map((key) => [key, 1]))
);

const METRIC_LABELS = {
  time: "时间准确率",
  route: "线路准确率",
  point: "点位准确率",
  include: "纳入/排除准确率",
  naming: "规范命名准确率",
  grouping: "记录/并行车辆分组准确率"
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizedFileName(value) {
  return path.posix.basename(String(value).replaceAll("\\", "/"));
}

function expectedGroup(item) {
  if (!item.recordHint || !item.sessionHint) return "";
  return `${item.recordHint}:${item.sessionHint}`;
}

function compareTruthSequence(left, right) {
  const leftSequence = Number.isInteger(left.sequenceHint)
    ? left.sequenceHint
    : Number.MAX_SAFE_INTEGER;
  const rightSequence = Number.isInteger(right.sequenceHint)
    ? right.sequenceHint
    : Number.MAX_SAFE_INTEGER;
  return leftSequence - rightSequence
    || String(left.expectedTime).localeCompare(String(right.expectedTime))
    || left.file.localeCompare(right.file);
}

function expectedNames(groundTruth) {
  const groups = new Map();
  for (const item of groundTruth) {
    if (!item.include || !item.nameBase) continue;
    const key = `${expectedGroup(item)}\0${item.nameBase}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const names = new Map();
  for (const items of groups.values()) {
    items.sort(compareTruthSequence);
    for (const [index, item] of items.entries()) {
      const suffix = items.length > 1 ? String(index + 1) : "";
      names.set(item.file, `${item.nameBase}${suffix}.jpg`);
    }
  }
  return names;
}

function validateFixtures(groundTruth, ocrEntries) {
  if (!Array.isArray(groundTruth) || groundTruth.length === 0) {
    throw new Error("260726 ground truth 必须是非空数组");
  }
  if (!Array.isArray(ocrEntries) || ocrEntries.length === 0) {
    throw new Error("260726 OCR 必须是非空数组");
  }

  const truthFields = [
    "file",
    "route",
    "semanticPoint",
    "place",
    "expectedTime",
    "include",
    "recordHint",
    "sessionHint",
    "sequenceHint",
    "nameBase"
  ];
  const truthFiles = new Set();
  for (const item of groundTruth) {
    for (const field of truthFields) {
      if (!(field in item)) throw new Error(`${item.file || "未知图片"} 缺少真值字段 ${field}`);
    }
    if (truthFiles.has(item.file)) throw new Error(`ground truth 文件名重复：${item.file}`);
    if (item.expectedTime && !/^\d{2}:\d{2}$/.test(item.expectedTime)) {
      throw new Error(`${item.file} expectedTime 格式错误：${item.expectedTime}`);
    }
    truthFiles.add(item.file);
  }

  const ocrFiles = new Set();
  for (const item of ocrEntries) {
    if (typeof item.file !== "string" || typeof item.text !== "string") {
      throw new Error("OCR 条目必须包含字符串 file 和 text");
    }
    const file = normalizedFileName(item.file);
    if (ocrFiles.has(file)) throw new Error(`OCR 文件名重复：${file}`);
    ocrFiles.add(file);
  }

  const missingOcr = [...truthFiles].filter((file) => !ocrFiles.has(file));
  const missingTruth = [...ocrFiles].filter((file) => !truthFiles.has(file));
  if (missingOcr.length || missingTruth.length) {
    const details = [
      missingOcr.length ? `缺少 OCR：${missingOcr.join("、")}` : "",
      missingTruth.length ? `缺少真值：${missingTruth.join("、")}` : ""
    ].filter(Boolean);
    throw new Error(`验收样本未一一对应；${details.join("；")}`);
  }
}

function collectInputs(groundTruth, ocrEntries, classify) {
  const truthByFile = new Map(groundTruth.map((item) => [item.file, item]));

  // Preserve the OCR fixture order. Truth sequence and grouping hints are never
  // added to either the classifier input or the resolver input.
  return ocrEntries.map((entry) => {
    const id = normalizedFileName(entry.file);
    const classifierInput = {
      fileName: id,
      ocrText: entry.text,
      timeOcrText: entry.timeText || ""
    };
    return {
      id,
      truth: truthByFile.get(id),
      classified: classify(classifierInput)
    };
  });
}

function runPipeline(inputs, resolve, group) {
  const resolverInputs = inputs.map((input) => ({
    ...input.classified,
    benchmarkSampleId: input.id
  }));
  const resolved = resolve(resolverInputs);
  const normalized = Object.values(group(resolved)).flat();
  const normalizedById = new Map(
    normalized.map((photo) => [photo.benchmarkSampleId, photo])
  );

  return new Map(resolved.map((photo) => {
    const prediction = normalizedById.get(photo.benchmarkSampleId) ?? photo;
    return [photo.benchmarkSampleId, {
      ...prediction,
      predictedGroup: prediction.include === false
        ? `unassigned:${photo.benchmarkSampleId}`
        : prediction.recordGroup
          || prediction.patrolGroup
          || prediction.routeKey
          || `unassigned:${photo.benchmarkSampleId}`
    }];
  }));
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

function canonicalPoint(value) {
  const aliases = {
    "海东收费站入口": "海东主线收费站",
    "海东收费站出口": "海东主线收费站",
    "峡口匝道": "峡口立交"
  };
  return aliases[value] ?? value ?? "";
}

function bestClusterMapping(samples) {
  const predictedGroups = [...new Set(samples.map((sample) => sample.predictedGroup))];
  const truthGroups = [...new Set(samples.map((sample) => expectedGroup(sample.truth)))];
  const overlap = predictedGroups.map((predicted) => truthGroups.map((truth) =>
    samples.filter((sample) =>
      sample.predictedGroup === predicted && expectedGroup(sample.truth) === truth
    ).length
  ));
  const memo = new Map();

  function solve(predictedIndex, usedTruth) {
    if (predictedIndex === predictedGroups.length) return { score: 0, choices: [] };
    const cacheKey = `${predictedIndex}:${[...usedTruth].sort((a, b) => a - b).join(",")}`;
    if (memo.has(cacheKey)) return memo.get(cacheKey);

    const skipped = solve(predictedIndex + 1, usedTruth);
    let best = { score: skipped.score, choices: [null, ...skipped.choices] };
    for (let truthIndex = 0; truthIndex < truthGroups.length; truthIndex += 1) {
      if (usedTruth.has(truthIndex)) continue;
      const nextUsed = new Set(usedTruth);
      nextUsed.add(truthIndex);
      const next = solve(predictedIndex + 1, nextUsed);
      const candidate = {
        score: overlap[predictedIndex][truthIndex] + next.score,
        choices: [truthIndex, ...next.choices]
      };
      if (candidate.score > best.score) best = candidate;
    }
    memo.set(cacheKey, best);
    return best;
  }

  const solution = solve(0, new Set());
  return new Map(solution.choices.flatMap((truthIndex, predictedIndex) =>
    truthIndex === null
      ? []
      : [[predictedGroups[predictedIndex], truthGroups[truthIndex]]]
  ));
}

function groupingChecks(inputs, predictions) {
  const samples = inputs
    .filter((input) => input.truth.include && expectedGroup(input.truth))
    .map((input) => ({
      ...input,
      predictedGroup: predictions.get(input.id).predictedGroup
    }));
  const mapping = bestClusterMapping(samples);
  return samples.map((sample) => {
    const expected = expectedGroup(sample.truth);
    const mapped = mapping.get(sample.predictedGroup) ?? "";
    return {
      id: sample.id,
      ok: mapped === expected,
      expected,
      actual: mapped
        ? `${sample.predictedGroup} -> ${mapped}`
        : `${sample.predictedGroup} -> 未匹配`
    };
  });
}

export function evaluateAcceptance({
  groundTruth = readJson(GROUND_TRUTH_PATH),
  ocrEntries = readJson(OCR_PATH),
  classify = classifyImage,
  resolve = resolvePhotoAssignments,
  group = groupRoutePhotos
} = {}) {
  validateFixtures(groundTruth, ocrEntries);
  const expectedNameByFile = expectedNames(groundTruth);
  const inputs = collectInputs(groundTruth, ocrEntries, classify);
  const predictions = runPipeline(inputs, resolve, group);

  const timeChecks = inputs.map((input) => {
    const actual = predictions.get(input.id).time || "";
    return {
      id: input.id,
      ok: actual === input.truth.expectedTime,
      expected: input.truth.expectedTime,
      actual: actual || "未识别"
    };
  });

  const routeChecks = inputs.map((input) => {
    const actual = predictions.get(input.id).routeKey || "";
    return {
      id: input.id,
      ok: actual === input.truth.route,
      expected: input.truth.route || "排除",
      actual: actual || "排除"
    };
  });

  const pointChecks = inputs
    .filter((input) => input.truth.include && input.truth.place)
    .map((input) => {
      const actual = canonicalPoint(predictions.get(input.id).place);
      return {
        id: input.id,
        ok: actual === input.truth.place,
        expected: input.truth.place,
        actual: actual || "未识别"
      };
    });

  const includeChecks = inputs.map((input) => {
    const actual = predictions.get(input.id).include === true;
    return {
      id: input.id,
      ok: actual === input.truth.include,
      expected: input.truth.include,
      actual
    };
  });

  const namingChecks = inputs
    .filter((input) => expectedNameByFile.has(input.id))
    .map((input) => {
      const prediction = predictions.get(input.id);
      const actual = prediction.include === false ? "" : prediction.proposedName || "";
      const expected = expectedNameByFile.get(input.id);
      return {
        id: input.id,
        ok: actual === expected,
        expected,
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
    fixture: "2026-07-26",
    samples: inputs.length,
    metrics,
    predictions
  };
}

export function gateResult(result, thresholds = DEFAULT_THRESHOLDS) {
  return METRIC_KEYS
    .map((key) => result.metrics[key])
    .filter((metric) => metric.accuracy < thresholds[metric.key]);
}

export function parseThresholds(args) {
  const thresholds = { ...DEFAULT_THRESHOLDS };
  for (const arg of args) {
    const match = arg.match(/^--threshold(?:-([a-z]+))?=(0(?:\.\d+)?|1(?:\.0+)?)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (key && !METRIC_KEYS.includes(key)) throw new Error(`未知指标：${key}`);
    const keys = key ? [key] : METRIC_KEYS;
    for (const metricKey of keys) thresholds[metricKey] = Number(rawValue);
  }
  return thresholds;
}

function percent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function printReport(result, thresholds) {
  console.log(`2026-07-26 独立验收 benchmark：${result.samples} 张图片`);
  console.log("输入仅含原始文件名和 OCR 文本；真值标签未传入 classify/resolve。");
  console.log("");
  for (const metric of Object.values(result.metrics)) {
    const threshold = thresholds[metric.key];
    const status = metric.accuracy >= threshold ? "PASS" : "FAIL";
    console.log(
      `${status} ${metric.label}: ${percent(metric.accuracy)} `
      + `(${metric.correct}/${metric.total})，门槛 ${percent(threshold)}`
    );
    for (const failure of metric.failures) {
      console.log(`  - ${failure.id}: 期望=${failure.expected}；实际=${failure.actual}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const thresholds = parseThresholds(args);
  const result = evaluateAcceptance();
  printReport(result, thresholds);
  const failed = gateResult(result, thresholds);
  if (failed.length && !args.includes("--report-only")) {
    console.error(`\n门禁失败：${failed.map((metric) => metric.label).join("、")}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
