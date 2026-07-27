import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  OFFICIAL_ORIGIN,
  OFFICIAL_RECORD_URL,
  OfficialSession,
  safeError,
  sanitizeForRenderer
} = require("../electron/official-session.cjs");

const DEFAULT_CDP_ENDPOINT = "http://127.0.0.1:9333";
const OFFICIAL_PAGE_PREFIX = `${OFFICIAL_ORIGIN}/`;

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 3000 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Chrome CDP返回HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("Chrome CDP返回了无效JSON"));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("连接Chrome CDP超时")));
    request.on("error", reject);
  });
}

function putJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method: "PUT",
      timeout: 3000
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Chrome CDP返回HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("Chrome CDP返回了无效JSON"));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("连接Chrome CDP超时")));
    request.on("error", reject);
    request.end();
  });
}

export class CdpConnection {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 0;
    this.pending = new Map();
  }

  async open() {
    if (typeof WebSocket !== "function") {
      throw new Error("当前Node运行时不支持WebSocket");
    }
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("连接Chrome页面超时")), 5000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("无法连接Chrome页面"));
      }, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || "Chrome CDP调用失败"));
      } else {
        pending.resolve(message);
      }
    });
    this.socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error("Chrome页面连接已关闭"));
      }
      this.pending.clear();
    });
  }

  call(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Chrome页面连接不可用"));
    }
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (response.result?.exceptionDetails) {
      const details = response.result.exceptionDetails;
      throw new Error(
        details.exception?.description
        || details.text
        || "Chrome页面执行失败"
      );
    }
    return response.result?.result?.value;
  }

  async bringToFront() {
    await this.call("Page.bringToFront");
  }

  close() {
    this.socket?.close();
    this.socket = null;
  }
}

export function browserWindowAdapter(connection, pageUrl) {
  return class CdpBrowserWindow {
    constructor() {
      this.destroyed = false;
      this.handlers = new Map();
      this.webContents = {
        session: {
          setPermissionRequestHandler() {},
          setPermissionCheckHandler() {}
        },
        setWindowOpenHandler() {},
        on() {},
        getURL: () => pageUrl,
        loadURL: async () => {},
        executeJavaScript: (expression) => connection.evaluate(expression)
      };
    }

    isDestroyed() {
      return this.destroyed;
    }

    async loadURL() {}

    on(name, handler) {
      this.handlers.set(name, handler);
    }

    show() {}

    focus() {
      connection.bringToFront().catch(() => {});
    }

    destroy() {
      this.destroyed = true;
      this.handlers.get("closed")?.();
    }
  };
}

export function rankOfficialPage(probe) {
  return [
    probe.authenticated ? 1 : 0,
    probe.serviceReady ? 1 : 0,
    probe.cached ? 1 : 0,
    probe.hasSession ? 1 : 0,
    probe.routerReady ? 1 : 0,
    probe.readyState === "complete" ? 1 : 0
  ];
}

function compareRank(left, right) {
  const leftRank = rankOfficialPage(left);
  const rightRank = rankOfficialPage(right);
  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] !== rightRank[index]) return rightRank[index] - leftRank[index];
  }
  return 0;
}

async function probeOfficialTarget(page, logger) {
  const connection = new CdpConnection(page.webSocketDebuggerUrl);
  await connection.open();
  const probe = await connection.evaluate(`(() => {
    const cacheKey = Symbol.for("qh.patrol.official.webpack.require");
    let hasSession = false;
    try {
      hasSession = [window.localStorage, window.sessionStorage].some((store) => {
        for (let index = 0; index < store.length; index += 1) {
          const key = store.key(index);
          if (/^TokenKey$/i.test(String(key)) && Boolean(store.getItem(key))) return true;
        }
        return false;
      });
    } catch {}
    return {
      href: location.href,
      readyState: document.readyState,
      cached: typeof window[cacheKey] === "function",
      hasSession,
      routerReady: Boolean(document.querySelector("#app")?.__vue__?.$router)
    };
  })()`);
  const official = new OfficialSession({
    BrowserWindow: browserWindowAdapter(connection, page.url),
    logger
  });
  const status = await official.status();
  return {
    page,
    connection,
    official,
    ...probe,
    authenticated: status.authenticated === true,
    serviceReady: status.serviceReady === true,
    status
  };
}

