import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDraft,
  buildJournalDraft,
  buildRoadBulletin,
  classifyImage,
  coordinatesFromOcr,
  groupRoutePhotos,
  inferRouteTimeRange,
  placeAssignment,
  resolvePhotoAssignments,
  routeReadiness,
  timeFromOcr,
  timeFromOcrEvidence
} from "../src/domain.js";

test("classifies historical naming convention from a daily image name", () => {
  const result = classifyImage({ fileName: "同仁路口驶入高速1.jpg" });
  assert.equal(result.place, "同仁路口驶入高速");
  assert.equal(result.proposedName, "同仁路口驶入高速1.jpg");
  assert.equal(result.confidence, "high");
});

test("uses OCR time and verified G6 image in the generated draft", () => {
  const draft = buildDraft({
    date: "2026-07-26",
    routeKey: "g6",
    vehicle: "青A99R18",
    officers: ["张彩琪", "李彩燕", "黄昇鹏"],
    startTime: "08:00",
    endTime: "12:00",
    photos: [{
      originalName: "朝阳立交2.jpg",
      routeKey: "g6",
      place: "朝阳立交",
      time: "11:50",
      proposedName: "朝阳立交2.jpg",
      confidence: "high",
      include: true
    }]
  });
  assert.match(draft.narrative, /11时50分巡查至朝阳立交/);
  assert.match(draft.narrative, /未拍摄路段需由提交人现场确认/);
  assert.equal(draft.routeCode, "G6");
});

test("uses the historical Haidong main toll station wording in G6 narratives", () => {
  const draft = buildDraft({
    date: "2026-07-26",
    routeKey: "g6",
    vehicle: "青A99R18",
    officers: ["张彩琪", "李彩燕", "黄昇鹏"],
    startTime: "08:00",
    endTime: "12:00",
    photos: [{
      originalName: "海东收费站入口2.jpg",
      routeKey: "g6",
      place: "海东收费站入口",
      time: "09:20",
      proposedName: "海东主线收费站.jpg",
      confidence: "high",
      include: true
    }],
    confirmedCondition: "畅通"
  });
  assert.match(
    draft.narrative,
    /09时20分巡查至海东主线收费站 K1779\+800m，收费站交通秩序正常/
  );
  assert.doesNotMatch(draft.narrative, /巡查至海东收费站入口/);
});

test("writes the return-leg transition after G6 and S101 turnaround points", () => {
  const g6 = buildDraft({
    date: "2026-07-26",
    routeKey: "g6",
    vehicle: "青A99R18",
    officers: ["李彩燕"],
    startTime: "08:52",
    endTime: "11:55",
    photos: [{
      originalName: "平安收费站.jpg",
      routeKey: "g6",
      place: "平安收费站",
      time: "09:29",
      confidence: "high",
      include: true
    }]
  });
  const s101 = buildDraft({
    date: "2026-07-26",
    routeKey: "s101",
    vehicle: "青A99R18",
    officers: ["李彩燕"],
    startTime: "09:35",
    endTime: "10:22",
    photos: [{
      originalName: "互助东收费站.jpg",
      routeKey: "s101",
      place: "互助东收费站",
      time: "09:58",
      confidence: "high",
      include: true
    }]
  });
  assert.match(g6.narrative, /从平安收费站调头.*西宁方向/);
  assert.match(s101.narrative, /从互助东收费站调头.*互助往韵家口方向/);
});

test("merges the western entry and Xining-west direction at the same timestamp", () => {
  const draft = buildDraft({
    date: "2026-07-26",
    routeKey: "west",
    vehicle: "青A33W69",
    officers: ["宁戎", "杨富强"],
    startTime: "08:00",
    endTime: "12:00",
    photos: [{
      originalName: "1.jpg",
      routeKey: "west",
      place: "西宁西方向",
      time: "08:57",
      proposedName: "西宁西方向.jpg",
      confidence: "high",
      include: true
    }],
    confirmedCondition: "畅通"
  });
  assert.match(
    draft.narrative,
    /08时57分进入管辖路段G6京藏高速公路西过境段K1800\+500m-K1836\+000m（西宁往湟源方向），沿西宁西方向开展公路巡查/
  );
  assert.equal((draft.narrative.match(/08时57分/g) || []).length, 1);
});

