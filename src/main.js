import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardCheck,
  Clock3,
  CloudSun,
  Copy,
  createIcons,
  Eye,
  ExternalLink,
  FileImage,
  FileText,
  FolderOpen,
  ImagePlus,
  Images,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  MapPin,
  RefreshCw,
  Route,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  SquareCheckBig,
  Trash2,
  Undo2,
  Users,
  X,
  XCircle
} from "lucide";
import {
  ROUTES,
  buildDraft,
  buildJournalDraft,
  buildRoadBulletin,
  classifyImage,
  dateFromOcr,
  groupRoutePhotos,
  inferRouteTimeRange,
  placeAssignment,
  resolvePhotoAssignments,
  toDisplayDate,
  weatherFromOcr
} from "./domain.js";
import { recognizePatrolImage } from "./ocr.js";
import { isTrustedLocalAppOrigin } from "./local-origin.js";
import {
  OFFICIAL_PERSONNEL,
  OFFICIAL_PROFILE,
  buildOfficialSubmitPlan,
  registerOfficialPersonnel
} from "./official-plan.js";
import "./styles.css";

const OFFICIAL_URL = "http://110.167.233.70:8084/#/dutyRecord";
const ROUTE_KEYS = Object.keys(ROUTES);
const ROUTE_BADGES = { g6: "G6", west: "G6 西过境", s101: "S101" };
const PERSONNEL = Object.keys(OFFICIAL_PERSONNEL);
const WEATHER_OPTIONS = ["晴", "多云", "阴", "小雨", "中雨", "大雨", "雪", "雾"];
const WORKFLOW_STEPS = [
  ["source", "照片准备"],
  ["ocr", "OCR 识别"],
  ["group", "线路归集"],
  ["login", "登录会话"],
  ["query", "同日查重"],
  ["preflight", "写入预检"],
  ["submit", "新增 / 复用"],
  ["readback", "回读校验"]
];

function chinaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function emptyWorkflow() {
  return Object.fromEntries(WORKFLOW_STEPS.map(([key]) => [
    key,
    { status: "pending", detail: "" }
  ]));
}

const state = {
  date: chinaDate(),
  dateSynchronized: false,
  weather: "",
  confirmedCondition: "畅通",
  // 自动登录
  credentialUsers: [],
  selectedCredentialUser: "",
  autoLoggingIn: false,
  autoLoginError: "",
  photos: [],
  loadingFolder: false,
  running: false,
  runNonce: 0,
  selectedPhoto: null,
  inspectorMode: "photo",
  selectedRoute: "g6",
  selectedOutput: "record",
  postSubmitVerified: false,
  routeProfiles: {
    g6: {
      vehicle: "青A99R18",
      officers: ["张彩琪", "李彩燕", "黄昇鹏"],
      startTime: "08:00",
      endTime: "12:00",
      timeManual: false
    },
    west: {
      vehicle: "青A33W69",
      officers: ["宁戎", "杨富强"],
      startTime: "08:00",
      endTime: "12:00",
      timeManual: false
    },
    s101: {
      vehicle: "",
      officers: [],
      startTime: "08:00",
      endTime: "12:00",
      timeManual: false
    }
  },
  narrativeOverrides: {},
  workflow: emptyWorkflow(),
  workflowMessage: "等待照片",
  workflowPercent: 0,
  currentFile: "",
  desktopStatus: null,
  personnelSynchronized: false,
  existingDay: null,
  preflight: null,
  submitResult: null,
  readbackResult: null,
  rollback: null,
  rollbackResult: null,
  issues: [],
  activity: [],
  dirtyAfterSubmit: false,
  toast: ""
};

const ICONS = {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardCheck,
  Clock3,
  CloudSun,
  Copy,
  Eye,
  ExternalLink,
  FileImage,
  FileText,
  FolderOpen,
  ImagePlus,
  Images,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  MapPin,
  RefreshCw,
  Route,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  SquareCheckBig,
  Trash2,
  Undo2,
  Users,
  X,
  XCircle
};

const $ = (selector) => document.querySelector(selector);
const icon = (name, size = 18, className = "") =>
  `<i data-lucide="${name}" class="${className}" style="width:${size}px;height:${size}px" aria-hidden="true"></i>`;

function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]
  );
}

function routeKeyForDraft(draft) {
  return draft.routeKey
    || ROUTE_KEYS.find((routeKey) => ROUTES[routeKey].code === draft.routeCode)
    || "";
}

function draftsForCurrentPhotos() {
  return ROUTE_KEYS.map((routeKey) => {
    const profile = state.routeProfiles[routeKey];
    const draft = buildDraft({
      date: state.date,
      routeKey,
      vehicle: profile.vehicle,
      officers: profile.officers,
      startTime: profile.startTime,
      endTime: profile.endTime,
      photos: state.photos,
      confirmedCondition: state.confirmedCondition
    });
    if (Object.hasOwn(state.narrativeOverrides, routeKey)) {
      draft.narrative = state.narrativeOverrides[routeKey];
    }
    return draft;
  });
}

function usableDrafts(drafts = draftsForCurrentPhotos()) {
  return drafts.filter((draft) => draft.readiness.included.length > 0);
}

function generatedOutputs(drafts = draftsForCurrentPhotos()) {
  const usable = usableDrafts(drafts);
  const routeKeys = usable.map(routeKeyForDraft).filter(Boolean);
  return {
    drafts,
    usable,
    journal: buildJournalDraft({ date: state.date, drafts: usable }),
    bulletin: buildRoadBulletin({
      date: state.date,
      weather: state.weather,
      routeKeys,
      confirmedCondition: state.confirmedCondition
    })
  };
}

function desktopMethod(name) {
  const bridge = window.dutyDesktop;
  if (!bridge) return null;
  const aliases = {
    status: ["status", "officialStatus"],
    openLogin: ["openLogin", "officialOpenLogin", "openOfficial"],
    personnel: ["personnel", "officialPersonnel"],
    queryDay: ["queryDay", "officialQueryDay"],
    submitPlan: ["submitPlan", "officialSubmitPlan"],
    readback: ["readback", "officialReadback"],
    rollback: ["rollback", "officialRollback"],
    autoLogin: ["autoLogin", "officialAutoLogin"],
    credentials: ["credentials", "officialCredentials"]
  };
  const methodName = aliases[name]?.find((candidate) => typeof bridge[candidate] === "function");
  return methodName ? bridge[methodName].bind(bridge) : null;
}

const WEB_OFFICIAL_ENDPOINTS = Object.freeze({
  status: ["GET", "/api/official/status"],
  openLogin: ["POST", "/api/official/open-login"],
  personnel: ["POST", "/api/official/personnel"],
  queryDay: ["POST", "/api/official/query-day"],
  submitPlan: ["POST", "/api/official/submit-plan"],
  readback: ["POST", "/api/official/readback"],
  rollback: ["POST", "/api/official/rollback"],
  autoLogin: ["POST", "/api/official/auto-login"],
  credentials: ["GET", "/api/official/credentials"]
});

function hasLocalWebBridge() {
  return isTrustedLocalAppOrigin();
}

function webOfficialMethod(name) {
  const endpoint = WEB_OFFICIAL_ENDPOINTS[name];
  if (!endpoint || !hasLocalWebBridge()) return null;
  return async (payload) => {
    const [method, path] = endpoint;
    const response = await fetch(path, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      headers: method === "POST" ? { "content-type": "application/json" } : {},
      ...(method === "POST" ? { body: JSON.stringify(payload ?? {}) } : {})
    });
    if (!response.ok) throw new Error(`本地自动化服务返回HTTP ${response.status}`);
    return response.json();
  };
}

function officialMethod(name) {
  return desktopMethod(name) || webOfficialMethod(name);
}

function hasDesktopBridge() {
  return ["status", "openLogin", "personnel", "queryDay", "submitPlan", "readback", "rollback"]
    .every((name) => officialMethod(name));
}

async function callDesktop(name, payload) {
  const method = officialMethod(name);
  if (!method) {
    const error = new Error("本地自动化桥接不可用");
    error.code = "AUTOMATION_BRIDGE_REQUIRED";
    throw error;
  }
  const result = payload === undefined ? await method() : await method(payload);
  if (!result?.ok) {
    const error = new Error(result?.error?.message || `${name}执行失败`);
    error.code = result?.error?.code || "DESKTOP_OPERATION_FAILED";
    error.details = result?.error?.details;
    error.result = result;
    throw error;
  }
  return result;
}

function setStep(key, status, detail = "") {
  state.workflow[key] = { status, detail };
  render();
}

function resetWorkflow() {
  state.workflow = emptyWorkflow();
  state.workflowMessage = "准备开始";
  state.workflowPercent = 0;
  state.currentFile = "";
  state.issues = [];
  state.preflight = null;
  state.rollbackResult = null;
}

function addActivity(message, level = "info") {
  state.activity.unshift({
    message,
    level,
    time: new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date())
  });
  state.activity = state.activity.slice(0, 12);
}

