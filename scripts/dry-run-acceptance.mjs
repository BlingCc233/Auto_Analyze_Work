import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDraft,
  classifyImage,
  resolvePhotoAssignments
} from "../src/domain.js";
import { buildOfficialSubmitPlan } from "../src/official-plan.js";
import { CdpOfficialBridge } from "../server/official-cdp-bridge.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATE = "2026-07-26";

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
}

function buildAcceptanceDrafts() {
  const truth = readJson("data/acceptance/260726-ground-truth.json");
  const ocrEntries = readJson("data/acceptance/260726-ocr.json");
  const ocrByName = new Map(ocrEntries.map((entry) => [
    path.basename(entry.file),
    entry
  ]));
  const photos = truth.map((item) => {
    const ocr = ocrByName.get(item.file);
    return classifyImage({
      fileName: item.file,
      ocrText: ocr?.text || "",
      timeOcrText: ocr?.timeText || ""
    });
  });
  const resolved = resolvePhotoAssignments(photos);
  const profiles = {
    g6: {
      vehicle: "青A99R18",
      officers: ["张彩琪", "李彩燕", "黄昇鹏"]
    },
    west: {
      vehicle: "青A33W69",
      officers: ["宁戎", "杨富强"]
    }
  };
  return Object.entries(profiles).map(([routeKey, profile]) => buildDraft({
    date: DATE,
    routeKey,
    vehicle: profile.vehicle,
    officers: profile.officers,
    startTime: "08:00",
    endTime: "12:00",
    photos: resolved.filter((photo) => photo.routeKey === routeKey),
    confirmedCondition: "畅通"
  }));
}

async function main() {
  const official = new CdpOfficialBridge({
    logger: { log() {}, error() {} }
  });
  try {
    const status = await official.status();
    if (!status.authenticated || !status.serviceReady) {
      throw new Error(status.error?.message || "官方Chrome会话尚未登录或接口服务未就绪");
    }
    const existingDay = await official.queryDay({ date: DATE });
    const drafts = buildAcceptanceDrafts();
    const attachmentSources = new Map();
    for (const draft of drafts) {
      for (const photo of draft.readiness.included) {
        attachmentSources.set(photo.originalName, {
          path: path.join(ROOT, "daily", "260726", photo.originalName),
          mimeType: "image/jpeg"
        });
      }
    }
    const plan = buildOfficialSubmitPlan({
      date: DATE,
      drafts,
      weather: "晴",
      existingDay,
      attachmentSources,
      dryRun: true
    });
    const result = await official.submitPlan(plan);
    console.log(JSON.stringify({
      date: DATE,
      existingCounts: existingDay.counts,
      routes: drafts.map((draft) => ({
        routeKey: draft.routeKey,
        vehicle: draft.vehicle,
        officers: draft.officers,
        startTime: draft.startTime,
        endTime: draft.endTime,
        attachmentNames: draft.attachments.map((item) => item.normalizedName)
      })),
      ready: result.ready,
      conflicts: result.conflicts,
      operations: result.operations,
      attachments: result.attachments,
      confirmationIssued: Boolean(result.confirmation?.confirmToken)
    }, null, 2));
    if (!result.ready) process.exitCode = 1;
  } finally {
    official.dispose();
  }
}

await main();
