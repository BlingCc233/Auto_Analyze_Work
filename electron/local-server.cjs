const { createReadStream } = require("node:fs");
const {
  readFile,
  readdir,
  stat
} = require("node:fs/promises");
const { createServer } = require("node:http");
const {
  basename,
  extname,
  isAbsolute,
  join,
  relative,
  resolve
} = require("node:path");
const { pathToFileURL } = require("node:url");

const images = new Set([".jpg", ".jpeg", ".png"]);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm"
};

const DEFAULT_PORT = 5173;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_OCR_BODY_BYTES = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64 * 1024;
const MIME_SIGNATURES = {
  "image/jpeg": (buffer) => (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ),
  "image/png": (buffer) => (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  )
};

function localError(code, message, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function businessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function preferredBusinessDate(_dailyRoot, now = new Date()) {
  return businessDate(now);
}

function folderFor(date) {
  const match = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1].slice(2)}${match[2]}${match[3]}` : null;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function sendNotFound(response) {
  response.writeHead(404, {
    "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff"
  });
  response.end("Not found");
}

function safePath(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(pathname)).replaceAll("\\", "/");
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const resolved = resolve(root, decoded.replace(/^\/+/, ""));
  const fromRoot = relative(root, resolved);
  if (
    fromRoot === ""
    || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  ) return resolved;
  return null;
}

async function isUsableDistRoot(candidate) {
  try {
    const indexPath = join(candidate, "index.html");
    const index = await readFile(indexPath, "utf8");
    if (!/<(?:div|main)[^>]+id=["']app["']/i.test(index)) return false;
    const assets = [...index.matchAll(/(?:src|href)=["'](\/assets\/[^"'?#]+)/g)]
      .map((match) => match[1]);
    if (!assets.length) return false;
    for (const asset of assets) {
      const assetPath = safePath(candidate, asset);
      const file = assetPath ? await stat(assetPath) : null;
      if (!file?.isFile()) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function resolveDistRoot(appRoot) {
  const candidates = [];
  const add = (candidate) => {
    if (candidate && !candidates.includes(resolve(candidate))) {
      candidates.push(resolve(candidate));
    }
  };

  if (basename(resolve(appRoot)).toLowerCase() === "dist") add(appRoot);
  add(join(appRoot, "dist"));
  add(appRoot);
  add(join(__dirname, "..", "dist"));
  if (process.resourcesPath) {
    add(join(process.resourcesPath, "dist"));
    add(join(process.resourcesPath, "app", "dist"));
    add(join(process.resourcesPath, "app.asar", "dist"));
  }

  for (const candidate of candidates) {
    if (await isUsableDistRoot(candidate)) return candidate;
  }
  throw localError(
    "DIST_NOT_FOUND",
    "找不到完整的工作台构建资源，请重新安装或执行构建。",
    500
  );
}

async function serveFile(request, response, filePath) {
  try {
    const file = await stat(filePath);
    if (!file.isFile()) return false;
    response.writeHead(200, {
      "content-length": file.size,
      "content-type": contentTypes[extname(filePath).toLowerCase()]
        ?? "application/octet-stream",
      "x-content-type-options": "nosniff"
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath).pipe(response);
    return true;
  } catch {
    return false;
  }
}

function isSpaNavigation(request, pathname) {
  if (!["GET", "HEAD"].includes(request.method)) return false;
  if (extname(pathname)) return false;
  const accept = String(request.headers.accept || "");
  return !accept || accept.includes("text/html") || accept.includes("*/*");
}

function assertTrustedLocalRequest(request, origin) {
  const expectedHost = new URL(origin).host;
  const host = String(request.headers.host || "");
  const requestOrigin = String(request.headers.origin || "");
  const fetchSite = String(request.headers["sec-fetch-site"] || "");
  if (host !== expectedHost) {
    throw localError("UNTRUSTED_LOCAL_REQUEST", "拒绝未知本地请求", 403);
  }
  if (
    requestOrigin && requestOrigin !== origin
    || fetchSite && fetchSite !== "same-origin"
  ) {
    throw localError("UNTRUSTED_LOCAL_REQUEST", "拒绝非同源OCR请求", 403);
  }
}

function readJsonBody(request, maxBytes) {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    request.resume();
    return Promise.reject(localError(
      "REQUEST_TOO_LARGE",
      `OCR请求超过${Math.floor(maxBytes / 1024 / 1024)}MB限制`,
      413
    ));
  }

  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    request.once("error", rejectBody);
    request.once("end", () => {
      if (tooLarge) {
        rejectBody(localError(
          "REQUEST_TOO_LARGE",
          `OCR请求超过${Math.floor(maxBytes / 1024 / 1024)}MB限制`,
          413
        ));
        return;
      }
      try {
        resolveBody(chunks.length
          ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
          : {});
      } catch {
        rejectBody(localError("INVALID_JSON", "OCR请求JSON无效", 400));
      }
    });
  });
}

function validateOcrPayload(input, maxImageBytes) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw localError("INVALID_OCR_REQUEST", "OCR请求格式无效", 400);
  }
  const mimeType = String(input.mimeType || "").toLowerCase();
  const signatureMatches = MIME_SIGNATURES[mimeType];
  if (!signatureMatches) {
    throw localError("INVALID_OCR_IMAGE", "OCR仅支持JPEG或PNG图片", 400);
  }
  if (
    typeof input.dataBase64 !== "string"
    || !input.dataBase64
    || input.dataBase64.length % 4 !== 0
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.dataBase64)
  ) {
    throw localError("INVALID_OCR_IMAGE", "OCR请求缺少有效图片数据", 400);
  }
  const padding = input.dataBase64.endsWith("==")
    ? 2
    : input.dataBase64.endsWith("=") ? 1 : 0;
  const estimatedBytes = input.dataBase64.length / 4 * 3 - padding;
  if (!estimatedBytes || estimatedBytes > maxImageBytes) {
    throw localError(
      "INVALID_OCR_IMAGE",
      `OCR图片大小无效或超过${Math.floor(maxImageBytes / 1024 / 1024)}MB`,
      413
    );
  }
  const buffer = Buffer.from(input.dataBase64, "base64");
  if (buffer.length !== estimatedBytes || !signatureMatches(buffer)) {
    throw localError("INVALID_OCR_IMAGE", "OCR图片内容与类型不一致", 400);
  }
  return {
    mimeType,
    dataBase64: input.dataBase64
  };
}

function nativeOcrModuleCandidates(appRoot) {
  const candidates = [
    join(appRoot, "server", "native-ocr.mjs"),
    join(__dirname, "..", "server", "native-ocr.mjs")
  ];
  if (String(appRoot).endsWith(".asar")) {
    candidates.unshift(
      join(`${appRoot}.unpacked`, "server", "native-ocr.mjs")
    );
  }
  if (process.resourcesPath) {
    candidates.push(
      join(process.resourcesPath, "server", "native-ocr.mjs"),
      join(process.resourcesPath, "app", "server", "native-ocr.mjs"),
      join(process.resourcesPath, "app.asar", "server", "native-ocr.mjs")
    );
  }
  return [...new Set(candidates.map((candidate) => resolve(candidate)))];
}

function resolveNativeOcrRuntimeRoot(
  appRoot,
  resourcesPath = process.resourcesPath
) {
  const resolvedAppRoot = resolve(appRoot);
  if (!resourcesPath) return resolvedAppRoot;
  const resolvedResources = resolve(resourcesPath);
  const relativeToResources = relative(resolvedResources, resolvedAppRoot);
  return relativeToResources === ""
    || (!relativeToResources.startsWith("..") && !isAbsolute(relativeToResources))
    ? resolvedResources
    : resolvedAppRoot;
}

async function loadNativeOcrModule(appRoot) {
  for (const candidate of nativeOcrModuleCandidates(appRoot)) {
    try {
      const file = await stat(candidate);
      if (!file.isFile()) continue;
      const module = await import(pathToFileURL(candidate).href);
      if (typeof module.recognizeNativeImage === "function") {
        return module.recognizeNativeImage;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw localError(
          "NATIVE_OCR_START_FAILED",
          "无法加载PP-OCRv6组件",
          200
        );
      }
    }
  }
  throw localError(
    "NATIVE_OCR_UNAVAILABLE",
    "当前安装未提供PP-OCRv6组件",
    200
  );
}

function publicOcrError(error) {
  const knownCodes = new Set([
    "INVALID_JSON",
    "INVALID_OCR_IMAGE",
    "INVALID_OCR_REQUEST",
    "NATIVE_OCR_FAILED",
    "NATIVE_OCR_START_FAILED",
    "NATIVE_OCR_UNAVAILABLE",
    "REQUEST_TOO_LARGE",
    "UNTRUSTED_LOCAL_REQUEST"
  ]);
  const code = knownCodes.has(error?.code) ? error.code : "NATIVE_OCR_FAILED";
  const fallback = code === "NATIVE_OCR_UNAVAILABLE"
    ? "当前安装未提供PP-OCRv6模型"
    : "PP-OCRv6识别失败";
  const exposeMessage = knownCodes.has(error?.code);
  return {
    ok: false,
    error: {
      code,
      message: exposeMessage
        && typeof error?.message === "string"
        && error.message.length <= 160
        ? error.message
        : fallback
    }
  };
}

async function listen(server, preferredPort) {
  const bind = (port) => new Promise((resolveListen, rejectListen) => {
    const onError = (error) => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });

  try {
    await bind(preferredPort);
  } catch (error) {
    if (preferredPort !== DEFAULT_PORT || error?.code !== "EADDRINUSE") throw error;
    await bind(0);
  }
}

async function startLocalServer({
  appRoot,
  dailyRoot,
  port = DEFAULT_PORT,
  nativeOcr,
  now = () => new Date(),
  limits = {}
}) {
  const distRoot = await resolveDistRoot(resolve(appRoot));
  const patrolRoot = resolve(dailyRoot);
  const maxBodyBytes = limits.maxBodyBytes ?? MAX_OCR_BODY_BYTES;
  const maxImageBytes = limits.maxImageBytes ?? MAX_IMAGE_BYTES;
  const nativeOcrRoot = resolveNativeOcrRuntimeRoot(resolve(appRoot));
  let origin = "";
  let nativeOcrPromise;

  const invokeNativeOcr = async (payload) => {
    if (nativeOcr) return nativeOcr(payload, { root: nativeOcrRoot });
    nativeOcrPromise ??= loadNativeOcrModule(resolve(appRoot));
    const recognizeNativeImage = await nativeOcrPromise;
    return recognizeNativeImage(payload, { root: nativeOcrRoot });
  };

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, origin || "http://127.0.0.1");

      if (request.method === "POST" && url.pathname === "/api/ocr") {
        try {
          assertTrustedLocalRequest(request, origin);
          const payload = validateOcrPayload(
            await readJsonBody(request, maxBodyBytes),
            maxImageBytes
          );
          return sendJson(response, 200, await invokeNativeOcr(payload));
        } catch (error) {
          return sendJson(response, error?.statusCode || 200, publicOcrError(error));
        }
      }

      if (request.method === "GET" && url.pathname === "/api/today") {
        return sendJson(response, 200, {
          date: await preferredBusinessDate(patrolRoot, now())
        });
      }

      if (request.method === "GET" && url.pathname === "/api/daily") {
        const folder = folderFor(url.searchParams.get("date"));
        if (!folder) {
          return sendJson(response, 400, {
            error: "日期格式应为 YYYY-MM-DD"
          });
        }
        try {
          const directory = safePath(patrolRoot, folder);
          if (!directory) return sendJson(response, 400, { error: "无效目录" });
          const entries = await readdir(directory, { withFileTypes: true });
          const files = entries
            .filter((entry) => entry.isFile() && images.has(extname(entry.name).toLowerCase()))
            .map((entry) => ({
              name: entry.name,
              url: `/daily/${folder}/${encodeURIComponent(entry.name)}`
            }))
            .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
          return sendJson(response, 200, {
            folder: directory,
            files
          });
        } catch {
          return sendJson(response, 200, {
            folder: join(patrolRoot, folder),
            files: []
          });
        }
      }

      if (
        ["GET", "HEAD"].includes(request.method)
        && url.pathname.startsWith("/daily/")
      ) {
        const filePath = safePath(
          patrolRoot,
          url.pathname.slice("/daily/".length)
        );
        if (
          !filePath
          || !images.has(extname(filePath).toLowerCase())
          || !await serveFile(request, response, filePath)
        ) sendNotFound(response);
        return;
      }

      if (!["GET", "HEAD"].includes(request.method)) {
        sendNotFound(response);
        return;
      }

      const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = safePath(distRoot, requestedPath);
      if (filePath && await serveFile(request, response, filePath)) return;
      if (
        isSpaNavigation(request, url.pathname)
        && await serveFile(request, response, join(distRoot, "index.html"))
      ) return;
      sendNotFound(response);
    } catch {
      if (!response.headersSent) sendNotFound(response);
      else response.end();
    }
  });

  await listen(server, port);
  const address = server.address();
  origin = `http://127.0.0.1:${address.port}`;
  return {
    server,
    url: origin,
    distRoot,
    preferredPortAvailable: address.port === port
  };
}

module.exports = {
  DEFAULT_PORT,
  MAX_IMAGE_BYTES,
  MAX_OCR_BODY_BYTES,
  businessDate,
  preferredBusinessDate,
  resolveNativeOcrRuntimeRoot,
  resolveDistRoot,
  startLocalServer
};
