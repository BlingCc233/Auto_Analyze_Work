import test from "node:test";
import assert from "node:assert/strict";
import { buildDraft, classifyImage, resolvePhotoAssignments } from "../src/domain.js";
import {
  OFFICIAL_PERSONNEL_NAMES,
  buildOfficialSubmitPlan,
  registerOfficialPersonnel
} from "../src/official-plan.js";

function westDraft() {
  const photos = resolvePhotoAssignments([
    classifyImage({
      fileName: "微信图片_20260726221659_116_43.jpg",
      ocrText: "08:57 S1113宁贵高速 湟源 兰州 2026-07-26"
    }),
    classifyImage({
      fileName: "微信图片_20260726221702_118_43.jpg",
      ocrText: "09:02 海湖路互通式立交桥 2546m 2026-07-26"
    }),
    classifyImage({
      fileName: "微信图片_20260726221704_120_43.jpg",
      ocrText: "09:35 西宁西收费站 G6京藏高速西向 2026-07-26"
    })
  ]);
  return buildDraft({
    date: "2026-07-26",
    routeKey: "west",
    vehicle: "青A33W69",
    officers: ["宁戎", "杨富强"],
    startTime: "08:00",
    endTime: "12:00",
    photos,
    confirmedCondition: "畅通"
  });
}

test("builds an idempotent create-or-reuse plan without update identifiers", () => {
  const draft = westDraft();
  const sources = new Map(draft.readiness.included.map((photo) => [
    photo.originalName,
    { mimeType: "image/jpeg", dataBase64: "/9j/2Q==" }
  ]));
  const plan = buildOfficialSubmitPlan({
    date: "2026-07-26",
    drafts: [draft],
    weather: "晴",
    attachmentSources: sources
  });

  assert.equal(plan.dryRun, true);
  assert.equal(plan.schedules[0].mode, "upsert");
  assert.equal(plan.records[0].mode, "upsert");
  assert.equal(plan.journals[0].mode, "upsert");
  assert.equal("scheduleId" in plan.schedules[0].payload, false);
  assert.equal("recordId" in plan.records[0].payload, false);
  assert.equal("checklogId" in plan.journals[0].payload, false);
  assert.equal(plan.records[0].payload.personName, "宁戎,杨富强,");
  assert.equal(plan.records[0].attachments.length, 3);
  assert.equal(plan.journals[0].payload.weather, "1");
});

test("refuses unknown personnel and unresolved photo review", () => {
  const draft = westDraft();
  draft.officers = ["不存在人员"];
  assert.throws(
    () => buildOfficialSubmitPlan({
      date: "2026-07-26",
      drafts: [draft],
      weather: "晴",
      attachmentSources: new Map()
    }),
    /没有“不存在人员”/
  );

  const reviewDraft = westDraft();
  reviewDraft.readiness.reviewCount = 1;
  assert.throws(
    () => buildOfficialSubmitPlan({
      date: "2026-07-26",
      drafts: [reviewDraft],
      weather: "晴",
      attachmentSources: new Map()
    }),
    /仍有1张图片未自动确认/
  );
});

test("exposes the complete brigade roster and accepts synchronized personnel ids", () => {
  assert.deepEqual(OFFICIAL_PERSONNEL_NAMES, [
    "史正健",
    "李得祥",
    "黄昇鹏",
    "张彩琪",
    "李芬红",
    "马玲瑞",
    "唐宁",
    "段小燕",
    "张景雲",
    "李文香",
    "宁戎",
    "兰萍萍",
    "袁燕",
    "李彩燕",
    "杨富强",
    "曹福泰"
  ]);
  assert.equal(registerOfficialPersonnel([
    { name: "段小燕", personId: "person-duan" }
  ]), 1);

  const draft = westDraft();
  draft.officers = ["段小燕"];
  const sources = new Map(draft.readiness.included.map((photo) => [
    photo.originalName,
    { mimeType: "image/jpeg", dataBase64: "/9j/2Q==" }
  ]));
  const plan = buildOfficialSubmitPlan({
    date: "2026-07-26",
    drafts: [draft],
    weather: "晴",
    attachmentSources: sources
  });
  assert.equal(plan.records[0].payload.personName, "段小燕,");
  assert.equal(plan.records[0].payload.personIds, "person-duan,");
});
