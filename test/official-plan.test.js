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
    vehicle: "青A8A971",
    officers: ["宁戎", "杨富强"],
    startTime: "08:00",
    endTime: "12:00",
    photos,
    confirmedCondition: "畅通"
  });
}

function july27Drafts() {
  const photos = resolvePhotoAssignments([
    classifyImage({
      fileName: "微信图片_20260727124741_131_43.jpg",
      ocrText: "柴达木路\n海湖路\n通海路\n祁连路\n胜利路\n1129\n2026-0727\n星期一晴 24°C\n西宁市•S1113宁贵高速",
      timeOcrText: "11:29"
    }),
    classifyImage({
      fileName: "微信图片_20260727124744_132_43.jpg",
      ocrText: "10:53\n2026-07-27\n星期一晴24°C\nETCS\n海东市•平安区体育公园",
      timeOcrText: "10:53"
    }),
    classifyImage({
      fileName: "微信图片_20260727124747_133_43.jpg",
      ocrText: "1035\n2026-07-27\n星期一 晴 22°C\n海东市•G0611张汶高速",
      timeOcrText: "10:35"
    }),
    classifyImage({
      fileName: "微信图片_20260727124748_134_43.jpg",
      ocrText: "10:19\n2026-07-27\n星期一晴22°C\n西宁市•兴海路79号院\n大通\n湟源\n兰州",
      timeOcrText: "10:19"
    }),
    classifyImage({
      fileName: "微信图片_20260727152314_136_43.jpg",
      ocrText: "13:01\n西宁市•万方城\n2026-07-27\n星期一晴27°C\n海拔：2252.8米"
    }),
    classifyImage({
      fileName: "微信图片_20260727152315_137_43.jpg",
      ocrText: "G6\n湟源 格尔木\n生物园区\n13:05\n2026-07-27\n西宁市•闽宁钢材交易市场\n事故多发路段谨慎驾驶\n匝道\n1804",
      timeOcrText: "13:05"
    }),
    classifyImage({
      fileName: "微信图片_20260727152319_138_43.jpg",
      ocrText: "13:08\n2026-07-27\n西宁市：海湖路互通式立交桥\n海拔：2316.5米",
      timeOcrText: "13:08"
    }),
    classifyImage({
      fileName: "微信图片_20260727152321_139_43.jpg",
      ocrText: "13:27\n2026-07-27\n西宁市•G6京藏高速\n海拔：2434.0米\nETC车辆靠中",
      timeOcrText: "13:27"
    })
  ]);
  return [
    buildDraft({
      date: "2026-07-27",
      routeKey: "g6",
      vehicle: "青A99R18",
      officers: ["张彩琪", "李彩燕", "黄昇鹏"],
      startTime: "10:14",
      endTime: "11:34",
      photos,
      confirmedCondition: "畅通"
    }),
    buildDraft({
      date: "2026-07-27",
      routeKey: "west",
      vehicle: "青A8A971",
      officers: ["宁戎", "杨富强"],
      startTime: "12:56",
      endTime: "13:32",
      photos,
      confirmedCondition: "畅通"
    })
  ];
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
  assert.equal(plan.records[0].payload.address, "韵家口大队");
  assert.equal(plan.records[0].payload.drivingDirection, "全程");
  assert.equal(plan.records[0].payload.personName, "宁戎,杨富强,");
  assert.equal(plan.records[0].attachments.length, 3);
  assert.equal(plan.journals[0].payload.weather, "1");
});

