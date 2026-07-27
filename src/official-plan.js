import { ROUTES, toDisplayDate } from "./domain.js";

export const OFFICIAL_PROFILE = Object.freeze({
  oid: "009ee4f252643b7ea9a50e4ed47f0d23",
  cateId: "1002000100000000",
  cateName: "公路路政",
  checkCategory: "ccbc9991ac759a654259abafb36e38b7",
  checkType: "公路巡查",
  scheduler: "李彩燕"
});

export const OFFICIAL_PERSONNEL_NAMES = Object.freeze([
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

const KNOWN_PERSONNEL = {
  "李得祥": {
    personId: "4d37c8dbb7754d1kbgab9d73dxxa1859",
    mobile: ""
  },
  "李芬红": {
    personId: "4d37c8dbb7754d1kbgab9d73dxxa3203",
    mobile: ""
  },
  "马玲瑞": {
    personId: "4d37c8dbb7754d1kbgab9d73dxxa2253",
    mobile: ""
  },
  "唐宁": {
    personId: "4d3329417f701e0620a329783bd67713",
    mobile: ""
  },
  "段小燕": {
    personId: "4d37c8dbb7754d1kbgab9d73dxxa3151",
    mobile: ""
  },
  "李文香": {
    personId: "297d70f890d5399007844c3a6f4ee296",
    mobile: ""
  },
  "兰萍萍": {
    personId: "4d37c8dbb7754d1ba342b9d73d03a1117",
    mobile: ""
  },
  "李彩燕": {
    personId: "2f3f4c6093f1b71c1ed1110b0b3db224",
    mobile: ""
  },
  "张彩琪": {
    personId: "4d37c8dbb7754d1ba342b9d73d03a1408",
    mobile: ""
  },
  "黄昇鹏": {
    personId: "4d37c8dbb7754d1ba342b9d73d03a588",
    mobile: ""
  },
  "宁戎": {
    personId: "4d37c8dbb7754d1ba342b9d73d03a602",
    mobile: ""
  },
  "杨富强": {
    personId: "b9543ae2767826275262073adb5fa656",
    mobile: ""
  },
  "史正健": {
    personId: "1ad075a9c9f667558f7cfcb0e3c170fa",
    mobile: ""
  },
  "张景雲": {
    personId: "a637dae125a745b91f3003ab89ee670c",
    mobile: ""
  }
};

export const OFFICIAL_PERSONNEL = Object.seal(Object.fromEntries(
  OFFICIAL_PERSONNEL_NAMES.map((name) => [
    name,
    {
      personId: KNOWN_PERSONNEL[name]?.personId || "",
      mobile: ""
    }
  ])
));

export function registerOfficialPersonnel(entries = []) {
  let synchronized = 0;
  for (const entry of entries) {
    const name = String(
      entry?.name
      || entry?.lawOfficerName
      || entry?.personName
      || ""
    ).trim();
    const personId = String(
      entry?.personId
      || entry?.userId
      || ""
    ).trim();
    const registered = OFFICIAL_PERSONNEL[name];
    if (
      !registered
      || !/^[A-Za-z0-9._:-]{1,160}$/.test(personId)
    ) continue;
    registered.personId = personId;
    synchronized += 1;
  }
  return synchronized;
}

const ROUTE_API = Object.freeze({
  g6: {
    roadNum: "G6",
    roadName: "京藏高速公路",
    patrolRoute: "G6",
    inspectionLength: "33.9",
    scheduleContent: "公路路面、公路附属设施、公路用地及建筑控制区监管"
  },
  west: {
    roadNum: "G6京藏高速公路西过境段",
    roadName: "G6京藏高速公路西过境段",
    patrolRoute: "G6京藏高速公路西过境段",
    inspectionLength: "35.5",
    scheduleContent: "公路路面、公路附属设施、公路用地及建筑控制区监管"
  },
  s101: {
    roadNum: "S101",
    roadName: "西宁高速公路",
    patrolRoute: "S101西宁高速公路（韵家口至互助）",
    inspectionLength: "32.5",
    scheduleContent: "公路路面、公路附属设施、公路用地及建筑控制区监管"
  }
});

const WEATHER_CODE = Object.freeze({
  "晴": "1",
  "多云": "1",
  "阴": "2",
  "风": "3",
  "小雨": "4",
  "中雨": "4",
  "大雨": "4",
  "雨": "4",
  "雪": "5"
});

function normalizeDelimited(value) {
  return [...new Set(String(value ?? "")
    .split(/[;,，；]+/)
    .map((item) => item.trim())
    .filter(Boolean))]
    .sort();
}

function equalSets(left, right) {
  const a = normalizeDelimited(left);
  const b = normalizeDelimited(right);
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function routeKeyForDraft(draft) {
  if (draft.routeKey && ROUTES[draft.routeKey]) return draft.routeKey;
  return Object.keys(ROUTES).find((routeKey) => ROUTES[routeKey].code === draft.routeCode) || "";
}

function routeKeyForExistingRecord(record) {
  const roadNum = String(record.roadNum ?? "");
  const roadName = String(record.roadName ?? "");
  if (/西过境/.test(`${roadNum}${roadName}`)) return "west";
  if (/S101|西宁高速/.test(`${roadNum}${roadName}`)) return "s101";
  if (/(^|[,;])G6($|[,;])|京藏高速/.test(`${roadNum}${roadName}`)) return "g6";
  return "";
}

function uniqueExisting(items, label) {
  if (items.length > 1) {
    throw new Error(`${label}存在${items.length}条候选，无法自动选择更新目标`);
  }
  return items[0] ?? null;
}

function parseKilometer(value) {
  const match = String(value).match(/K?(\d+)\+(\d+)/i);
  return match ? { kilometer: match[1], meter: match[2] } : { kilometer: "", meter: "" };
}

function peopleFor(names) {
  const people = names.map((name) => {
    const registered = OFFICIAL_PERSONNEL[name];
    if (!registered) throw new Error(`官方人员映射中没有“${name}”`);
    if (!registered.personId) {
      throw new Error(`官方人员“${name}”尚未同步，请登录官方系统后重试`);
    }
    return {
      personId: registered.personId,
      personName: name,
      createId: OFFICIAL_PERSONNEL[OFFICIAL_PROFILE.scheduler].personId,
      mobile: registered.mobile
    };
  });
  if (!people.length) throw new Error("每条线路至少需要一名巡查人员");
  return people;
}

function attachmentFor(photo, attachmentSources) {
  const source = attachmentSources.get(photo.originalName);
  if (!source) throw new Error(`缺少附件数据：${photo.originalName}`);
  return {
    name: photo.proposedName,
    mimeType: source.mimeType || "image/jpeg",
    ...(source.path ? { path: source.path } : { dataBase64: source.dataBase64 })
  };
}

export function buildOfficialSubmitPlan({
  date,
  drafts,
  weather,
  attachmentSources = new Map(),
  dryRun = true,
  confirmToken = ""
}) {
  const usable = drafts.filter((draft) => draft.readiness?.included?.length);
  if (!usable.length) throw new Error("没有可提交的线路");

  const schedules = [];
  const records = [];
  const journals = [];
  for (const draft of usable) {
    const routeKey = routeKeyForDraft(draft);
    if (!routeKey) throw new Error(`无法映射线路：${draft.routeCode}`);
    if (!draft.vehicle) throw new Error(`${ROUTES[routeKey].label}缺少车辆`);
    if (!draft.officers?.length) throw new Error(`${ROUTES[routeKey].label}缺少巡查人员`);
    if (draft.roadCondition !== "畅通") {
      throw new Error(`${ROUTES[routeKey].label}路况尚未确认，拒绝自动提交`);
    }
    if (draft.readiness.reviewCount) {
      throw new Error(`${ROUTES[routeKey].label}仍有${draft.readiness.reviewCount}张图片未自动确认`);
    }

    const api = ROUTE_API[routeKey];
    const route = ROUTES[routeKey];
    const people = peopleFor(draft.officers);
    const ids = people.map((person) => person.personId);
    const start = parseKilometer(route.start);
    const end = parseKilometer(route.end);
    const scheduleRef = `schedule-${routeKey}`;
    const recordRef = `record-${routeKey}`;
    const schedulePayload = {
      cateId: OFFICIAL_PROFILE.cateId,
      cateName: OFFICIAL_PROFILE.cateName,
      patrolType: "路巡",
      startTime: `${date} 08:00:00`,
      endTime: `${date} 18:00:00`,
      isUseCar: "1",
      plateNumbers: draft.vehicle,
      lawEnforcementOfficials: draft.officers.join(";"),
      lawEnforcementOfficialsIds: ids.join(";"),
      schedulePersonnel: OFFICIAL_PROFILE.scheduler,
      schedulePersonnelId: OFFICIAL_PERSONNEL[OFFICIAL_PROFILE.scheduler].personId,
      patrolRoute: api.patrolRoute,
      times: 1,
      content: api.scheduleContent,
      oid: OFFICIAL_PROFILE.oid,
      approve: ""
    };
    schedules.push({
      clientRef: scheduleRef,
      mode: "upsert",
      payload: schedulePayload
    });

    const recordPayload = {
      oid: OFFICIAL_PROFILE.oid,
      checkStartTime: draft.startTime,
      checkEndTime: draft.endTime,
      checkCategory: OFFICIAL_PROFILE.checkCategory,
      checkType: OFFICIAL_PROFILE.checkType,
      address: "",
      cateId: OFFICIAL_PROFILE.cateId,
      cateName: OFFICIAL_PROFILE.cateName,
      roadCondition: "1",
      drivingDirection: "",
      roadNum: api.roadNum,
      roadName: api.roadName,
      startKilometer: start.kilometer,
      startMeter: start.meter,
      endKilometer: end.kilometer,
      endMeter: end.meter,
      describes: draft.narrative,
      personIds: `${ids.join(",")},`,
      personName: `${draft.officers.join(",")},`,
      certificateId: "",
      listPer: people,
      listAtt: [],
      listAbn: [],
      listCaseDocs: [],
      carCondition: "完好",
      carConditionDescribe: "",
      equipmentCondition: "齐全",
      equipmentConditionDescribe: ""
    };
    records.push({
      clientRef: recordRef,
      scheduleRef,
      mode: "upsert",
      payload: recordPayload,
      attachments: draft.readiness.included.map((photo) =>
        attachmentFor(photo, attachmentSources)
      )
    });

    const journalPayload = {
      oid: OFFICIAL_PROFILE.oid,
      title: `${toDisplayDate(date)}${route.code}巡查记录`,
      patrolType: "路巡",
      status: "",
      startCheckTime: draft.startTime,
      endCheckTime: draft.endTime,
      weather: WEATHER_CODE[weather] || "1",
      isUseCar: "1",
      plateNumbers: draft.vehicle,
      lawEnforcementOfficials: draft.officers.join(","),
      lawEnforcementOfficialsIds: ids.join(","),
      patrolRoute: api.patrolRoute,
      schedulePersonnel: OFFICIAL_PROFILE.scheduler,
      schedulePersonnelId: OFFICIAL_PERSONNEL[OFFICIAL_PROFILE.scheduler].personId,
      inspectionLength: api.inspectionLength,
      roadCondition: "无异常情况",
      roadProductCondition: "无异常情况",
      buildControlCondition: "无异常情况",
      checkProblem: "/",
      disposed: "/",
      stayDisposed: "/",
      other: `1. ${draft.narrative}`,
      saveStatus: "2",
      storageId: ""
    };
    journals.push({
      clientRef: `journal-${routeKey}`,
      scheduleRef,
      recordRefs: [recordRef],
      mode: "upsert",
      payload: journalPayload
    });
  }

  return {
    date,
    dryRun,
    ...(confirmToken ? { confirmToken } : {}),
    schedules,
    records,
    journals
  };
}