function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 2200);
}

function markDirty(message = "内容已修改，重新运行将查重后新增或完全一致复用") {
  if (state.submitResult) state.dirtyAfterSubmit = true;
  state.postSubmitVerified = false;
  state.preflight = null;
  state.readbackResult = null;
  if (message) addActivity(message);
}

function releasePhotoUrls(photos) {
  for (const photo of photos) {
    if (photo.objectUrl && photo.url) URL.revokeObjectURL(photo.url);
  }
}

function cleanImageFiles(fileList) {
  return [...fileList].filter((file) =>
    /^image\/(?:jpeg|png)$/i.test(file.type)
    || /\.(?:jpe?g|png)$/i.test(file.name)
  );
}

function unverifiedPhoto(fileName) {
  const suggestion = classifyImage({ fileName });
  return {
    ...suggestion,
    originalName: fileName,
    recognized: false,
    include: false,
    confidence: suggestion.confidence === "excluded" ? "excluded" : "pending",
    reason: "等待 OCR 识别。",
    proposedName: suggestion.proposedName || fileName
  };
}

function useFiles(fileList) {
  const files = cleanImageFiles(fileList);
  if (!files.length) {
    state.issues = [{ severity: "error", title: "没有可读取的图片", detail: "支持 JPG、JPEG 和 PNG。" }];
    render();
    return;
  }
  releasePhotoUrls(state.photos);
  resetAutomaticRouteTimes();
  state.photos = files.map((file, sourceIndex) => ({
    file,
    url: URL.createObjectURL(file),
    objectUrl: true,
    sourceIndex,
    ...unverifiedPhoto(file.name)
  }));
  state.selectedPhoto = state.photos[0]?.sourceIndex ?? null;
  state.inspectorMode = "photo";
  state.narrativeOverrides = {};
  state.existingDay = null;
  state.submitResult = null;
  state.readbackResult = null;
  state.rollback = null;
  state.dirtyAfterSubmit = false;
  state.postSubmitVerified = false;
  resetWorkflow();
  state.workflow.source = { status: "done", detail: `${files.length} 张` };
  state.workflowMessage = "照片已载入";
  addActivity(`已载入 ${files.length} 张照片`);
  render();
}

function normalizedPhotos(photos) {
  const normalized = Object.values(groupRoutePhotos(photos)).flat();
  const byIndex = new Map(normalized.map((photo) => [photo.sourceIndex, photo]));
  return photos.map((photo) => {
    const match = byIndex.get(photo.sourceIndex);
    return match
      ? {
        ...photo,
        proposedName: match.proposedName,
        sequence: match.sequence,
        patrolGroup: match.patrolGroup,
        recordGroup: match.recordGroup
      }
      : photo;
  });
}

function resetAutomaticRouteTimes() {
  for (const profile of Object.values(state.routeProfiles)) {
    profile.timeManual = false;
  }
}

function synchronizeRouteTimes(photos = state.photos) {
  for (const routeKey of ROUTE_KEYS) {
    const profile = state.routeProfiles[routeKey];
    if (profile.timeManual) continue;
    const inferred = inferRouteTimeRange(routeKey, photos);
    if (!inferred) continue;
    profile.startTime = inferred.startTime;
    profile.endTime = inferred.endTime;
  }
}

function inferWeather(photos) {
  const counts = new Map();
  for (const photo of photos) {
    const value = photo.weather || weatherFromOcr(photo.ocrText || "");
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "";
}

function isCancelled(nonce) {
  return nonce !== state.runNonce;
}

async function recognizePhotos({ force = false, nonce = state.runNonce } = {}) {
  const targets = state.photos
    .map((photo, index) => ({ photo, index }))
    .filter(({ photo }) => force || !photo.recognized);
  if (!targets.length) {
    state.photos = normalizedPhotos(resolvePhotoAssignments(state.photos));
    synchronizeRouteTimes();
    setStep("ocr", "done", `${state.photos.length} 张已识别`);
    return;
  }

  setStep("ocr", "active", `0/${targets.length}`);
  let completed = 0;
  for (const { photo, index } of targets) {
    if (isCancelled(nonce)) throw new Error("任务已停止");
    state.currentFile = photo.originalName;
    state.workflowMessage = `正在识别 ${photo.originalName}`;
    let lastReported = -10;
    render();
    try {
      const result = await recognizePatrolImage(photo.file || photo.url, (progress) => {
        const percent = Math.round(progress * 100);
        if (percent - lastReported < 10 && percent !== 100) return;
        lastReported = percent;
        state.workflow.ocr.detail = `${completed + 1}/${targets.length} · ${percent}%`;
        state.workflowPercent = Math.round(((completed + progress) / targets.length) * 42);
        render();
      });
      const classified = classifyImage({
        fileName: photo.originalName,
        ocrText: result.ocrText,
        timeOcrText: result.timeOcrText
      });
      const recognized = {
        ...photo,
        ...classified,
        recognized: true,
        ocrConfidence: result.confidence,
        ocrError: ""
      };
      if (photo.manualAssignment) {
        Object.assign(recognized, {
          routeKey: photo.routeKey,
          routeOptions: photo.routeOptions,
          pointId: photo.pointId,
          place: photo.place,
          semanticPoint: photo.semanticPoint,
          sequence: photo.sequence,
          confidence: photo.confidence,
          include: photo.include,
          nameBase: photo.nameBase,
          proposedName: photo.proposedName,
          standardName: photo.standardName,
          event: photo.event,
          reason: photo.reason,
          shared: false,
          manualAssignment: true
        });
      }
      if (photo.manualTime) recognized.time = photo.time;
      if (photo.manualName) {
        recognized.nameBase = photo.nameBase;
        recognized.proposedName = photo.proposedName;
        recognized.standardName = photo.standardName;
        recognized.manualName = true;
      }
      state.photos[index] = recognized;
    } catch (error) {
      state.photos[index] = {
        ...photo,
        recognized: true,
        include: false,
        confidence: "review",
        ocrError: error?.message || "OCR 失败",
        reason: "OCR 失败，需重新识别或人工修正。"
      };
    }
    completed += 1;
    state.workflow.ocr.detail = `${completed}/${targets.length}`;
    state.workflowPercent = Math.round((completed / targets.length) * 42);
    render();
  }

  setStep("ocr", "done", `${state.photos.length} 张`);
  setStep("group", "active", "分析并行车辆与线路拓扑");
  state.photos = normalizedPhotos(resolvePhotoAssignments(state.photos));
  synchronizeRouteTimes();
  if (!state.weather) state.weather = inferWeather(state.photos);
  state.workflowPercent = 50;
  const routeCount = usableDrafts().length;
  setStep("group", "done", `${routeCount} 条线路`);
  state.workflowMessage = `已归集 ${routeCount} 条线路`;
}

function collectIssues(drafts = draftsForCurrentPhotos()) {
  const issues = [];
  const usable = usableDrafts(drafts);
  if (!state.photos.length) {
    issues.push({ severity: "error", title: "没有照片", detail: "请选择或拖入当日巡查图片。" });
    return issues;
  }
  if (!usable.length) {
    issues.push({ severity: "error", title: "没有可提交线路", detail: "当前图片尚未归集到三条管辖线路。" });
  }
  if (!state.weather) {
    issues.push({ severity: "error", title: "天气未识别", detail: "请选择当日天气后重新运行。" });
  }

  const names = new Map();
  const unresolved = state.photos.filter((photo) =>
    photo.recognized
    && ["review", "context"].includes(photo.confidence)
    && photo.confidence !== "excluded"
  );
  if (unresolved.length) {
    issues.push({
      severity: "error",
      title: `${unresolved.length} 张图片尚未可靠归集`,
      detail: `${unresolved.slice(0, 3).map((photo) => photo.originalName).join("、")}${unresolved.length > 3 ? "等" : ""}。修正地点或排除后可继续。`
    });
  }
  for (const photo of state.photos) {
    names.set(photo.originalName, (names.get(photo.originalName) || 0) + 1);
    if (photo.include && !photo.time) {
      issues.push({
        severity: "error",
        title: `${photo.originalName} 缺少时间`,
        detail: "填写水印拍摄时间后可继续自动填报。"
      });
    }
    const ocrDate = dateFromOcr(photo.ocrText || "");
    if (photo.include && ocrDate && ocrDate !== state.date) {
      issues.push({
        severity: "error",
        title: `${photo.originalName} 日期不一致`,
        detail: `图片水印为 ${ocrDate}，当前填报日期为 ${state.date}。`
      });
    }
    if (photo.include && photo.routeKey && photo.time) {
      const profile = state.routeProfiles[photo.routeKey];
      const toMinutes = (value) => {
        const [hour, minute] = String(value).split(":").map(Number);
        return hour * 60 + minute;
      };
      const photoAt = toMinutes(photo.time);
      const routeStart = toMinutes(profile.startTime);
      const routeEnd = toMinutes(profile.endTime);
      if (photoAt < routeStart - 30 || photoAt > routeEnd + 30) {
        issues.push({
          severity: "error",
          title: `${photo.originalName} 时间超出记录时段`,
          detail: `识别为 ${photo.time}，${ROUTES[photo.routeKey].code} 当前设置为 ${profile.startTime}-${profile.endTime}。`
        });
      }
    }
  }
  for (const [name, count] of names) {
    if (count > 1) {
      issues.push({
        severity: "error",
        title: `文件名重复：${name}`,
        detail: "附件来源映射要求同一批次文件名唯一。"
      });
    }
  }

  for (const draft of usable) {
    const routeKey = routeKeyForDraft(draft);
    if (!draft.vehicle.trim()) {
      issues.push({
        severity: "error",
        title: `${ROUTES[routeKey].code} 缺少车辆`,
        detail: "填写该线路执法车辆后可继续。"
      });
    }
    if (!draft.officers.length) {
      issues.push({
        severity: "error",
        title: `${ROUTES[routeKey].code} 缺少人员`,
        detail: "至少选择一名巡查人员。"
      });
    }
    if (draft.startTime >= draft.endTime) {
      issues.push({
        severity: "error",
        title: `${ROUTES[routeKey].code} 时间范围无效`,
        detail: "结束时间必须晚于开始时间。"
      });
    }
    if (draft.readiness.reviewCount) {
      issues.push({
        severity: "error",
        title: `${ROUTES[routeKey].code} 有 ${draft.readiness.reviewCount} 张歧义图片`,
        detail: "上下文弱匹配仍需修正地点；拓扑自动确认图片不在此列。"
      });
    }
  }
  return issues;
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("附件读取失败"));
    reader.readAsDataURL(blob);
  });
}