test("carries patrol event focus into new schedules without changing the official check type", () => {
  const draft = westDraft();
  draft.focus = `${draft.focus}；事故处理；施工监管`;
  draft.checkType = "公路巡查";
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

  assert.match(plan.schedules[0].payload.content, /事故处理；施工监管/);
  assert.equal(plan.records[0].payload.checkType, "公路巡查");
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

test("updates only the uniquely matching July 27 records and keeps supplemental evidence", () => {
  const drafts = july27Drafts();
  const sources = new Map(drafts.flatMap((draft) =>
    draft.readiness.included.map((photo) => [
      photo.originalName,
      { mimeType: "image/jpeg", dataBase64: "/9j/2Q==" }
    ])
  ));
  const existingDay = {
    schedules: [
      {
        scheduleId: "schedule-g6-early",
        plateNumbers: "青A99R18",
        lawEnforcementOfficials: "张景雲;张彩琪",
        patrolRoute: "G6",
        content: "公路保通",
        times: 1
      },
      {
        scheduleId: "schedule-g6-target",
        plateNumbers: "青A8A971",
        lawEnforcementOfficials: "黄昇鹏;李芬红;段小燕",
        patrolRoute: "G6",
        content: "公路巡查，张贴宣传海报",
        times: 1
      },
      {
        scheduleId: "schedule-west-target",
        plateNumbers: "青A8A971",
        lawEnforcementOfficials: "黄昇鹏;李芬红;马玲瑞",
        patrolRoute: "G6京藏高速公路西过境段",
        content: "公路巡查",
        times: 1
      }
    ],
    records: [
      {
        recordId: "record-01602",
        recordNum: "01602",
        checkStartTime: "2026-07-27 07:00:00",
        checkEndTime: "2026-07-27 09:36:00",
        roadNum: "G6",
        roadName: "京藏高速公路",
        listAtt: [
          { storageId: "early-1", name: "朝阳1.JPG", path: "/early-1" },
          { storageId: "early-2", name: "平安收费站.JPG", path: "/early-2" }
        ]
      },
      {
        recordId: "record-01603",
        recordNum: "01603",
        checkStartTime: "2026-07-27 10:15:00",
        checkEndTime: "2026-07-27 11:35:00",
        roadNum: "G6",
        roadName: "京藏高速公路",
        describes: [
          "10时15分巡查人员从大队出发开始巡查；",
          "11时10分巡查至海东主线收费站，张贴宣传海报并查看治超数据。",
          "11时35分返回大队，巡查结束。"
        ].join("\n"),
        listAtt: [
          { storageId: "g6-1", name: "朝阳立交1.jpg", path: "/g6-1" },
          { storageId: "g6-2", name: "海东主线收费站.jpg", path: "/g6-2" },
          { storageId: "g6-3", name: "平安收费站.jpg", path: "/g6-3" },
          { storageId: "g6-extra", name: "张贴海报.jpg", path: "/g6-extra" },
          { storageId: "g6-wrong", name: "朝阳立交2.jpg", path: "/g6-wrong" }
        ]
      },
      {
        recordId: "record-01604",
        recordNum: "01604",
        checkStartTime: "2026-07-27 12:55:00",
        checkEndTime: "2026-07-27 18:00:00",
        roadNum: "G6京藏高速公路西过境段",
        roadName: "G6京藏高速公路西过境段",
        listAtt: [
          { storageId: "west-1", name: "高速入口.jpg", path: "/west-1" },
          { storageId: "west-2", name: "大酉山隧道.jpg", path: "/west-2" },
          { storageId: "west-3", name: "西宁西收费站.jpg", path: "/west-3" }
        ]
      }
    ],
    journals: [
      {
        checklogId: "journal-01602",
        scheduleId: "schedule-g6-early",
        recordIds: ["record-01602"]
      },
      {
        checklogId: "journal-01603",
        scheduleId: "schedule-g6-target",
        recordIds: ["record-01603"]
      }
    ]
  };

  const plan = buildOfficialSubmitPlan({
    date: "2026-07-27",
    drafts,
    weather: "晴",
    existingDay,
    attachmentSources: sources
  });
  const [g6Schedule, westSchedule] = plan.schedules;
  const [g6Record, westRecord] = plan.records;
  const [g6Journal, westJournal] = plan.journals;

  assert.equal(g6Schedule.mode, "update");
  assert.equal(g6Schedule.payload.scheduleId, "schedule-g6-target");
  assert.equal(g6Schedule.payload.content, "公路巡查，张贴宣传海报");
  assert.equal(westSchedule.mode, "update");
  assert.equal(westSchedule.payload.scheduleId, "schedule-west-target");

  assert.equal(g6Record.mode, "update");
  assert.equal(g6Record.payload.recordId, "record-01603");
  assert.equal(g6Record.payload.recordNum, "01603");
  assert.equal(g6Record.payload.checkType, "公路巡查");
  assert.equal(g6Record.payload.address, "韵家口大队");
  assert.equal(g6Record.payload.drivingDirection, "全程");
  assert.equal(westRecord.payload.recordId, "record-01604");
  assert.equal(westRecord.payload.recordNum, "01604");
  assert.equal(
    plan.records.some((item) => item.payload.recordId === "record-01602"),
    false
  );
  assert.deepEqual(
    g6Record.payload.listAtt.map((entry) => entry.name),
    ["朝阳立交.jpg", "海东主线收费站.jpg", "平安收费站.jpg", "张贴海报.jpg"]
  );
  assert.deepEqual(
    g6Record.attachments.map((entry) => entry.name),
    ["柴达木路高速路口.jpg"]
  );
  assert.match(g6Record.payload.describes, /11时10分.*张贴宣传海报并查看治超数据/);
  assert.match(g6Record.payload.describes, /11时29分巡查至柴达木路高速路口/);
  assert.deepEqual(
    westRecord.attachments.map((entry) => entry.name),
    ["西宁西方向.jpg"]
  );
  assert.deepEqual(westRecord.attachmentOrder, [
    "高速入口.jpg",
    "西宁西方向.jpg",
    "大酉山隧道.jpg",
    "西宁西收费站.jpg"
  ]);

  assert.equal(g6Journal.mode, "update");
  assert.equal(g6Journal.payload.checklogId, "journal-01603");
  assert.equal(westJournal.mode, "upsert");
  assert.equal("checklogId" in westJournal.payload, false);
});
