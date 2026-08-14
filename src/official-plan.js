import { ROUTES } from "./domain.js";

export const OFFICIAL_PROFILE = Object.freeze({
  oid: "009ee4f252643b7ea9a50e4ed47f0d23",
  cateId: "1002000100000000",
  cateName: "公路路政",
  checkCategory: "ccbc9991ac759a654259abafb36e38b7",
  checkType: "公路巡查",
  address: "韵家口大队",
  drivingDirection: "全程",
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

function routeKeyForExistingRoute(value) {
  const text = String(value ?? "");
  if (/西过境/.test(text)) return "west";
  if (/S101|西宁高速/.test(text)) return "s101";
  if (/(^|[,;])G6($|[,;])|京藏高速/.test(text)) return "g6";
  return "";
}

function uniqueExisting(items, label) {
  if (items.length > 1) {
    throw new Error(`${label}存在${items.length}条候选，无法自动选择更新目标`);
  }
  return items[0] ?? null;
}

function toMinuteStamp(value) {
  const match = String(value ?? "").match(
    /^(\d{4})-(\d{2})-(\d{2})[ T]([01]\d|2[0-3]):([0-5]\d)/
  );
  if (!match) return Number.NaN;
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5])
  ) / 60000;
}

function overlapMinutes(leftStart, leftEnd, rightStart, rightEnd) {
  const starts = [toMinuteStamp(leftStart), toMinuteStamp(rightStart)];
  const ends = [toMinuteStamp(leftEnd), toMinuteStamp(rightEnd)];
  if ([...starts, ...ends].some((value) => !Number.isFinite(value))) return 0;
  return Math.max(0, Math.min(...ends) - Math.max(...starts));
}

function canonicalAttachmentName(value) {
  return String(value ?? "")
    .replace(/\.[^.]+$/, "")
    .replace(/\s+/g, "")
    .replace(/([^\d])\d+$/, "$1")
    .replace(/海东收费站(?:入口|出口)?/g, "海东主线收费站")
    .replace(/韵家口主线收费站/g, "海东主线收费站")
    .replace(/收费口/g, "收费站")
    .replace(/同仁路口驶入高速|西过境入口/g, "高速入口")
    .replace(/大酉山隧道[左右幅]$/g, "大酉山隧道");
}

function existingAttachmentPlan(record, photos, attachmentSources) {
  if (!record) {
    return {
      listAtt: [],
      uploads: photos.map((photo) => attachmentFor(photo, attachmentSources)),
      order: photos.map((photo) => photo.proposedName)
    };
  }

  const existing = Array.isArray(record.listAtt) ? record.listAtt : [];
  const consumed = new Set();
  const retained = [];
  const uploads = [];
  const ordered = [];
  const plannedCanonical = new Set(
    photos.map((photo) => canonicalAttachmentName(photo.proposedName))
  );

  photos.forEach((photo, photoIndex) => {
    const canonical = canonicalAttachmentName(photo.proposedName);
    const matchIndex = existing.findIndex((entry, index) =>
      !consumed.has(index)
      && canonicalAttachmentName(entry.name) === canonical
    );
    if (matchIndex === -1) {
      uploads.push(attachmentFor(photo, attachmentSources));
      ordered.push({ name: photo.proposedName, rank: photoIndex, index: existing.length + photoIndex });
      return;
    }
    consumed.add(matchIndex);
    const entry = {
      ...existing[matchIndex],
      name: photo.proposedName
    };
    retained.push(entry);
    ordered.push({ name: entry.name, rank: photoIndex, index: matchIndex });
  });

  existing.forEach((entry, index) => {
    if (consumed.has(index)) return;
    if (plannedCanonical.has(canonicalAttachmentName(entry.name))) return;
    retained.push(entry);
    const previous = ordered
      .filter((item) => item.index < index && Number.isInteger(item.rank))
      .sort((left, right) => right.index - left.index)[0];
    const next = ordered
      .filter((item) => item.index > index && Number.isInteger(item.rank))
      .sort((left, right) => left.index - right.index)[0];
    const rank = previous && next && next.rank > previous.rank
      ? (previous.rank + next.rank) / 2
      : previous
        ? previous.rank + 0.5
        : next
          ? next.rank - 0.5
          : photos.length + 0.5;
    ordered.push({ name: entry.name, rank, index });
  });
  return {
    listAtt: retained,
    uploads,
    order: ordered
      .sort((left, right) => left.rank - right.rank || left.index - right.index)
      .map((item) => item.name)
  };
}

function normalizeLine(value) {
  return String(value ?? "").replace(/\s+/g, "");
}

