const test = require("node:test");
const assert = require("node:assert/strict");

const {
  OFFICIAL_PARTITION,
  OfficialSession,
  equalSets,
  journalCollision,
  normalizeSubmitPlan,
  journalEquivalent,
  recordEquivalent,
  sanitizeForRenderer,
  scheduleCollision,
  scheduleEquivalent
} = require("../electron/official-session.cjs");

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

function validPlan() {
  return {
    date: "2026-07-26",
    schedules: [
      {
        clientRef: "schedule-west",
        payload: {
          cateId: "1002000100000000",
          cateName: "公路路政",
          patrolType: "路巡",
          startTime: "2026-07-26 08:30:00",
          endTime: "2026-07-26 12:00:00",
          isUseCar: "1",
          plateNumbers: "青A33W69",
          lawEnforcementOfficials: "宁戎;杨富强",
          lawEnforcementOfficialsIds: "person-ning;person-yang",
          schedulePersonnel: "李彩燕",
          schedulePersonnelId: "person-li",
          patrolRoute: "G6京藏高速公路西过境段",
          times: 1,
          content: "公路路面、公路附属设施、公路用地及建筑控制区监管",
          oid: "organ-1",
          approve: null
        }
      }
    ],
    records: [
      {
        clientRef: "record-west",
        scheduleRef: "schedule-west",
        payload: {
          oid: "organ-1",
          checkStartTime: "2026-07-26 08:57:00",
          checkEndTime: "2026-07-26 11:41:00",
          checkCategory: "category-1",
          checkType: "公路路面、公路附属设施、公路用地及建筑控制区监管",
          cateId: "1002000100000000",
          cateName: "公路路政",
          roadCondition: "1",
          roadNum: "G6",
          roadName: "京藏高速公路西过境段",
          describes: "巡查西过境段，沿线道路及附属设施正常。",
          personIds: "person-ning,person-yang,",
          personName: "宁戎,杨富强,",
          certificateId: "",
          listPer: [
            { personId: "person-ning", personName: "宁戎", createId: "person-li" },
            { personId: "person-yang", personName: "杨富强", createId: "person-li" }
          ],
          listAtt: [],
          listAbn: [],
          listCaseDocs: []
        },
        attachments: [
          {
            name: "01-西过境-S1113连接线.jpg",
            mimeType: "image/jpeg",
            dataBase64: JPEG_BYTES.toString("base64")
          }
        ]
      }
    ],
    journals: [
      {
        clientRef: "journal-west",
        scheduleRef: "schedule-west",
        recordRefs: ["record-west"],
        payload: {
          title: "2026年7月26日巡查日志",
          patrolType: "路巡",
          startCheckTime: "2026-07-26 08:57:00",
          endCheckTime: "2026-07-26 11:41:00",
          weather: "1",
          isUseCar: "1",
          plateNumbers: "青A33W69",
          lawEnforcementOfficials: "宁戎,杨富强",
          lawEnforcementOfficialsIds: "person-ning,person-yang",
          patrolRoute: "G6京藏高速公路西过境段",
          schedulePersonnel: "李彩燕",
          schedulePersonnelId: "person-li",
          inspectionLength: "35.5",
          roadCondition: "无异常情况",
          roadProductCondition: "无异常情况",
          buildControlCondition: "无异常情况",
          checkProblem: "",
          disposed: "",
          stayDisposed: "",
          other: "1. 巡查西过境段，沿线道路及附属设施正常。",
          saveStatus: "2"
        }
      }
    ]
  };
}

test("normalizes a complete plan as dry-run by default", () => {
  const plan = normalizeSubmitPlan(validPlan());
  assert.equal(plan.dryRun, true);
  assert.equal(plan.confirmToken, "");
  assert.equal(plan.schedules[0].mode, "upsert");
  assert.equal(plan.records[0].attachments[0].mimeType, "image/jpeg");
});

test("requires a one-time confirm token for live writes", () => {
  const plan = validPlan();
  plan.dryRun = false;
  assert.throws(
    () => normalizeSubmitPlan(plan),
    (error) => error.code === "CONFIRMATION_REQUIRED"
  );
});

