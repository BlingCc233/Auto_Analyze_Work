const { createHash, randomBytes, timingSafeEqual } = require("node:crypto");
const { readFile, stat } = require("node:fs/promises");
const { basename, extname } = require("node:path");

const OFFICIAL_ORIGIN = "http://110.167.233.70:8084";
const OFFICIAL_RECORD_URL = `${OFFICIAL_ORIGIN}/#/dutyRecord`;
const OFFICIAL_PARTITION = "persist:official-system";
const CONFIRMATION_TTL_MS = 10 * 60 * 1000;
const ROLLBACK_TTL_MS = 30 * 60 * 1000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_RECORD_ATTACHMENTS = 100;
const MAX_PLAN_ATTACHMENTS = 300;
const MAX_PLAN_ITEMS = 20;

const API = Object.freeze({
  scheduleList: "/check/schedule/cheSchedulePageList",
  scheduleAdd: "/check/schedule/addCheSchedule",
  scheduleUpdate: "/check/schedule/updateCheSchedule",
  scheduleDelete: "/check/schedule/deleteCheScheduleById/",
  recordList: "/check/record/cheRecordPageList",
  recordDetail: "/check/record/cheRecordDetail",
  recordAdd: "/check/record/addCheRecord",
  recordDelete: "/check/record/deleteCheRecordByIds",
  recordLog: "/check/record/getCheRecordLog",
  journalList: "/check/checklog/cheChecklogPageList",
  journalAdd: "/check/checklog/addCheChecklog",
  journalUpdate: "/check/checklog/updateCheChecklog",
  journalDelete: "/check/checklog/deleteCheChecklogById/",
  personnelList: "/case/caseTemplate/lawOfficer/listLawOfficer",
  logout: "/auth/oauth/logout",
  upload: "/system/sys/file/uploadCommon",
  attachmentDelete: "/system/sys/file/delete/"
});

const SENSITIVE_KEY = /^(authorization|cookie|cookies|password|passwd|pwd|secret|set-cookie|token|tokenkey|access[_-]?token|refresh[_-]?token|localstorage|sessionstorage)$/i;
const SENSITIVE_TEXT = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]"],
  [
    /(["']?(?:TokenKey|access[_-]?token|refresh[_-]?token|password|passwd|pwd)["']?\s*[:=]\s*["']?)[^"'\s,;}]+/gi,
    "$1[REDACTED]"
  ],
  [/\b(cookie|set-cookie|authorization)\s*[:=]\s*[^\r\n]+/gi, "$1=[REDACTED]"]
];

const PAYLOAD_KEYS = Object.freeze({
  schedule: new Set([
    "scheduleId", "cateId", "cateName", "patrolType", "startTime", "endTime",
    "isUseCar", "plateNumbers", "lawEnforcementOfficials",
    "lawEnforcementOfficialsIds", "schedulePersonnel", "schedulePersonnelId",
    "patrolRoute", "times", "content", "oid", "approve"
  ]),
  record: new Set([
    "recordId", "oid", "checkStartTime", "checkEndTime", "checkCategory",
    "checkType", "address", "cateId", "cateName", "roadCondition",
    "drivingDirection", "roadNum", "roadName", "startKilometer", "startMeter",
    "endKilometer", "endMeter", "desTemplateId", "describes", "personIds",
    "personName", "certificateId", "listPer", "listAtt", "listAbn",
    "listCaseDocs", "caseDoctypeId", "carCondition", "carConditionDescribe",
    "equipmentCondition", "equipmentConditionDescribe", "includingPeople",
    "successor", "manager"
  ]),
  journal: new Set([
    "checklogId", "oid", "title", "patrolType", "status", "startCheckTime",
    "endCheckTime", "weather", "scheduleId", "recordsIds", "isUseCar",
    "plateNumbers", "lawEnforcementOfficials", "lawEnforcementOfficialsIds",
    "patrolRoute", "schedulePersonnel", "schedulePersonnelId",
    "inspectionLength", "roadCondition", "roadProductCondition",
    "buildControlCondition", "checkProblem", "disposed", "stayDisposed",
    "other", "saveStatus", "storageId"
  ])
});

const REQUIRED_PAYLOAD_FIELDS = Object.freeze({
  schedule: [
    "cateId", "cateName", "patrolType", "startTime", "endTime", "isUseCar",
    "plateNumbers", "lawEnforcementOfficials", "lawEnforcementOfficialsIds",
    "schedulePersonnel", "schedulePersonnelId", "patrolRoute", "times", "content"
  ],
  record: [
    "checkStartTime", "checkEndTime", "checkCategory", "checkType", "address",
    "cateId", "cateName", "roadCondition", "drivingDirection", "roadNum", "roadName", "describes",
    "personIds", "personName", "listPer"
  ],
  journal: [
    "title", "patrolType", "startCheckTime", "endCheckTime", "weather",
    "isUseCar", "plateNumbers", "lawEnforcementOfficials",
    "lawEnforcementOfficialsIds", "patrolRoute", "schedulePersonnel",
    "schedulePersonnelId", "inspectionLength", "roadCondition",
    "roadProductCondition", "buildControlCondition", "saveStatus"
  ]
});

class OfficialSessionError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "OfficialSessionError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) {
    throw new OfficialSessionError("INVALID_SCHEMA", `${label}必须是普通对象`);
  }
}

function assertKnownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new OfficialSessionError("INVALID_SCHEMA", `${label}包含不允许的字段：${key}`);
    }
  }
}

function assertString(value, label, options = {}) {
  const {
    allowEmpty = false,
    max = 4096,
    pattern
  } = options;
  if (typeof value !== "string") {
    throw new OfficialSessionError("INVALID_SCHEMA", `${label}必须是字符串`);
  }
  if (!allowEmpty && !value.trim()) {
    throw new OfficialSessionError("INVALID_SCHEMA", `${label}不能为空`);
  }
  if (value.length > max) {
    throw new OfficialSessionError("INVALID_SCHEMA", `${label}超过最大长度`);
  }
  if (pattern && !pattern.test(value)) {
    throw new OfficialSessionError("INVALID_SCHEMA", `${label}格式不正确`);
  }
  return value;
}

function assertArray(value, label, options = {}) {
  const { min = 0, max = MAX_PLAN_ITEMS } = options;
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new OfficialSessionError(
      "INVALID_SCHEMA",
      `${label}数量必须在${min}至${max}之间`
    );
  }
  return value;
}

function validCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function assertDate(value, label = "date") {
  assertString(value, label, { max: 10 });
  if (!validCalendarDate(value)) {
    throw new OfficialSessionError("INVALID_SCHEMA", `${label}必须是有效的YYYY-MM-DD日期`);
  }
  return value;
}

function addCalendarDays(value, count) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + count));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function validDateTime(value) {
  const match = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/
  );
  if (!match || !validCalendarDate(`${match[1]}-${match[2]}-${match[3]}`)) return false;
  return true;
}

function assertDateTime(value, label, planDate) {
  assertString(value, label, { max: 19 });
  if (!validDateTime(value)) {
    throw new OfficialSessionError("INVALID_SCHEMA", `${label}必须是YYYY-MM-DD HH:mm:ss`);
  }
  if (planDate && !value.startsWith(`${planDate} `)) {
    throw new OfficialSessionError("INVALID_SCHEMA", `${label}必须属于计划日期${planDate}`);
  }
  return value;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateJsonTree(value, label, depth = 0) {
  if (depth > 8) {
    throw new OfficialSessionError("INVALID_SCHEMA", `${label}嵌套过深`);
  }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new OfficialSessionError("INVALID_SCHEMA", `${label}包含无效数字`);
    }
    return;
  }
  if (typeof value === "string") {
    if (value.length > 100000) {
      throw new OfficialSessionError("INVALID_SCHEMA", `${label}包含超长文本`);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 500) {
      throw new OfficialSessionError("INVALID_SCHEMA", `${label}数组过长`);
    }
    value.forEach((entry, index) => validateJsonTree(entry, `${label}[${index}]`, depth + 1));
    return;
  }
  assertPlainObject(value, label);
  if (Object.keys(value).length > 100) {
    throw new OfficialSessionError("INVALID_SCHEMA", `${label}字段过多`);
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      throw new OfficialSessionError("INVALID_SCHEMA", `${label}包含危险字段`);
    }
    validateJsonTree(entry, `${label}.${key}`, depth + 1);
  }
}

function validateIdentifier(value, label, allowEmpty = false) {
  return assertString(value, label, {
    allowEmpty,
    max: 160,
    pattern: allowEmpty
      ? /^[A-Za-z0-9._:-]*$/
      : /^[A-Za-z0-9._:-]+$/
  });
}

function normalizePayload(kind, input, date) {
  assertPlainObject(input, `${kind}.payload`);
  assertKnownKeys(input, PAYLOAD_KEYS[kind], `${kind}.payload`);
  validateJsonTree(input, `${kind}.payload`);

  const payload = cloneJson(input);
  for (const field of REQUIRED_PAYLOAD_FIELDS[kind]) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === "") {
      throw new OfficialSessionError("INVALID_SCHEMA", `${kind}.payload.${field}不能为空`);
    }
  }

  const startField = kind === "schedule"
    ? "startTime"
    : kind === "record"
      ? "checkStartTime"
      : "startCheckTime";
  const endField = kind === "schedule"
    ? "endTime"
    : kind === "record"
      ? "checkEndTime"
      : "endCheckTime";
  assertDateTime(payload[startField], `${kind}.payload.${startField}`, date);
  assertDateTime(payload[endField], `${kind}.payload.${endField}`, date);
  if (payload[startField] > payload[endField]) {
    throw new OfficialSessionError("INVALID_SCHEMA", `${kind}结束时间不得早于开始时间`);
  }

  if (kind === "schedule") {
    if (!Number.isInteger(payload.times) || payload.times < 1 || payload.times > 9999) {
      throw new OfficialSessionError("INVALID_SCHEMA", "schedule.payload.times必须是1至9999的整数");
    }
    if (!["0", "1"].includes(String(payload.isUseCar))) {
      throw new OfficialSessionError("INVALID_SCHEMA", "schedule.payload.isUseCar必须是0或1");
    }
    if (payload.scheduleId !== undefined) {
      validateIdentifier(payload.scheduleId, "schedule.payload.scheduleId");
    }
  }

  if (kind === "record") {
    if (!Array.isArray(payload.listPer) || payload.listPer.length === 0 || payload.listPer.length > 30) {
      throw new OfficialSessionError("INVALID_SCHEMA", "record.payload.listPer必须包含1至30名人员");
    }
    payload.listPer.forEach((person, index) => {
      assertPlainObject(person, `record.payload.listPer[${index}]`);
      assertKnownKeys(
        person,
        new Set(["personId", "personName", "createId", "mobile", "certificateId"]),
        `record.payload.listPer[${index}]`
      );
      assertString(person.personId, `record.payload.listPer[${index}].personId`, { max: 160 });
      assertString(person.personName, `record.payload.listPer[${index}].personName`, { max: 80 });
    });
    for (const listField of ["listAtt", "listAbn", "listCaseDocs"]) {
      if (payload[listField] !== undefined && !Array.isArray(payload[listField])) {
        throw new OfficialSessionError("INVALID_SCHEMA", `record.payload.${listField}必须是数组`);
      }
    }
    if (payload.recordId !== undefined) {
      validateIdentifier(payload.recordId, "record.payload.recordId");
    }
  }

  if (kind === "journal") {
    if (!["1", "2"].includes(String(payload.saveStatus))) {
      throw new OfficialSessionError("INVALID_SCHEMA", "journal.payload.saveStatus必须是1或2");
    }
    if (!["1", "2", "3", "4", "5"].includes(String(payload.weather))) {
      throw new OfficialSessionError("INVALID_SCHEMA", "journal.payload.weather必须是1至5");
    }
    if (payload.checklogId !== undefined && payload.checklogId !== "") {
      validateIdentifier(payload.checklogId, "journal.payload.checklogId");
    }
  }

  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") {
      assertString(value, `${kind}.payload.${key}`, {
        allowEmpty: true,
        max: key === "describes" || key === "other" ? 50000 : 4096
      });
    }
  }
  return payload;
}

function normalizeMode(value) {
  const mode = value === undefined ? "upsert" : value;
  if (!["upsert", "create", "update", "reuse"].includes(mode)) {
    throw new OfficialSessionError(
      "INVALID_SCHEMA",
      "mode必须是upsert、create、update或reuse"
    );
  }
  return mode;
}

function normalizeClientRef(value, label) {
  return assertString(value, label, {
    max: 80,
    pattern: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/
  });
}

function normalizeAttachment(input, index) {
  const label = `record.attachments[${index}]`;
  assertPlainObject(input, label);
  assertKnownKeys(input, new Set(["path", "dataBase64", "name", "mimeType"]), label);
  const name = assertString(input.name, `${label}.name`, { max: 240 });
  if (basename(name) !== name || /[\u0000-\u001f]/.test(name)) {
    throw new OfficialSessionError("INVALID_SCHEMA", `${label}.name必须是安全文件名`);
  }

  const extension = extname(name).toLowerCase();
  if (![".jpg", ".jpeg", ".png"].includes(extension)) {
    throw new OfficialSessionError("INVALID_SCHEMA", `${label}.name仅支持JPG或PNG`);
  }

  const hasPath = typeof input.path === "string" && input.path.length > 0;
  const hasData = typeof input.dataBase64 === "string" && input.dataBase64.length > 0;
  if (hasPath === hasData) {
    throw new OfficialSessionError(
      "INVALID_SCHEMA",
      `${label}必须且只能提供path或dataBase64`
    );
  }

  let dataBase64 = input.dataBase64;
  let inferredMime;
  if (hasData) {
    if (dataBase64.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 256) {
      throw new OfficialSessionError("INVALID_SCHEMA", `${label}.dataBase64超过5MB限制`);
    }
    const dataUrl = dataBase64.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=\r\n]+)$/i);
    if (dataUrl) {
      inferredMime = dataUrl[1].toLowerCase();
      dataBase64 = dataUrl[2];
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64.replace(/\s/g, ""))) {
      throw new OfficialSessionError("INVALID_SCHEMA", `${label}.dataBase64格式不正确`);
    }
  }

  const mimeType = input.mimeType || inferredMime || (
    extension === ".png" ? "image/png" : "image/jpeg"
  );
  if (!["image/jpeg", "image/png"].includes(String(mimeType).toLowerCase())) {
    throw new OfficialSessionError("INVALID_SCHEMA", `${label}.mimeType不受支持`);
  }

  return {
    name,
    mimeType: String(mimeType).toLowerCase(),
    ...(hasPath
      ? { path: assertString(input.path, `${label}.path`, { max: 4096 }) }
      : { dataBase64: dataBase64.replace(/\s/g, "") })
  };
}