test("writes a western turnaround when one toll photo is bounded by both tunnel passes", () => {
  const draft = buildDraft({
    date: "2026-07-14",
    routeKey: "west",
    vehicle: "青A33W69",
    officers: ["宁戎", "杨富强"],
    startTime: "10:58",
    endTime: "11:57",
    photos: [
      { originalName: "1.jpg", routeKey: "west", place: "大酉山隧道", time: "11:08", confidence: "high", include: true },
      { originalName: "2.jpg", routeKey: "west", place: "西宁西收费站", time: "11:28", confidence: "high", include: true },
      { originalName: "3.jpg", routeKey: "west", place: "大酉山隧道", time: "11:47", confidence: "high", include: true }
    ]
  });
  assert.match(draft.narrative, /到达西宁西收费站.*随后调头.*湟源往西宁方向/);
});

test("reads watermark time near the date instead of a road-sign time range", () => {
  assert.equal(timeFromOcr("7:00-21:00 G6 15:43 西宁市 2026-07-23 星期四"), "15:43");
  assert.equal(timeFromOcr("2026-07-26 09:42 星期日"), "09:42");
  assert.equal(timeFromOcr("10:501 2026-07-22"), "10:50");
});

test("combines an independently cropped clock with the full watermark hour", () => {
  assert.equal(
    timeFromOcrEvidence(
      "1研曝完之德\n星期日 晴25°C\n西宁市•南辅路",
      "1.41'"
    ),
    "11:41"
  );
});

test("infers a route record window from the first and last included photos", () => {
  assert.deepEqual(inferRouteTimeRange("g6", [
    { routeKey: "g6", include: true, time: "08:57" },
    { routeKey: "west", include: true, time: "09:02" },
    { routeKey: "g6", include: true, time: "11:50" },
    { routeKey: "g6", include: false, time: "18:01" }
  ]), {
    startTime: "08:52",
    endTime: "11:55",
    firstPhotoTime: "08:57",
    lastPhotoTime: "11:50",
    paddingMinutes: 5
  });
});

test("separates western bypass photos from G6 flat-section photos", () => {
  const groups = groupRoutePhotos([
    classifyImage({ fileName: "微信图片.jpg", ocrText: "09:02 大酉山隧道 G6" }),
    classifyImage({ fileName: "平安收费站4.jpg", ocrText: "09:29 平安收费站" })
  ]);
  assert.equal(groups.west[0].proposedName, "大酉山隧道.jpg");
  assert.equal(groups.g6[0].place, "平安收费站");
});

test("recognizes Xinghai Road 79 as the G6 Chaoyang interchange without coordinates", () => {
  const photo = classifyImage({
    fileName: "微信图片_20260727124748_134_43.jpg",
    ocrText: [
      "10:19",
      "2026-07-27",
      "西宁市•兴海路79号院",
      "大通",
      "湟源",
      "兰州"
    ].join("\n")
  });
  assert.equal(photo.routeKey, "g6");
  assert.equal(photo.place, "朝阳立交");
  assert.equal(photo.confidence, "high");
  assert.equal(photo.proposedName, "朝阳立交.jpg");
});

