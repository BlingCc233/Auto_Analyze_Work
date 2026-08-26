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
  normalizeRoutePhotos,
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

test("recognizes accident handling and keeps the generated narrative factual", () => {
  const classified = classifyImage({
    fileName: "事故现场.jpg",
    ocrText: "12:34 2026-08-16 西过境出口 交通事故 现场安全警戒 应急处置"
  });
  assert.equal(classified.event, "accident");

  const draft = buildDraft({
    date: "2026-08-16",
    routeKey: "west",
    vehicle: "青A33W69",
    officers: ["李彩燕"],
    startTime: "12:20",
    endTime: "13:10",
    confirmedCondition: "畅通",
    photos: [{
      originalName: "事故现场.jpg",
      routeKey: "west",
      place: "事故处理点",
      time: "12:34",
      event: "accident",
      confidence: "high",
      include: true
    }]
  });

  assert.deepEqual(draft.eventTypes, ["accident"]);
  assert.match(draft.focus, /事故处理/);
  assert.match(draft.narrative, /开展现场安全警戒和处置/);
  assert.match(draft.narrative, /人员伤亡、路产损失及恢复通行情况以现场核验登记为准/);
  assert.doesNotMatch(draft.narrative, /未发现异常情况/);
  assert.equal(draft.attachments[0].event, "accident");
});