test("rejects unknown fields and cross-day payload times", () => {
  const unknown = validPlan();
  unknown.password = "must-not-pass";
  assert.throws(
    () => normalizeSubmitPlan(unknown),
    (error) => error.code === "INVALID_SCHEMA"
  );

  const wrongDate = validPlan();
  wrongDate.records[0].payload.checkEndTime = "2026-07-27 11:41:00";
  assert.throws(
    () => normalizeSubmitPlan(wrongDate),
    (error) => error.code === "INVALID_SCHEMA"
  );
});

test("removes credentials recursively and redacts credential-like text", () => {
  const sanitized = sanitizeForRenderer({
    ok: true,
    TokenKey: "secret-token",
    nested: {
      password: "secret-password",
      storageId: "attachment-id",
      message: "{\"TokenKey\":\"quoted-secret\",\"Authorization\":\"Bearer abc.def.ghi\"}"
    }
  });
  assert.equal("TokenKey" in sanitized, false);
  assert.equal("password" in sanitized.nested, false);
  assert.equal(sanitized.nested.storageId, "attachment-id");
  assert.match(sanitized.nested.message, /\[REDACTED\]/);
  assert.doesNotMatch(
    JSON.stringify(sanitized),
    /secret-token|secret-password|quoted-secret|abc\.def\.ghi/
  );
});

test("normalizes comma and semicolon personnel sets without losing concurrency", () => {
  assert.equal(equalSets("person-a;person-b", "person-b,person-a,"), true);
  const first = validPlan().schedules[0].payload;
  const concurrent = {
    ...first,
    plateNumbers: "青A99R18",
    lawEnforcementOfficials: "张彩琪;李彩燕;宁戎",
    lawEnforcementOfficialsIds: "person-zhang;person-li;person-ning",
    patrolRoute: "G6京藏高速公路东段"
  };
  assert.equal(scheduleEquivalent(first, concurrent), false);
  assert.equal(scheduleCollision(first, concurrent), false);
  assert.equal(
    scheduleCollision(first, {
      ...concurrent,
      patrolRoute: first.patrolRoute
    }),
    true
  );
});

test("allows parallel journals on different routes and vehicles", () => {
  const first = validPlan().journals[0].payload;
  const parallel = {
    ...first,
    plateNumbers: "青A99R18",
    lawEnforcementOfficials: "张彩琪,李彩燕,宁戎",
    lawEnforcementOfficialsIds: "person-zhang,person-li,person-ning",
    patrolRoute: "G6"
  };
  assert.equal(journalCollision(first, parallel), false);
  assert.equal(
    journalCollision(first, {
      ...parallel,
      patrolRoute: first.patrolRoute
    }),
    true
  );
});

test("matches records across delimiter differences but not different route descriptions", () => {
  const payload = validPlan().records[0].payload;
  const existing = {
    ...payload,
    personIds: "person-yang;person-ning",
    roadNum: ["G6"],
    roadName: ["京藏高速公路西过境段"]
  };
  assert.equal(recordEquivalent(existing, payload), true);
  assert.equal(
    recordEquivalent({ ...existing, describes: "另一条线路" }, payload),
    false
  );
});

test("matches record detail personnel from listPer when personIds is blank", () => {
  const payload = validPlan().records[0].payload;
  const detail = {
    ...payload,
    personIds: "",
    personName: "",
    personNames: "",
    listPer: payload.listPer.map(({ personId, personName }) => ({
      personId,
      personName
    }))
  };
  assert.equal(recordEquivalent(detail, payload), true);
});

test("journal equivalence verifies narrative, weather and condition fields", () => {
  const payload = validPlan().journals[0].payload;
  const existing = {
    ...payload,
    scheduleId: "schedule-existing"
  };
  assert.equal(journalEquivalent(existing, payload), true);
  assert.equal(
    journalEquivalent({ ...existing, other: "错误正文" }, payload),
    false
  );
  assert.equal(
    journalEquivalent({ ...existing, weather: "2" }, payload),
    false
  );
});