test("resolves the complete July 27 G6 sequence without contextual review", () => {
  const photos = resolvePhotoAssignments([
    classifyImage({
      fileName: "微信图片_20260727124741_131_43.jpg",
      ocrText: "11:29 2026-07-27 西宁市 S1113宁贵高速 柴达木路 海湖路 通海路 祁连路 胜利路"
    }),
    classifyImage({
      fileName: "微信图片_20260727124744_132_43.jpg",
      ocrText: "10:53 2026-07-27 海东市 平安区体育公园 ETC"
    }),
    classifyImage({
      fileName: "微信图片_20260727124747_133_43.jpg",
      ocrText: [
        "1035",
        "2026-07-27",
        "星期一 晴 22°C",
        "海东市•G0611张汶高速",
        "中隊",
        "海拔：2162.1米",
        "工作单位：省交通综合执法西宁高速支队韵家口大队",
        "备注：G6京藏（北京至西藏）高速公路平西段、西过境段",
        "S101西互（西宁至互助）高速公路"
      ].join("\n")
    }),
    classifyImage({
      fileName: "微信图片_20260727124748_134_43.jpg",
      ocrText: "10:19 2026-07-27 西宁市 兴海路79号院 大通 湟源 兰州"
    })
  ]);
  const ordered = [...photos].sort((left, right) => left.time.localeCompare(right.time));

  assert.deepEqual(ordered.map((photo) => [
    photo.time,
    photo.routeKey,
    photo.place,
    photo.confidence
  ]), [
    ["10:19", "g6", "朝阳立交", "high"],
    ["10:35", "g6", "海东主线收费站", "high"],
    ["10:53", "g6", "平安收费站", "high"],
    ["11:29", "g6", "柴达木路高速路口", "topology"]
  ]);
  assert.equal(routeReadiness("g6", photos).reviewCount, 0);
  assert.equal(routeReadiness("g6", photos).ready, true);
});

test("separates the complete July 27 morning and afternoon patrols from one WeChat series", () => {
  const fixtures = [
    {
      fileName: "微信图片_20260727124741_131_43.jpg",
      ocrText: "柴达木路\n海湖路\n通海路\n祁连路\n胜利路\n1129\n2026-0727\n星期一晴 24°C\n西宁市•S1113宁贵高速",
      timeOcrText: "11:29"
    },
    {
      fileName: "微信图片_20260727124744_132_43.jpg",
      ocrText: "10:53\n2026-07-27\n星期一晴24°C\nETCS\n海东市•平安区体育公园",
      timeOcrText: "10:53"
    },
    {
      fileName: "微信图片_20260727124747_133_43.jpg",
      ocrText: "1035\n2026-07-27\n星期一 晴 22°C\n海东市•G0611张汶高速",
      timeOcrText: "10:35"
    },
    {
      fileName: "微信图片_20260727124748_134_43.jpg",
      ocrText: "10:19\n2026-07-27\n星期一晴22°C\n西宁市•兴海路79号院\n大通\n湟源\n兰州",
      timeOcrText: "10:19"
    },
    {
      fileName: "微信图片_20260727152314_136_43.jpg",
      ocrText: "13:01\n西宁市•万方城\n2026-07-27\n星期一晴27°C\n海拔：2252.8米"
    },
    {
      fileName: "微信图片_20260727152315_137_43.jpg",
      ocrText: "G6\n湟源 格尔木\n生物园区\n13:05\n2026-07-27\n西宁市•闽宁钢材交易市场\n事故多发路段谨慎驾驶\n匝道\n1804",
      timeOcrText: "13:05"
    },
    {
      fileName: "微信图片_20260727152319_138_43.jpg",
      ocrText: "13:08\n2026-07-27\n西宁市：海湖路互通式立交桥\n海拔：2316.5米",
      timeOcrText: "13:08"
    },
    {
      fileName: "微信图片_20260727152321_139_43.jpg",
      ocrText: "13:27\n2026-07-27\n西宁市•G6京藏高速\n海拔：2434.0米\nETC车辆靠中",
      timeOcrText: "13:27"
    }
  ];
  const photos = resolvePhotoAssignments(fixtures.map(classifyImage));
  const ordered = [...photos].sort((left, right) => left.time.localeCompare(right.time));

  assert.deepEqual(ordered.map((photo) => [
    photo.time,
    photo.routeKey,
    photo.place,
    photo.confidence
  ]), [
    ["10:19", "g6", "朝阳立交", "high"],
    ["10:35", "g6", "海东主线收费站", "high"],
    ["10:53", "g6", "平安收费站", "high"],
    ["11:29", "g6", "柴达木路高速路口", "topology"],
    ["13:01", "west", "高速入口", "topology"],
    ["13:05", "west", "西宁西方向", "topology"],
    ["13:08", "west", "大酉山隧道", "high"],
    ["13:27", "west", "西宁西收费站", "high"]
  ]);
  assert.equal(new Set(ordered.slice(0, 4).map((photo) => photo.contextBatch)).size, 1);
  assert.equal(new Set(ordered.slice(4).map((photo) => photo.contextBatch)).size, 1);
  assert.notEqual(ordered[0].contextBatch, ordered[4].contextBatch);
  assert.deepEqual(
    routeReadiness("west", photos).included.map((photo) => photo.proposedName),
    ["高速入口.jpg", "西宁西方向.jpg", "大酉山隧道.jpg", "西宁西收费站.jpg"]
  );
  assert.equal(routeReadiness("g6", photos).reviewCount, 0);
  assert.equal(routeReadiness("west", photos).reviewCount, 0);
});