function normalizeSubmitPlan(input) {
  assertPlainObject(input, "submitPlan");
  assertKnownKeys(
    input,
    new Set(["date", "dryRun", "confirmToken", "schedules", "records", "journals"]),
    "submitPlan"
  );

  const date = assertDate(input.date, "submitPlan.date");
  if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") {
    throw new OfficialSessionError("INVALID_SCHEMA", "submitPlan.dryRun必须是布尔值");
  }
  const dryRun = input.dryRun !== false;
  const confirmToken = input.confirmToken === undefined
    ? ""
    : assertString(input.confirmToken, "submitPlan.confirmToken", {
      max: 160,
      pattern: /^[A-Za-z0-9_-]+$/
    });
  if (!dryRun && !confirmToken) {
    throw new OfficialSessionError(
      "CONFIRMATION_REQUIRED",
      "线上写入必须携带dryRun预检返回的一次性confirmToken"
    );
  }

  const schedules = assertArray(input.schedules, "submitPlan.schedules", {
    min: 1,
    max: MAX_PLAN_ITEMS
  }).map((item, index) => {
    const label = `submitPlan.schedules[${index}]`;
    assertPlainObject(item, label);
    assertKnownKeys(item, new Set(["clientRef", "mode", "payload"]), label);
    const payload = normalizePayload("schedule", item.payload, date);
    const mode = normalizeMode(item.mode);
    if ((mode === "update" || mode === "reuse") && !payload.scheduleId) {
      throw new OfficialSessionError("INVALID_SCHEMA", `${label}.${mode}必须提供scheduleId`);
    }
    if (mode === "create" && payload.scheduleId) {
      throw new OfficialSessionError("INVALID_SCHEMA", `${label}.create不得提供scheduleId`);
    }
    return {
      clientRef: normalizeClientRef(item.clientRef, `${label}.clientRef`),
      mode,
      payload
    };
  });

  let attachmentCount = 0;
  const records = assertArray(input.records, "submitPlan.records", {
    min: 1,
    max: MAX_PLAN_ITEMS
  }).map((item, index) => {
    const label = `submitPlan.records[${index}]`;
    assertPlainObject(item, label);
    assertKnownKeys(
      item,
      new Set([
        "clientRef",
        "scheduleRef",
        "mode",
        "payload",
        "attachments",
        "attachmentOrder"
      ]),
      label
    );
    const payload = normalizePayload("record", item.payload, date);
    const mode = normalizeMode(item.mode);
    if ((mode === "update" || mode === "reuse") && !payload.recordId) {
      throw new OfficialSessionError("INVALID_SCHEMA", `${label}.${mode}必须提供recordId`);
    }
    if (mode === "create" && payload.recordId) {
      throw new OfficialSessionError("INVALID_SCHEMA", `${label}.create不得提供recordId`);
    }
    const attachments = assertArray(item.attachments || [], `${label}.attachments`, {
      min: 0,
      max: MAX_RECORD_ATTACHMENTS
    }).map(normalizeAttachment);
    const attachmentOrder = assertArray(
      item.attachmentOrder || [],
      `${label}.attachmentOrder`,
      { min: 0, max: MAX_RECORD_ATTACHMENTS }
    ).map((name, attachmentIndex) =>
      assertString(name, `${label}.attachmentOrder[${attachmentIndex}]`, { max: 255 })
    );
    attachmentCount += attachments.length;
    return {
      clientRef: normalizeClientRef(item.clientRef, `${label}.clientRef`),
      scheduleRef: normalizeClientRef(item.scheduleRef, `${label}.scheduleRef`),
      mode,
      payload,
      attachments,
      attachmentOrder
    };
  });
  if (attachmentCount > MAX_PLAN_ATTACHMENTS) {
    throw new OfficialSessionError(
      "INVALID_SCHEMA",
      `单个计划附件总数不得超过${MAX_PLAN_ATTACHMENTS}`
    );
  }

  const journals = assertArray(input.journals, "submitPlan.journals", {
    min: 1,
    max: MAX_PLAN_ITEMS
  }).map((item, index) => {
    const label = `submitPlan.journals[${index}]`;
    assertPlainObject(item, label);
    assertKnownKeys(
      item,
      new Set(["clientRef", "scheduleRef", "recordRefs", "mode", "payload"]),
      label
    );
    const payload = normalizePayload("journal", item.payload, date);
    const mode = normalizeMode(item.mode);
    if ((mode === "update" || mode === "reuse") && !payload.checklogId) {
      throw new OfficialSessionError("INVALID_SCHEMA", `${label}.${mode}必须提供checklogId`);
    }
    if (mode === "create" && payload.checklogId) {
      throw new OfficialSessionError("INVALID_SCHEMA", `${label}.create不得提供checklogId`);
    }
    return {
      clientRef: normalizeClientRef(item.clientRef, `${label}.clientRef`),
      scheduleRef: normalizeClientRef(item.scheduleRef, `${label}.scheduleRef`),
      recordRefs: assertArray(item.recordRefs, `${label}.recordRefs`, {
        min: 1,
        max: MAX_PLAN_ITEMS
      }).map((ref, refIndex) => normalizeClientRef(ref, `${label}.recordRefs[${refIndex}]`)),
      mode,
      payload
    };
  });

  const scheduleRefs = new Set();
  for (const schedule of schedules) {
    if (scheduleRefs.has(schedule.clientRef)) {
      throw new OfficialSessionError("INVALID_SCHEMA", `排班引用重复：${schedule.clientRef}`);
    }
    scheduleRefs.add(schedule.clientRef);
  }
  const recordRefs = new Set();
  for (const record of records) {
    if (recordRefs.has(record.clientRef)) {
      throw new OfficialSessionError("INVALID_SCHEMA", `现场记录引用重复：${record.clientRef}`);
    }
    recordRefs.add(record.clientRef);
    if (!scheduleRefs.has(record.scheduleRef)) {
      throw new OfficialSessionError(
        "INVALID_SCHEMA",
        `现场记录${record.clientRef}引用了不存在的排班${record.scheduleRef}`
      );
    }
  }
  const journalRefs = new Set();
  for (const journal of journals) {
    if (journalRefs.has(journal.clientRef)) {
      throw new OfficialSessionError("INVALID_SCHEMA", `日志引用重复：${journal.clientRef}`);
    }
    journalRefs.add(journal.clientRef);
    if (!scheduleRefs.has(journal.scheduleRef)) {
      throw new OfficialSessionError(
        "INVALID_SCHEMA",
        `日志${journal.clientRef}引用了不存在的排班${journal.scheduleRef}`
      );
    }
    for (const recordRef of journal.recordRefs) {
      if (!recordRefs.has(recordRef)) {
        throw new OfficialSessionError(
          "INVALID_SCHEMA",
          `日志${journal.clientRef}引用了不存在的现场记录${recordRef}`
        );
      }
    }
  }

  return {
    date,
    dryRun,
    confirmToken,
    schedules,
    records,
    journals
  };
}

function normalizeQueryDay(input) {
  const value = typeof input === "string" ? { date: input } : input;
  assertPlainObject(value, "queryDay");
  assertKnownKeys(value, new Set(["date", "oid", "cateId"]), "queryDay");
  const result = { date: assertDate(value.date, "queryDay.date") };
  if (value.oid !== undefined) {
    result.oid = assertString(value.oid, "queryDay.oid", { allowEmpty: true, max: 160 });
  }
  if (value.cateId !== undefined) {
    result.cateId = assertString(value.cateId, "queryDay.cateId", {
      allowEmpty: true,
      max: 160
    });
  }
  return result;
}

function normalizePersonnelQuery(input) {
  assertPlainObject(input, "personnel");
  assertKnownKeys(input, new Set(["oid"]), "personnel");
  return {
    oid: validateIdentifier(input.oid, "personnel.oid")
  };
}

function normalizeReadback(input) {
  assertPlainObject(input, "readback");
  assertKnownKeys(
    input,
    new Set(["date", "scheduleIds", "recordIds", "journalIds"]),
    "readback"
  );
  const result = { date: assertDate(input.date, "readback.date") };
  for (const field of ["scheduleIds", "recordIds", "journalIds"]) {
    result[field] = assertArray(input[field] || [], `readback.${field}`, {
      min: 0,
      max: 100
    }).map((value, index) => validateIdentifier(value, `readback.${field}[${index}]`));
  }
  return result;
}

function normalizeRollback(input) {
  assertPlainObject(input, "rollback");
  assertKnownKeys(input, new Set(["rollbackToken", "confirmToken"]), "rollback");
  return {
    rollbackToken: assertString(input.rollbackToken, "rollback.rollbackToken", {
      max: 160,
      pattern: /^[A-Za-z0-9_-]+$/
    }),
    confirmToken: assertString(input.confirmToken, "rollback.confirmToken", {
      max: 160,
      pattern: /^[A-Za-z0-9_-]+$/
    })
  };
}

function redactText(value) {
  let output = String(value);
  for (const [pattern, replacement] of SENSITIVE_TEXT) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

function sanitizeForRenderer(value, depth = 0, seen = new WeakSet()) {
  if (depth > 12) return "[TRUNCATED]";
  if (value === null || value === undefined || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return redactText(value);
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 1000).map((entry) => sanitizeForRenderer(entry, depth + 1, seen));
  }
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) continue;
    output[key] = sanitizeForRenderer(entry, depth + 1, seen);
  }
  return output;
}

function safeError(error) {
  const code = typeof error?.code === "string" && /^[A-Z0-9_:-]+$/.test(error.code)
    ? error.code
    : "OFFICIAL_OPERATION_FAILED";
  const result = {
    code,
    message: redactText(error?.message || "官方系统操作失败").slice(0, 1000)
  };
  if (error?.details !== undefined) {
    result.details = sanitizeForRenderer(error.details);
  }
  return result;
}

function normalizeDelimited(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => String(entry).trim()).filter(Boolean))].sort();
  }
  return [...new Set(
    String(value ?? "")
      .split(/[;,，；]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  )].sort();
}

function normalizedText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numericTextEqual(left, right) {
  const a = normalizedText(left);
  const b = normalizedText(right);
  if (a === b) return true;
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return false;
  return Number(a) === Number(b);
}

function equalSets(left, right) {
  const a = normalizeDelimited(left);
  const b = normalizeDelimited(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function comparablePeople(record) {
  const directIds = [
    record.lawEnforcementOfficialsIds,
    record.personIds,
    record.personId
  ].find((value) => normalizeDelimited(value).length);
  const listIds = Array.isArray(record.listPer)
    ? record.listPer.map((person) => person?.personId)
    : [];
  const ids = normalizeDelimited(directIds || listIds);
  return ids.length
    ? ids
    : normalizeDelimited(
      record.lawEnforcementOfficials
      || record.personNames
      || record.personName
      || (
        Array.isArray(record.listPer)
          ? record.listPer.map((person) => person?.personName)
          : []
      )
    );
}

function scheduleEquivalent(existing, payload) {
  return normalizedText(existing.cateId) === normalizedText(payload.cateId)
    && normalizedText(existing.oid) === normalizedText(payload.oid)
    && normalizedText(existing.startTime) === normalizedText(payload.startTime)
    && normalizedText(existing.endTime) === normalizedText(payload.endTime)
    && normalizedText(existing.isUseCar) === normalizedText(payload.isUseCar)
    && normalizedText(existing.plateNumbers) === normalizedText(payload.plateNumbers)
    && equalSets(
      existing.lawEnforcementOfficialsIds || existing.lawEnforcementOfficials,
      payload.lawEnforcementOfficialsIds || payload.lawEnforcementOfficials
    )
    && equalSets(existing.patrolRoute, payload.patrolRoute)
    && normalizedText(existing.patrolType) === normalizedText(payload.patrolType)
    && normalizedText(existing.schedulePersonnelId || existing.schedulePersonnel)
      === normalizedText(payload.schedulePersonnelId || payload.schedulePersonnel)
    && normalizedText(existing.content) === normalizedText(payload.content)
    && normalizedText(existing.times) === normalizedText(payload.times);
}

function recordEquivalent(existing, payload) {
  return (!payload.recordNum
      || normalizedText(existing.recordNum) === normalizedText(payload.recordNum))
    && normalizedText(existing.checkStartTime) === normalizedText(payload.checkStartTime)
    && normalizedText(existing.checkEndTime) === normalizedText(payload.checkEndTime)
    && equalSets(comparablePeople(existing), comparablePeople(payload))
    && normalizedText(existing.oid) === normalizedText(payload.oid)
    && normalizedText(existing.cateId) === normalizedText(payload.cateId)
    && normalizedText(existing.checkCategory) === normalizedText(payload.checkCategory)
    && normalizedText(existing.address) === normalizedText(payload.address)
    && normalizedText(existing.roadCondition) === normalizedText(payload.roadCondition)
    && normalizedText(existing.drivingDirection)
      === normalizedText(payload.drivingDirection)
    && equalSets(existing.roadNum, payload.roadNum)
    && equalSets(existing.roadName, payload.roadName)
    && numericTextEqual(existing.startKilometer, payload.startKilometer)
    && numericTextEqual(existing.startMeter, payload.startMeter)
    && numericTextEqual(existing.endKilometer, payload.endKilometer)
    && numericTextEqual(existing.endMeter, payload.endMeter)
    && normalizedText(existing.checkType || existing.checkTypeName)
      === normalizedText(payload.checkType)
    && normalizedText(existing.describes) === normalizedText(payload.describes)
    && normalizedText(existing.carCondition) === normalizedText(payload.carCondition)
    && normalizedText(existing.carConditionDescribe)
      === normalizedText(payload.carConditionDescribe)
    && normalizedText(existing.equipmentCondition)
      === normalizedText(payload.equipmentCondition)
    && normalizedText(existing.equipmentConditionDescribe)
      === normalizedText(payload.equipmentConditionDescribe);
}

function journalEquivalent(existing, payload) {
  const scheduleMatches = !payload.scheduleId
    || normalizedText(existing.scheduleId) === normalizedText(payload.scheduleId);
  return scheduleMatches
    && normalizedText(existing.oid) === normalizedText(payload.oid)
    && normalizedText(existing.title) === normalizedText(payload.title)
    && normalizedText(existing.patrolType) === normalizedText(payload.patrolType)
    && normalizedText(existing.startCheckTime) === normalizedText(payload.startCheckTime)
    && normalizedText(existing.endCheckTime) === normalizedText(payload.endCheckTime)
    && normalizedText(existing.weather) === normalizedText(payload.weather)
    && normalizedText(existing.isUseCar) === normalizedText(payload.isUseCar)
    && normalizedText(existing.plateNumbers) === normalizedText(payload.plateNumbers)
    && equalSets(
      existing.lawEnforcementOfficialsIds || existing.lawEnforcementOfficials,
      payload.lawEnforcementOfficialsIds || payload.lawEnforcementOfficials
    )
    && equalSets(existing.patrolRoute, payload.patrolRoute)
    && normalizedText(existing.schedulePersonnelId || existing.schedulePersonnel)
      === normalizedText(payload.schedulePersonnelId || payload.schedulePersonnel)
    && normalizedText(existing.inspectionLength)
      === normalizedText(payload.inspectionLength)
    && normalizedText(existing.roadCondition) === normalizedText(payload.roadCondition)
    && normalizedText(existing.roadProductCondition)
      === normalizedText(payload.roadProductCondition)
    && normalizedText(existing.buildControlCondition)
      === normalizedText(payload.buildControlCondition)
    && normalizedText(existing.checkProblem) === normalizedText(payload.checkProblem)
    && normalizedText(existing.disposed) === normalizedText(payload.disposed)
    && normalizedText(existing.stayDisposed) === normalizedText(payload.stayDisposed)
    && normalizedText(existing.other) === normalizedText(payload.other);
}

function intervalsOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return String(leftStart) <= String(rightEnd) && String(rightStart) <= String(leftEnd);
}

function setsIntersect(left, right) {
  const values = new Set(normalizeDelimited(left));
  return normalizeDelimited(right).some((value) => values.has(value));
}

function scheduleCollision(existing, payload) {
  if (!intervalsOverlap(existing.startTime, existing.endTime, payload.startTime, payload.endTime)) {
    return false;
  }
  const sameVehicle = (
    normalizedText(existing.plateNumbers)
      && normalizedText(existing.plateNumbers) === normalizedText(payload.plateNumbers)
  );
  const sameRoute = equalSets(existing.patrolRoute, payload.patrolRoute);
  const sharedPersonnel = setsIntersect(
    existing.lawEnforcementOfficialsIds || existing.lawEnforcementOfficials,
    payload.lawEnforcementOfficialsIds || payload.lawEnforcementOfficials
  );
  return sameRoute && (sameVehicle || sharedPersonnel);
}

function recordCollision(existing, payload) {
  if (!intervalsOverlap(
    existing.checkStartTime,
    existing.checkEndTime,
    payload.checkStartTime,
    payload.checkEndTime
  )) {
    return false;
  }
  return setsIntersect(
    existing.personIds || existing.personName,
    payload.personIds || payload.personName
  ) && (
    equalSets(existing.roadNum, payload.roadNum)
    || equalSets(existing.roadName, payload.roadName)
  );
}

function journalCollision(existing, payload) {
  if (!intervalsOverlap(
    existing.startCheckTime,
    existing.endCheckTime,
    payload.startCheckTime,
    payload.endCheckTime
  )) {
    return false;
  }
  const sameVehicle = (
    normalizedText(existing.plateNumbers)
      && normalizedText(existing.plateNumbers) === normalizedText(payload.plateNumbers)
  );
  const sameRoute = equalSets(existing.patrolRoute, payload.patrolRoute);
  const sharedPersonnel = setsIntersect(
    existing.lawEnforcementOfficialsIds || existing.lawEnforcementOfficials,
    payload.lawEnforcementOfficialsIds || payload.lawEnforcementOfficials
  );
  return sameRoute && (sameVehicle || sharedPersonnel);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  );
}

