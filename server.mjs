import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, extname, join, normalize, resolve } from "node:path";
import { createServer as createViteServer } from "vite";
import {
  CdpOfficialBridge,
  officialBridgeError
} from "./server/official-cdp-bridge.mjs";
import { recognizeNativeImage } from "./server/native-ocr.mjs";

const root = resolve(".");
const dailyRoot = resolve(root, "daily");
const images = new Set([".jpg", ".jpeg", ".png"]);
const officialBridge = new CdpOfficialBridge();
const MAX_JSON_BYTES = 80 * 1024 * 1024;

function businessDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function folderFor(date) {
  const match = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[1].slice(2)}${match[2]}${match[3]}`;
}

function json(response, statusCode, body) {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function assertSameOrigin(request) {
  const host = String(request.headers.host || "");
  const origin = String(request.headers.origin || "");
  const fetchSite = String(request.headers["sec-fetch-site"] || "");
  if (!/^127\.0\.0\.1:5173$/.test(host)) {
    const error = new Error("拒绝未知Host");
    error.code = "UNTRUSTED_LOCAL_REQUEST";
    throw error;
  }
  if (request.method !== "GET" && (
    origin !== "http://127.0.0.1:5173"
    || (fetchSite && fetchSite !== "same-origin")
  )) {
    const error = new Error("拒绝非同源自动化请求");
    error.code = "UNTRUSTED_LOCAL_REQUEST";
    throw error;
  }
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) {
      const error = new Error("自动化请求超过80MB限制");
      error.code = "REQUEST_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("自动化请求JSON无效");
    error.code = "INVALID_JSON";
    throw error;
  }
}

const officialOperations = new Map([
  ["GET /api/official/status", "status"],
  ["POST /api/official/open-login", "openLogin"],
  ["POST /api/official/personnel", "personnel"],
  ["POST /api/official/query-day", "queryDay"],
  ["POST /api/official/submit-plan", "submitPlan"],
  ["POST /api/official/readback", "readback"],
  ["POST /api/official/rollback", "rollback"],
  ["POST /api/official/auto-login", "autoLogin"],
  ["GET /api/official/credentials", "credentials"],
  ["POST /api/official/logout", "logout"]
]);

function safeDailyFile(pathname) {
  const relative = normalize(decodeURIComponent(pathname.replace(/^\/daily\//, ""))).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = resolve(dailyRoot, relative);
  return filePath.startsWith(`${dailyRoot}/`) ? filePath : null;
}

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "spa"
});

createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");

  const officialOperation = officialOperations.get(`${request.method} ${url.pathname}`);
  if (officialOperation) {
    try {
      assertSameOrigin(request);
      const payload = request.method === "GET" ? undefined : await readJson(request);
      return json(response, 200, await officialBridge.invoke(officialOperation, payload));
    } catch (error) {
      return json(response, 200, officialBridgeError(error));
    }
  }

  if (request.method === "POST" && url.pathname === "/api/ocr") {
    try {
      assertSameOrigin(request);
      return json(response, 200, await recognizeNativeImage(await readJson(request), { root }));
    } catch (error) {
      return json(response, 200, officialBridgeError(error));
    }
  }

  if (request.method === "GET" && url.pathname === "/api/today") {
    return json(response, 200, { date: businessDate() });
  }

  if (request.method === "GET" && url.pathname === "/api/daily") {
    const folder = folderFor(url.searchParams.get("date"));
    if (!folder) return json(response, 400, { error: "日期格式应为 YYYY-MM-DD" });

    try {
      const directory = resolve(dailyRoot, folder);
      if (!directory.startsWith(`${dailyRoot}/`)) return json(response, 400, { error: "无效目录" });
      const entries = await readdir(directory, { withFileTypes: true });
      const files = entries
        .filter((entry) => entry.isFile() && images.has(extname(entry.name).toLowerCase()))
        .map((entry) => ({
          name: entry.name,
          url: `/daily/${folder}/${encodeURIComponent(entry.name)}`
        }))
        .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
      return json(response, 200, { folder: `daily/${folder}`, files });
    } catch (error) {
      if (error.code === "ENOENT") return json(response, 200, { folder: `daily/${folder}`, files: [] });
      return json(response, 500, { error: "无法读取每日图片目录" });
    }
  }

  if (request.method === "GET" && url.pathname.startsWith("/daily/")) {
    const filePath = safeDailyFile(url.pathname);
    if (!filePath) return response.end("Not found");
    try {
      const file = await stat(filePath);
      if (!file.isFile() || !images.has(extname(filePath).toLowerCase())) return response.end("Not found");
      response.writeHead(200, { "content-type": `image/${extname(filePath).slice(1) === "jpg" ? "jpeg" : extname(filePath).slice(1)}` });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
    return;
  }

  vite.middlewares(request, response);
}).listen(5173, "127.0.0.1", () => {
  console.log("巡查工作台: http://127.0.0.1:5173/");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    officialBridge.dispose();
    process.exit(0);
  });
}