test("keeps a confirmed manual place locked across assignment reruns", () => {
  const classified = classifyImage({
    fileName: "微信图片_20260727152321_139_43.jpg",
    ocrText: "13:27 2026-07-27 西宁市 G6京藏高速"
  });
  const manual = {
    ...classified,
    ...placeAssignment("west", "西宁西收费站"),
    confidence: "manual",
    include: true,
    manualAssignment: true,
    reason: "地点已人工修正。"
  };
  const [resolved] = resolvePhotoAssignments([manual]);

  assert.equal(resolved.routeKey, "west");
  assert.equal(resolved.place, "西宁西收费站");
  assert.equal(resolved.pointId, "west-toll");
  assert.equal(resolved.confidence, "manual");
  assert.equal(resolved.include, true);
});

test("keeps interleaved same-time patrols on different routes separate", () => {
  const photos = resolvePhotoAssignments([
    classifyImage({
      fileName: "微信图片_20260727100000_1_43.jpg",
      ocrText: "09:00 2026-07-27 西宁市 兴海路79号院"
    }),
    classifyImage({
      fileName: "微信图片_20260727100001_2_43.jpg",
      ocrText: "09:01 2026-07-27 西宁市 万方城"
    }),
    classifyImage({
      fileName: "微信图片_20260727100002_3_43.jpg",
      ocrText: "09:05 2026-07-27 西宁市 海湖路互通式立交桥"
    }),
    classifyImage({
      fileName: "微信图片_20260727100003_4_43.jpg",
      ocrText: "09:06 2026-07-27 海东市 平安区体育公园"
    }),
    classifyImage({
      fileName: "微信图片_20260727100004_5_43.jpg",
      ocrText: "09:10 2026-07-27 海东市 曹家堡东收费站"
    }),
    classifyImage({
      fileName: "微信图片_20260727100005_6_43.jpg",
      ocrText: "09:20 2026-07-27 西宁市 西宁西收费站 G6京藏高速西向"
    })
  ]);

  assert.deepEqual(
    photos.filter((photo) => photo.routeKey === "g6").map((photo) => photo.place),
    ["朝阳立交", "平安收费站", "曹家堡东收费站"]
  );
  assert.deepEqual(
    photos.filter((photo) => photo.routeKey === "west").map((photo) => photo.place),
    ["高速入口", "大酉山隧道", "西宁西收费站"]
  );
  assert.equal(routeReadiness("g6", photos).reviewCount, 0);
  assert.equal(routeReadiness("west", photos).reviewCount, 0);
});

test("does not discard an S1113 connector photo without route context", () => {
  const photo = classifyImage({ fileName: "微信图片.jpg", ocrText: "08:57 西宁市 S1113宁贵高速" });
  assert.equal(photo.confidence, "review");
  assert.equal(photo.include, false);
});

test("defers unauthorized locations to route context and excludes distant photos", () => {
  const photo = classifyImage({ fileName: "微信图片.jpg", ocrText: "18:01 未授权位置" });
  assert.equal(photo.confidence, "review");
  assert.equal(photo.include, false);
  const resolved = resolvePhotoAssignments([
    classifyImage({ fileName: "1.jpg", ocrText: "09:02 大酉山隧道" }),
    classifyImage({ fileName: "2.jpg", ocrText: "09:35 西宁西收费站" }),
    photo
  ]);
  assert.equal(resolved[2].confidence, "excluded");
  assert.equal(resolved[2].include, false);
});