test("recognizes construction supervision as a patrol event", () => {
  const result = classifyImage({
    fileName: "施工监管.jpg",
    ocrText: "10:30 2026-08-24 S101余家村 施工现场 作业安全"
  });
  assert.equal(result.event, "construction");
  assert.equal(result.place, "施工监管点");
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

test("prefers a valid watermark clock before the date over a bad time crop", () => {
  assert.equal(
    timeFromOcrEvidence(
      "09.21\n2026-08-04\n西宁市•鲸油能源加油加气站\nETC车辆靠中",
      "05:45"
    ),
    "09:21"
  );
});

test("uses all 2026-08-14 watermark clocks instead of bad crop candidates", () => {
  const samples = [
    ["10:14", "02:14"],
    ["10.:301", "10:30"],
    ["10:421", ""],
    ["L10-52", "11:20"],
    ["11:15", "15:12"],
    ["11:211", "12:11"],
    ["11:33", "13:12"],
    ["11:551", "15:51"]
  ];
  assert.deepEqual(
    samples.map(([clock, crop]) => timeFromOcrEvidence(
      `${clock}\n12026-08-14\n星期五晴19C`,
      crop
    )),
    ["10:14", "10:30", "10:42", "10:52", "11:15", "11:21", "11:33", "11:55"]
  );
});

test("resolves the verified 2026-08-09 G6 turnaround from route topology", () => {
  const samples = [
    ["微信图片_20260809140952_1_70.jpg", "09:20\n12026-08-09\n西宁市·鲁青水上公园"],
    ["微信图片_20260809140956_2_70.jpg", "09:36\nT2026-08-09\n海东市·西宁东收费站(G0611张汶高速入口西北向)"],
    ["微信图片_20260809141038_3_70.jpg", "09:46\nL2026-08-09\n海东市：G6京藏高速\nETC专用"],
    ["微信图片_20260809141039_4_70.jpg", "09:56\n12026-08-09\n海东市：西宁东收费站(G0611张汶高速入口西北向)"],
    ["微信图片_20260809141041_5_70.jpg", "1202608-09\n11:44\n西宁市·南辅路\n柴达木路\n祁连路"]
  ];
  const resolved = resolvePhotoAssignments(samples.map(([fileName, ocrText]) =>
    classifyImage({ fileName, ocrText })
  ));

  assert.deepEqual(resolved.map(({ time, place, routeKey }) => ({ time, place, routeKey })), [
    { time: "09:20", place: "朝阳立交", routeKey: "g6" },
    { time: "09:36", place: "西宁东收费口", routeKey: "g6" },
    { time: "09:46", place: "平安收费站", routeKey: "g6" },
    { time: "09:56", place: "西宁东收费口", routeKey: "g6" },
    { time: "11:44", place: "柴达木路高速路口", routeKey: "g6" }
  ]);
});

test("resolves the verified 2026-08-14 G6 and western patrols", () => {
  const samples = [
    ["微信图片_20260814123104_16_70.jpg", "10:14\n12026-08-14\n西宁市·锦绣江南"],
    ["微信图片_20260814123105_17_70.jpg", "10:30\n12026-08-14\n海东市·G0611张汶高速"],
    ["微信图片_20260814123106_18_70.jpg", "10:42\n2026-08-14\n海东市·平安收费站(G6京藏高速出口)"],
    ["微信图片_20260814123107_19_70.jpg", "L10-52\n12026-08-14具\n海东市·海东收费站1G061张汶高速东南向）"],
    ["微信图片_20260814123108_20_70.jpg", "11:15\n12026-08-14\n西宁市·万佳家博园"],
    ["微信图片_20260814123109_21_70.jpg", "11:211\n12026-08-14\n西宁市·西宁市城北区阳光宝贝幼儿园"],
    ["微信图片_20260814123110_22_70.jpg", "11:33\n12026-08-14\n西宁市·109国道"],
    ["微信图片_20260814123111_23_70.jpg", "11:551\n12026-08-14\n西宁市·G6京藏高速\n大面山腿道"]
  ];
  const resolved = resolvePhotoAssignments(samples.map(([fileName, ocrText]) =>
    classifyImage({ fileName, ocrText })
  ));

  assert.deepEqual(resolved.map(({ time, place, routeKey, semanticPoint }) => ({
    time, place, routeKey, semanticPoint
  })), [
    { time: "10:14", place: "朝阳立交", routeKey: "g6", semanticPoint: "朝阳互通立交" },
    { time: "10:30", place: "海东主线收费站", routeKey: "g6", semanticPoint: "海东主线收费站" },
    { time: "10:42", place: "平安收费站", routeKey: "g6", semanticPoint: "平安收费站" },
    { time: "10:52", place: "海东收费站出口", routeKey: "g6", semanticPoint: "海东主线收费站出口" },
    { time: "11:15", place: "大酉山隧道", routeKey: "west", semanticPoint: "大酉山隧道右幅" },
    { time: "11:21", place: "西钢出口", routeKey: "west", semanticPoint: "西钢出口" },
    { time: "11:33", place: "西宁西收费站", routeKey: "west", semanticPoint: "西宁西收费站" },
    { time: "11:55", place: "大酉山隧道", routeKey: "west", semanticPoint: "大酉山隧道左幅" }
  ]);
  assert.equal(new Set(resolved.slice(0, 4).map((photo) => photo.recordGroup)).size, 1);
  assert.equal(new Set(resolved.slice(4).map((photo) => photo.recordGroup)).size, 1);
  assert.notEqual(resolved[0].recordGroup, resolved[4].recordGroup);
});

test("reads compact watermark time before the date instead of later road text", () => {
  const text = [
    "1109",
    "2026-08-04",
    "星期二 晴19°C",
    "西宁市™S1113宁贵高速",
    "0.08-2191"
  ].join("\n");
  assert.equal(timeFromOcr(text), "11:09");
  assert.equal(timeFromOcrEvidence(text, ""), "11:09");
});

test("uses the complete clock line when OCR emits a stray hour above it", () => {
  assert.equal(
    timeFromOcrEvidence("09\n09:08\n2026=08-04\n西宁市•西宁特殊钢股份有限公司", ""),
    "09:08"
  );
});

test("resolves the 2026-08-04 western patrol from watermark evidence and topology", () => {
  const samples = [
    ["微信图片_20260804113749_155_43.jpg", "08:57\n2026-08-04\n西宁市：S1113宁贵高速", "08:57"],
    ["微信图片_20260804113750_156_43.jpg", "08:59\n2026-08-04\n西宁市•G0611张汶高速\nG6\n湟源 格尔木", ""],
    ["微信图片_20260804113751_157_43.jpg", "09.02\n2026¥08 04\n西宁市：公铁联运钢材市场\n大酉山隧道", ""],
    ["微信图片_20260804113752_158_43.jpg", "09\n09:08\n2026=08-04\n西宁市•西宁特殊钢股份有限公司\n西钢", ""],
    ["微信图片_20260804113753_159_43.jpg", "09.21\n2026-08-04\n西宁市•鲸油能源加油加气站\nG6京藏高速\nETC车辆靠中", "05:45"],
    ["微信图片_20260804113754_160_43.jpg", "11:01\n2026-08-04\n西宁市•G6京藏高速\n海拔：2369.5米", "11:01"],
    ["微信图片_20260804113755_161_43.jpg", "1109\n2026-08-04\n西宁市™S1113宁贵高速\n西昆仑大道\n西塔高速\n0.08-2191", ""]
  ];
  const resolved = resolvePhotoAssignments(samples.map(([fileName, ocrText, timeOcrText]) =>
    classifyImage({ fileName, ocrText, timeOcrText })
  ));

  assert.deepEqual(resolved.map(({ time, place, routeKey }) => ({ time, place, routeKey })), [
    { time: "08:57", place: "高速入口", routeKey: "west" },
    { time: "08:59", place: "西宁西方向", routeKey: "west" },
    { time: "09:02", place: "大酉山隧道", routeKey: "west" },
    { time: "09:08", place: "西钢出口", routeKey: "west" },
    { time: "09:21", place: "西宁西收费站", routeKey: "west" },
    { time: "11:01", place: "大酉山隧道", routeKey: "west" },
    { time: "11:09", place: "西过境出口", routeKey: "west" }
  ]);
  assert.equal(resolved.filter((photo) => ["review", "context"].includes(photo.confidence)).length, 0);
  const draft = buildDraft({
    date: "2026-08-04",
    routeKey: "west",
    vehicle: "青A33W69",
    officers: ["宁戎"],
    startTime: "08:52",
    endTime: "11:14",
    photos: resolved
  });
  assert.match(draft.narrative, /08时57分进入管辖路段/);
  assert.match(draft.narrative, /11时09分从西过境出口驶离管辖路段，返回大队/);
  assert.doesNotMatch(draft.narrative, /巡查至连接段/);
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

test("splits the 2026-08-05 sequential west and G6 patrols", () => {
  const samples = [
    ["微信图片_20260805123235_179_43.jpg", "09:39\n2026-08-05\n西宁市 S1113宁贵高速"],
    ["微信图片_20260805123235_180_43.jpg", "09:42\n2026-08-05\n西宁市 西宁北站"],
    ["微信图片_20260805123236_181_43.jpg", "2026-08-05\n09.4\n大西山隧道\n2540\n西宁市 天津路", "09.44"],
    ["微信图片_20260805123237_182_43.jpg", "10:02\n2026-08-05\n西宁市 多巴凤凰新型农村社区\nETC车辆靠中"],
    ["微信图片_20260805123238_183_43.jpg", "10:47\n2026-08-05\n大酉山隧道\n西宁市 G6京藏高速"],
    ["微信图片_20260805123239_184_43.jpg", "10:55\n2026-08-05\n西宁市 南辅路"],
    ["微信图片_20260805123240_185_43.jpg", "10:55\n2026-08-05\n西宁城区\n韵家口\n峡口"],
    ["微信图片_20260805123241_186_43.jpg", "11:08\n2026-08-05\n海东市 G0611张汶高速\nETC"],
    ["微信图片_20260805123242_187_43.jpg", "11:17\n2026-08-05\n海东市 平安区安居小区\n收费站 ETC"],
    ["微信图片_20260805123243_188_43.jpg", "11:26\n2026-08-05\n海东市 G0611张汶高速"],
    ["微信图片_20260805123244_189_43.jpg", "6-08-E\n柴达木路\n海湖路 通海路\n塔尔寺 祁连路"]
  ];
  const resolved = resolvePhotoAssignments(samples.map(([fileName, ocrText, timeOcrText]) =>
    classifyImage({ fileName, ocrText, timeOcrText })
  ));
  assert.deepEqual(
    resolved.map((photo) => [photo.time, photo.routeKey, photo.place]),
    [
      ["09:39", "west", "高速入口"],
      ["09:42", "west", "西宁西方向"],
      ["09:44", "west", "大酉山隧道"],
      ["10:02", "west", "西宁西收费站"],
      ["10:47", "west", "大酉山隧道"],
      ["10:55", "west", "西过境出口"],
      ["10:55", "g6", "同仁路口驶入高速"],
      ["11:08", "g6", "海东主线收费站"],
      ["11:17", "g6", "平安收费站"],
      ["11:26", "g6", "海东主线收费站"],
      ["11:41", "g6", "柴达木路高速路口"]
    ]
  );
  assert.equal(new Set(resolved.map((photo) => photo.patrolGroup)).size, 2);
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

test("keeps the verified August 26 G6 series in one automatic batch", () => {
  const photos = resolvePhotoAssignments([
    ["微信图片_20260826174733_157_70.jpg", "15:06 2026-08-26 西宁市 祁连路派出所 G6京藏高速公路平西段"],
    ["微信图片_20260826174734_158_70.jpg", "15:22 2026-08-26 海东市 G0611张汶高速 G6京藏高速公路平西段"],
    ["微信图片_20260826174735_159_70.jpg", "16:01 2026-08-26 ETC专用 未授权位置 G6京藏高速公路平西段"],
    ["微信图片_20260826174736_160_70.jpg", "16:23 2026-08-26 未授权位置 G6京藏高速公路平西段"],
    ["微信图片_20260826174737_161_70.jpg", "17:40 2026-08-26 西宁市 北禅路 禁达木错 通海络 塔尔寺祁连路 海湖路 G6京藏高速公路平西段"]
  ].map(([fileName, ocrText]) => classifyImage({ fileName, ocrText })));

  assert.deepEqual(
    photos.map((photo) => [photo.time, photo.routeKey, photo.place]),
    [
      ["15:06", "g6", "同仁路口驶入高速"],
      ["15:22", "g6", "海东主线收费站"],
      ["16:01", "g6", "平安收费站"],
      ["16:23", "g6", "海东主线收费站"],
      ["17:40", "g6", "柴达木路高速路口"]
    ]
  );
  assert.equal(new Set(photos.map((photo) => photo.contextBatch)).size, 1);
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
  const topologyConfirmed = photos.filter((photo) =>
    photo.confidence === "topology"
  );
  assert.equal(topologyConfirmed.length, 3);
  for (const photo of topologyConfirmed) {
    assert.match(photo.reason, /自动确认/);
    assert.doesNotMatch(photo.reason, /需人工确认/);
  }
  assert.equal(routeReadiness("g6", photos).reviewCount, 0);
  assert.equal(routeReadiness("west", photos).reviewCount, 0);
});

test("resolves the July 28 west patrol, removes duplicates and excludes post-route transit", () => {
  const photos = [
    {
      fileName: "微信图片_20260728114245_144_43.jpg",
      ocrText: "11:09 未授权位置 2026-07-28 西宁南收费站",
      timeOcrText: "11:09"
    },
    {
      fileName: "微信图片_20260728114249_145_43.jpg",
      ocrText: "10:58 未授权位置 2026-07-28",
      timeOcrText: "10:58"
    },
    {
      fileName: "微信图片_20260728114250_146_43.jpg",
      ocrText: "09:23 2026-07-28 西宁市 S1113宁贵高速 大通 湟源 兰州 防伪TYUA2KKK1BGDN9",
      timeOcrText: "09:23"
    },
    {
      fileName: "微信图片_20260728114251_147_43.jpg",
      ocrText: "09:25 2026-07-28 G0611张汶高速 门源 G6 湟源 格尔木 西宁城区 海湖大道 西钢 多巴",
      timeOcrText: "09:25"
    },
    {
      fileName: "微信图片_20260728114252_148_43.jpg",
      ocrText: "09:28 2026-07-28 前方隧道2540m 西宁市 青海格桑花生物科技股份有限公司",
      timeOcrText: "09:28"
    },
    {
      fileName: "微信图片_20260728114254_149_43.jpg",
      ocrText: "10:01 2026-07-28 西宁市 G6京藏高速 海拔：2384.8米",
      timeOcrText: "10:01"
    },
    {
      fileName: "微信图片_20260728114255_150_43.jpg",
      ocrText: "10:02 2026-07-28 西宁市 G6京藏高速 海拔：2389.9米",
      timeOcrText: "10:02"
    },
    {
      fileName: "微信图片_20260728114256_151_43.jpg",
      ocrText: "10:28 2026-07-28 西宁市 G0611 大通 门源",
      timeOcrText: "10:28"
    },
    {
      fileName: "微信图片_20260728114405_152_43.jpg",
      ocrText: "09:23 2026-07-28 西宁市 S1113宁贵高速 大通 湟源 兰州 防伪TYUA2KKK1BGDN9",
      timeOcrText: "09:23"
    }
  ].map(classifyImage);
  const resolved = resolvePhotoAssignments(photos);
  const included = normalizeRoutePhotos("west", resolved);

  assert.deepEqual(
    included.map((photo) => [photo.time, photo.place, photo.confidence]),
    [
      ["09:23", "高速入口", "topology"],
      ["09:25", "西宁西方向", "topology"],
      ["09:28", "大酉山隧道", "high"],
      ["10:01", "西宁西收费站", "topology"],
      ["10:02", "西宁西收费站", "topology"],
      ["10:28", "西过境出口", "topology"]
    ]
  );
  assert.equal(routeReadiness("west", resolved).reviewCount, 0);
  assert.equal(resolved.find((photo) => photo.captureOrder === 152).confidence, "excluded");
  assert.match(resolved.find((photo) => photo.captureOrder === 152).reason, /重复照片/);
  assert.deepEqual(
    resolved
      .filter((photo) => [144, 145].includes(photo.captureOrder))
      .map((photo) => photo.confidence),
    ["excluded", "excluded"]
  );
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

test("defaults an unlabelled image between validated route anchors to a removable facility survey", () => {
  const photos = resolvePhotoAssignments([
    classifyImage({ fileName: "1.jpg", ocrText: "09:02 大酉山隧道" }),
    classifyImage({ fileName: "2.jpg", ocrText: "09:20 西宁市 G6京藏高速" }),
    classifyImage({ fileName: "3.jpg", ocrText: "09:35 西宁西收费站 G6西向" })
  ]);
  assert.equal(photos[1].routeKey, "west");
  assert.equal(photos[1].place, "路域设施勘察");
  assert.equal(photos[1].event, "facility-survey");
  assert.equal(photos[1].confidence, "topology");
  assert.equal(photos[1].include, true);
  assert.match(photos[1].reason, /手动排除/);
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
