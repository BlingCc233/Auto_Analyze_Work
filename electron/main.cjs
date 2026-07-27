const { app, BrowserWindow, ipcMain, session } = require("electron");
const { join } = require("node:path");
const { startLocalServer } = require("./local-server.cjs");
const {
  OfficialSession,
  safeError,
  sanitizeForRenderer
} = require("./official-session.cjs");
const {
  listUsernames,
  findCredentials
} = require("./credentials.cjs");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");

let workbench;
let officialSession;
let localServer;
let quitting = false;

function redactLog(value) {
  return safeError(new Error(String(value))).message;
}

function logWindowMessage(label, ...values) {
  console.log(`[${label}]`, ...values.map(redactLog));
}

function errorPage(title, message) {
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
section{max-width:720px;border:1px solid #d6dde4;background:#fff;padding:28px;border-radius:8px;box-shadow:0 10px 30px rgba(22,34,47,.08)}
h1{font-size:22px;margin:0 0 12px}p{line-height:1.7;margin:0;color:#52606d;white-space:pre-wrap}
</style>
</head>
<body><main><section><h1>${escape(title)}</h1><p>${escape(message)}</p></section></main></body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function attachDiagnostics(window, label) {
  const { webContents } = window;
  webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      logWindowMessage(
        label,
        `did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`
      );
    }
  );
  webContents.on("console-message", (...args) => {
    const details = args.length === 2 && args[1] && typeof args[1] === "object"
      ? args[1]
      : { level: args[1], message: args[2], lineNumber: args[3], sourceId: args[4] };
    logWindowMessage(
      label,
      `console:${details.level ?? "?"} ${details.message ?? ""}`
    );
  });
  webContents.on("render-process-gone", (_event, details) => {
    logWindowMessage(
      label,
      `renderer gone: ${details?.reason || "unknown"} (${details?.exitCode ?? "?"})`
    );
  });
  webContents.on("unresponsive", () => {
    logWindowMessage(label, "renderer unresponsive");
  });
}

async function loadWithFallback(window, url, label) {
  try {
    await window.loadURL(url);
    if (label === "workbench") {
      const health = await window.webContents.executeJavaScript(
        `({
          hasAppRoot: Boolean(document.querySelector("#app")),
          bodyText: String(document.body && document.body.innerText || "").trim().slice(0, 120)
        })`,
        false
      );
      if (!health?.hasAppRoot) {
        throw Object.assign(
          new Error(`工作台入口无效：${health?.bodyText || "页面缺少#app"}`),
          { code: "WORKBENCH_ENTRY_INVALID" }
        );
      }
    }
  } catch (error) {
    logWindowMessage(label, `loadURL failed: ${error?.message || error}`);
    const message = [
      "工作台页面加载失败。",
      `地址：${url}`,
      `错误：${error?.message || error}`,
      "请关闭应用后重新启动；终端日志中保留了 did-fail-load 和渲染进程信息。"
    ].join("\n");
    try {
      await window.loadURL(errorPage("巡查工作台加载失败", message));
    } catch (fallbackError) {
      logWindowMessage(label, `local error page failed: ${fallbackError?.message || fallbackError}`);
    }
  }
}

async function createWorkbenchWindow() {
  if (workbench && !workbench.isDestroyed()) {
    workbench.show();
    workbench.focus();
    return workbench;
  }
  workbench = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1040,
    minHeight: 720,
    show: false,
    title: "韵家口巡查工作台",
    backgroundColor: "#f4f6f8",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  attachDiagnostics(workbench, "workbench");
  workbench.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  workbench.once("ready-to-show", () => {
    if (workbench && !workbench.isDestroyed()) workbench.show();
  });
  workbench.on("closed", () => {
    workbench = null;
  });
  await loadWithFallback(workbench, localServer.url, "workbench");
  if (workbench && !workbench.isDestroyed() && !workbench.isVisible()) {
    workbench.show();
  }
  return workbench;
}

function trustedRendererOrigin() {
  return localServer ? new URL(localServer.url).origin : "";
}

function assertTrustedSender(event) {
  const senderUrl = event.senderFrame?.url || event.sender?.getURL?.() || "";
  let origin = "";
  try {
    origin = new URL(senderUrl).origin;
  } catch {
    throw Object.assign(new Error("拒绝未知来源的桌面桥接请求"), {
      code: "UNTRUSTED_RENDERER"
    });
  }
  if (!trustedRendererOrigin() || origin !== trustedRendererOrigin()) {
    throw Object.assign(new Error("拒绝非工作台页面的桌面桥接请求"), {
      code: "UNTRUSTED_RENDERER"
    });
  }
}

function registerHandler(channel, action) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event, payload) => {
    try {
      assertTrustedSender(event);
      return sanitizeForRenderer(await action(payload));
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
  });
}

function registerOfficialHandlers() {
  registerHandler("official-status", () => officialSession.status());
  registerHandler("official-open-login", () => officialSession.openLogin());
  registerHandler("official-personnel", (payload) => officialSession.listPersonnel(payload));
  registerHandler("official-query-day", (payload) => officialSession.queryDay(payload));
  registerHandler("official-submit-plan", (payload) => officialSession.submitPlan(payload));
  registerHandler("official-readback", (payload) => officialSession.readback(payload));
  registerHandler("official-rollback", (payload) => officialSession.rollback(payload));

  // Compatibility for the current renderer while it migrates to official-open-login.
  registerHandler("open-official", () => officialSession.openLogin());

  // 自动登录：前端传用户名，主进程查找密码并执行自动登录
  registerHandler("official-auto-login", (payload) => {
    const username = String(payload?.username || "").trim();
    if (!username) {
      return { ok: false, error: { code: "INVALID_CREDENTIAL", message: "请选择登录用户" } };
    }
    const cred = findCredentials(username);
    if (!cred) {
      return { ok: false, error: { code: "INVALID_CREDENTIAL", message: `未找到用户"${username}"的帐密` } };
    }
    return officialSession.autoLogin(cred.username, cred.password);
  });

  // 返回可选用户列表（仅用户名，不含密码）
  registerHandler("official-credentials", () => {
    return {
      ok: true,
      users: listUsernames().map((username) => ({ username }))
    };
  });
}

app.whenReady().then(async () => {
  const appRoot = app.isPackaged ? app.getAppPath() : join(__dirname, "..");
  const dailyRoot = app.isPackaged
    ? join(app.getPath("documents"), "韵家口巡查工作台", "daily")
    : join(process.cwd(), "daily");

  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false)
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  try {
    localServer = await startLocalServer({ appRoot, dailyRoot });
  } catch (error) {
    console.error("[main] local server failed", redactLog(error?.message || error));
    app.quit();
    return;
  }

  officialSession = new OfficialSession({
    BrowserWindow,
    logger: console
  });
  registerOfficialHandlers();
  await createWorkbenchWindow();

  app.on("activate", () => {
    createWorkbenchWindow().catch((error) => {
      console.error("[main] activate failed", redactLog(error?.message || error));
    });
  });
}).catch((error) => {
  console.error("[main] startup failed", redactLog(error?.message || error));
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (quitting) return;
  quitting = true;
  officialSession?.dispose();
  localServer?.server.close();
});

process.on("unhandledRejection", (error) => {
  console.error("[main] unhandled rejection", redactLog(error?.message || error));
});

process.on("uncaughtException", (error) => {
  console.error("[main] uncaught exception", redactLog(error?.message || error));
});