test("accepts a partial western patrol while preserving its coverage warning", () => {
  const photos = [
    classifyImage({ fileName: "1.jpg", ocrText: "09:00 G0611 张汶高速 生物园" }),
    classifyImage({ fileName: "2.jpg", ocrText: "09:02 大酉山隧道" }),
    classifyImage({ fileName: "3.jpg", ocrText: "09:35 西宁西收费站 G6西向" }),
    classifyImage({ fileName: "4.jpg", ocrText: "09:53 大酉山隧道" })
  ];
  const readiness = routeReadiness("west", resolvePhotoAssignments(photos));
  assert.equal(readiness.ready, true);
  assert.equal(readiness.partial, false);
  assert.deepEqual(readiness.included.map((photo) => photo.proposedName), [
    "高速入口.jpg",
    "大酉山隧道1.jpg",
    "西宁西收费站.jpg",
    "大酉山隧道2.jpg"
  ]);
});

test("marks an unlabelled image between validated route anchors for review instead of inventing a station", () => {
  const photos = resolvePhotoAssignments([
    classifyImage({ fileName: "1.jpg", ocrText: "09:02 大酉山隧道" }),
    classifyImage({ fileName: "2.jpg", ocrText: "09:20 西宁市 G6京藏高速" }),
    classifyImage({ fileName: "3.jpg", ocrText: "09:35 西宁西收费站 G6西向" })
  ]);
  assert.equal(photos[1].routeKey, "west");
  assert.equal(photos[1].place, "连接/待确认节点");
  assert.equal(photos[1].confidence, "context");
  assert.equal(photos[1].include, true);
});

test("gives an exact coordinate cluster priority over a broad road-sign alias", () => {
  const photo = classifyImage({
    fileName: "05.jpg",
    ocrText: "朝阳北 09:54 西宁市城北区 青海建国物流 经纬度：36.650965°N,101.775090°E"
  });
  assert.equal(photo.place, "西过境出口");
  assert.equal(photo.routeKey, "west");
  assert.equal(photo.confidence, "high");
});

test("repairs common OCR coordinate punctuation variants within Qinghai bounds", () => {
  assert.deepEqual(
    coordinatesFromOcr("经纬度：36.641503°N,1017720919E"),
    { latitude: 36.641503, longitude: 101.7720919 }
  );
  assert.deepEqual(
    coordinatesFromOcr("经纬度：36.6653112N,101/743038°E"),
    { latitude: 36.6653112, longitude: 101.743038 }
  );
});

test("generates a road bulletin without unsupported full-route claims", () => {
  const reviewBulletin = buildRoadBulletin({
    date: "2026-07-26",
    weather: "晴",
    routeKeys: ["g6", "west"],
    confirmedCondition: "待确认"
  });
  const confirmedBulletin = buildRoadBulletin({
    date: "2026-07-26",
    weather: "晴",
    routeKeys: ["g6"],
    confirmedCondition: "畅通"
  });
  assert.match(reviewBulletin, /未核验路段不自动表述为全线畅通/);
  assert.match(confirmedBulletin, /道路畅通/);
});

test("builds a journal association draft from route drafts", () => {
  const draft = buildDraft({
    date: "2026-07-26",
    routeKey: "west",
    vehicle: "青A33W69",
    officers: ["宁戎", "杨富强"],
    startTime: "08:00",
    endTime: "12:00",
    photos: [classifyImage({ fileName: "大酉山隧道.jpg", ocrText: "09:02 大酉山隧道" })]
  });
  const journal = buildJournalDraft({ date: "2026-07-26", drafts: [draft] });
  assert.equal(journal.scheduleAssociation[0].route, "G6京藏高速公路西过境段");
  assert.match(journal.content, /大酉山隧道/);
});
