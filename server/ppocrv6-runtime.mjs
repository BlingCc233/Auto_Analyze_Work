import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { access } from "node:fs/promises";
import path from "node:path";

let runtimePromise;

function runtimeError(code, message) {
  return Object.assign(new Error(message), { code });
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function modelCandidates(root, name) {
  return [
    path.join(root, "ocr", "models", name),
    path.join(process.env.HOME || "", ".paddlex", "official_models", name)
  ];
}

async function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate && await exists(candidate)) return candidate;
  }
  return "";
}

async function workerCommand(root) {
  const extension = process.platform === "win32" ? ".exe" : "";
  const bundled = await firstExisting([
    process.env.PPOCRV6_WORKER || "",
    path.join(root, "ocr", "bin", `ppocrv6-worker${extension}`),
    path.join(root, "build", `ppocrv6-worker${extension}`)
  ]);
  if (bundled) return { command: bundled, args: [] };

  const python = process.env.PPOCRV6_PYTHON;
  const script = path.join(root, "scripts", "ppocrv6-worker.py");
  if (python && await exists(script)) {
    return { command: python, args: [script] };
  }
  throw runtimeError("PPOCRV6_UNAVAILABLE", "当前安装未提供PP-OCRv6运行时");
}

export function clockFromLines(lines = []) {
  for (const line of lines) {
    if (isDate(line.text)) continue;
    const source = String(line.text || "")
      .replace(/[Oo]/g, "0")
      .replace(/[：·.-]/g, ":");
    const match = source.match(/([0-2]?\d)\s*:\s*([0-5]\d)/);
    if (match && Number(match[1]) <= 23) {
      return `${match[1].padStart(2, "0")}:${match[2]}`;
    }
    const compact = source.replace(/\D/g, "").match(/^([0-2]\d)([0-5]\d)/);
    if (compact) return `${compact[1]}:${compact[2]}`;
  }
  return "";
}

function isDate(text) {
  return /20\d{2}[-=./:]\d{1,2}[-=./:]\d{1,3}/.test(String(text));
}

export function spatialText(result) {
  const lines = Array.isArray(result.lines) ? result.lines : [];
  const date = lines
    .filter((line) => isDate(line.text))
    .sort((left, right) => right.score - left.score)[0];
  if (!date || !result.width || !result.height) {
    return lines.map((line) => line.text).join("\n");
  }
  const watermark = lines.filter((line) =>
    line.x < result.width * 0.72
    && line.y >= date.y - result.height * 0.055
    && line.y <= result.height * 0.995
  );
  const watermarkSet = new Set(watermark);
  const scene = lines.filter((line) => !watermarkSet.has(line));
  const time = clockFromLines(result.timeLines) || clockFromLines(watermark);
  return [
    ...(time ? [time] : []),
    date.text,
    ...watermark
      .filter((line) => line !== date && line.text !== time)
      .sort((left, right) => left.y - right.y || left.x - right.x)
      .map((line) => line.text),
    ...scene.map((line) => line.text)
  ].join("\n");
}

async function createRuntime(root) {
  const command = await workerCommand(root);
  const detModel = await firstExisting(modelCandidates(root, "PP-OCRv6_tiny_det"));
  const recModel = await firstExisting(modelCandidates(root, "PP-OCRv6_tiny_rec"));
  if (!detModel || !recModel) {
    throw runtimeError("PPOCRV6_UNAVAILABLE", "当前安装缺少PP-OCRv6模型");
  }
  const child = spawn(command.command, [
    ...command.args,
    "--det-model", detModel,
    "--rec-model", recModel
  ], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: {
      ...process.env,
      PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True"
    }
  });
  const output = createInterface({ input: child.stdout });
  const pending = new Map();
  let sequence = 0;
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const startupTimer = setTimeout(() => {
    readyReject(runtimeError("PPOCRV6_START_FAILED", "PP-OCRv6启动超时"));
    child.kill();
  }, 45_000);

  output.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.ready) {
      clearTimeout(startupTimer);
      readyResolve();
      return;
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.ok) waiter.resolve(message);
    else waiter.reject(runtimeError("PPOCRV6_FAILED", message.error || "PP-OCRv6识别失败"));
  });
  child.once("error", (error) => {
    readyReject(runtimeError("PPOCRV6_START_FAILED", error.message));
  });
  child.once("exit", () => {
    const error = runtimeError("PPOCRV6_FAILED", "PP-OCRv6进程已退出");
    readyReject(error);
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
    runtimePromise = null;
  });
  await ready;

  return {
    recognize(imagePath) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(runtimeError("PPOCRV6_FAILED", "PP-OCRv6识别超时"));
        }, 45_000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(`${JSON.stringify({ id, imagePath })}\n`);
      });
    },
    close() {
      child.kill();
    }
  };
}

export async function recognizePpOcrImage(imagePath, { root = path.resolve(".") } = {}) {
  runtimePromise ??= createRuntime(root).catch((error) => {
    runtimePromise = null;
    throw error;
  });
  const runtime = await runtimePromise;
  const result = await runtime.recognize(imagePath);
  return formatPpOcrResult(result);
}

export function formatPpOcrResult(result) {
  return {
    ok: true,
    engine: result.engine,
    ocrText: spatialText(result),
    timeOcrText: clockFromLines(result.timeLines),
    confidence: Number(result.confidence) || 0,
    geometry: {
      width: result.width,
      height: result.height,
      lines: result.lines
    }
  };
}

export function resetPpOcrForTests() {
  runtimePromise?.then((runtime) => runtime.close()).catch(() => {});
  runtimePromise = null;
}