async function photoBlob(photo) {
  if (photo.file instanceof Blob) return photo.file;
  if (!photo.url) throw new Error(`缺少附件来源：${photo.originalName}`);
  const response = await fetch(photo.url);
  if (!response.ok) throw new Error(`无法读取附件：${photo.originalName}`);
  return response.blob();
}

async function buildAttachmentSources(drafts, nonce) {
  const included = drafts.flatMap((draft) => draft.readiness.included);
  const unique = [...new Map(included.map((photo) => [photo.originalName, photo])).values()];
  const sources = new Map();
  for (let index = 0; index < unique.length; index += 1) {
    if (isCancelled(nonce)) throw new Error("任务已停止");
    const photo = unique[index];
    state.workflowMessage = `正在准备附件 ${index + 1}/${unique.length}`;
    state.workflow.preflight.detail = `附件 ${index + 1}/${unique.length}`;
    render();
    const blob = await photoBlob(photo);
    const mimeType = blob.type === "image/png" ? "image/png" : "image/jpeg";
    sources.set(photo.originalName, {
      mimeType,
      dataBase64: await blobToBase64(blob)
    });
  }
  return sources;
}

async function waitForLogin(nonce) {
  setStep("login", "active", "检查登录状态");
  let status = await callDesktop("status");
  state.desktopStatus = status;
  if (status.authenticated && status.serviceReady) {
    const synchronized = await synchronizeOfficialPersonnel();
    setStep("login", "done", synchronized ? `会话可用 · ${synchronized} 人` : "会话可用");
    return;
  }

  await callDesktop("openLogin");
  setStep("login", "waiting", "等待人工登录");
  state.workflowMessage = "请在官方窗口完成人工登录和滑块验证";
  addActivity("官方登录窗口已打开，登录成功后将自动续跑");
  for (let attempt = 0; attempt < 900; attempt += 1) {
    if (isCancelled(nonce)) throw new Error("任务已停止");
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    status = await callDesktop("status");
    state.desktopStatus = status;
    if (status.authenticated && status.serviceReady) {
      const synchronized = await synchronizeOfficialPersonnel();
      setStep("login", "done", synchronized ? `登录成功 · ${synchronized} 人` : "登录成功");
      addActivity("官方系统登录成功，自动流程已续跑", "success");
      return;
    }
    if (attempt % 5 === 0) render();
  }
  const error = new Error("等待官方系统登录超时");
  error.code = "LOGIN_TIMEOUT";
  throw error;
}

async function synchronizeOfficialPersonnel() {
  if (!officialMethod("personnel")) return 0;
  try {
    const result = await callDesktop("personnel", { oid: OFFICIAL_PROFILE.oid });
    const synchronized = registerOfficialPersonnel(result.personnel);
    state.personnelSynchronized = true;
    if (synchronized) addActivity(`已同步 ${synchronized} 名大队执法人员`);
    return synchronized;
  } catch (error) {
    addActivity(`人员名单同步失败：${error.message}`, "error");
    return 0;
  }
}

function resultIds(result) {
  return {
    scheduleIds: (result?.results?.schedules || []).map((item) => item.scheduleId).filter(Boolean),
    recordIds: (result?.results?.records || []).map((item) => item.recordId).filter(Boolean),
    journalIds: (result?.results?.journals || []).map((item) => item.checklogId).filter(Boolean)
  };
}

function assertReadback(result, ids) {
  const missing = result?.missing || {};
  const missingIds = [
    ...(missing.scheduleIds || []),
    ...(missing.recordIds || []),
    ...(missing.journalIds || [])
  ];
  if (missingIds.length) {
    const error = new Error(`回读缺少 ${missingIds.length} 个写入对象`);
    error.code = "READBACK_MISSING";
    throw error;
  }
  const expected = ids.scheduleIds.length + ids.recordIds.length + ids.journalIds.length;
  const actual = (result.schedules || []).length
    + (result.records || []).length
    + (result.journals || []).length;
  if (actual < expected) {
    const error = new Error(`回读数量不足：应为 ${expected}，实际 ${actual}`);
    error.code = "READBACK_INCOMPLETE";
    throw error;
  }
}

function issueFromError(error) {
  return {
    severity: "error",
    title: error?.code || "自动流程中止",
    detail: error?.message || "发生未知错误。"
  };
}

async function runAutomation({ previewOnly = false } = {}) {
  if (state.running) return;
  const nonce = ++state.runNonce;
  state.running = true;
  resetWorkflow();
  state.submitResult = null;
  state.readbackResult = null;
  state.rollback = null;
  state.rollbackResult = null;
  state.dirtyAfterSubmit = false;
  state.postSubmitVerified = false;
  state.inspectorMode = "flow";
  addActivity(previewOnly ? "开始重新识别" : "开始一键自动填报");
  render();

  try {
    setStep("source", "active", "检查照片");
    if (!state.photos.length) await loadDailyFolder({ silent: true });
    if (!state.photos.length) throw new Error(`${state.date} 没有可用照片`);
    setStep("source", "done", `${state.photos.length} 张`);
    state.workflowPercent = 4;

    await recognizePhotos({ force: previewOnly, nonce });
    if (isCancelled(nonce)) throw new Error("任务已停止");

    const drafts = draftsForCurrentPhotos();
    state.issues = collectIssues(drafts);
    if (state.issues.some((issue) => issue.severity === "error")) {
      setStep("group", "error", "需修正识别结果");
      state.workflowMessage = "识别结果存在冲突，未写入官方系统";
      throw Object.assign(new Error("请先修正右侧列出的冲突"), { code: "REVIEW_REQUIRED", handled: true });
    }

    if (previewOnly || !hasDesktopBridge()) {
      for (const key of ["login", "query", "preflight", "submit", "readback"]) {
        state.workflow[key] = { status: "skipped", detail: "桌面版可用" };
      }
      state.workflowPercent = 100;
      state.workflowMessage = hasDesktopBridge() ? "识别预览已更新" : "识别预览完成，自动提交需桌面版";
      addActivity(state.workflowMessage, "success");
      return;
    }

    await waitForLogin(nonce);
    state.workflowPercent = 58;

    setStep("query", "active", "查询排班、现场记录和日志");
    state.workflowMessage = `正在查询 ${state.date} 已有登记`;
    const existingDay = await callDesktop("queryDay", {
      date: state.date,
      oid: OFFICIAL_PROFILE.oid,
      cateId: OFFICIAL_PROFILE.cateId
    });
    state.existingDay = existingDay;
    setStep(
      "query",
      "done",
      `${existingDay.counts?.schedules || 0}/${existingDay.counts?.records || 0}/${existingDay.counts?.journals || 0}`
    );
    state.workflowPercent = 66;

    setStep("preflight", "active", "准备附件");
    const currentDrafts = usableDrafts();
    const attachmentSources = await buildAttachmentSources(currentDrafts, nonce);
    const plan = buildOfficialSubmitPlan({
      date: state.date,
      drafts: currentDrafts,
      weather: state.weather,
      existingDay,
      attachmentSources,
      dryRun: true
    });
    state.workflowMessage = "正在执行只读写入预检";
    const preflight = await callDesktop("submitPlan", plan);
    state.preflight = preflight;
    if (!preflight.ready || !preflight.confirmation?.confirmToken) {
      state.issues = (preflight.conflicts || []).map((conflict) => ({
        severity: "error",
        title: `${conflict.kind || "数据"}冲突`,
        detail: conflict.reason || "预检未通过。"
      }));
      setStep("preflight", "error", `${state.issues.length} 项冲突`);
      const error = new Error("官方系统预检发现冲突，未执行写入");
      error.code = "PREFLIGHT_CONFLICT";
      error.handled = true;
      throw error;
    }
    setStep("preflight", "done", "无冲突");
    state.workflowPercent = 78;

    setStep("submit", "active", "仅新增或完全一致复用");
    state.workflowMessage = "正在新增或复用，请勿关闭应用";
    const livePlan = {
      ...plan,
      dryRun: false,
      confirmToken: preflight.confirmation.confirmToken
    };
    const submitted = await callDesktop("submitPlan", livePlan);
    state.submitResult = submitted;
    state.rollback = submitted.rollback || null;
    setStep("submit", "done", "新增 / 复用完成");
    state.workflowPercent = 91;

    setStep("readback", "active", "核对字段、附件与关联");
    const ids = resultIds(submitted);
    const readback = await callDesktop("readback", { date: state.date, ...ids });
    assertReadback(readback, ids);
    state.readbackResult = readback;
    setStep("readback", "done", "校验一致");
    state.workflowPercent = 100;
    state.workflowMessage = "自动填报完成并通过回读校验";
    state.selectedOutput = "readback";
    addActivity("排班、现场记录和日志已提交并通过回读", "success");
  } catch (error) {
    if (error?.result?.rollback) state.rollback = error.result.rollback;
    if (error?.result?.partialResults) {
      state.submitResult = { results: error.result.partialResults };
    }
    if (isCancelled(nonce)) {
      state.workflowMessage = "任务已停止";
      addActivity("任务已由用户停止");
    } else if (!error?.handled) {
      state.issues = [issueFromError(error), ...state.issues];
      const active = WORKFLOW_STEPS.find(([key]) => state.workflow[key].status === "active");
      if (active) state.workflow[active[0]] = { status: "error", detail: error.message };
      state.workflowMessage = error?.message || "自动流程中止";
      addActivity(state.workflowMessage, "error");
    } else {
      addActivity(error.message, "error");
    }
  } finally {
    if (!isCancelled(nonce)) {
      state.running = false;
      state.currentFile = "";
      render();
    }
  }
}