function lineTime(value) {
  const match = String(value ?? "").match(/(\d{1,2})时(\d{1,2})分/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
}

function mergeSupplementalNarrative(existing, generated) {
  if (!existing || normalizeLine(existing) === normalizeLine(generated)) return generated;
  const activityPattern = /施工|养护|绿化|治超|超限|超载|宣传|海报|保通|驻守|方舱|检查|核查|整改|处置|应急|事故|违法|通行受限|拥堵|缓行/;
  const supplemental = String(existing)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      line
      && !/^巡查期间/.test(line)
      && activityPattern.test(line)
      && !normalizeLine(generated).includes(normalizeLine(line))
    );
  if (!supplemental.length) return generated;

  const lines = String(generated).split(/\r?\n/);
  for (const line of supplemental) {
    const at = lineTime(line);
    const sameTime = Number.isFinite(at)
      ? lines.findIndex((entry) => lineTime(entry) === at)
      : -1;
    if (sameTime >= 0) {
      if (!activityPattern.test(lines[sameTime])) lines[sameTime] = line;
      continue;
    }
    const conclusion = lines.findIndex((entry) => /^巡查期间/.test(entry));
    const later = Number.isFinite(at)
      ? lines.findIndex((entry, index) =>
        index > 0
        && Number.isFinite(lineTime(entry))
        && lineTime(entry) > at
      )
      : -1;
    const insertAt = later >= 0
      ? later
      : conclusion >= 0
        ? conclusion
        : lines.length;
    lines.splice(insertAt, 0, line);
  }
  return lines.join("\n");
}

function recordMatchScore(record, draft, routeKey) {
  if (routeKeyForExistingRecord(record) !== routeKey) return null;
  const overlap = overlapMinutes(
    record.checkStartTime,
    record.checkEndTime,
    draft.startTime,
    draft.endTime
  );
  if (overlap <= 0) return null;

  const draftStart = toMinuteStamp(draft.startTime);
  const draftEnd = toMinuteStamp(draft.endTime);
  const recordStart = toMinuteStamp(record.checkStartTime);
  const recordEnd = toMinuteStamp(record.checkEndTime);
  const draftDuration = Math.max(1, draftEnd - draftStart);
  const coverage = overlap / draftDuration;
  if (coverage < 0.5) return null;

  const plannedNames = new Set(
    draft.readiness.included.map((photo) => canonicalAttachmentName(photo.proposedName))
  );
  const existingNames = new Set(
    (record.listAtt || []).map((entry) => canonicalAttachmentName(entry.name))
  );
  const attachmentMatches = [...plannedNames].filter((name) => existingNames.has(name)).length;
  const startDelta = Math.abs(recordStart - draftStart);
  const endDelta = Math.abs(recordEnd - draftEnd);
  return coverage * 100
    + attachmentMatches * 24
    + Math.max(0, 30 - startDelta)
    + Math.max(0, 20 - endDelta / 3);
}

