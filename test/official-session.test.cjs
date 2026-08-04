const test = require("node:test");
const assert = require("node:assert/strict");

const {
  API,
  OFFICIAL_PARTITION,
  OfficialSession,
  equalSets,
  journalCollision,
  mergeOrderedAttachments,
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
        ],
        attachmentOrder: [
          "高速入口.jpg",
          "01-西过境-S1113连接线.jpg",
          "大酉山隧道.jpg"
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
  assert.deepEqual(plan.records[0].attachmentOrder, [
    "高速入口.jpg",
    "01-西过境-S1113连接线.jpg",
    "大酉山隧道.jpg"
  ]);
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
      ...first,
      patrolRoute: "G6",
      lawEnforcementOfficials: "张彩琪;李彩燕",
      lawEnforcementOfficialsIds: "person-zhang;person-li"
    }),
    false
  );
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
      plateNumbers: first.plateNumbers
    }),
    false
  );
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
  assert.equal(
    recordEquivalent(
      { ...existing, endMeter: 0 },
      { ...payload, endMeter: "000" }
    ),
    true
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

test("interleaves retained and uploaded attachments in patrol order", () => {
  const existing = [
    { storageId: "entry", name: "高速入口.jpg" },
    { storageId: "tunnel", name: "大酉山隧道.jpg" },
    { storageId: "toll", name: "西宁西收费站.jpg" }
  ];
  const uploaded = [{ storageId: "direction", name: "西宁西方向.jpg" }];
  assert.deepEqual(
    mergeOrderedAttachments(existing, uploaded, [
      "高速入口.jpg",
      "西宁西方向.jpg",
      "大酉山隧道.jpg",
      "西宁西收费站.jpg"
    ]).map((entry) => entry.storageId),
    ["entry", "direction", "tunnel", "toll"]
  );
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

test("openLogin fills selected credentials and stops for the manual challenge", async () => {
  class UnusedWindow {}
  const official = new OfficialSession({
    BrowserWindow: UnusedWindow,
    logger: { log() {}, error() {} }
  });
  const fakeWindow = {
    showCalls: 0,
    focusCalls: 0,
    show() { this.showCalls += 1; },
    focus() { this.focusCalls += 1; },
    isDestroyed() { return false; },
    webContents: {
      getURL: () => "http://110.167.233.70:8084/#/login"
    }
  };
  official.ensureWindow = async () => {
    official.window = fakeWindow;
    return fakeWindow;
  };
  official._waitForPageReady = async () => {};
  official._fillLoginForm = async (username, password) => {
    assert.equal(username, "李彩燕");
    assert.equal(password, "secret");
    return true;
  };
  let clicks = 0;
  official._clickLoginButton = async () => {
    clicks += 1;
    return true;
  };
  official.status = async () => ({
    ok: true,
    authenticated: false,
    serviceReady: false,
    loginRequired: true
  });

  const result = await official.openLogin({
    username: "李彩燕",
    password: "secret"
  });
  assert.equal(clicks, 1);
  assert.equal(fakeWindow.showCalls, 1);
  assert.equal(fakeWindow.focusCalls, 1);
  assert.equal(result.credentialsFilled, true);
  assert.equal(result.awaitingChallenge, true);
  assert.equal("password" in result, false);
});

test("submits login after CAPTCHA and returns only API-verified authentication", async () => {
  class UnusedWindow {}
  let now = 1000;
  const official = new OfficialSession({
    BrowserWindow: UnusedWindow,
    now: () => now,
    logger: { log() {}, error() {} }
  });
  let clicks = 0;
  official._clickLoginButton = async () => {
    clicks += 1;
    return true;
  };
  official.status = async () => ({
    ok: true,
    authenticated: true,
    serviceReady: true,
    loginRequired: false
  });
  const state = {
    captchaSolvedAt: null,
    submittedAfterCaptcha: false
  };

  assert.equal(
    await official._advanceLoginAfterCaptcha(
      { captchaSolved: true, token: false },
      state
    ),
    null
  );
  assert.equal(clicks, 0);

  now = 1800;
  assert.equal(
    await official._advanceLoginAfterCaptcha(
      { captchaSolved: true, token: false },
      state
    ),
    null
  );
  assert.equal(clicks, 1);

  const result = await official._advanceLoginAfterCaptcha(
    { captchaSolved: true, token: true },
    state
  );
  assert.equal(clicks, 1);
  assert.equal(result.authenticated, true);
  assert.equal(result.serviceReady, true);
});

test("status reports the verified account selected for the authenticated session", async () => {
  class UnusedWindow {}
  const official = new OfficialSession({
    BrowserWindow: UnusedWindow,
    logger: { log() {}, error() {} }
  });
  official.window = {
    isDestroyed: () => false,
    webContents: {
      getURL: () => "http://110.167.233.70:8084/#/dutyRecord",
      executeJavaScript: async () => true
    }
  };
  official.pendingUsername = "李彩燕";
  official._executePage = async () => ({
    authenticated: true,
    serviceReady: true
  });

  const first = await official.status({ createWindow: false });
  const second = await official.status({ createWindow: false });
  assert.equal(first.username, "李彩燕");
  assert.equal(second.username, "李彩燕");
  assert.equal(official.pendingUsername, "");
});

test("status restores the authenticated username persisted in the official partition", async () => {
  class UnusedWindow {}
  const official = new OfficialSession({
    BrowserWindow: UnusedWindow,
    logger: { log() {}, error() {} }
  });
  official.window = {
    isDestroyed: () => false,
    webContents: {
      getURL: () => "http://110.167.233.70:8084/#/dutyRecord"
    }
  };
  official._executePage = async () => ({
    authenticated: true,
    serviceReady: true,
    username: "宁戎"
  });

  const result = await official.status({ createWindow: false });
  assert.equal(result.username, "宁戎");
  assert.equal(official.authenticatedUsername, "宁戎");
});

test("autoLogin switches an authenticated session when another account is selected", async () => {
  class StopAfterLogout {
    constructor() {
      throw Object.assign(new Error("stop after verified logout"), { code: "TEST_STOP" });
    }
  }
  const official = new OfficialSession({
    BrowserWindow: StopAfterLogout,
    logger: { log() {}, error() {} }
  });
  official.status = async () => ({
    ok: true,
    authenticated: true,
    serviceReady: true,
    loginRequired: false,
    username: "宁戎"
  });
  let logoutCalls = 0;
  official.logout = async () => {
    logoutCalls += 1;
    return { ok: true, authenticated: false, serviceReady: false };
  };

  await assert.rejects(
    official.autoLogin("李彩燕", "secret"),
    (error) => error.code === "TEST_STOP"
  );
  assert.equal(logoutCalls, 1);
  assert.equal(official.pendingUsername, "李彩燕");
});

test("logout revokes the official session, clears token cookies and verifies signed-out state", async () => {
  class UnusedWindow {}
  const removedCookies = [];
  let navigatedTo = "";
  const official = new OfficialSession({
    BrowserWindow: UnusedWindow,
    logger: { log() {}, warn() {}, error() {} }
  });
  official.window = {
    isDestroyed: () => false,
    loadURL: async (url) => {
      navigatedTo = url;
    },
    webContents: {
      getURL: () => "http://110.167.233.70:8084/#/dutyRecord",
      executeJavaScript: async () => true,
      session: {
        cookies: {
          get: async () => [
            { name: "TokenKey" },
            { name: "TokenKey_expired" },
            { name: "unrelated" }
          ],
          remove: async (_url, name) => {
            removedCookies.push(name);
          }
        }
      }
    }
  };
  let statusCalls = 0;
  official.status = async () => {
    statusCalls += 1;
    return statusCalls === 1
      ? {
        ok: true,
        authenticated: true,
        serviceReady: true,
        loginRequired: false
      }
      : {
        ok: true,
        windowOpen: true,
        loaded: true,
        authenticated: false,
        serviceReady: true,
        loginRequired: true
      };
  };
  official._request = async (config) => {
    assert.equal(config.url, API.logout);
    assert.equal(config.method, "get");
    return { code: 200 };
  };
  official._waitForPageReady = async () => {};
  official.authenticatedUsername = "李彩燕";

  const result = await official.logout();
  assert.equal(result.authenticated, false);
  assert.equal(result.loginRequired, true);
  assert.equal(result.remoteLogoutAccepted, true);
  assert.equal(navigatedTo, "http://110.167.233.70:8084/#/login");
  assert.deepEqual(removedCookies, ["TokenKey", "TokenKey_expired"]);
  assert.equal(official.authenticatedUsername, "");
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
    if (url.includes("getCheRecordLog")) {
      return { code: 200, data: [] };
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
  assert.deepEqual(result.journals[0].recordIds, []);
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