function stopAutomation() {
  if (!state.running) return;
  state.runNonce += 1;
  state.running = false;
  state.currentFile = "";
  state.workflowMessage = "正在停止，当前 OCR 完成后退出";
  addActivity("已请求停止当前任务");
  render();
}

async function rollbackSubmission() {
  if (state.running || !state.rollback) return;
  const confirmed = window.confirm("确认回滚本次自动填报产生的新增内容？系统会先校验线上数据未被他人修改。");
  if (!confirmed) return;
  state.running = true;
  state.workflowMessage = "正在回滚本次写入";
  addActivity("开始回滚本次写入");
  render();
  try {
    const result = await callDesktop("rollback", {
      rollbackToken: state.rollback.rollbackToken,
      confirmToken: state.rollback.confirmToken
    });
    state.rollbackResult = result;
    state.rollback = result.rollback || null;
    if (!result.ok) {
      const error = new Error(result.error?.message || "回滚未完成");
      error.code = result.error?.code || "ROLLBACK_FAILED";
      throw error;
    }
    state.submitResult = null;
    state.readbackResult = null;
    state.dirtyAfterSubmit = false;
    state.postSubmitVerified = false;
    state.workflowMessage = "本次写入已回滚并校验";
    addActivity("本次写入已完成回滚", "success");
  } catch (error) {
    if (error?.result?.rollback) state.rollback = error.result.rollback;
    state.issues = [issueFromError(error), ...state.issues];
    state.workflowMessage = error.message;
    addActivity(error.message, "error");
  } finally {
    state.running = false;
    render();
  }
}