test("creates the official window with the persistent isolated partition", async () => {
  let options;
  class FakeBrowserWindow {
    constructor(input) {
      options = input;
      this.destroyed = false;
      this.handlers = new Map();
      this.webContents = {
        session: {
          setPermissionRequestHandler() {},
          setPermissionCheckHandler() {}
        },
        setWindowOpenHandler() {},
        on() {},
        getURL: () => "http://110.167.233.70:8084/#/dutyRecord",
        loadURL: async () => {}
      };
    }
    isDestroyed() { return this.destroyed; }
    loadURL() { return Promise.resolve(); }
    on(name, handler) { this.handlers.set(name, handler); }
    show() {}
    focus() {}
  }

  const official = new OfficialSession({
    BrowserWindow: FakeBrowserWindow,
    logger: { log() {}, error() {} }
  });
  await official.ensureWindow();
  assert.equal(options.webPreferences.partition, OFFICIAL_PARTITION);
  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(options.webPreferences.nodeIntegration, false);
  assert.equal(options.show, false);
});

test("dry-run performs preflight without invoking any write request", async () => {
  class UnusedWindow {}
  const official = new OfficialSession({
    BrowserWindow: UnusedWindow,
    logger: { log() {}, error() {} },
    stat: async () => ({ isFile: () => true, size: 9 }),
    readFile: async () => JPEG_BYTES
  });
  let writes = 0;
  official._assertAuthenticated = async () => {};
  official._queryDayValidated = async () => ({
    schedules: [],
    records: [],
    journals: []
  });
  official._buildPreflight = async (plan) => ({
    ready: true,
    conflicts: [],
    operations: {
      schedules: plan.schedules.map((item) => ({ item, action: "create" })),
      records: plan.records.map((item) => ({ item, action: "create" })),
      journals: plan.journals.map((item) => ({ item, action: "create" }))
    },
    publicOperations: {
      schedules: [{ clientRef: "schedule-west", action: "create", existing: null }],
      records: [{ clientRef: "record-west", action: "create", existing: null }],
      journals: [{ clientRef: "journal-west", action: "create", existing: null }]
    }
  });
  official._request = async () => {
    writes += 1;
    throw new Error("dry-run must not write");
  };

  const result = await official.submitPlan(validPlan());
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.ready, true);
  assert.equal(typeof result.confirmation.confirmToken, "string");
  assert.equal(writes, 0);
});

test("finds a backfilled journal by patrol date rather than creation date", async () => {
  class UnusedWindow {}
  const official = new OfficialSession({
    BrowserWindow: UnusedWindow,
    logger: { log() {}, error() {} }
  });
  official._request = async ({ url }) => {
    if (url.includes("cheSchedulePageList")) {
      return { code: 200, data: { records: [] } };
    }
    if (url.includes("cheRecordPageList")) {
      return { code: 200, data: { records: [] } };
    }
    return {
      code: 200,
      data: {
        records: [
          {
            checklogId: "backfilled-log",
            startCheckTime: "2026-07-26 08:57:00",
            createTime: "2026-07-27 09:00:00"
          },
          {
            checklogId: "other-day-log",
            startCheckTime: "2026-07-25 08:57:00",
            createTime: "2026-07-27 09:01:00"
          }
        ]
      }
    };
  };

  const result = await official._queryDayValidated({ date: "2026-07-26" });
  assert.deepEqual(result.journals.map((entry) => entry.checklogId), ["backfilled-log"]);
});

test("reads the official law-officer list without exposing phone data", async () => {
  class UnusedWindow {}
  const official = new OfficialSession({
    BrowserWindow: UnusedWindow,
    logger: { log() {}, error() {} }
  });
  official._assertAuthenticated = async () => {};
  official._request = async ({ url, method, params }) => {
    assert.equal(url, "/case/caseTemplate/lawOfficer/listLawOfficer");
    assert.equal(method, "get");
    assert.deepEqual(params, {
      organId: "009ee4f252643b7ea9a50e4ed47f0d23",
      isSubOrgan: 0
    });
    return {
      code: 200,
      data: [
        {
          lawOfficerName: "段小燕",
          userId: "person-duan",
          mobile: "must-not-be-exposed"
        }
      ]
    };
  };

  const result = await official.listPersonnel({
    oid: "009ee4f252643b7ea9a50e4ed47f0d23"
  });
  assert.deepEqual(result, {
    ok: true,
    personnel: [
      { name: "段小燕", personId: "person-duan" }
    ]
  });
});