function selectExistingRecord(existingDay, draft, routeKey, claimedIds) {
  const candidates = (existingDay?.records || [])
    .filter((record) => !claimedIds.has(record.recordId))
    .map((record) => ({
      record,
      score: recordMatchScore(record, draft, routeKey)
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score);
  if (!candidates.length) return null;
  if (
    candidates.length > 1
    && candidates[0].score - candidates[1].score < 25
  ) {
    throw new Error(`${ROUTES[routeKey].label}当天现场记录存在多个接近候选，拒绝自动覆盖`);
  }
  return candidates[0].record;
}

function recordIdsForJournal(journal) {
  if (Array.isArray(journal.recordIds)) return journal.recordIds.map(String);
  return normalizeDelimited(journal.recordsIds);
}

function selectExistingJournal(existingDay, record, claimedIds) {
  if (!record) return null;
  const matches = (existingDay?.journals || []).filter((journal) =>
    !claimedIds.has(journal.checklogId)
    && recordIdsForJournal(journal).includes(String(record.recordId))
  );
  return uniqueExisting(matches, `现场记录${record.recordNum || record.recordId}关联日志`);
}

function selectExistingSchedule(existingDay, {
  routeKey,
  draft,
  journal,
  record,
  claimedIds
}) {
  const schedules = (existingDay?.schedules || [])
    .filter((schedule) => !claimedIds.has(schedule.scheduleId));
  if (journal?.scheduleId) {
    const match = schedules.find((schedule) => schedule.scheduleId === journal.scheduleId);
    if (!match) throw new Error(`未找到日志关联排班${journal.scheduleId}`);
    const unrelated = (existingDay?.journals || []).filter((entry) =>
      entry.scheduleId === match.scheduleId
      && entry.checklogId !== journal.checklogId
      && !recordIdsForJournal(entry).includes(String(record?.recordId || ""))
    );
    if (unrelated.length) {
      throw new Error(`${ROUTES[routeKey].label}目标排班还关联其他日志，拒绝自动覆盖`);
    }
    return match;
  }

  const sameRoute = schedules.filter((schedule) =>
    routeKeyForExistingRoute(schedule.patrolRoute) === routeKey
  );
  const sameVehicle = sameRoute.filter((schedule) =>
    String(schedule.plateNumbers || "").trim() === String(draft.vehicle || "").trim()
  );
  if (sameVehicle.length) {
    return uniqueExisting(sameVehicle, `${ROUTES[routeKey].label}同车排班`);
  }
  const samePeople = sameRoute.filter((schedule) =>
    equalSets(
      schedule.lawEnforcementOfficials,
      draft.officers.join(";")
    )
  );
  return uniqueExisting(samePeople, `${ROUTES[routeKey].label}同人员排班`);
}

function parseKilometer(value) {
  const match = String(value).match(/K?(\d+)\+(\d+)/i);
  return match ? { kilometer: match[1], meter: match[2] } : { kilometer: "", meter: "" };
}

function officialRecordTitle(date) {
  const [year, month, day] = String(date).split("-");
  return `${year}年${month}月${day}日巡查记录`;
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
  existingDay = null,
  attachmentSources = new Map(),
  dryRun = true,
  confirmToken = ""
}) {
  const usable = drafts.filter((draft) => draft.readiness?.included?.length);
  if (!usable.length) throw new Error("没有可提交的线路");

  const schedules = [];
  const records = [];
  const journals = [];
  const claimedScheduleIds = new Set();
  const claimedRecordIds = new Set();
  const claimedJournalIds = new Set();
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
    const existingRecord = selectExistingRecord(
      existingDay,
      draft,
      routeKey,
      claimedRecordIds
    );
    const existingJournal = selectExistingJournal(
      existingDay,
      existingRecord,
      claimedJournalIds
    );
    const existingSchedule = selectExistingSchedule(existingDay, {
      routeKey,
      draft,
      journal: existingJournal,
      record: existingRecord,
      claimedIds: claimedScheduleIds
    });
    if (existingRecord) claimedRecordIds.add(existingRecord.recordId);
    if (existingJournal) claimedJournalIds.add(existingJournal.checklogId);
    if (existingSchedule) claimedScheduleIds.add(existingSchedule.scheduleId);

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
      times: Number(existingSchedule?.times) || 1,
      content: existingSchedule?.content || api.scheduleContent,
      oid: OFFICIAL_PROFILE.oid,
      approve: existingSchedule?.approve ?? "",
      ...(existingSchedule ? { scheduleId: existingSchedule.scheduleId } : {})
    };
    schedules.push({
      clientRef: scheduleRef,
      mode: existingSchedule ? "update" : "upsert",
      payload: schedulePayload
    });

    const narrative = mergeSupplementalNarrative(
      existingRecord?.describes,
      draft.narrative
    );
    const attachmentPlan = existingAttachmentPlan(
      existingRecord,
      draft.readiness.included,
      attachmentSources
    );
    const recordPayload = {
      ...(existingRecord?.recordNum ? { recordNum: existingRecord.recordNum } : {}),
      oid: OFFICIAL_PROFILE.oid,
      checkStartTime: draft.startTime,
      checkEndTime: draft.endTime,
      checkCategory: OFFICIAL_PROFILE.checkCategory,
      checkType: existingRecord?.checkType || OFFICIAL_PROFILE.checkType,
      address: OFFICIAL_PROFILE.address,
      cateId: OFFICIAL_PROFILE.cateId,
      cateName: OFFICIAL_PROFILE.cateName,
      roadCondition: "1",
      drivingDirection: OFFICIAL_PROFILE.drivingDirection,
      roadNum: api.roadNum,
      roadName: api.roadName,
      startKilometer: start.kilometer,
      startMeter: start.meter,
      endKilometer: end.kilometer,
      endMeter: end.meter,
      ...(existingRecord?.desTemplateId
        ? { desTemplateId: existingRecord.desTemplateId }
        : {}),
      describes: narrative,
      personIds: `${ids.join(",")},`,
      personName: `${draft.officers.join(",")},`,
      certificateId: existingRecord?.certificateId || "",
      listPer: people,
      listAtt: attachmentPlan.listAtt,
      listAbn: Array.isArray(existingRecord?.listAbn) ? existingRecord.listAbn : [],
      listCaseDocs: Array.isArray(existingRecord?.listCaseDocs)
        ? existingRecord.listCaseDocs
        : [],
      carCondition: existingRecord?.carCondition || "完好",
      carConditionDescribe: existingRecord?.carConditionDescribe || "",
      equipmentCondition: existingRecord?.equipmentCondition || "齐全",
      equipmentConditionDescribe: existingRecord?.equipmentConditionDescribe || "",
      ...(existingRecord?.includingPeople
        ? { includingPeople: existingRecord.includingPeople }
        : {}),
      ...(existingRecord?.successor ? { successor: existingRecord.successor } : {}),
      ...(existingRecord?.manager ? { manager: existingRecord.manager } : {}),
      ...(existingRecord ? { recordId: existingRecord.recordId } : {})
    };
    records.push({
      clientRef: recordRef,
      scheduleRef,
      mode: existingRecord ? "update" : "upsert",
      payload: recordPayload,
      attachments: attachmentPlan.uploads,
      attachmentOrder: attachmentPlan.order
    });

    const journalPayload = {
      oid: OFFICIAL_PROFILE.oid,
      title: officialRecordTitle(date),
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
      other: `1. ${narrative}`,
      saveStatus: "2",
      storageId: existingJournal?.storageId || "",
      ...(existingJournal ? { checklogId: existingJournal.checklogId } : {})
    };
    journals.push({
      clientRef: `journal-${routeKey}`,
      scheduleRef,
      recordRefs: [recordRef],
      mode: existingJournal ? "update" : "upsert",
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