export async function discoverOfficialTargets({
  cdpEndpoint = DEFAULT_CDP_ENDPOINT,
  logger = { log() {}, error() {} }
} = {}) {
  let pages;
  try {
    pages = await getJson(`${cdpEndpoint}/json/list`);
  } catch (error) {
    const wrapped = new Error(
      "未连接到自动化Chrome。请使用工作台启动入口打开Chrome后重试。"
    );
    wrapped.code = "CHROME_DEBUG_UNAVAILABLE";
    wrapped.cause = error;
    throw wrapped;
  }
  const candidates = pages.filter((entry) =>
    entry.type === "page"
    && String(entry.url).startsWith(OFFICIAL_PAGE_PREFIX)
    && entry.webSocketDebuggerUrl
  );
  const probes = [];
  for (const page of candidates) {
    try {
      probes.push(await probeOfficialTarget(page, logger));
    } catch {
      // A stale or closing tab must not prevent another authenticated tab.
    }
  }
  return probes.sort(compareRank);
}

export class CdpOfficialBridge {
  constructor({
    cdpEndpoint = DEFAULT_CDP_ENDPOINT,
    logger = console
  } = {}) {
    this.cdpEndpoint = cdpEndpoint;
    this.logger = logger;
    this.active = null;
    this.connectPromise = null;
  }

  async _connectBest() {
    if (this.active) return this.active;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = (async () => {
      const targets = await discoverOfficialTargets({
        cdpEndpoint: this.cdpEndpoint,
        logger: this.logger
      });
      if (!targets.length) {
        const error = new Error("自动化Chrome中未找到官方系统页面");
        error.code = "OFFICIAL_PAGE_NOT_FOUND";
        throw error;
      }
      const [selected, ...unused] = targets;
      for (const target of unused) {
        target.official.dispose();
        target.connection.close();
      }
      this.active = selected;
      return selected;
    })().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  async status() {
    try {
      const active = await this._connectBest();
      const status = await active.official.status();
      return sanitizeForRenderer({
        ...status,
        bridge: "chrome-cdp",
        cachedService: active.cached
      });
    } catch (error) {
      return {
        ok: true,
        windowOpen: false,
        loaded: false,
        authenticated: false,
        serviceReady: false,
        loginRequired: true,
        bridge: "chrome-cdp",
        error: safeError(error)
      };
    }
  }

  async openLogin() {
    let active;
    try {
      active = await this._connectBest();
    } catch (error) {
      if (error.code !== "OFFICIAL_PAGE_NOT_FOUND") throw error;
      const encoded = encodeURIComponent(OFFICIAL_RECORD_URL);
      await putJson(`${this.cdpEndpoint}/json/new?${encoded}`);
      active = await this._connectBest();
    }
    await active.connection.bringToFront();
    return this.status();
  }

  async queryDay(payload) {
    return (await this._connectBest()).official.queryDay(payload);
  }

  async personnel(payload) {
    return (await this._connectBest()).official.listPersonnel(payload);
  }

  async submitPlan(payload) {
    // The same OfficialSession instance is deliberately retained so the
    // one-time confirmation token cannot cross sessions between dry-run/live.
    return (await this._connectBest()).official.submitPlan(payload);
  }

  async readback(payload) {
    return (await this._connectBest()).official.readback(payload);
  }

  async rollback(payload) {
    return (await this._connectBest()).official.rollback(payload);
  }

  async invoke(name, payload) {
    const methods = {
      status: () => this.status(),
      openLogin: () => this.openLogin(),
      personnel: () => this.personnel(payload),
      queryDay: () => this.queryDay(payload),
      submitPlan: () => this.submitPlan(payload),
      readback: () => this.readback(payload),
      rollback: () => this.rollback(payload)
    };
    if (!methods[name]) {
      const error = new Error("未知官方系统桥接操作");
      error.code = "INVALID_BRIDGE_OPERATION";
      throw error;
    }
    return methods[name]();
  }

  dispose() {
    if (!this.active) return;
    this.active.official.dispose();
    this.active.connection.close();
    this.active = null;
  }
}

export function officialBridgeError(error) {
  return { ok: false, error: safeError(error) };
}