function hashValue(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function detectImageMime(buffer) {
  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  return "";
}

function mergeOrderedAttachments(existing, uploaded, order) {
  const combined = [...existing, ...uploaded];
  const queues = new Map();
  for (const attachment of combined) {
    const queue = queues.get(attachment.name) || [];
    queue.push(attachment);
    queues.set(attachment.name, queue);
  }
  const result = [];
  for (const name of order || []) {
    const queue = queues.get(name);
    if (queue?.length) result.push(queue.shift());
  }
  for (const queue of queues.values()) result.push(...queue);
  return result;
}

function safeTokenEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function responseRecords(response, label) {
  const code = String(response?.code ?? "");
  if (code !== "200") {
    throw new OfficialSessionError(
      "OFFICIAL_API_ERROR",
      `${label}失败：${response?.msg || `code=${code || "unknown"}`}`
    );
  }
  const records = response?.data?.records;
  if (!Array.isArray(records)) {
    throw new OfficialSessionError("OFFICIAL_API_SHAPE", `${label}返回格式不正确`);
  }
  return records;
}

function responseData(response, label) {
  const code = String(response?.code ?? "");
  if (code !== "200") {
    throw new OfficialSessionError(
      "OFFICIAL_API_ERROR",
      `${label}失败：${response?.msg || `code=${code || "unknown"}`}`
    );
  }
  return response?.data;
}

function extractId(response, keys) {
  const data = response?.data;
  const candidates = [
    data,
    ...(isPlainObject(data) ? keys.map((key) => data[key]) : []),
    ...keys.map((key) => response?.[key])
  ];
  return candidates.find(
    (value) => typeof value === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(value)
  ) || "";
}

function pickFields(source, allowed) {
  const output = {};
  for (const key of allowed) {
    if (source?.[key] !== undefined) output[key] = cloneJson(source[key]);
  }
  return output;
}

function summaryForExisting(kind, item) {
  if (!item) return null;
  if (kind === "schedule") {
    return {
      scheduleId: item.scheduleId,
      startTime: item.startTime,
      endTime: item.endTime,
      plateNumbers: item.plateNumbers,
      lawEnforcementOfficials: item.lawEnforcementOfficials,
      patrolRoute: item.patrolRoute
    };
  }
  if (kind === "record") {
    return {
      recordId: item.recordId,
      recordNum: item.recordNum,
      checkStartTime: item.checkStartTime,
      checkEndTime: item.checkEndTime,
      personName: item.personName,
      roadNum: item.roadNum,
      roadName: item.roadName
    };
  }
  return {
    checklogId: item.checklogId,
    startCheckTime: item.startCheckTime,
    endCheckTime: item.endCheckTime,
    plateNumbers: item.plateNumbers,
    lawEnforcementOfficials: item.lawEnforcementOfficials,
    patrolRoute: item.patrolRoute
  };
}

function buildErrorPage(title, message) {
  const escape = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<style>
html,body{height:100%;margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;background:#f4f6f8;color:#17212b}
main{min-height:100%;display:grid;place-items:center;padding:32px;box-sizing:border-box}
section{max-width:680px;border:1px solid #d6dde4;background:#fff;padding:28px;border-radius:8px;box-shadow:0 10px 30px rgba(22,34,47,.08)}
h1{font-size:22px;margin:0 0 12px}p{line-height:1.7;margin:0;color:#52606d;white-space:pre-wrap}
</style>
</head>
<body><main><section><h1>${escape(title)}</h1><p>${escape(message)}</p></section></main></body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function buildPageExecutionScript(operation) {
  const encoded = Buffer.from(JSON.stringify(operation), "utf8").toString("base64");
  return `(async()=>{"use strict";
const input=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob("${encoded}"),c=>c.charCodeAt(0))));
const sensitive=/^(authorization|cookie|cookies|password|passwd|pwd|secret|set-cookie|token|tokenkey|access[_-]?token|refresh[_-]?token|localstorage|sessionstorage)$/i;
const scrub=(value,depth=0,seen=new WeakSet())=>{
  if(depth>12)return"[TRUNCATED]";
  if(value===null||value===undefined||typeof value==="boolean"||typeof value==="number")return value;
  if(typeof value==="string")return value
    .replace(/\\bBearer\\s+[A-Za-z0-9._~+/=-]+/gi,"Bearer [REDACTED]")
    .replace(/(["']?(?:TokenKey|access[_-]?token|refresh[_-]?token|password|passwd|pwd)["']?\\s*[:=]\\s*["']?)[^"'\\s,;}]+/gi,"$1[REDACTED]");
  if(typeof value!=="object")return String(value);
  if(seen.has(value))return"[CIRCULAR]";
  seen.add(value);
  if(Array.isArray(value))return value.slice(0,1000).map(entry=>scrub(entry,depth+1,seen));
  const output={};
  for(const [key,entry] of Object.entries(value)){
    if(!sensitive.test(key))output[key]=scrub(entry,depth+1,seen);
  }
  return output;
};
const captureRequire=()=>{
  const cacheKey=Symbol.for("qh.patrol.official.webpack.require");
  const cached=window[cacheKey];
  if(typeof cached==="function"&&cached.m&&cached.c&&cached.e)return cached;
  const root=document.querySelector("#app")&&document.querySelector("#app").__vue__;
  const router=root&&root.$router;
  if(!router)throw Object.assign(new Error("官方Vue Router尚未就绪"),{code:"OFFICIAL_ROUTER_NOT_READY"});
  const candidates=[];
  const scan=routes=>{
    for(const route of routes||[]){
      const values=[route.component,...Object.values(route.components||{})];
      for(const value of values){
        if(typeof value==="function"&&/\\.e\\(/.test(Function.prototype.toString.call(value)))candidates.push(value);
      }
      scan(route.children);
    }
  };
  scan(router.options&&router.options.routes);
  let captured=null;
  const originalBind=Function.prototype.bind;
  Function.prototype.bind=function(...args){
    if(!captured&&typeof this==="function"&&this.m&&this.c&&this.e&&this.d&&this.o)captured=this;
    return originalBind.apply(this,args);
  };
  try{
    for(const candidate of candidates){
      try{
        const result=candidate(()=>{},()=>{});
        if(result&&typeof result.catch==="function")result.catch(()=>{});
      }catch(_){}
      if(captured)break;
    }
  }finally{
    Function.prototype.bind=originalBind;
  }
  if(!captured)throw Object.assign(new Error("无法捕获官方请求服务"),{code:"OFFICIAL_SERVICE_UNAVAILABLE"});
  try{Object.defineProperty(window,cacheKey,{value:captured,writable:true,configurable:true});}catch(_){window[cacheKey]=captured;}
  return captured;
};
try{
  const hasSession=()=>{
    try{
      const stores=[window.localStorage,window.sessionStorage];
      return stores.some(store=>{
        for(let index=0;index<store.length;index+=1){
          const key=store.key(index);
          if(/^TokenKey$/i.test(String(key))&&Boolean(store.getItem(key)))return true;
        }
        return false;
      });
    }catch(_){return false;}
  };
  if(input.type==="status"&&!hasSession()){
    return{ok:true,value:{
      serviceReady:Boolean(document.querySelector("#app")),
      authenticated:false,
      responseCode:"",
      username:""
    }};
  }
  const webpackRequire=captureRequire();
  const requestModule=webpackRequire(0);
  const request=requestModule&&requestModule.a;
  if(typeof request!=="function")throw Object.assign(new Error("官方请求模块不可用"),{code:"OFFICIAL_SERVICE_UNAVAILABLE"});
  if(input.type==="status"){
    let authenticated=false;
    let responseCode="";
    let username="";
    if(hasSession()){
      try{
        const response=await request({
          url:"${API.recordList}",
          method:"get",
          params:{current:1,size:1},
          showloading:false
        });
        responseCode=String(response&&response.code||"");
        authenticated=responseCode==="200";
      }catch(_){}
    }
    if(authenticated){
      try{username=String(window.localStorage.getItem("_qh_patrol_authenticated_username")||"").trim();}catch(_){}
    }
    return{ok:true,value:{serviceReady:true,authenticated,responseCode,username}};
  }
  if(input.type==="upload"){
    const binary=Uint8Array.from(atob(input.dataBase64),c=>c.charCodeAt(0));
    const formData=new FormData();
    formData.append("file",new File([binary],input.name,{type:input.mimeType}));
    const response=await request({
      url:"${API.upload}",
      method:"POST",
      data:formData,
      contentType:"multipart/form-data;",
      showloading:false
    });
    return{ok:true,value:scrub(response)};
  }
  if(input.type!=="request")throw Object.assign(new Error("未知桥接操作"),{code:"INVALID_BRIDGE_OPERATION"});
  const response=await request(input.config);
  return{ok:true,value:scrub(response)};
}catch(error){
  return{
    ok:false,
    error:{
      code:String(error&&error.code||"OFFICIAL_PAGE_REQUEST_FAILED").slice(0,120),
      message:String(error&&error.message||error||"官方页面请求失败")
        .replace(/\\bBearer\\s+[A-Za-z0-9._~+/=-]+/gi,"Bearer [REDACTED]")
        .slice(0,1000),
      status:Number(error&&error.response&&error.response.status)||undefined
    }
  };
}})()`;
}

class OfficialSession {
  constructor(options) {
    assertPlainObject(options, "OfficialSession.options");
    if (typeof options.BrowserWindow !== "function") {
      throw new TypeError("OfficialSession requires BrowserWindow");
    }
    this.BrowserWindow = options.BrowserWindow;
    this.logger = options.logger || console;
    this.now = options.now || Date.now;
    this.randomBytes = options.randomBytes || randomBytes;
    this.readFile = options.readFile || readFile;
    this.stat = options.stat || stat;
    this.partition = options.partition || OFFICIAL_PARTITION;
    this.officialUrl = options.officialUrl || OFFICIAL_RECORD_URL;
    this.window = null;
    this.loadPromise = null;
    this.lastLoadError = null;
    this.pageQueue = Promise.resolve();
    this.mutationActive = false;
    this.confirmations = new Map();
    this.rollbacks = new Map();
    this.authenticatedUsername = "";
    this.pendingUsername = "";
  }

  _log(level, ...values) {
    const method = typeof this.logger?.[level] === "function"
      ? this.logger[level].bind(this.logger)
      : this.logger?.log?.bind(this.logger);
    if (!method) return;
    method(...values.map((value) => redactText(value).slice(0, 3000)));
  }

  _pruneTokens() {
    const current = this.now();
    for (const [token, entry] of this.confirmations) {
      if (entry.expiresAt <= current) this.confirmations.delete(token);
    }
    for (const [token, entry] of this.rollbacks) {
      if (entry.expiresAt <= current || entry.used) this.rollbacks.delete(token);
    }
  }

  _newToken(bytes = 24) {
    return this.randomBytes(bytes).toString("base64url");
  }

  _loginResult(result, startedAt, username = "") {
    const loginElapsedMs = Math.max(0, this.now() - startedAt);
    const decorated = {
      ...result,
      loginElapsedMs,
      loginWithinTarget: loginElapsedMs <= 3000
    };
    if (username) decorated.username = username;
    this._log(
      "log",
      `[auto-login] verified in ${loginElapsedMs}ms (${decorated.loginWithinTarget ? "within" : "over"} 3s target)`
    );
    return decorated;
  }

  async _storeAuthenticatedUsername(username) {
    if (!this._isWindowUsable()) return;
    const value = String(username || "").trim();
    try {
      await this.window.webContents.executeJavaScript(
        `try { localStorage.setItem("_qh_patrol_authenticated_username", ${JSON.stringify(value)}); true; } catch (_) { false; }`
      );
    } catch {}
  }

  _isWindowUsable() {
    return this.window && !this.window.isDestroyed();
  }

  _attachWindowGuards(window) {
    const webContents = window.webContents;
    const officialOrigin = new URL(this.officialUrl).origin;
    webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });
    webContents.session.setPermissionCheckHandler(() => false);
    webContents.setWindowOpenHandler(({ url }) => {
      if (String(url).startsWith(officialOrigin)) {
        webContents.loadURL(url).catch((error) => {
          this._log("error", "[official] popup navigation failed", error.message);
        });
      }
      return { action: "deny" };
    });
    webContents.on("will-navigate", (event, url) => {
      if (!String(url).startsWith(officialOrigin)) event.preventDefault();
    });
    webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame || errorCode === -3) return;
        this.lastLoadError = {
          code: errorCode,
          description: redactText(errorDescription),
          url: String(validatedURL).startsWith(officialOrigin) ? validatedURL : ""
        };
        this._log(
          "error",
          `[official] did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`
        );
      }
    );
    webContents.on("console-message", (...args) => {
      const details = args.length === 2 && isPlainObject(args[1])
        ? args[1]
        : { level: args[1], message: args[2], lineNumber: args[3], sourceId: args[4] };
      this._log(
        "log",
        `[official console:${details.level ?? "?"}] ${details.message ?? ""}`
      );
    });
    webContents.on("render-process-gone", (_event, details) => {
      this._log(
        "error",
        `[official] renderer gone: ${details?.reason || "unknown"} (${details?.exitCode ?? "?"})`
      );
    });
  }

  async _showLoadError(error) {
    if (!this._isWindowUsable()) return;
    const message = [
      "官方系统页面加载失败。",
      `错误：${redactText(error?.message || error || "未知错误")}`,
      "请检查网络后重新打开登录窗口。"
    ].join("\n");
    try {
      await this.window.loadURL(buildErrorPage("官方系统加载失败", message));
    } catch (fallbackError) {
      this._log("error", "[official] local error page failed", fallbackError.message);
    }
  }

  async _loadOfficial() {
    if (!this._isWindowUsable()) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.window.loadURL(this.officialUrl)
      .then(() => {
        this.lastLoadError = null;
      })
      .catch(async (error) => {
        this.lastLoadError = {
          code: error?.code || "LOAD_URL_FAILED",
          description: redactText(error?.message || error)
        };
        this._log("error", "[official] loadURL failed", error?.message || error);
        await this._showLoadError(error);
      })
      .finally(() => {
        this.loadPromise = null;
      });
    return this.loadPromise;
  }

  async ensureWindow({ show = false } = {}) {
    if (!this._isWindowUsable()) {
      this.window = new this.BrowserWindow({
        width: 1320,
        height: 900,
        minWidth: 980,
        minHeight: 680,
        show: false,
        title: "青海省交通运输行政执法综合管理信息系统",
        backgroundColor: "#f4f6f8",
        webPreferences: {
          partition: this.partition,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true
        }
      });
      this._attachWindowGuards(this.window);
      this.window.on("closed", () => {
        this.window = null;
        this.loadPromise = null;
      });
      await this._loadOfficial();
    } else {
      const currentUrl = this.window.webContents.getURL();
      if (!String(currentUrl).startsWith(new URL(this.officialUrl).origin)) {
        await this._loadOfficial();
      } else if (this.loadPromise) {
        await this.loadPromise;
      }
    }
    if (show && this._isWindowUsable()) {
      this.window.show();
      this.window.focus();
    }
    return this.window;
  }

  async openLogin(options = {}) {
    const username = String(options?.username || "").trim();
    const password = String(options?.password || "");

    await this.ensureWindow({ show: true });
    if (!username || !password) {
      return this.status({ createWindow: false });
    }

    await this._waitForPageReady();
    let filled = await this._fillLoginForm(username, password);
    if (!filled) {
      try {
        await this.window.loadURL(`${new URL(this.officialUrl).origin}/#/login`);
        await this._waitForPageReady();
        filled = await this._fillLoginForm(username, password);
      } catch {}
    }
    if (!filled) {
      throw new OfficialSessionError(
        "LOGIN_FORM_NOT_FOUND",
        "未找到官方登录输入框，无法自动填写帐密"
      );
    }

    await this._installCaptchaObserver();
    await this._clickLoginButton();
    this.pendingUsername = username;
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (this._isWindowUsable()) {
      this.window.show();
      this.window.focus();
    }
    const status = await this.status({ createWindow: false });
    return {
      ...status,
      credentialsFilled: true,
      awaitingChallenge: !status.authenticated
    };
  }

  async logout() {
    if (!this._isWindowUsable()) {
      this.authenticatedUsername = "";
      this.pendingUsername = "";
      return {
        ok: true,
        windowOpen: false,
        loaded: false,
        authenticated: false,
        serviceReady: false,
        loginRequired: true
      };
    }

    const before = await this.status({ createWindow: false });
    let remoteLogoutAccepted = false;
    if (before.authenticated) {
      try {
        const response = await this._request({
          url: API.logout,
          method: "get",
          showloading: false
        });
        const code = String(response?.code ?? "");
        const message = String(response?.msg || "");
        remoteLogoutAccepted = code === "200" || message.includes("token校验失败");
        if (!remoteLogoutAccepted) {
          this._log("warn", `[official] logout API returned code=${code || "unknown"}`);
        }
      } catch (error) {
        this._log("warn", "[official] logout API failed; clearing local session", error?.message || error);
      }
    }

    const wc = this.window.webContents;
    try {
      await wc.executeJavaScript(`(async () => {
        try {
          const root = document.querySelector('#app') && document.querySelector('#app').__vue__;
          const store = root && root.$store;
          if (store) {
            try { store.commit('CLEAR_ALL_CACHE'); } catch(e) {}
            try { await store.dispatch('deleteAllTabs'); } catch(e) {}
          }
        } catch(e) {}

        const tokenPattern = /^(TokenKey|TokenKey_expired|authToken|access[_-]?token|refresh[_-]?token)$/i;
        [window.localStorage, window.sessionStorage].forEach(function(store) {
          try {
            const keys = [];
            for (let index = 0; index < store.length; index += 1) {
              const key = store.key(index);
              if (
                tokenPattern.test(String(key))
                || key === '_captcha_solved'
                || key === '_qh_patrol_authenticated_username'
              ) keys.push(key);
            }
            keys.forEach(function(key) { store.removeItem(key); });
          } catch(e) {}
        });
        try {
          document.cookie.split(';').forEach(function(entry) {
            const name = entry.split('=')[0].trim();
            if (tokenPattern.test(name)) {
              document.cookie = name + '=; Max-Age=0; path=/';
            }
          });
        } catch(e) {}
        return true;
      })()`);
    } catch (error) {
      this._log("warn", "[official] page session cleanup failed", error?.message || error);
    }

    try {
      const cookies = await wc.session?.cookies?.get({ url: OFFICIAL_ORIGIN });
      for (const cookie of cookies || []) {
        if (/^(TokenKey|TokenKey_expired|authToken|access[_-]?token|refresh[_-]?token)$/i.test(cookie.name)) {
          await wc.session.cookies.remove(OFFICIAL_ORIGIN, cookie.name);
        }
      }
    } catch (error) {
      this._log("warn", "[official] cookie cleanup failed", error?.message || error);
    }

    await this.window.loadURL(`${OFFICIAL_ORIGIN}/#/login`);
    await this._waitForPageReady();
    const after = await this.status({ createWindow: false });
    if (after.authenticated) {
      throw new OfficialSessionError(
        "LOGOUT_VERIFICATION_FAILED",
        "官方系统退出后仍检测到有效登录状态"
      );
    }
    this.authenticatedUsername = "";
    this.pendingUsername = "";
    return {
      ...after,
      ok: true,
      authenticated: false,
      loginRequired: true,
      remoteLogoutAccepted
    };
  }

  // ─── 自动登录 ────────────────────────────────────────────────

  async _waitForPageReady() {
    if (!this._isWindowUsable()) return;
    const wc = this.window.webContents;
    try {
      await wc.executeJavaScript(`new Promise((resolve) => {
        const ready = () => document.readyState === "complete" && (
          document.querySelector('#app')
          || document.querySelector('input[type="password"]')
        );
        if (ready()) return resolve();
        const observer = new MutationObserver(() => {
          if (!ready()) return;
          observer.disconnect();
          resolve();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        window.addEventListener('load', () => {
          if (ready()) {
            observer.disconnect();
            resolve();
          }
        }, { once: true });
        setTimeout(() => {
          observer.disconnect();
          resolve();
        }, 1500);
      })`);
    } catch {
      // Ignore if page isn't ready for JS execution
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  async _fillLoginForm(username, password) {
    if (!this._isWindowUsable()) return false;
    const wc = this.window.webContents;
    try {
      const result = await wc.executeJavaScript(`(() => {
        const u = ${JSON.stringify(String(username))};
        const p = ${JSON.stringify(String(password))};

        function setNativeValue(el, value) {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
          ).set;
          setter.call(el, value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // 查找用户名输入框
        const usernameSelectors = [
          'input[placeholder*="用户名"]', 'input[placeholder*="账号"]',
          'input[placeholder*="手机"]', 'input[name="username"]',
          'input[name="account"]', 'input[type="text"]:not([readonly])',
          '.el-input input[type="text"]', '#username', '#account',
          'input:not([type="password"]):not([type="hidden"]):not([readonly])'
        ];
        const passwordSelectors = [
          'input[placeholder*="密码"]', 'input[name="password"]',
          'input[type="password"]', '.el-input input[type="password"]',
          '#password'
        ];

        let usernameEl = null;
        for (const sel of usernameSelectors) {
          usernameEl = document.querySelector(sel);
          if (usernameEl) break;
        }
        let passwordEl = null;
        for (const sel of passwordSelectors) {
          passwordEl = document.querySelector(sel);
          if (passwordEl) break;
        }

        if (!usernameEl || !passwordEl) {
          return { ok: false, usernameFound: !!usernameEl, passwordFound: !!passwordEl };
        }

        setNativeValue(usernameEl, u);
        setNativeValue(passwordEl, p);
        return { ok: true, usernameFound: true, passwordFound: true };
      })()`);
      return result && result.ok;
    } catch (error) {
      this._log("warn", "[auto-login] fillForm failed:", error.message);
      return false;
    }
  }

  async _waitForLoginForm(timeoutMs = 15000) {
    if (!this._isWindowUsable()) return false;
    try {
      return await this.window.webContents.executeJavaScript(`new Promise((resolve) => {
        const ready = () => Boolean(
          document.querySelector('input[type="password"]')
          && Array.from(document.querySelectorAll('button, .el-button, [role="button"]'))
            .some((element) => /登录|登\\s*录|login/i.test(element.textContent || ''))
        );
        if (ready()) return resolve(true);
        const observer = new MutationObserver(() => {
          if (!ready()) return;
          observer.disconnect();
          clearTimeout(timer);
          resolve(true);
        });
        const timer = setTimeout(() => {
          observer.disconnect();
          resolve(false);
        }, ${Math.max(0, Number(timeoutMs) || 0)});
        observer.observe(document.documentElement, { childList: true, subtree: true });
      })`);
    } catch {
      return false;
    }
  }

  async _clickLoginButton() {
    if (!this._isWindowUsable()) return false;
    const wc = this.window.webContents;
    try {
      return await wc.executeJavaScript(`(() => {
        const buttons = document.querySelectorAll('button, .el-button, span.el-button, [role="button"]');
        for (const btn of buttons) {
          if (/登录|登\\s*录|login/i.test(btn.textContent || "")) {
            btn.click();
            return true;
          }
        }
        // 尝试按回车提交
        const form = document.querySelector('form');
        if (form) { form.dispatchEvent(new Event('submit', { bubbles: true })); return true; }
        // 尝试发送回车到密码框
        const pwdEl = document.querySelector('input[type="password"]');
        if (pwdEl) {
          pwdEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
          return true;
        }
        return false;
      })()`);
    } catch {
      return false;
    }
  }

  async _installCaptchaObserver() {
    if (!this._isWindowUsable()) return false;
    try {
      return await this.window.webContents.executeJavaScript(`(function() {
        try {
          if (window.__qhCaptchaObserverInstalled) return true;
          window.__qhCaptchaObserverInstalled = true;
          var origOpen = XMLHttpRequest.prototype.open;
          var origSend = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.open = function(method, url) {
            this.__qhCaptchaUrl = url;
            return origOpen.apply(this, arguments);
          };
          XMLHttpRequest.prototype.send = function(body) {
            var request = this;
            if (request.__qhCaptchaUrl) {
              request.addEventListener('load', function() {
                if (!new RegExp('captcha/check', 'i').test(request.__qhCaptchaUrl) || request.status !== 200) return;
                try {
                  var response = JSON.parse(request.responseText);
                  if (response.success && response.repData && response.repData.result === true) {
                    localStorage.setItem('_captcha_solved', '1');
                  }
                } catch(e) {}
              });
            }
            return origSend.apply(this, arguments);
          };
          return true;
        } catch(e) {
          return false;
        }
      })()`);
    } catch (error) {
      this._log("warn", "[auto-login] CAPTCHA observer install failed", error?.message || error);
      return false;
    }
  }

  async _detectSlider() {
    if (!this._isWindowUsable()) return null;
    const wc = this.window.webContents;
    try {
      return await wc.executeJavaScript(`(() => {
        // 滑块容器选择器（按优先级）
        const containerSelectors = [
          '.dx_captcha_slider', '.slider-container', '.captcha-slider',
          '.verify-slider', '.slide-verify', '.slider-verify',
          '.nc_wrapper', '.nc-container', '.geetest_slider',
          '.verify-box', '.captcha-box', '.drag-slider',
          '[class*="slider"]', '[class*="slide"]', '[class*="captcha"]',
          '[class*="verify"]', '[class*="drag"]'
        ];
        // 滑块按钮/thumb 选择器
        const handleSelectors = [
          '.dx_captcha_slider-btn', '.slider-btn', '.slider-thumb',
          '.slider-handle', '.slider-button', '.drag-btn',
          '.verify-btn', '.nc_iconfont', '.btn_slide',
          '[class*="slider-btn"]', '[class*="handle"]', '[class*="thumb"]',
          '[class*="block"]', '.slider > button', '.slider > div[class*="btn"]'
        ];

        let container = null;
        let containerSel = "";
        for (const sel of containerSelectors) {
          container = document.querySelector(sel);
          if (container && container.offsetParent !== null) {
            containerSel = sel;
            break;
          }
        }
        if (!container) return null;

        let handle = null;
        for (const sel of handleSelectors) {
          handle = container.querySelector(sel);
          if (handle && handle.offsetParent !== null) break;
        }
        // 如果找不到特定 handle，用 container 自身
        if (!handle) handle = container;

        const cRect = container.getBoundingClientRect();
        const hRect = handle.getBoundingClientRect();

        return {
          found: true,
          containerSelector: containerSel,
          containerRect: { x: cRect.x, y: cRect.y, width: cRect.width, height: cRect.height },
          handleRect: { x: hRect.x, y: hRect.y, width: hRect.width, height: hRect.height },
          // 滑块可拖动的总宽度
          trackWidth: cRect.width - hRect.width - 4
        };
      })()`);
    } catch {
      return null;
    }
  }

  // ─── NCC缺口检测: 直接Data URI模板匹配 ──────────────────
  // 获取verify-image IMG data URI，nativeImage解码，NCC匹配
  async _findGapPosition(sliderInfo) {
    if (!sliderInfo || !this._isWindowUsable()) return null;
    const wc = this.window.webContents;

    try {
      // 1. 获取两个verify-image的data URI
      const imageData = await wc.executeJavaScript(`(() => {
        try {
          var imgs = document.querySelectorAll('img.verify-image, img[class*="verify-img"]');
          if (!imgs || imgs.length < 2) return null;
          var pieceUri = imgs[0].src, bgUri = imgs[1].src;
          var pW = imgs[0].naturalWidth, pH = imgs[0].naturalHeight;
          var bW = imgs[1].naturalWidth, bH = imgs[1].naturalHeight;
          // Get image panel width
          var panel = document.querySelector('.verify-img-out, .verify-image-panel, [class*="img-out"]');
          if (!panel) panel = document.querySelector('.verify-bar-area, [class*="bar-area"]');
          var panelW = panel ? panel.getBoundingClientRect().width : 0;
          return { pieceUri, pW, pH, bgUri, bW, bH, panelW };
        } catch(e) { return null; }
      })()`);
      if (!imageData || !imageData.pieceUri) { this._log("warn", "[auto-login] no verify-image data URIs"); return null; }

      const { pieceUri, pW, pH, bgUri, bW, bH } = imageData;
      let panelW = imageData.panelW || sliderInfo.containerRect.width;
      this._log("log", `[auto-login] NCC images: piece=${pW}x${pH} bg=${bW}x${bH} panelW=${panelW}`);

      // 2. 解码图片
      const { nativeImage } = require("electron");
      const pieceImg = nativeImage.createFromDataURL(pieceUri);
      const bgImg = nativeImage.createFromDataURL(bgUri);
      let pieceBitmap, bgBitmap;
      try { pieceBitmap = pieceImg.toBitmap(); } catch { pieceBitmap = pieceImg.getBitmap(); }
      try { bgBitmap = bgImg.toBitmap(); } catch { bgBitmap = bgImg.getBitmap(); }

      // 3. 灰度 + Alpha mask
      const pieceMask = new Uint8Array(pW * pH); let maskCount = 0;
      const pGray = new Float64Array(pW * pH), bGray = new Float64Array(bW * bH);
      for (let i = 0; i < pW * pH; i++) { const idx = i * 4; pGray[i] = pieceBitmap[idx]*0.299 + pieceBitmap[idx+1]*0.587 + pieceBitmap[idx+2]*0.114; if (pieceBitmap[idx+3] > 64) { pieceMask[i] = 1; maskCount++; } }
      for (let i = 0; i < bW * bH; i++) { const idx = i * 4; bGray[i] = bgBitmap[idx]*0.299 + bgBitmap[idx+1]*0.587 + bgBitmap[idx+2]*0.114; }
      const useMask = maskCount > pW * pH * 0.1;
      this._log("log", `[auto-login] mask: ${maskCount}/${pW*pH} ${useMask ? 'USING' : 'all-pixel'}`);

      // 4. 模板零均值归一化 (mask aware)
      let tMean = 0; let count = 0;
      for (let i = 0; i < pW * pH; i++) { if (useMask && !pieceMask[i]) continue; tMean += pGray[i]; count++; }
      tMean /= count;
      const tNorm = new Float64Array(pW * pH); let tVar = 0;
      for (let i = 0; i < pW * pH; i++) { if (useMask && !pieceMask[i]) continue; const v = pGray[i] - tMean; tNorm[i] = v; tVar += v * v; }
      if (tVar < 0.5) { this._log("warn", "[auto-login] piece template low variance"); return null; }

      // 5. NCC扫描 (Y=0, mask aware)
      const searchEnd = bW - pW; let bestNcc = -Infinity, bestGx = -1;
      for (let gx = 0; gx <= searchEnd; gx++) {
        let sMean = 0; let sc = 0;
        for (let ty = 0; ty < pH; ty++) for (let tx = 0; tx < pW; tx++) { const idx = ty*pW+tx; if (useMask && !pieceMask[idx]) continue; sMean += bGray[ty*bW+(gx+tx)]; sc++; }
        if (sc === 0) continue; sMean /= sc;
        let num = 0, sVar = 0;
        for (let ty = 0; ty < pH; ty++) for (let tx = 0; tx < pW; tx++) { const idx = ty*pW+tx; if (useMask && !pieceMask[idx]) continue; const t = tNorm[idx]; const s = bGray[ty*bW+(gx+tx)] - sMean; num += t*s; sVar += s*s; }
        const ncc = sVar > 0.001 ? num / Math.sqrt(tVar * sVar) : 0;
        if (ncc > bestNcc) { bestNcc = ncc; bestGx = gx; }
      }
      this._log("log", `[auto-login] NCC best=${Math.round(bestNcc*1000)/1000} at gx=${bestGx}`);

      // 6. 转换到CSS像素
      const cssScale = panelW > 0 ? panelW / bW : sliderInfo.containerRect.width / bW;
      const gapLeftCss = Math.round(bestGx * cssScale);
      const pieceLeftCss = 0;
      const handleLeft = sliderInfo.handleRect.x - sliderInfo.containerRect.x;
      const correctedOffset = gapLeftCss - pieceLeftCss + handleLeft;
      this._log("log", `[auto-login] gap: css=${gapLeftCss}px handleOff=${handleLeft} offset=${correctedOffset}px ncc=${Math.round(bestNcc*1000)/1000}`);
      return { offset: correctedOffset, method: `ncc-${Math.round(bestNcc*1000)/1000}`, confidence: Math.round(bestNcc*100) };
    } catch(e) { this._log("warn", `[auto-login] NCC error: ${e.message}`); return null; }
  }

  async _resolveSliderOffset(sliderInfo, previousGap, attempt) {
    const freshGap = attempt === 0 && previousGap
      ? previousGap
      : await this._findGapPosition(sliderInfo);
    const gapInfo = freshGap || previousGap;
    if (gapInfo && Number.isFinite(gapInfo.offset)) {
      const tweaks = [0, 3, -3, 5, -5];
      return {
        gapInfo,
        offset: gapInfo.offset + (freshGap ? 0 : (tweaks[attempt] || 0)),
        fresh: Boolean(freshGap)
      };
    }
    return {
      gapInfo: null,
      offset: Math.round(sliderInfo.trackWidth * (0.7 + attempt * 0.04)),
      fresh: false
    };
  }

  async _waitForSliderSolution(sliderInfo, timeoutMs = 1200) {
    const deadline = Date.now() + timeoutMs;
    do {
      const gap = await this._findGapPosition(sliderInfo);
      if (
        gap
        && Number.isFinite(gap.offset)
        && Number(gap.confidence) >= 60
      ) return gap;
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
    return null;
  }

  // ─── 增强滑块拖拽 ────────────────────────────────────
  async _simulateSliderDragV2(sliderInfo, targetOffset) {
    if (!sliderInfo || !this._isWindowUsable()) return false;
    const wc = this.window.webContents;

    const handleCX = Math.round(sliderInfo.handleRect.x + sliderInfo.handleRect.width/2);
    const startY = Math.round(sliderInfo.handleRect.y + sliderInfo.handleRect.height/2);
    const handleOff = sliderInfo.handleRect.x - sliderInfo.containerRect.x;
    let dragDist = targetOffset > 0 ? targetOffset - handleOff : sliderInfo.trackWidth;
    if (dragDist < 5) dragDist = targetOffset;
    if (dragDist > sliderInfo.trackWidth + 10) dragDist = sliderInfo.trackWidth;
    const endX = Math.round(handleCX + dragDist);

    if (typeof wc.sendInputEvent === "function") {
      wc.sendInputEvent({
        type: "mouseDown",
        x: handleCX,
        y: startY,
        button: "left",
        clickCount: 1
      });
      await new Promise((resolve) => setTimeout(resolve, 35 + Math.random() * 20));
      const steps = 16;
      for (let index = 1; index <= steps; index += 1) {
        const time = index / steps;
        const eased = time < 0.5
          ? 2 * time * time
          : 1 - Math.pow(-2 * time + 2, 2) / 2;
        wc.sendInputEvent({
          type: "mouseMove",
          x: Math.round(handleCX + dragDist * eased),
          y: Math.round(startY + Math.sin(index * 0.55) * 2),
          button: "left"
        });
        await new Promise((resolve) => setTimeout(
          resolve,
          time > 0.85 ? 8 + Math.random() * 5 : 4 + Math.random() * 3
        ));
      }
      wc.sendInputEvent({
        type: "mouseUp",
        x: endX,
        y: startY,
        button: "left",
        clickCount: 1
      });
      this._log("log", `[auto-login] native trajectory: offset=${targetOffset} dist=${Math.round(dragDist)}px`);
      return true;
    }

    try { wc.debugger.attach("1.3"); } catch(e) {
      if (e.message && e.message.includes("already attached")) { try { wc.debugger.detach(); } catch{} wc.debugger.attach("1.3"); }
      else { this._log("warn", `[auto-login] debugger: ${e.message}`); return false; }
    }
    try {
      // mousePressed
      await wc.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mousePressed", x: handleCX, y: startY, button: "left", clickCount: 1 });
      await new Promise(r => setTimeout(r, 40 + Math.random()*60));
      // mouseMoved with a short eased trajectory.
      const steps = 22 + Math.floor(Math.random()*8);
      for (let i = 1; i <= steps; i++) {
        const t = i/steps, eased = t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
        const cx = Math.round(handleCX + dragDist*eased), cy = Math.round(startY + Math.sin(i*0.5)*2);
        await wc.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx, y: cy, button: "left", movementX: Math.round(dragDist/steps), movementY: 0 });
        await new Promise(r => setTimeout(r, t>0.9 ? 8+Math.random()*15 : 3+Math.random()*5));
      }
      await wc.debugger.sendCommand("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: endX,
        y: startY,
        button: "left",
        clickCount: 1
      });
      this._log("log", `[auto-login] CDP trajectory: offset=${targetOffset} dist=${Math.round(dragDist)}px`);
      return true;
    } catch(e) { this._log("warn", `[auto-login] CDP error: ${e.message}`); return false; }
    finally { try { wc.debugger.detach(); } catch{} }
  }


  async _simulateSliderDrag(sliderInfo) {
    if (!sliderInfo || !this._isWindowUsable()) return false;
    const wc = this.window.webContents;

    // 计算鼠标坐标（相对于 viewport）
    const startX = Math.round(
      sliderInfo.handleRect.x + sliderInfo.handleRect.width / 2
    );
    const startY = Math.round(
      sliderInfo.handleRect.y + sliderInfo.handleRect.height / 2
    );
    const endX = Math.round(
      sliderInfo.containerRect.x + sliderInfo.containerRect.width
        - sliderInfo.handleRect.width / 2 - 2
    );
    const endY = startY;

    // 附加 debugger 以使用 CDP Input.dispatchMouseEvent
    let attached = false;
    try {
      wc.debugger.attach("1.3");
      attached = true;
    } catch (error) {
      if (error.message && error.message.includes("already attached")) {
        try { wc.debugger.detach(); } catch {}
        wc.debugger.attach("1.3");
        attached = true;
      } else {
        this._log("warn", "[auto-login] debugger attach failed:", error.message);
        return false;
      }
    }

    try {
      // mousePressed — 按下滑块
      await wc.debugger.sendCommand("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: startX,
        y: startY,
        button: "left",
        clickCount: 1
      });

      // 停顿模拟人类反应时间
      await new Promise((resolve) => setTimeout(resolve, 60 + Math.random() * 90));

      // mouseMoved — 分步拖拽（10~15 步，带 Y 轴微颤）
      const steps = 10 + Math.floor(Math.random() * 6);
      const stepDX = (endX - startX) / steps;
      for (let index = 1; index <= steps; index += 1) {
        const currentX = startX + stepDX * index;
        const yWobble = Math.sin(index * 0.4) * 1.5 + (Math.random() - 0.5) * 1;
        await wc.debugger.sendCommand("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: Math.round(currentX),
          y: Math.round(startY + yWobble),
          button: "left",
          movementX: Math.round(stepDX),
          movementY: 0
        });
        // 延迟：开始快，接近终点慢（人类特征）
        const delay = 6 + Math.random() * (index > steps * 0.65 ? 28 : 12);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      // 释放前短暂停顿
      await new Promise((resolve) => setTimeout(resolve, 30 + Math.random() * 80));

      // mouseReleased — 释放滑块
      await wc.debugger.sendCommand("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: endX,
        y: endY,
        button: "left",
        clickCount: 1
      });

      return true;
    } catch (error) {
      this._log("warn", "[auto-login] slider drag failed:", error.message);
      return false;
    } finally {
      try { wc.debugger.detach(); } catch {}
    }
  }

  async _pollLoginSuccess(deadline) {
    if (!this._isWindowUsable()) return false;
    const wc = this.window.webContents;

    while (Date.now() < deadline) {
      try {
        const hasToken = await wc.executeJavaScript(`(() => {
          try {
            return [window.localStorage, window.sessionStorage].some((store) => {
              for (let index = 0; index < store.length; index += 1) {
                const key = store.key(index);
                if (/^TokenKey$/i.test(String(key)) && Boolean(store.getItem(key))) return true;
              }
              return false;
            });
          } catch { return false; }
        })()`);

        if (hasToken) {
          // 验证 Token 真正有效：发一次 status 检测
          const pageStatus = await this._executePage({ type: "status" });
          if (pageStatus.authenticated && pageStatus.serviceReady) return true;
          // Token 存在但无效（可能过期），继续等待
        }

        // 检查页面上有无错误提示
        try {
          const errorMsg = await wc.executeJavaScript(`(() => {
            const els = document.querySelectorAll('.el-message--error, [class*="error"], .msg-error, .login-error, .err-tip');
            for (const el of els) {
              if (el.offsetParent && el.innerText) return el.innerText.trim().slice(0, 200);
            }
            return "";
          })()`);
          if (errorMsg) {
            this._log("warn", `[auto-login] page error: ${errorMsg}`);
          }
        } catch {}
      } catch {
        // 页面可能正在跳转，忽略 JS 执行错误
      }

      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    return false;
  }

  async _advanceLoginAfterCaptcha(progress, state) {
    if (!progress || !state) return null;

    if (progress.captchaSolved && state.captchaSolvedAt === null) {
      state.captchaSolvedAt = this.now();
      this._log(
        "log",
        `[auto-login] CAPTCHA accepted +${this.now() - state.startedAt}ms; waiting for the site login callback`
      );
    }
    if (
      state.captchaSolvedAt !== null
      && !state.submittedAfterCaptcha
      && this.now() - state.captchaSolvedAt >= 120
    ) {
      state.submittedAfterCaptcha = await this._clickLoginButton();
      this._log(
        state.submittedAfterCaptcha ? "log" : "warn",
        state.submittedAfterCaptcha
          ? `[auto-login] login submitted +${this.now() - state.startedAt}ms after CAPTCHA acceptance`
          : "[auto-login] CAPTCHA accepted but login button was not found"
      );
    }
    if (!progress.token) return null;

    const verified = await this.status({ createWindow: false });
    if (!verified.authenticated || !verified.serviceReady) return null;
    this._log("log", `[auto-login] login token verified by official API +${this.now() - state.startedAt}ms`);
    return verified;
  }

  async autoLogin(username, password) {
    const startedAt = this.now();
    if (typeof username !== "string" || !username.trim()) {
      throw new OfficialSessionError("INVALID_CREDENTIAL", "用户名不能为空");
    }
    if (typeof password !== "string" || !password.trim()) {
      throw new OfficialSessionError("INVALID_CREDENTIAL", "密码不能为空");
    }

    // 1. 先检查是否已登录
    const requestedUsername = username.trim();
    const current = await this.status({ createWindow: false });
    this._log("log", `[auto-login] initial status +${this.now() - startedAt}ms`);
    if (
      current.authenticated
      && current.serviceReady
      && current.username === requestedUsername
    ) {
      this._log("log", "[auto-login] already authenticated, skipping");
      return this._loginResult(current, startedAt, requestedUsername);
    }
    if (current.authenticated && current.serviceReady) {
      this._log("log", `[auto-login] switching authenticated account to ${requestedUsername}`);
      await this.logout();
    }
    this.pendingUsername = requestedUsername;
    if (this.loadPromise) await this.loadPromise;

    // 2. 复用已有官方窗口，避免状态检查后销毁并重复加载官网。
    if (!this._isWindowUsable()) {
      this.window = new this.BrowserWindow({
      width: 1320,
      height: 900,
      minWidth: 980,
      minHeight: 680,
      show: false,
      title: "青海省交通运输行政执法综合管理信息系统 - 自动登录",
      backgroundColor: "#f4f6f8",
      webPreferences: {
        partition: this.partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    });
      this._attachWindowGuards(this.window);
      this.window.on("closed", () => {
        this.window = null;
        this.loadPromise = null;
      });
      await this.window.loadURL(this.officialUrl);
    } else {
      const currentUrl = String(this.window.webContents.getURL() || "");
      const officialOrigin = new URL(this.officialUrl).origin;
      if (!currentUrl.startsWith(officialOrigin)) {
        await this.window.loadURL(this.officialUrl);
      } else if (!/\/#\/login(?:[/?#]|$)/i.test(currentUrl)) {
        await this.window.loadURL(`${officialOrigin}/#/login`);
      }
    }
    await this._waitForPageReady();
    this._log("log", `[auto-login] login page ready +${this.now() - startedAt}ms`);

    const loadedSession = await this.status({ createWindow: false });
    this._log("log", `[auto-login] loaded session checked +${this.now() - startedAt}ms`);
    if (
      loadedSession.authenticated
      && loadedSession.serviceReady
      && loadedSession.username === requestedUsername
    ) {
      this._log("log", "[auto-login] persistent session restored after page load");
      return this._loginResult(loadedSession, startedAt, requestedUsername);
    }
    if (loadedSession.authenticated && loadedSession.serviceReady) {
      this._log("log", `[auto-login] loaded session belongs to another account; switching to ${requestedUsername}`);
      await this.logout();
    } else {
      const loadedUrl = String(this.window.webContents.getURL() || "");
      if (!/\/#\/login(?:[/?#]|$)/i.test(loadedUrl)) {
        try { await this.window.loadURL(`${new URL(this.officialUrl).origin}/#/login`); } catch {}
        await this._waitForPageReady();
      }
    }

    // 4. 尝试最多 3 轮自动登录
    const deadline = Date.now() + 120000; // 2 分钟总超时
    for (let round = 0; round < 3; round += 1) {
      if (Date.now() >= deadline) break;

      this._log("log", `[auto-login] round ${round + 1}/3`);

      // 4a. 填写帐密
      try {
        await this.window.webContents.executeJavaScript(
          `try { localStorage.removeItem('_captcha_solved'); } catch(e) {}`
        );
      } catch {}
      const filled = await this._fillLoginForm(username, password);
      let formFilled = filled;
      if (!formFilled) {
        await this._waitForLoginForm(1200);
        formFilled = await this._fillLoginForm(username, password);
      }
      if (!formFilled) {
        this._log("warn", "[auto-login] could not fill login form, retrying...");
        continue;
      }
      this._log("log", `[auto-login] credentials filled +${this.now() - startedAt}ms`);

      // 4b. 先监听验证结果，再点击登录按钮，避免漏掉快速返回的 CAPTCHA 请求。
      await this._installCaptchaObserver();
      const clicked = await this._clickLoginButton();
      if (!clicked) {
        this._log("warn", "[auto-login] login button was not ready; retrying");
        continue;
      }
      let sliderReady = null;
      const sliderDeadline = Date.now() + 1800;
      while (Date.now() < sliderDeadline && !sliderReady?.found) {
        sliderReady = await this._detectSlider();
        if (!sliderReady?.found) await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // 4c. 检测滑块 + NCC缺口检测 + 精准拖拽
      const slider = sliderReady || await this._detectSlider();
      let gapInfo = null;

      if (slider && slider.found) {
        this._log("log", `[auto-login] slider found: ${slider.containerSelector} trackWidth=${slider.trackWidth}`);
        gapInfo = await this._waitForSliderSolution(slider);
        if (!gapInfo) {
          this._log("warn", "[auto-login] slider images were not ready; retrying form submission");
          continue;
        }
        this._log("log", `[auto-login] slider solution ready +${this.now() - startedAt}ms`);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 150));
        const directStatus = await this.status({ createWindow: false });
        if (directStatus.authenticated && directStatus.serviceReady) {
          this.authenticatedUsername = requestedUsername;
          this.pendingUsername = "";
          await this._storeAuthenticatedUsername(requestedUsername);
          return this._loginResult(directStatus, startedAt, requestedUsername);
        }
        this._log("warn", "[auto-login] slider did not appear; retrying form submission");
        continue;
      }

      // Multi-attempt drag with tweaks
      const MAX_SUB = 5;
      let success = false;
      let authenticatedStatus = null;
      const loginProgressState = {
        startedAt,
        captchaSolvedAt: null,
        submittedAfterCaptcha: false
      };
      for (let sub = 0; sub < MAX_SUB && !success && Date.now() < deadline; sub++) {
        const curSlider = await this._detectSlider();
        if (curSlider && curSlider.found) {
          const resolvedOffset = await this._resolveSliderOffset(curSlider, gapInfo, sub);
          gapInfo = resolvedOffset.gapInfo;
          const tryOffset = resolvedOffset.offset;
          this._log(
            "log",
            `[auto-login] sub-${sub+1}/${MAX_SUB}: ${resolvedOffset.fresh ? "fresh NCC" : gapInfo ? "cached NCC" : "blind"} offset=${tryOffset}px`
          );

          // 使用真实鼠标轨迹并在目标位置释放，只触发一次验证码校验。
          await this._simulateSliderDragV2(curSlider, tryOffset);
          this._log("log", `[auto-login] slider released +${this.now() - startedAt}ms`);
        }

        // Poll for login success (10s per sub-attempt)
        const subStartedAt = Date.now();
        const subDeadline = subStartedAt + 10000;
        while (Date.now() < subDeadline && !success) {
          const poll = await this.window.webContents.executeJavaScript(`(() => {
            var hasToken = false;
            var captchaSolved = false;
            try {
              hasToken = [localStorage, sessionStorage].some(function(s) {
                for (var i=0; i<s.length; i++) { var k=s.key(i); if (/^TokenKey$/i.test(k) && s.getItem(k)) return true; }
                return false;
              });
              captchaSolved = localStorage.getItem('_captcha_solved') === '1';
              if (!hasToken) {
                var store = document.querySelector('#app').__vue__.$store;
                if (store && store.state.authToken) hasToken = true;
              }
            } catch(e) {}
            return {
              token: hasToken,
              captchaSolved: captchaSolved,
              notLogin: !/login/i.test(location.href),
              slider: !!document.querySelector('.verify-slider')
            };
          })()`);
          authenticatedStatus = await this._advanceLoginAfterCaptcha(
            poll,
            loginProgressState
          );
          if (authenticatedStatus) {
            success = true;
            break;
          }
          if (!poll || !poll.slider) { this._log("log", "[auto-login] slider disappeared, waiting for login..."); }
          if (
            poll?.slider
            && !poll.captchaSolved
            && !poll.token
            && Date.now() - subStartedAt >= 2200
          ) {
            this._log("log", "[auto-login] CAPTCHA was not accepted; refreshing gap detection");
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 75));
        }
        if (success) break;
      }

      if (success) {
        const result = authenticatedStatus || await this.status({ createWindow: false });
        this.authenticatedUsername = requestedUsername;
        this.pendingUsername = "";
        await this._storeAuthenticatedUsername(requestedUsername);
        return this._loginResult(result, startedAt, requestedUsername);
      }

      this._log("warn", `[auto-login] round ${round + 1} exhausted, retrying...`);
      try { await this.window.loadURL(this.officialUrl); } catch {}
      await this._waitForPageReady();
    }

    // 5. 全部自动尝试失败，打开窗口让用户手动完成
    this._log("warn", "[auto-login] all automatic rounds exhausted, showing window for manual login");
    if (this._isWindowUsable()) {
      this.window.show();
      this.window.focus();
    }

    // 等待手动登录完成
    const manualDeadline = Date.now() + 180000;
    while (Date.now() < manualDeadline) {
      const status = await this.status({ createWindow: false });
      if (status.authenticated && status.serviceReady) {
        this._log("log", "[auto-login] manual login succeeded");
        this.authenticatedUsername = requestedUsername;
        this.pendingUsername = "";
        await this._storeAuthenticatedUsername(requestedUsername);
        return { ...status, username: requestedUsername };
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new OfficialSessionError(
      "LOGIN_TIMEOUT",
      "自动登录超时，请检查帐密是否正确，或手动在弹出窗口中完成登录"
    );
  }

  async _executePage(operation) {
    const run = async () => {
      await this.ensureWindow({ show: false });
      if (!this._isWindowUsable()) {
        throw new OfficialSessionError("OFFICIAL_WINDOW_UNAVAILABLE", "官方系统窗口不可用");
      }
      const url = this.window.webContents.getURL();
      if (!String(url).startsWith(new URL(this.officialUrl).origin)) {
        throw new OfficialSessionError(
          "OFFICIAL_PAGE_UNAVAILABLE",
          "官方系统页面未成功加载，请打开登录窗口重试"
        );
      }
      const result = await this.window.webContents.executeJavaScript(
        buildPageExecutionScript(operation),
        false
      );
      if (!result?.ok) {
        throw new OfficialSessionError(
          result?.error?.code || "OFFICIAL_PAGE_REQUEST_FAILED",
          result?.error?.message || "官方页面请求失败",
          result?.error?.status ? { status: result.error.status } : undefined
        );
      }
      return sanitizeForRenderer(result.value);
    };
    const queued = this.pageQueue.then(run, run);
    this.pageQueue = queued.catch(() => {});
    return queued;
  }

  async status(options = {}) {
    const createWindow = options.createWindow !== false;
    if (createWindow) await this.ensureWindow({ show: false });
    if (!this._isWindowUsable()) {
      this.authenticatedUsername = "";
      return {
        ok: true,
        windowOpen: false,
        loaded: false,
        authenticated: false,
        serviceReady: false,
        loginRequired: true
      };
    }
    const currentUrl = this.window.webContents.getURL();
    const loaded = String(currentUrl).startsWith(new URL(this.officialUrl).origin);
    if (!loaded) {
      return {
        ok: true,
        windowOpen: true,
        loaded: false,
        authenticated: false,
        serviceReady: false,
        loginRequired: true,
        loadError: this.lastLoadError ? sanitizeForRenderer(this.lastLoadError) : null
      };
    }
    try {
      const pageStatus = await this._executePage({ type: "status" });
      const authenticated = pageStatus.authenticated === true;
      if (authenticated && this.pendingUsername) {
        this.authenticatedUsername = this.pendingUsername;
        this.pendingUsername = "";
        await this._storeAuthenticatedUsername(this.authenticatedUsername);
      } else if (authenticated && pageStatus.username) {
        this.authenticatedUsername = String(pageStatus.username).trim();
      } else if (!authenticated) {
        this.authenticatedUsername = "";
      }
      return {
        ok: true,
        windowOpen: true,
        loaded: true,
        authenticated,
        serviceReady: pageStatus.serviceReady === true,
        loginRequired: !authenticated,
        username: authenticated ? this.authenticatedUsername : "",
        partition: OFFICIAL_PARTITION
      };
    } catch (error) {
      return {
        ok: true,
        windowOpen: true,
        loaded: true,
        authenticated: false,
        serviceReady: false,
        loginRequired: true,
        error: safeError(error)
      };
    }
  }

  async _assertAuthenticated() {
    const status = await this.status();
    if (!status.authenticated || !status.serviceReady) {
      throw new OfficialSessionError(
        "LOGIN_REQUIRED",
        "请先在官方系统窗口完成人工登录和滑块验证"
      );
    }
  }

  _validateApiConfig(config) {
    const method = String(config.method || "get").toLowerCase();
    const path = String(config.url || "");
    const exact = new Set([
      API.scheduleList,
      API.scheduleAdd,
      API.scheduleUpdate,
      API.recordList,
      API.recordDetail,
      API.recordAdd,
      API.recordDelete,
      API.recordLog,
      API.journalList,
      API.journalAdd,
      API.journalUpdate,
      API.logout,
      API.personnelList
    ]);
    const prefixes = [API.scheduleDelete, API.journalDelete, API.attachmentDelete];
    if (!exact.has(path) && !prefixes.some((prefix) => path.startsWith(prefix))) {
      throw new OfficialSessionError("INVALID_API_PATH", "请求路径不在官方桥接白名单");
    }
    if (!["get", "post"].includes(method)) {
      throw new OfficialSessionError("INVALID_API_METHOD", "请求方法不在官方桥接白名单");
    }
  }

  async _request(config) {
    this._validateApiConfig(config);
    return this._executePage({
      type: "request",
      config: {
        ...cloneJson(config),
        showloading: false
      }
    });
  }

  async _uploadAttachment(prepared) {
    const response = await this._executePage({
      type: "upload",
      name: prepared.name,
      mimeType: prepared.mimeType,
      dataBase64: prepared.buffer.toString("base64")
    });
    const data = responseData(response, `上传附件${prepared.name}`);
    if (!Array.isArray(data) || data.length !== 1) {
      throw new OfficialSessionError(
        "OFFICIAL_API_SHAPE",
        `上传附件${prepared.name}返回格式不正确`
      );
    }
    const uploaded = data[0];
    if (!uploaded?.storageId || !uploaded?.storagePath) {
      throw new OfficialSessionError(
        "OFFICIAL_API_SHAPE",
        `上传附件${prepared.name}缺少storageId或storagePath`
      );
    }
    return {
      path: uploaded.storagePath,
      storageId: uploaded.storageId,
      name: uploaded.fileName || prepared.name
    };
  }

  async queryDay(input) {
    const query = normalizeQueryDay(input);
    await this._assertAuthenticated();
    return this._queryDayValidated(query);
  }

  async listPersonnel(input) {
    const query = normalizePersonnelQuery(input);
    await this._assertAuthenticated();
    const response = await this._request({
      url: API.personnelList,
      method: "get",
      params: {
        organId: query.oid,
        isSubOrgan: 0
      }
    });
    const data = responseData(response, "读取执法人员");
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(data?.records)
        ? data.records
        : Array.isArray(data?.list)
          ? data.list
          : null;
    if (!rows) {
      throw new OfficialSessionError("OFFICIAL_API_SHAPE", "执法人员列表返回格式不正确");
    }
    const personnel = new Map();
    for (const row of rows) {
      const name = String(row?.lawOfficerName || row?.personName || row?.name || "").trim();
      const personId = String(row?.userId || row?.personId || "").trim();
      if (
        !name
        || name.length > 80
        || !/^[A-Za-z0-9._:-]{1,160}$/.test(personId)
      ) continue;
      personnel.set(name, { name, personId });
    }
    return sanitizeForRenderer({
      ok: true,
      personnel: [...personnel.values()]
    });
  }

  async _queryDayValidated(query) {
    const nextDate = addCalendarDays(query.date, 1);
    const scheduleParams = {
      current: 1,
      size: -1,
      startTime: query.date,
      endTime: `${nextDate} 23:59:59`
    };
    if (query.cateId) scheduleParams.cateId = query.cateId;

    const recordParams = {
      current: 1,
      size: -1,
      checkStartTime: `${query.date} 00:00:00`,
      checkEndTime: `${nextDate} 23:59:59`
    };
    if (query.oid) recordParams.oid = query.oid;

    const schedulesResponse = await this._request({
      url: API.scheduleList,
      method: "get",
      params: scheduleParams
    });
    const recordsResponse = await this._request({
      url: API.recordList,
      method: "get",
      params: recordParams
    });
    const journalsResponse = await this._request({
      url: API.journalList,
      method: "get",
      params: {
        current: 1,
        size: -1
      }
    });
    const schedules = responseRecords(schedulesResponse, "查询当日排班")
      .filter((entry) => String(entry.startTime || "").slice(0, 10) === query.date);
    const recordRows = responseRecords(recordsResponse, "查询当日现场记录")
      .filter((entry) => String(entry.checkStartTime || "").slice(0, 10) === query.date);
    const journalRows = responseRecords(journalsResponse, "查询日志")
      .filter((entry) => {
        const patrolDate = String(entry.startCheckTime || "").slice(0, 10);
        const createDate = String(entry.createTime || "").slice(0, 10);
        return patrolDate === query.date || (!patrolDate && createDate === query.date);
      });
    const records = [];
    for (const row of recordRows) {
      const detail = await this._recordDetail(row.recordId);
      records.push({ ...row, ...detail });
    }
    const journals = [];
    for (const row of journalRows) {
      const associationResponse = await this._request({
        url: API.recordLog,
        method: "get",
        params: { checklogId: row.checklogId }
      });
      const associations = responseData(associationResponse, "读取日志关联记录");
      if (!Array.isArray(associations)) {
        throw new OfficialSessionError("OFFICIAL_API_SHAPE", "日志关联记录格式不正确");
      }
      journals.push({
        ...row,
        recordIds: associations
          .map((entry) => String(entry?.recordId || "").trim())
          .filter(Boolean)
      });
    }
    return sanitizeForRenderer({
      ok: true,
      date: query.date,
      schedules,
      records,
      journals,
      counts: {
        schedules: schedules.length,
        records: records.length,
        journals: journals.length
      }
    });
  }

  async _recordDetail(recordId) {
    const response = await this._request({
      url: API.recordDetail,
      method: "get",
      params: { recordId }
    });
    const data = responseData(response, "读取现场记录详情");
    if (!isPlainObject(data)) {
      throw new OfficialSessionError("OFFICIAL_API_SHAPE", "现场记录详情格式不正确");
    }
    return data;
  }

  async _journalReadback(checklogId) {
    const response = await this._request({
      url: API.journalList,
      method: "get",
      params: { current: 1, size: 10, checklogId }
    });
    const rows = responseRecords(response, "读取日志");
    const row = rows.find((entry) => entry.checklogId === checklogId);
    if (!row) {
      throw new OfficialSessionError("READBACK_FAILED", `未回读到日志${checklogId}`);
    }
    const associationResponse = await this._request({
      url: API.recordLog,
      method: "get",
      params: { checklogId }
    });
    const associations = responseData(associationResponse, "读取日志关联记录");
    if (!Array.isArray(associations)) {
      throw new OfficialSessionError("OFFICIAL_API_SHAPE", "日志关联记录格式不正确");
    }
    return { journal: row, records: associations };
  }

  async readback(input) {
    const request = normalizeReadback(input);
    await this._assertAuthenticated();
    const day = await this._queryDayValidated({ date: request.date });
    const scheduleIdSet = new Set(request.scheduleIds);
    const recordIdSet = new Set(request.recordIds);
    const journalIdSet = new Set(request.journalIds);
    const schedules = request.scheduleIds.length
      ? day.schedules.filter((entry) => scheduleIdSet.has(entry.scheduleId))
      : day.schedules;
    const recordRows = request.recordIds.length
      ? day.records.filter((entry) => recordIdSet.has(entry.recordId))
      : day.records;
    const journalRows = request.journalIds.length
      ? day.journals.filter((entry) => journalIdSet.has(entry.checklogId))
      : day.journals;
    const recordDetails = [];
    for (const row of recordRows) {
      recordDetails.push(await this._recordDetail(row.recordId));
    }
    const journals = [];
    for (const row of journalRows) {
      journals.push(await this._journalReadback(row.checklogId));
    }
    return sanitizeForRenderer({
      ok: true,
      date: request.date,
      schedules,
      records: recordDetails,
      journals,
      missing: {
        scheduleIds: request.scheduleIds.filter(
          (id) => !schedules.some((entry) => entry.scheduleId === id)
        ),
        recordIds: request.recordIds.filter(
          (id) => !recordDetails.some((entry) => entry.recordId === id)
        ),
        journalIds: request.journalIds.filter(
          (id) => !journals.some((entry) => entry.journal.checklogId === id)
        )
      }
    });
  }

  async _prepareAttachments(plan) {
    const prepared = new Map();
    for (const record of plan.records) {
      const files = [];
      for (const attachment of record.attachments) {
        let buffer;
        if (attachment.path) {
          const fileStat = await this.stat(attachment.path);
          if (!fileStat.isFile()) {
            throw new OfficialSessionError(
              "INVALID_ATTACHMENT",
              `附件不是普通文件：${attachment.name}`
            );
          }
          if (fileStat.size > MAX_FILE_BYTES) {
            throw new OfficialSessionError(
              "INVALID_ATTACHMENT",
              `附件超过5MB：${attachment.name}`
            );
          }
          buffer = await this.readFile(attachment.path);
        } else {
          buffer = Buffer.from(attachment.dataBase64, "base64");
        }
        buffer = Buffer.from(buffer);
        if (buffer.length === 0 || buffer.length > MAX_FILE_BYTES) {
          throw new OfficialSessionError(
            "INVALID_ATTACHMENT",
            `附件大小无效：${attachment.name}`
          );
        }
        const detectedMime = detectImageMime(buffer);
        if (!detectedMime || detectedMime !== attachment.mimeType) {
          throw new OfficialSessionError(
            "INVALID_ATTACHMENT",
            `附件内容与图片类型不匹配：${attachment.name}`
          );
        }
        files.push({
          name: attachment.name,
          mimeType: attachment.mimeType,
          size: buffer.length,
          sha256: createHash("sha256").update(buffer).digest("hex"),
          buffer
        });
      }
      prepared.set(record.clientRef, files);
    }
    return prepared;
  }

  _planFingerprint(plan, prepared) {
    return hashValue({
      date: plan.date,
      schedules: plan.schedules,
      records: plan.records.map((record) => ({
        clientRef: record.clientRef,
        scheduleRef: record.scheduleRef,
        mode: record.mode,
        payload: record.payload,
        attachments: (prepared.get(record.clientRef) || []).map((file) => ({
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          sha256: file.sha256
        }))
      })),
      journals: plan.journals
    });
  }

  _issueConfirmation(fingerprint) {
    this._pruneTokens();
    const token = this._newToken();
    const expiresAt = this.now() + CONFIRMATION_TTL_MS;
    this.confirmations.set(token, { fingerprint, expiresAt });
    return { confirmToken: token, expiresAt: new Date(expiresAt).toISOString() };
  }

  _consumeConfirmation(token, fingerprint) {
    this._pruneTokens();
    const entry = this.confirmations.get(token);
    this.confirmations.delete(token);
    if (!entry || entry.expiresAt <= this.now()) {
      throw new OfficialSessionError(
        "CONFIRMATION_EXPIRED",
        "confirmToken无效、已使用或已过期，请重新执行dryRun"
      );
    }
    if (!safeTokenEqual(entry.fingerprint, fingerprint)) {
      throw new OfficialSessionError(
        "CONFIRMATION_MISMATCH",
        "计划内容或附件在dryRun后发生变化，请重新执行dryRun"
      );
    }
  }

  async _buildPreflight(plan, day) {
    const operations = {
      schedules: [],
      records: [],
      journals: []
    };
    const conflicts = [];
    const scheduleIds = new Map();
    const recordIds = new Map();

    for (const item of plan.schedules) {
      const payload = item.payload;
      const explicit = payload.scheduleId
        ? day.schedules.find((entry) => entry.scheduleId === payload.scheduleId)
        : null;
      const exact = day.schedules.filter((entry) => scheduleEquivalent(entry, payload));
      const collisions = day.schedules.filter((entry) => scheduleCollision(entry, payload));
      let action;
      let existing;
      if (item.mode === "update" || item.mode === "reuse") {
        if (!explicit) {
          conflicts.push({
            kind: "schedule",
            clientRef: item.clientRef,
            reason: `未找到指定排班${payload.scheduleId}`
          });
          action = "conflict";
        } else if (item.mode === "reuse" && !scheduleEquivalent(explicit, payload)) {
          conflicts.push({
            kind: "schedule",
            clientRef: item.clientRef,
            reason: "指定排班与计划内容不一致"
          });
          action = "conflict";
          existing = explicit;
        } else if (item.mode === "update") {
          existing = explicit;
          action = "update";
        } else {
          existing = explicit;
          action = "reuse";
        }
      } else if (exact.length === 1 && item.mode === "upsert") {
        existing = exact[0];
        action = "reuse";
      } else if (exact.length > 0 || collisions.length > 0) {
        existing = exact[0] || collisions[0];
        conflicts.push({
          kind: "schedule",
          clientRef: item.clientRef,
          reason: exact.length > 1
            ? "存在多条完全相同的排班，无法无歧义复用"
            : item.mode === "create" && exact.length
              ? "create模式检测到同日重复排班"
              : "检测到同车，或同线路同人员的重叠排班"
        });
        action = "conflict";
      } else {
        action = "create";
      }
      if (action === "reuse") scheduleIds.set(item.clientRef, existing.scheduleId);
      operations.schedules.push({ item, action, existing });
    }

    for (const item of plan.records) {
      const payload = item.payload;
      const explicit = payload.recordId
        ? day.records.find((entry) => entry.recordId === payload.recordId)
        : null;
      const exact = day.records.filter((entry) => recordEquivalent(entry, payload));
      const collisions = day.records.filter((entry) => recordCollision(entry, payload));
      let action;
      let existing;
      if (item.mode === "update" || item.mode === "reuse") {
        if (!explicit) {
          conflicts.push({
            kind: "record",
            clientRef: item.clientRef,
            reason: `未找到指定现场记录${payload.recordId}`
          });
          action = "conflict";
        } else if (item.mode === "reuse" && !recordEquivalent(explicit, payload)) {
          conflicts.push({
            kind: "record",
            clientRef: item.clientRef,
            reason: "指定现场记录与计划内容不一致"
          });
          action = "conflict";
          existing = explicit;
        } else if (item.mode === "update") {
          existing = explicit;
          action = "update";
        } else {
          existing = explicit;
          action = "reuse";
        }
      } else if (exact.length === 1 && item.mode === "upsert") {
        existing = exact[0];
        action = "reuse";
      } else if (exact.length > 0 || collisions.length > 0) {
        existing = exact[0] || collisions[0];
        conflicts.push({
          kind: "record",
          clientRef: item.clientRef,
          reason: exact.length > 1
            ? "存在多条完全相同的现场记录，无法无歧义复用"
            : item.mode === "create" && exact.length
              ? "create模式检测到同日重复现场记录"
              : "检测到同人员、同路线且时间重叠的现场记录"
        });
        action = "conflict";
      } else {
        action = "create";
      }

      if (action === "reuse" && item.attachments.length) {
        const detail = await this._recordDetail(existing.recordId);
        const existingNames = new Set((detail.listAtt || []).map((entry) => entry.name));
        const missingNames = item.attachments
          .map((entry) => entry.name)
          .filter((name) => !existingNames.has(name));
        if (missingNames.length) {
          conflicts.push({
            kind: "record",
            clientRef: item.clientRef,
            reason: `重复记录缺少计划附件：${missingNames.join("、")}`
          });
          action = "conflict";
        }
      }
      if (action === "reuse") recordIds.set(item.clientRef, existing.recordId);
      operations.records.push({ item, action, existing });
    }

    const claimedJournalIds = new Set(
      plan.journals
        .map((item) => item.payload.checklogId)
        .filter(Boolean)
    );
    for (const item of plan.journals) {
      const resolvedScheduleId = scheduleIds.get(item.scheduleRef);
      const resolvedRecordIds = item.recordRefs.map((ref) => recordIds.get(ref));
      const resolved = resolvedScheduleId && resolvedRecordIds.every(Boolean);
      const payload = {
        ...item.payload,
        ...(resolvedScheduleId ? { scheduleId: resolvedScheduleId } : {})
      };
      const explicit = payload.checklogId
        ? day.journals.find((entry) => entry.checklogId === payload.checklogId)
        : null;
      const equivalent = day.journals.filter((entry) =>
        journalEquivalent(entry, payload)
        && (
          entry.checklogId === payload.checklogId
          || !claimedJournalIds.has(entry.checklogId)
        )
      );
      let exact = [];
      if (resolved) {
        for (const candidate of equivalent) {
          const readback = await this._journalReadback(candidate.checklogId);
          const associatedIds = readback.records.map((entry) => entry.recordId);
          if (equalSets(associatedIds, resolvedRecordIds)) exact.push(candidate);
        }
      }
      const collisions = day.journals.filter((entry) =>
        journalCollision(entry, payload)
        && (
          entry.checklogId === payload.checklogId
          || !claimedJournalIds.has(entry.checklogId)
        )
      );
      let action;
      let existing;
      if (item.mode === "update" || item.mode === "reuse") {
        if (!explicit) {
          conflicts.push({
            kind: "journal",
            clientRef: item.clientRef,
            reason: `未找到指定日志${payload.checklogId}`
          });
          action = "conflict";
        } else if (item.mode === "reuse" && !journalEquivalent(explicit, payload)) {
          conflicts.push({
            kind: "journal",
            clientRef: item.clientRef,
            reason: "指定日志与计划内容不一致"
          });
          action = "conflict";
          existing = explicit;
        } else if (item.mode === "update") {
          existing = explicit;
          action = "update";
        } else {
          existing = explicit;
          action = "reuse";
        }
      } else if (exact.length === 1 && item.mode === "upsert") {
        existing = exact[0];
        action = "reuse";
      } else if (exact.length > 0 || collisions.length > 0) {
        existing = exact[0] || collisions[0];
        conflicts.push({
          kind: "journal",
          clientRef: item.clientRef,
          reason: exact.length > 1
            ? "存在多条完全相同的日志，无法无歧义复用"
            : item.mode === "create" && exact.length
              ? "create模式检测到同日重复日志"
              : "检测到同车，或同线路同人员的重叠日志"
        });
        action = "conflict";
      } else {
        action = "create";
      }
      operations.journals.push({ item, action, existing });
    }

    const publicOperations = {};
    for (const kind of ["schedules", "records", "journals"]) {
      const singular = kind === "schedules" ? "schedule" : kind === "records" ? "record" : "journal";
      publicOperations[kind] = operations[kind].map((operation) => ({
        clientRef: operation.item.clientRef,
        action: operation.action,
        existing: summaryForExisting(singular, operation.existing)
      }));
    }
    return {
      ready: conflicts.length === 0,
      conflicts,
      operations,
      publicOperations
    };
  }

  _storeRollback(operations) {
    if (!operations.length) return null;
    this._pruneTokens();
    const rollbackToken = this._newToken();
    const confirmToken = this._newToken();
    const expiresAt = this.now() + ROLLBACK_TTL_MS;
    this.rollbacks.set(rollbackToken, {
      operations: cloneJson(operations),
      confirmToken,
      expiresAt,
      used: false
    });
    return {
      rollbackToken,
      confirmToken,
      expiresAt: new Date(expiresAt).toISOString(),
      operations: operations.map((operation) => ({
        kind: operation.kind,
        action: operation.action,
        id: operation.id || operation.storageId || ""
      }))
    };
  }

  async submitPlan(input) {
    const plan = normalizeSubmitPlan(input);
    await this._assertAuthenticated();
    const prepared = await this._prepareAttachments(plan);
    const fingerprint = this._planFingerprint(plan, prepared);
    const day = await this._queryDayValidated({
      date: plan.date,
      oid: plan.records[0]?.payload?.oid,
      cateId: plan.schedules[0]?.payload?.cateId
    });
    const preflight = await this._buildPreflight(plan, day);

    if (plan.dryRun) {
      const confirmation = preflight.ready
        ? this._issueConfirmation(fingerprint)
        : null;
      return sanitizeForRenderer({
        ok: true,
        dryRun: true,
        ready: preflight.ready,
        conflicts: preflight.conflicts,
        operations: preflight.publicOperations,
        attachments: [...prepared.entries()].map(([recordRef, files]) => ({
          recordRef,
          files: files.map((file) => ({
            name: file.name,
            mimeType: file.mimeType,
            size: file.size
          }))
        })),
        confirmation
      });
    }

    this._consumeConfirmation(plan.confirmToken, fingerprint);
    if (!preflight.ready) {
      throw new OfficialSessionError(
        "PREFLIGHT_CONFLICT",
        "线上数据在dryRun后发生变化，请处理冲突并重新预检",
        preflight.conflicts
      );
    }
    if (this.mutationActive) {
      throw new OfficialSessionError("MUTATION_BUSY", "另一项官方系统写入正在执行");
    }

    this.mutationActive = true;
    const rollbackOperations = [];
    const results = {
      schedules: [],
      records: [],
      journals: []
    };
    const scheduleIds = new Map();
    const recordIds = new Map();
    try {
      for (const operation of preflight.operations.schedules) {
        const { item, action, existing } = operation;
        if (action === "reuse") {
          scheduleIds.set(item.clientRef, existing.scheduleId);
          results.schedules.push({
            clientRef: item.clientRef,
            action,
            scheduleId: existing.scheduleId,
            readback: summaryForExisting("schedule", existing)
          });
          continue;
        }

        const beforeIds = new Set(day.schedules.map((entry) => entry.scheduleId));
        if (action === "update") {
          rollbackOperations.push({
            kind: "schedule",
            action: "restore",
            id: existing.scheduleId,
            payload: pickFields(existing, PAYLOAD_KEYS.schedule)
          });
        }
        const payload = {
          ...item.payload,
          ...(action === "update" ? { scheduleId: existing.scheduleId } : {})
        };
        const response = await this._request({
          url: action === "update" ? API.scheduleUpdate : API.scheduleAdd,
          method: "post",
          data: payload
        });
        responseData(response, `${action === "update" ? "更新" : "新增"}排班`);

        const refreshed = await this._queryDayValidated({
          date: plan.date,
          cateId: payload.cateId
        });
        let scheduleId = action === "update"
          ? existing.scheduleId
          : extractId(response, ["scheduleId", "id"]);
        let readback = scheduleId
          ? refreshed.schedules.find((entry) => entry.scheduleId === scheduleId)
          : null;
        if (!readback) {
          const candidates = refreshed.schedules.filter(
            (entry) => scheduleEquivalent(entry, payload)
              && (action === "update" || !beforeIds.has(entry.scheduleId))
          );
          if (candidates.length === 1) {
            [readback] = candidates;
            scheduleId = readback.scheduleId;
          }
        }
        if (!readback) {
          throw new OfficialSessionError(
            "READBACK_FAILED",
            `排班${item.clientRef}写入后无法确定scheduleId`
          );
        }
        if (action === "create") {
          rollbackOperations.push({
            kind: "schedule",
            action: "delete",
            id: scheduleId,
            expected: pickFields(readback, PAYLOAD_KEYS.schedule)
          });
        }
        if (!scheduleEquivalent(readback, payload)) {
          throw new OfficialSessionError(
            "READBACK_FAILED",
            `排班${item.clientRef}写入后回读不一致`
          );
        }
        scheduleIds.set(item.clientRef, scheduleId);
        results.schedules.push({
          clientRef: item.clientRef,
          action,
          scheduleId,
          readback: summaryForExisting("schedule", readback)
        });
      }

      for (const operation of preflight.operations.records) {
        const { item, action, existing } = operation;
        if (action === "reuse") {
          recordIds.set(item.clientRef, existing.recordId);
          results.records.push({
            clientRef: item.clientRef,
            action,
            recordId: existing.recordId,
            readback: summaryForExisting("record", existing)
          });
          continue;
        }

        const uploaded = [];
        for (const file of prepared.get(item.clientRef) || []) {
          const attachment = await this._uploadAttachment(file);
          uploaded.push(attachment);
          rollbackOperations.push({
            kind: "attachment",
            action: "delete",
            storageId: attachment.storageId
          });
        }

        let originalDetail;
        if (action === "update") {
          originalDetail = await this._recordDetail(existing.recordId);
          rollbackOperations.push({
            kind: "record",
            action: "restore",
            id: existing.recordId,
            payload: pickFields(originalDetail, PAYLOAD_KEYS.record)
          });
        }
        const existingAttachments = Array.isArray(item.payload.listAtt)
          ? item.payload.listAtt
          : [];
        const payload = {
          ...item.payload,
          ...(action === "update" ? { recordId: existing.recordId } : {}),
          listAtt: mergeOrderedAttachments(
            existingAttachments,
            uploaded,
            item.attachmentOrder
          ),
          listAbn: Array.isArray(item.payload.listAbn) ? item.payload.listAbn : [],
          listCaseDocs: Array.isArray(item.payload.listCaseDocs)
            ? item.payload.listCaseDocs
            : []
        };
        const beforeIds = new Set(day.records.map((entry) => entry.recordId));
        const response = await this._request({
          url: API.recordAdd,
          method: "post",
          data: payload
        });
        responseData(response, `${action === "update" ? "更新" : "新增"}现场记录`);

        const refreshed = await this._queryDayValidated({
          date: plan.date,
          oid: payload.oid
        });
        let recordId = action === "update"
          ? existing.recordId
          : extractId(response, ["recordId", "id"]);
        let row = recordId
          ? refreshed.records.find((entry) => entry.recordId === recordId)
          : null;
        if (!row) {
          const candidates = refreshed.records.filter(
            (entry) => recordEquivalent(entry, payload)
              && (action === "update" || !beforeIds.has(entry.recordId))
          );
          if (candidates.length === 1) {
            [row] = candidates;
            recordId = row.recordId;
          }
        }
        if (!row) {
          throw new OfficialSessionError(
            "READBACK_FAILED",
            `现场记录${item.clientRef}写入后无法确定recordId`
          );
        }
        if (action === "create") {
          rollbackOperations.push({
            kind: "record",
            action: "delete",
            id: recordId,
            expected: {
              ...pickFields(payload, PAYLOAD_KEYS.record),
              recordId
            }
          });
        }
        if (!recordEquivalent(row, payload)) {
          throw new OfficialSessionError(
            "READBACK_FAILED",
            `现场记录${item.clientRef}写入后列表回读不一致`
          );
        }
        const detail = await this._recordDetail(recordId);
        const detailStorageIds = new Set((detail.listAtt || []).map((entry) => entry.storageId));
        const expectedStorageIds = [
          ...existingAttachments.map((entry) => entry.storageId).filter(Boolean),
          ...uploaded.map((entry) => entry.storageId)
        ];
        if (
          !recordEquivalent(detail, payload)
          || !equalSets([...detailStorageIds], expectedStorageIds)
        ) {
          throw new OfficialSessionError(
            "READBACK_FAILED",
            `现场记录${item.clientRef}写入后详情或附件回读不一致`
          );
        }
        recordIds.set(item.clientRef, recordId);
        results.records.push({
          clientRef: item.clientRef,
          action,
          recordId,
          readback: summaryForExisting("record", row),
          attachments: (detail.listAtt || []).map((entry) => ({
            storageId: entry.storageId,
            name: entry.name
          }))
        });
      }

      for (const operation of preflight.operations.journals) {
        const { item, action, existing } = operation;
        if (action === "reuse") {
          results.journals.push({
            clientRef: item.clientRef,
            action,
            checklogId: existing.checklogId,
            readback: summaryForExisting("journal", existing)
          });
          continue;
        }

        const scheduleId = scheduleIds.get(item.scheduleRef);
        const linkedRecordIds = item.recordRefs.map((ref) => recordIds.get(ref));
        if (!scheduleId || linkedRecordIds.some((id) => !id)) {
          throw new OfficialSessionError(
            "PLAN_REFERENCE_UNRESOLVED",
            `日志${item.clientRef}的排班或现场记录引用未解析`
          );
        }
        if (action === "update") {
          const original = await this._journalReadback(existing.checklogId);
          rollbackOperations.push({
            kind: "journal",
            action: "restore",
            id: existing.checklogId,
            payload: {
              ...pickFields(original.journal, PAYLOAD_KEYS.journal),
              checklogId: existing.checklogId,
              recordsIds: original.records.map((entry) => entry.recordId).join(",")
            }
          });
        }
        const payload = {
          ...item.payload,
          ...(action === "update" ? { checklogId: existing.checklogId } : {}),
          scheduleId,
          recordsIds: linkedRecordIds.join(",")
        };
        const beforeIds = new Set(day.journals.map((entry) => entry.checklogId));
        const response = await this._request({
          url: action === "update" ? API.journalUpdate : API.journalAdd,
          method: "post",
          data: payload
        });
        responseData(response, `${action === "update" ? "更新" : "新增"}日志`);
        let checklogId = action === "update"
          ? existing.checklogId
          : extractId(response, ["checklogId", "id"]);

        if (!checklogId) {
          const refreshed = await this._queryDayValidated({ date: plan.date });
          const candidates = refreshed.journals.filter(
            (entry) => journalEquivalent(entry, payload)
              && !beforeIds.has(entry.checklogId)
          );
          if (candidates.length === 1) checklogId = candidates[0].checklogId;
        }
        if (!checklogId) {
          throw new OfficialSessionError(
            "READBACK_FAILED",
            `日志${item.clientRef}写入后无法确定checklogId`
          );
        }
        if (action === "create") {
          rollbackOperations.push({
            kind: "journal",
            action: "delete",
            id: checklogId,
            expected: {
              ...pickFields(payload, PAYLOAD_KEYS.journal),
              checklogId
            }
          });
        }
        const readback = await this._journalReadback(checklogId);
        const associatedIds = readback.records.map((entry) => entry.recordId);
        if (
          !journalEquivalent(readback.journal, payload)
          || !equalSets(associatedIds, linkedRecordIds)
        ) {
          throw new OfficialSessionError(
            "READBACK_FAILED",
            `日志${item.clientRef}写入后回读或关联记录不一致`
          );
        }
        results.journals.push({
          clientRef: item.clientRef,
          action,
          checklogId,
          readback: summaryForExisting("journal", readback.journal),
          recordIds: associatedIds
        });
      }

      return sanitizeForRenderer({
        ok: true,
        dryRun: false,
        results,
        rollback: this._storeRollback(rollbackOperations)
      });
    } catch (error) {
      return sanitizeForRenderer({
        ok: false,
        dryRun: false,
        error: safeError(error),
        partialResults: results,
        rollback: this._storeRollback(rollbackOperations)
      });
    } finally {
      this.mutationActive = false;
    }
  }

  async _verifyExpected(kind, id, expected) {
    if (kind === "record") {
      const detail = await this._recordDetail(id);
      const expectedAttachmentIds = (expected.listAtt || [])
        .map((entry) => entry.storageId)
        .filter(Boolean);
      const actualAttachmentIds = (detail.listAtt || [])
        .map((entry) => entry.storageId)
        .filter(Boolean);
      if (
        !recordEquivalent(detail, expected)
        || !equalSets(actualAttachmentIds, expectedAttachmentIds)
      ) {
        throw new OfficialSessionError(
          "ROLLBACK_GUARD_FAILED",
          `现场记录${id}已被修改，拒绝自动删除`
        );
      }
      return;
    }
    if (kind === "journal") {
      const readback = await this._journalReadback(id);
      const associatedIds = readback.records.map((entry) => entry.recordId);
      if (
        !journalEquivalent(readback.journal, expected)
        || !equalSets(associatedIds, expected.recordsIds)
      ) {
        throw new OfficialSessionError(
          "ROLLBACK_GUARD_FAILED",
          `日志${id}已被修改，拒绝自动删除`
        );
      }
      return;
    }
    const date = String(expected.startTime || "").slice(0, 10);
    const day = await this._queryDayValidated({ date });
    const row = day.schedules.find((entry) => entry.scheduleId === id);
    if (!row || !scheduleEquivalent(row, expected)) {
      throw new OfficialSessionError(
        "ROLLBACK_GUARD_FAILED",
        `排班${id}已被修改，拒绝自动删除`
      );
    }
  }

  async _executeRollbackOperation(operation) {
    if (operation.kind === "attachment" && operation.action === "delete") {
      const response = await this._request({
        url: `${API.attachmentDelete}${encodeURIComponent(operation.storageId)}`,
        method: "get"
      });
      responseData(response, "删除孤立附件");
      return;
    }
    if (operation.action === "restore") {
      const endpoint = operation.kind === "schedule"
        ? API.scheduleUpdate
        : operation.kind === "record"
          ? API.recordAdd
          : API.journalUpdate;
      const response = await this._request({
        url: endpoint,
        method: "post",
        data: operation.payload
      });
      responseData(response, `恢复${operation.kind}`);
      if (operation.kind === "record") {
        const detail = await this._recordDetail(operation.id);
        const expectedAttachmentIds = (operation.payload.listAtt || [])
          .map((entry) => entry.storageId)
          .filter(Boolean);
        const actualAttachmentIds = (detail.listAtt || [])
          .map((entry) => entry.storageId)
          .filter(Boolean);
        if (
          !recordEquivalent(detail, operation.payload)
          || !equalSets(actualAttachmentIds, expectedAttachmentIds)
        ) {
          throw new OfficialSessionError("ROLLBACK_READBACK_FAILED", "恢复现场记录后回读不一致");
        }
      } else if (operation.kind === "journal") {
        const readback = await this._journalReadback(operation.id);
        const associatedIds = readback.records.map((entry) => entry.recordId);
        if (
          !journalEquivalent(readback.journal, operation.payload)
          || !equalSets(associatedIds, operation.payload.recordsIds)
        ) {
          throw new OfficialSessionError("ROLLBACK_READBACK_FAILED", "恢复日志后回读不一致");
        }
      } else {
        const date = String(operation.payload.startTime).slice(0, 10);
        const day = await this._queryDayValidated({ date });
        const row = day.schedules.find((entry) => entry.scheduleId === operation.id);
        if (!row || !scheduleEquivalent(row, operation.payload)) {
          throw new OfficialSessionError("ROLLBACK_READBACK_FAILED", "恢复排班后回读不一致");
        }
      }
      return;
    }

    await this._verifyExpected(operation.kind, operation.id, operation.expected);
    let response;
    if (operation.kind === "schedule") {
      response = await this._request({
        url: `${API.scheduleDelete}${encodeURIComponent(operation.id)}`,
        method: "get"
      });
    } else if (operation.kind === "record") {
      response = await this._request({
        url: API.recordDelete,
        method: "post",
        data: { ids: [operation.id] }
      });
    } else {
      response = await this._request({
        url: `${API.journalDelete}${encodeURIComponent(operation.id)}`,
        method: "get"
      });
    }
    responseData(response, `删除${operation.kind}`);
    if (operation.kind === "journal") {
      const readbackResponse = await this._request({
        url: API.journalList,
        method: "get",
        params: { current: 1, size: 10, checklogId: operation.id }
      });
      const rows = responseRecords(readbackResponse, "回读日志删除结果");
      if (rows.some((entry) => entry.checklogId === operation.id)) {
        throw new OfficialSessionError("ROLLBACK_READBACK_FAILED", "删除日志后仍可回读到原记录");
      }
      return;
    }
    const date = String(
      operation.kind === "schedule"
        ? operation.expected.startTime
        : operation.expected.checkStartTime
    ).slice(0, 10);
    const day = await this._queryDayValidated({ date });
    const stillExists = operation.kind === "schedule"
      ? day.schedules.some((entry) => entry.scheduleId === operation.id)
      : day.records.some((entry) => entry.recordId === operation.id);
    if (stillExists) {
      throw new OfficialSessionError(
        "ROLLBACK_READBACK_FAILED",
        `删除${operation.kind}后仍可回读到原记录`
      );
    }
  }

  async rollback(input) {
    const request = normalizeRollback(input);
    await this._assertAuthenticated();
    this._pruneTokens();
    const entry = this.rollbacks.get(request.rollbackToken);
    if (!entry || entry.used || entry.expiresAt <= this.now()) {
      throw new OfficialSessionError(
        "ROLLBACK_EXPIRED",
        "rollbackToken无效、已使用或已过期"
      );
    }
    if (!safeTokenEqual(entry.confirmToken, request.confirmToken)) {
      throw new OfficialSessionError("ROLLBACK_CONFIRMATION_INVALID", "回滚confirmToken不正确");
    }
    if (this.mutationActive) {
      throw new OfficialSessionError("MUTATION_BUSY", "另一项官方系统写入正在执行");
    }

    entry.used = true;
    this.rollbacks.delete(request.rollbackToken);
    this.mutationActive = true;
    const reversed = [...entry.operations].reverse();
    const results = [];
    try {
      for (let index = 0; index < reversed.length; index += 1) {
        const operation = reversed[index];
        try {
          await this._executeRollbackOperation(operation);
          results.push({
            kind: operation.kind,
            action: operation.action,
            id: operation.id || operation.storageId || "",
            ok: true
          });
        } catch (error) {
          const remaining = reversed.slice(index).reverse();
          return sanitizeForRenderer({
            ok: false,
            error: safeError(error),
            results,
            rollback: this._storeRollback(remaining)
          });
        }
      }
      return sanitizeForRenderer({ ok: true, results });
    } finally {
      this.mutationActive = false;
    }
  }

  dispose() {
    this.confirmations.clear();
    this.rollbacks.clear();
    if (this._isWindowUsable()) this.window.destroy();
    this.window = null;
  }
}

module.exports = {
  API,
  OFFICIAL_ORIGIN,
  OFFICIAL_PARTITION,
  OFFICIAL_RECORD_URL,
  OfficialSession,
  OfficialSessionError,
  buildPageExecutionScript,
  equalSets,
  journalCollision,
  journalEquivalent,
  mergeOrderedAttachments,
  normalizePersonnelQuery,
  normalizeQueryDay,
  normalizeReadback,
  normalizeSubmitPlan,
  recordEquivalent,
  safeError,
  sanitizeForRenderer,
  scheduleCollision,
  scheduleEquivalent
};