async function loadDailyFolder({ silent = false } = {}) {
  if (state.loadingFolder) return;
  state.loadingFolder = true;
  if (!silent) {
    state.workflowMessage = `读取 ${state.date} 图片目录`;
    render();
  }
  try {
    const response = await fetch(`/api/daily?date=${encodeURIComponent(state.date)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "无法读取每日图片目录");
    releasePhotoUrls(state.photos);
    resetAutomaticRouteTimes();
    state.photos = (payload.files || []).map(({ name, url }, sourceIndex) => ({
      url,
      objectUrl: false,
      sourceIndex,
      ...unverifiedPhoto(name)
    }));
    state.selectedPhoto = state.photos[0]?.sourceIndex ?? null;
    state.inspectorMode = "photo";
    state.narrativeOverrides = {};
    state.existingDay = null;
    state.submitResult = null;
    state.readbackResult = null;
    state.rollback = null;
    state.dirtyAfterSubmit = false;
    state.postSubmitVerified = false;
    state.workflow.source = {
      status: state.photos.length ? "done" : "pending",
      detail: state.photos.length ? `${state.photos.length} 张` : ""
    };
    if (!silent) {
      state.workflowMessage = state.photos.length ? `已读取 ${state.photos.length} 张照片` : "目录中没有照片";
      addActivity(`本地目录读取完成：${state.photos.length} 张`);
    }
  } catch (error) {
    state.photos = [];
    state.selectedPhoto = null;
    state.inspectorMode = "flow";
    state.issues = [issueFromError(error)];
    if (!silent) state.workflowMessage = error.message;
  } finally {
    state.loadingFolder = false;
    render();
  }
}

async function synchronizeBusinessDate() {
  try {
    const response = await fetch("/api/today");
    const payload = await response.json();
    if (!response.ok || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) return;
    if (!state.dateSynchronized) {
      state.date = payload.date;
      state.dateSynchronized = true;
      render();
      await loadDailyFolder();
    }
  } catch {
    state.dateSynchronized = true;
  }
}

async function refreshDesktopStatus() {
  if (!hasDesktopBridge()) {
    state.desktopStatus = null;
    render();
    return;
  }
  try {
    state.desktopStatus = await callDesktop("status");
    if (state.desktopStatus.authenticated && state.desktopStatus.serviceReady) {
      await synchronizeOfficialPersonnel();
    }
  } catch (error) {
    state.desktopStatus = { authenticated: false, serviceReady: false, error: issueFromError(error) };
  }
  render();
}

async function loadCredentialUsers() {
  try {
    const method = officialMethod("credentials");
    if (!method) return;
    const result = await method();
    if (result?.ok && Array.isArray(result.users)) {
      state.credentialUsers = result.users.map((u) => u.username).filter(Boolean);
      if (state.credentialUsers.length > 0 && !state.selectedCredentialUser) {
        // 默认选中第一个匹配当前默认人员的用户
        const defaults = state.routeProfiles.g6.officers;
        const match = state.credentialUsers.find((u) => defaults.includes(u));
        state.selectedCredentialUser = match || state.credentialUsers[0];
      }
    }
  } catch {
    // 非桌面版或无 credentials 方法时静默忽略
  }
}

async function autoLogin() {
  if (!state.selectedCredentialUser || state.autoLoggingIn || state.running) return;
  state.autoLoggingIn = true;
  state.autoLoginError = "";
  render();
  try {
    const result = await callDesktop("autoLogin", state.selectedCredentialUser);
    state.desktopStatus = result;
    if (result.authenticated && result.serviceReady) {
      await synchronizeOfficialPersonnel();
      addActivity(`已自动登录为 ${state.selectedCredentialUser}`, "success");
    } else {
      state.autoLoginError = "登录未完全成功，请重试或手动登录";
      addActivity(state.autoLoginError, "warn");
    }
  } catch (error) {
    state.autoLoginError = error?.message || "自动登录失败";
    state.desktopStatus = { authenticated: false, serviceReady: false, error: issueFromError(error) };
    addActivity(state.autoLoginError, "error");
  } finally {
    state.autoLoggingIn = false;
    render();
  }
}

function statusClass() {
  if (!hasDesktopBridge()) return "browser";
  if (state.desktopStatus?.authenticated && state.desktopStatus?.serviceReady) return "online";
  return "offline";
}

function statusLabel() {
  if (!hasDesktopBridge()) return "自动化服务未连接";
  if (state.desktopStatus?.authenticated && state.desktopStatus?.serviceReady) return "官方系统已登录";
  return "官方系统未登录";
}

function workflowIcon(status) {
  if (status === "done") return icon("check", 14);
  if (status === "active") return icon("loader-circle", 14, "spin");
  if (status === "waiting") return icon("log-in", 14);
  if (status === "error") return icon("x", 14);
  return icon("circle", 12);
}

function renderWorkflow() {
  return WORKFLOW_STEPS.map(([key, label], index) => {
    const step = state.workflow[key];
    return `<li class="step ${step.status}">
      <span class="step-index">${workflowIcon(step.status)}</span>
      <div>
        <strong>${index + 1}. ${label}</strong>
        <span>${escapeHtml(step.detail || (step.status === "pending" ? "等待" : ""))}</span>
      </div>
    </li>`;
  }).join("");
}

function allPlaceOptions() {
  const seen = new Set();
  return ROUTE_KEYS.flatMap((routeKey) =>
    ROUTES[routeKey].checkpoints.map(([place]) => ({ routeKey, place }))
  ).filter(({ routeKey, place }) => {
    const key = `${routeKey}|${place}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function photoPlaceOptions(photo) {
  const selected = photo.routeKey && photo.place ? `${photo.routeKey}|${photo.place}` : "";
  const options = allPlaceOptions();
  if (
    selected
    && !options.some(({ routeKey, place }) => `${routeKey}|${place}` === selected)
  ) {
    options.unshift({ routeKey: photo.routeKey, place: photo.place });
  }
  return `<select class="field-control photo-place-select" data-photo-place="${photo.sourceIndex}" aria-label="修正图片地点">
    <option value="" ${!photo.routeKey && photo.confidence !== "excluded" ? "selected" : ""}>待确认地点</option>
    <option value="__exclude" ${photo.confidence === "excluded" ? "selected" : ""}>排除该图片</option>
    ${options.map(({ routeKey, place }) =>
      `<option value="${escapeHtml(`${routeKey}|${place}`)}" ${selected === `${routeKey}|${place}` ? "selected" : ""}>${escapeHtml(ROUTES[routeKey].code)} · ${escapeHtml(place)}</option>`
    ).join("")}
  </select>`;
}

function photoStatus(photo) {
  const labels = {
    high: "规则确认",
    topology: "拓扑确认",
    manual: "人工修正",
    context: "上下文歧义",
    excluded: "已排除",
    review: "需修正",
    pending: "待识别"
  };
  return `<span class="confidence ${photo.confidence || "pending"}">
    ${photo.confidence === "high" || photo.confidence === "topology" || photo.confidence === "manual"
      ? icon("check-circle-2", 14)
      : photo.confidence === "excluded"
        ? icon("x-circle", 14)
        : icon("alert-circle", 14)}
    ${labels[photo.confidence] || "待识别"}
  </span>`;
}

function renderPhotos() {
  if (!state.photos.length) {
    return `<div class="empty-state photo-empty">
      ${icon("images", 28)}
      <strong>当日照片为空</strong>
      <span>拖入当天全部照片，或从左侧读取日期目录。</span>
    </div>`;
  }
  return `<div class="photo-grid">
    ${state.photos.map((photo, index) => {
      const selected = state.selectedPhoto === photo.sourceIndex;
      const routeCode = photo.routeKey ? ROUTE_BADGES[photo.routeKey] : "未归集";
      return `<button type="button" class="photo-tile ${selected ? "selected" : ""} ${photo.include ? "included" : "excluded"}" data-select-photo="${photo.sourceIndex}" aria-pressed="${selected}" aria-label="检查 ${escapeHtml(photo.originalName)}">
        <span class="photo-media">
          ${photo.url
            ? `<img src="${escapeHtml(photo.url)}" alt="">`
            : `<span class="thumbnail-placeholder">${icon("file-image", 22)}</span>`}
          <span class="route-overlay">${escapeHtml(routeCode)}</span>
          <span class="time-overlay">${escapeHtml(photo.time || "--:--")}</span>
        </span>
        <span class="photo-tile-body">
          <strong title="${escapeHtml(photo.originalName)}">${escapeHtml(photo.originalName)}</strong>
          <span title="${escapeHtml(photo.proposedName || photo.originalName)}">${escapeHtml(photo.proposedName || photo.originalName)}</span>
          <span class="tile-footer">
            ${photoStatus(photo)}
            <small>${photo.recognized ? `OCR ${Math.round(photo.ocrConfidence || 0)}%` : `第 ${index + 1} 张`}</small>
          </span>
        </span>
      </button>`;
    }).join("")}
  </div>`;
}

function routeState(draft) {
  if (!draft.readiness.included.length) return { className: "empty", label: "无图片" };
  if (draft.readiness.reviewCount) return { className: "warning", label: `${draft.readiness.reviewCount} 张歧义` };
  return { className: "ready", label: "可自动提交" };
}

function renderOfficerPicker(routeKey, selected) {
  return `<div class="officer-picker" role="group" aria-label="${escapeHtml(ROUTES[routeKey].code)}巡查人员">
    ${PERSONNEL.map((name) => {
      const available = Boolean(OFFICIAL_PERSONNEL[name]?.personId);
      const unavailableLabel = state.personnelSynchronized ? "未入系统" : "待同步";
      return `<label class="officer-option ${available ? "" : "unavailable"}" ${available ? "" : `title="${unavailableLabel}"`}>
      <input type="checkbox" data-route-officer="${routeKey}" value="${escapeHtml(name)}" ${selected.includes(name) ? "checked" : ""} ${available ? "" : "disabled"}>
      <span>${escapeHtml(name)}</span>
      ${available ? "" : `<small>${unavailableLabel}</small>`}
    </label>`;
    }).join("")}
  </div>`;
}

function renderRoutes(drafts) {
  return drafts.map((draft) => {
    const routeKey = routeKeyForDraft(draft);
    const profile = state.routeProfiles[routeKey];
    const status = routeState(draft);
    const times = draft.readiness.included.map((photo) => photo.time).filter(Boolean).sort();
    return `<section class="route-editor ${draft.readiness.included.length ? "has-photos" : ""}">
      <div class="route-heading">
        <span class="route-code">${escapeHtml(ROUTE_BADGES[routeKey])}</span>
        <div>
          <h3>${escapeHtml(ROUTES[routeKey].label)}</h3>
          <p>${draft.readiness.included.length} 张 · ${times.length ? `${times[0]}-${times.at(-1)}` : "无有效时间"}</p>
        </div>
        <span class="route-status ${status.className}">${escapeHtml(status.label)}</span>
      </div>
      <div class="route-fields">
        <label class="vehicle-field">
          <span>${icon("car-front", 13)}执法车辆</span>
          <input class="field-control" data-route-field="vehicle" data-route="${routeKey}" value="${escapeHtml(profile.vehicle)}" placeholder="车牌号">
        </label>
        <div class="route-time-fields">
          <label>
            <span>开始</span>
            <input class="field-control" data-route-field="startTime" data-route="${routeKey}" type="time" value="${escapeHtml(profile.startTime)}">
          </label>
          <label>
            <span>结束</span>
            <input class="field-control" data-route-field="endTime" data-route="${routeKey}" type="time" value="${escapeHtml(profile.endTime)}">
          </label>
        </div>
        <div class="officer-field">
          <span>${icon("users", 13)}巡查人员</span>
          ${renderOfficerPicker(routeKey, profile.officers)}
        </div>
      </div>
    </section>`;
  }).join("");
}

function actionLabel(action) {
  return {
    create: "新增",
    update: "禁止",
    reuse: "完全一致复用",
    conflict: "冲突",
    upsert: "待预检",
    done: "完成"
  }[action] || action || "待定";
}

function renderResult() {
  if (!state.submitResult && !state.preflight && !state.rollbackResult) {
    return `<div class="empty-state compact-empty">${icon("list-checks", 22)}<strong>尚无提交结果</strong><span>预检后将逐项显示新增或完全一致复用。</span></div>`;
  }
  if (state.rollbackResult?.ok && !state.submitResult) {
    return `<div class="result-banner rolled-back">${icon("undo-2", 18)}<div><strong>已回滚</strong><span>本次自动写入已撤销并完成校验。</span></div></div>`;
  }
  const source = state.submitResult?.results || state.preflight?.operations || {};
  const groups = [
    ["schedules", "排班"],
    ["records", "现场记录"],
    ["journals", "日志"]
  ];
  return `<div class="result-list">
    ${groups.map(([key, label]) => {
      const items = source[key] || [];
      return `<div class="result-group">
        <div><strong>${label}</strong><span>${items.length} 条</span></div>
        ${items.map((item) => `<p>
          <span>${escapeHtml(item.clientRef || label)}</span>
          <b class="action-${escapeHtml(item.action === "update" ? "conflict" : item.action || "done")}">${escapeHtml(actionLabel(item.action || "done"))}</b>
        </p>`).join("") || "<small>无操作</small>"}
      </div>`;
    }).join("")}
    ${state.readbackResult ? `<div class="result-banner verified">${icon("shield-check", 18)}<div><strong>回读一致</strong><span>字段、附件及日志关联均已复核。</span></div></div>` : ""}
    ${state.dirtyAfterSubmit ? `<div class="result-banner changed">${icon("refresh-cw", 18)}<div><strong>内容已修改</strong><span>再次运行将重新查重，仅新增或完全一致复用。</span></div></div>` : ""}
  </div>`;
}

function renderIssues() {
  if (!state.issues.length) {
    return `<div class="issue-clear">${icon("check-circle-2", 18)}<span>当前没有阻断项</span></div>`;
  }
  return `<div class="issue-list">${state.issues.map((issue) => `<div class="issue ${issue.severity}">
    ${icon(issue.severity === "error" ? "alert-circle" : "circle", 17)}
    <div><strong>${escapeHtml(issue.title)}</strong><span>${escapeHtml(issue.detail)}</span></div>
  </div>`).join("")}</div>`;
}

function renderActivity() {
  if (!state.activity.length) return `<div class="rail-empty">尚无运行记录。</div>`;
  return `<ol class="activity-list">${state.activity.map((entry) => `<li class="${entry.level}">
    <time>${escapeHtml(entry.time)}</time><span>${escapeHtml(entry.message)}</span>
  </li>`).join("")}</ol>`;
}

function renderReadback() {
  if (!state.readbackResult) {
    return `<div class="empty-state compact-empty">${icon("shield-check", 22)}<strong>等待回读</strong><span>正式新增或复用后，系统将自动核验排班、现场记录、附件和日志关联。</span></div>`;
  }
  const groups = [
    ["schedules", "排班"],
    ["records", "现场记录"],
    ["journals", "日志"]
  ];
  return `<div class="readback-panel">
    <div class="result-banner verified">
      ${icon("shield-check", 20)}
      <div><strong>系统回读一致</strong><span>自动提交结果已从官方系统重新读取并核对。</span></div>
    </div>
    <dl class="readback-counts">
      ${groups.map(([key, label]) => `<div><dt>${label}</dt><dd>${(state.readbackResult[key] || []).length}</dd></div>`).join("")}
    </dl>
    <div class="human-check ${state.postSubmitVerified ? "verified" : ""}">
      <div>
        ${icon(state.postSubmitVerified ? "square-check-big" : "clipboard-check", 20)}
        <span><strong>${state.postSubmitVerified ? "人工核验已完成" : "提交后人工核验"}</strong><small>请抽查官方系统中的时间、人员、线路、附件和日志关联。</small></span>
      </div>
      <button id="mark-verified" class="${state.postSubmitVerified ? "secondary-button" : "primary-small"}">
        ${icon(state.postSubmitVerified ? "rotate-ccw" : "check", 16)}
        ${state.postSubmitVerified ? "取消标记" : "标记已核验"}
      </button>
    </div>
    ${state.rollback ? `<button id="rollback-output" class="rollback-button" ${state.running ? "disabled" : ""}>${icon("undo-2", 16)}回滚本次新增内容</button>` : ""}
  </div>`;
}

function renderOutput(outputs) {
  const selectedDraft = outputs.drafts.find((draft) => routeKeyForDraft(draft) === state.selectedRoute)
    || outputs.drafts[0];
  const tabs = [
    ["record", "现场记录", "file-text"],
    ["journal", "日志", "clipboard-check"],
    ["bulletin", "日报", "cloud-sun"],
    ["submit", "提交结果", "list-checks"],
    ["readback", "回读核验", "shield-check"]
  ];
  let content = "";
  if (state.selectedOutput === "journal") {
    content = outputs.journal.content || "没有可关联的线路记录。";
  } else if (state.selectedOutput === "bulletin") {
    content = outputs.bulletin;
  } else if (state.selectedOutput === "record") {
    content = selectedDraft.narrative;
  }
  const isTextOutput = ["record", "journal", "bulletin"].includes(state.selectedOutput);
  return `<section class="content-panel">
    <div class="content-tabs-wrap">
      <div class="content-tabs" role="tablist" aria-label="生成与提交内容">
        ${tabs.map(([key, label, iconName]) => `<button role="tab" data-output-tab="${key}" aria-selected="${state.selectedOutput === key}">${icon(iconName, 15)}${escapeHtml(label)}</button>`).join("")}
      </div>
      ${isTextOutput ? `<button class="icon-button" data-copy-output="${state.selectedOutput}" title="复制当前内容" aria-label="复制当前内容">${icon("copy", 16)}</button>` : ""}
    </div>
    ${state.selectedOutput === "record" ? `<div class="output-controls">
      <label><span>现场记录线路</span><select id="output-route" class="field-control" aria-label="选择现场记录线路">
        ${ROUTE_KEYS.map((routeKey) => `<option value="${routeKey}" ${state.selectedRoute === routeKey ? "selected" : ""}>${escapeHtml(ROUTES[routeKey].code)}</option>`).join("")}
      </select></label>
      <span>修改后重新运行会查重，仅新增或完全一致复用。</span>
    </div>` : ""}
    ${isTextOutput
      ? `<textarea id="generated-output" ${state.selectedOutput === "record" ? "" : "readonly"}>${escapeHtml(content)}</textarea>`
      : state.selectedOutput === "submit"
        ? `<div class="tab-body">${renderResult()}${state.rollback ? `<button id="rollback-output" class="rollback-button" ${state.running ? "disabled" : ""}>${icon("undo-2", 16)}回滚本次新增内容</button>` : ""}</div>`
        : `<div class="tab-body">${renderReadback()}</div>`}
  </section>`;
}

function selectedPhotoRecord() {
  return photoBySourceIndex(state.selectedPhoto);
}

function renderPhotoInspector(photo) {
  if (!photo) {
    return `<div class="empty-state inspector-empty">
      ${icon("file-image", 24)}
      <strong>未选择图片</strong>
      <span>在中央缩略图网格中点击一张图片进行核验。</span>
    </div>`;
  }
  return `<div class="photo-inspector">
    <div class="inspector-preview">
      ${photo.url ? `<img src="${escapeHtml(photo.url)}" alt="">` : icon("file-image", 30)}
      ${photo.url ? `<button class="icon-button preview-button" data-preview-photo="${photo.sourceIndex}" title="查看原图" aria-label="查看原图">${icon("eye", 17)}</button>` : ""}
    </div>
    <div class="inspector-title">
      <div><strong title="${escapeHtml(photo.originalName)}">${escapeHtml(photo.originalName)}</strong><span>${photo.routeKey ? escapeHtml(ROUTES[photo.routeKey].label) : "尚未归集线路"}</span></div>
      ${photoStatus(photo)}
    </div>
    <div class="inspector-fields">
      <label>
        <span>${icon("map-pin", 13)}线路与地点</span>
        ${photoPlaceOptions(photo)}
      </label>
      <label>
        <span>${icon("clock-3", 13)}水印时间</span>
        <input class="field-control photo-time-input" data-photo-time="${photo.sourceIndex}" type="time" value="${escapeHtml(photo.time || "")}">
      </label>
      <label>
        <span>${icon("file-text", 13)}规范附件名</span>
        <input class="field-control photo-name-input" data-photo-name="${photo.sourceIndex}" value="${escapeHtml(photo.proposedName || photo.originalName)}" spellcheck="false">
      </label>
    </div>
    <div class="inspector-reason">
      <strong>归集依据</strong>
      <p>${escapeHtml(photo.reason || "等待 OCR 识别。")}</p>
      ${photo.confidence === "topology" ? `<span>${icon("check-circle-2", 14)}拓扑状态已自动确认，无需人工确认</span>` : ""}
    </div>
    ${photo.ocrText
      ? `<details class="ocr-evidence"><summary>${icon("chevron-down", 14)}查看 OCR 文字证据</summary><pre>${escapeHtml(photo.ocrText)}</pre></details>`
      : `<div class="ocr-empty">${icon("scan-line", 15)}尚无 OCR 文字</div>`}
    <button class="danger-button" data-remove-photo="${photo.sourceIndex}">${icon("trash-2", 16)}移除这张图片</button>
  </div>`;
}

function renderFlowInspector() {
  return `<div class="flow-inspector">
    <div class="progress-summary">
      <div><strong>${escapeHtml(state.workflowMessage)}</strong><span>${state.currentFile ? escapeHtml(state.currentFile) : "OCR → 查重 → 新增 → 回读"}</span></div>
      <b>${state.workflowPercent}%</b>
    </div>
    <div class="progress-track" aria-label="自动流程进度"><span style="width:${Math.max(0, Math.min(100, state.workflowPercent))}%"></span></div>
    <ol class="workflow-steps">${renderWorkflow()}</ol>
    <section class="inspector-section">
      <div class="inspector-section-heading"><strong>冲突与错误</strong><span>${state.issues.length ? `${state.issues.length} 项阻断` : "提交门禁通过"}</span></div>
      ${renderIssues()}
    </section>
    <section class="inspector-section">
      <div class="inspector-section-heading"><strong>最近运行</strong><span>当前会话</span></div>
      ${renderActivity()}
    </section>
    ${state.rollback ? `<button id="rollback" class="rollback-button" ${state.running ? "disabled" : ""}>${icon("undo-2", 16)}回滚本次新增内容</button>` : ""}
  </div>`;
}

function renderInspector() {
  const photo = selectedPhotoRecord();
  const mode = !photo && state.inspectorMode === "photo" ? "flow" : state.inspectorMode;
  return `<aside class="inspector-panel">
    <div class="inspector-header">
      <div>
        <h2>${mode === "photo" ? "图片核验" : "自动流程"}</h2>
        <span>${mode === "photo" ? "修正地点、时间和规范命名" : "查看步骤、冲突、回读与回滚"}</span>
      </div>
      <div class="inspector-switch" role="tablist" aria-label="检查器模式">
        <button data-inspector-mode="photo" aria-selected="${mode === "photo"}" title="图片核验" aria-label="图片核验" ${photo ? "" : "disabled"}>${icon("image-plus", 16)}</button>
        <button data-inspector-mode="flow" aria-selected="${mode === "flow"}" title="自动流程" aria-label="自动流程">${icon("list-checks", 16)}</button>
      </div>
    </div>
    <div class="inspector-body">${mode === "photo" ? renderPhotoInspector(photo) : renderFlowInspector()}</div>
  </aside>`;
}

function render() {
  const outputs = generatedOutputs();
  const includedCount = state.photos.filter((photo) => photo.include).length;
  const routeCount = outputs.usable.length;
  const desktop = hasDesktopBridge();

  $("#app").innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <div class="brand">
          <img class="brand-mark" src="/icons/app-icon-512.png" alt="">
          <div><strong>韵家口巡查工作台</strong><span>巡查登记与回读核验</span></div>
        </div>
        <div class="header-status">
          ${desktop && state.credentialUsers.length > 0 ? `
          <div class="login-area">
            <select id="credential-select" class="field-control credential-select" ${state.autoLoggingIn || state.running ? "disabled" : ""} aria-label="选择登录用户">
              ${state.credentialUsers.map((username) =>
                `<option value="${escapeHtml(username)}" ${state.selectedCredentialUser === username ? "selected" : ""}>${escapeHtml(username)}</option>`
              ).join("")}
            </select>
            <button id="auto-login-btn" class="session-state ${statusClass()} auto-login-btn"
                    ${state.autoLoggingIn || state.running ? "disabled" : ""}
                    title="一键自动登录官方系统（自动过滑块）">
              ${state.autoLoggingIn ? icon("loader-circle", 14, "spin") : `<span class="session-dot"></span>`}
              ${state.autoLoggingIn ? "登录中..." : (state.desktopStatus?.authenticated ? escapeHtml(statusLabel()) : "一键登录")}
            </button>
            ${!state.desktopStatus?.authenticated ? `
            <button id="manual-login-btn" class="icon-button" title="手动打开登录窗口" aria-label="手动登录">
              ${icon("external-link", 15)}
            </button>` : ""}
          </div>
          ` : `
          <button id="session-status" class="session-state ${statusClass()}" title="${desktop ? "查看或打开官方系统登录窗口" : "本地自动化服务未连接"}">
            <span class="session-dot"></span>
            ${escapeHtml(statusLabel())}
            ${desktop ? icon("external-link", 14) : ""}
          </button>
          `}
          <span class="security-state">${icon("lock-keyhole", 14)}凭据不保存</span>
          ${state.autoLoginError ? `<span class="auto-login-error" title="${escapeHtml(state.autoLoginError)}">${icon("alert-circle", 14)}</span>` : ""}
        </div>
      </header>

      <section class="action-strip">
        <div class="action-context">
          <span>${icon("calendar-days", 16)}${escapeHtml(toDisplayDate(state.date))}</span>
          <span>${icon("images", 16)}${state.photos.length} 张照片</span>
          <span>${icon("route", 16)}${routeCount} 条线路</span>
          ${state.dirtyAfterSubmit ? `<b>${icon("refresh-cw", 14)}有修改，需重新查重</b>` : ""}
        </div>
        <div class="primary-action-wrap">
          <button id="run-automation" class="primary-action" ${state.running ? "disabled" : ""}>
            ${state.running ? icon("loader-circle", 21, "spin") : icon("scan-line", 21)}
            <span><strong>识别并自动填报</strong><small>${desktop ? "OCR → 查重 → 新增 → 回读" : "浏览器可识别预览，自动提交需桌面服务"}</small></span>
            ${icon("arrow-right", 19)}
          </button>
          ${state.running ? `<button id="stop-automation" class="stop-button">${icon("x", 16)}停止</button>` : ""}
        </div>
      </section>

      ${!desktop ? `<div class="desktop-notice">
        ${icon("alert-circle", 17)}
        <span><strong>当前为识别预览模式。</strong> OCR、归集和内容生成可用；官方查重、新增、回读与回滚需桌面自动化服务。</span>
      </div>` : ""}

      <main class="workbench">
        <aside class="task-sidebar">
          <section class="sidebar-section day-section">
            <div class="panel-heading"><div><h2>今日任务</h2><span>日期、天气与路况</span></div>${icon("calendar-days", 18)}</div>
            <label class="field-label">
              <span>工作日期</span>
              <input id="date" class="field-control" type="date" value="${escapeHtml(state.date)}">
            </label>
            <div class="day-field-grid">
              <label class="field-label">
                <span>天气</span>
                <select id="weather" class="field-control">
                  <option value="">待 OCR</option>
                  ${WEATHER_OPTIONS.map((weather) => `<option value="${weather}" ${state.weather === weather ? "selected" : ""}>${weather}</option>`).join("")}
                </select>
              </label>
              <label class="field-label">
                <span>路况</span>
                <select id="condition" class="field-control">
                  <option value="畅通" ${state.confirmedCondition === "畅通" ? "selected" : ""}>畅通</option>
                  <option value="待确认" ${state.confirmedCondition === "待确认" ? "selected" : ""}>待确认</option>
                </select>
              </label>
            </div>
            <div class="source-actions">
              <button id="load-folder" class="secondary-button" ${state.loadingFolder || state.running ? "disabled" : ""}>${icon("folder-open", 16)}读取 ${escapeHtml(state.date.slice(2).replaceAll("-", ""))}</button>
              <label class="secondary-button file-button">${icon("folder-open", 16)}选择目录<input id="folder-files" type="file" accept="image/jpeg,image/png" multiple webkitdirectory></label>
            </div>
          </section>

          <section class="sidebar-section route-section">
            <div class="panel-heading"><div><h2>三线路任务</h2><span>可同时巡查并分别登记</span></div>${icon("route", 18)}</div>
            <div class="route-list">${renderRoutes(outputs.drafts)}</div>
          </section>
        </aside>

        <div class="center-workspace">
          <section class="photo-workspace">
            <div class="workspace-heading">
              <div><h1>照片工作区</h1><span>${state.photos.length} 张已载入 · ${includedCount} 张进入记录 · ${routeCount} 条线路</span></div>
              <div class="section-actions">
                <label class="secondary-button file-button">${icon("image-plus", 16)}添加图片<input id="image-files" type="file" accept="image/jpeg,image/png" multiple></label>
                <button id="rescan" class="icon-button" title="重新识别全部图片" aria-label="重新识别全部图片" ${state.photos.length && !state.running ? "" : "disabled"}>${icon("refresh-cw", 17)}</button>
              </div>
            </div>
            <label id="drop-zone" class="drop-zone ${state.photos.length ? "compact" : ""}" for="image-files">
              ${icon("image-plus", 21)}
              <span><strong>拖入当天全部巡查照片</strong><small>混合线路与并行车辆会按 OCR、时间和拓扑分别归集</small></span>
            </label>
            ${renderPhotos()}
          </section>
          ${renderOutput(outputs)}
        </div>

        ${renderInspector()}
      </main>
      ${state.toast ? `<div class="toast">${icon("check", 16)}${escapeHtml(state.toast)}</div>` : ""}
      <div id="photo-dialog-root"></div>
    </div>`;

  createIcons({ icons: ICONS });
  bind();
}

function photoBySourceIndex(sourceIndex) {
  return state.photos.find((photo) => photo.sourceIndex === sourceIndex)
    || state.photos[Number(sourceIndex)];
}

function applyManualPlace(photo, value) {
  if (value === "__exclude") {
    Object.assign(photo, {
      routeKey: "",
      place: "通行或非管辖路段",
      sequence: null,
      confidence: "excluded",
      include: false,
      nameBase: photo.originalName.replace(/\.[^.]+$/, ""),
      standardName: photo.originalName,
      proposedName: photo.originalName,
      reason: "已人工排除，不进入任何记录。",
      manualOverride: true,
      manualAssignment: true
    });
    return;
  }
  if (!value) {
    Object.assign(photo, {
      routeKey: "",
      place: "待确认地点",
      sequence: null,
      confidence: "review",
      include: false,
      nameBase: photo.originalName.replace(/\.[^.]+$/, ""),
      standardName: photo.originalName,
      proposedName: photo.originalName,
      reason: "等待人工选择地点。",
      manualOverride: true,
      manualAssignment: true
    });
    return;
  }
  const delimiter = value.indexOf("|");
  const routeKey = value.slice(0, delimiter);
  const place = value.slice(delimiter + 1);
  Object.assign(photo, {
    ...placeAssignment(routeKey, place),
    confidence: "manual",
    include: true,
    reason: "地点已人工修正。",
    shared: false,
    manualOverride: true,
    manualAssignment: true
  });
}

function openPhotoDialog(photo) {
  if (!photo?.url) return;
  const root = $("#photo-dialog-root");
  root.innerHTML = `<div class="photo-dialog" role="dialog" aria-modal="true" aria-label="查看巡查图片">
    <button class="dialog-close" title="关闭" aria-label="关闭">${icon("x", 20)}</button>
    <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.originalName)}">
    <div><strong>${escapeHtml(photo.originalName)}</strong><span>${escapeHtml(photo.time || "时间未识别")} · ${escapeHtml(photo.place || "地点未识别")}</span></div>
  </div>`;
  createIcons({ icons: ICONS });
  root.querySelector(".dialog-close").addEventListener("click", () => { root.innerHTML = ""; });
  root.querySelector(".photo-dialog").addEventListener("click", (event) => {
    if (event.target.classList.contains("photo-dialog")) root.innerHTML = "";
  });
}

async function copyText(value, label) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(`${label}已复制`);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    showToast(`${label}已复制`);
  }
}

function bind() {
  $("#date")?.addEventListener("change", async (event) => {
    if (!event.target.value || event.target.value === state.date) return;
    state.runNonce += 1;
    state.date = event.target.value;
    releasePhotoUrls(state.photos);
    resetAutomaticRouteTimes();
    state.photos = [];
    state.selectedPhoto = null;
    state.inspectorMode = "flow";
    state.narrativeOverrides = {};
    state.existingDay = null;
    state.submitResult = null;
    state.readbackResult = null;
    state.rollback = null;
    state.dirtyAfterSubmit = false;
    state.postSubmitVerified = false;
    resetWorkflow();
    render();
    await loadDailyFolder();
  });

  $("#weather")?.addEventListener("change", (event) => {
    state.weather = event.target.value;
    markDirty();
    render();
  });
  $("#condition")?.addEventListener("change", (event) => {
    state.confirmedCondition = event.target.value;
    state.narrativeOverrides = {};
    markDirty();
    render();
  });

  $("#run-automation")?.addEventListener("click", () => runAutomation());
  $("#stop-automation")?.addEventListener("click", stopAutomation);
  $("#rescan")?.addEventListener("click", () => runAutomation({ previewOnly: true }));
  $("#load-folder")?.addEventListener("click", () => loadDailyFolder());
  $("#rollback")?.addEventListener("click", rollbackSubmission);
  $("#rollback-output")?.addEventListener("click", rollbackSubmission);
  $("#mark-verified")?.addEventListener("click", () => {
    state.postSubmitVerified = !state.postSubmitVerified;
    addActivity(state.postSubmitVerified ? "已标记完成人工核验" : "已取消人工核验标记");
    render();
  });
  $("#session-status")?.addEventListener("click", async () => {
    if (hasDesktopBridge()) {
      try {
        state.desktopStatus = await callDesktop("openLogin");
      } catch (error) {
        state.issues = [issueFromError(error), ...state.issues];
      }
      render();
    } else {
      window.open(OFFICIAL_URL, "_blank", "noopener,noreferrer");
    }
  });

  // 自动登录：用户选择下拉
  $("#credential-select")?.addEventListener("change", (event) => {
    state.selectedCredentialUser = event.target.value;
    render();
  });

  // 自动登录：一键登录按钮
  $("#auto-login-btn")?.addEventListener("click", autoLogin);

  // 手动登录兜底按钮
  $("#manual-login-btn")?.addEventListener("click", async () => {
    try {
      state.desktopStatus = await callDesktop("openLogin");
    } catch (error) {
      state.issues = [issueFromError(error), ...state.issues];
    }
    render();
  });

  $("#folder-files")?.addEventListener("change", (event) => useFiles(event.target.files));
  $("#image-files")?.addEventListener("change", (event) => useFiles(event.target.files));
  const dropZone = $("#drop-zone");
  dropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
  dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
  dropZone?.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
    useFiles(event.dataTransfer.files);
  });

  document.querySelectorAll("[data-select-photo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      state.selectedPhoto = Number(event.currentTarget.dataset.selectPhoto);
      state.inspectorMode = "photo";
      render();
    });
  });
  document.querySelectorAll("[data-inspector-mode]").forEach((button) => {
    button.addEventListener("click", (event) => {
      state.inspectorMode = event.currentTarget.dataset.inspectorMode;
      render();
    });
  });

  document.querySelectorAll("[data-route-field]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const routeKey = event.target.dataset.route;
      const field = event.target.dataset.routeField;
      state.routeProfiles[routeKey][field] = event.target.value.trim();
      if (field === "startTime" || field === "endTime") {
        state.routeProfiles[routeKey].timeManual = true;
      }
      delete state.narrativeOverrides[routeKey];
      markDirty();
      render();
    });
  });
  document.querySelectorAll("[data-route-officer]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const routeKey = event.target.dataset.routeOfficer;
      state.routeProfiles[routeKey].officers = [...document.querySelectorAll(`[data-route-officer="${routeKey}"]:checked`)]
        .map((checkbox) => checkbox.value);
      delete state.narrativeOverrides[routeKey];
      markDirty();
      render();
    });
  });

  document.querySelectorAll("[data-photo-place]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const photo = photoBySourceIndex(Number(event.target.dataset.photoPlace));
      if (!photo) return;
      const previousRoute = photo.routeKey;
      applyManualPlace(photo, event.target.value);
      state.photos = normalizedPhotos(state.photos);
      synchronizeRouteTimes();
      delete state.narrativeOverrides[previousRoute];
      delete state.narrativeOverrides[photo.routeKey];
      markDirty();
      state.issues = collectIssues();
      render();
    });
  });
  document.querySelectorAll("[data-photo-time]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const photo = photoBySourceIndex(Number(event.target.dataset.photoTime));
      if (!photo) return;
      photo.time = event.target.value;
      photo.timeEstimated = false;
      photo.manualTime = true;
      synchronizeRouteTimes();
      delete state.narrativeOverrides[photo.routeKey];
      markDirty();
      state.issues = collectIssues();
      render();
    });
  });
  document.querySelectorAll("[data-photo-name]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const photo = photoBySourceIndex(Number(event.target.dataset.photoName));
      if (!photo) return;
      const proposedName = event.target.value.trim() || photo.originalName;
      photo.proposedName = proposedName;
      photo.standardName = proposedName;
      photo.nameBase = proposedName.replace(/\.[^.]+$/, "");
      photo.manualOverride = true;
      photo.manualName = true;
      delete state.narrativeOverrides[photo.routeKey];
      state.photos = normalizedPhotos(state.photos);
      markDirty();
      state.issues = collectIssues();
      render();
    });
  });
  document.querySelectorAll("[data-remove-photo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const sourceIndex = Number(event.currentTarget.dataset.removePhoto);
      const photo = photoBySourceIndex(sourceIndex);
      if (photo?.objectUrl && photo.url) URL.revokeObjectURL(photo.url);
      state.photos = state.photos.filter((item) => item !== photo);
      state.photos = normalizedPhotos(resolvePhotoAssignments(state.photos));
      synchronizeRouteTimes();
      if (state.selectedPhoto === sourceIndex) {
        state.selectedPhoto = state.photos[0]?.sourceIndex ?? null;
        if (state.selectedPhoto === null) state.inspectorMode = "flow";
      }
      state.narrativeOverrides = {};
      markDirty();
      state.issues = collectIssues();
      render();
    });
  });
  document.querySelectorAll("[data-preview-photo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      openPhotoDialog(photoBySourceIndex(Number(event.currentTarget.dataset.previewPhoto)));
    });
  });

  document.querySelectorAll("[data-output-tab]").forEach((button) => {
    button.addEventListener("click", (event) => {
      state.selectedOutput = event.currentTarget.dataset.outputTab;
      render();
    });
  });
  $("#output-route")?.addEventListener("change", (event) => {
    state.selectedRoute = event.target.value;
    render();
  });
  $("#generated-output")?.addEventListener("input", (event) => {
    if (state.selectedOutput !== "record") return;
    state.narrativeOverrides[state.selectedRoute] = event.target.value;
    markDirty("", false);
  });
  document.querySelectorAll("[data-copy-output]").forEach((button) => {
    button.addEventListener("click", () => {
      const outputs = generatedOutputs();
      const selectedDraft = outputs.drafts.find((draft) => routeKeyForDraft(draft) === state.selectedRoute)
        || outputs.drafts[0];
      const text = state.selectedOutput === "journal"
        ? outputs.journal.content
        : state.selectedOutput === "bulletin"
          ? outputs.bulletin
          : selectedDraft.narrative;
      copyText(text, state.selectedOutput === "journal" ? "日志" : state.selectedOutput === "bulletin" ? "日报" : "现场记录");
    });
  });
}

render();
synchronizeBusinessDate();
refreshDesktopStatus();
loadCredentialUsers();
