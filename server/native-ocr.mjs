import { createHash } from "node:crypto";
import { readFile, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS = Object.freeze({
  "image/jpeg": ".jpg",
  "image/png": ".png"
});

let binaryPromise;

function nativeOcrError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function detectMime(buffer) {
  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) return "image/jpeg";
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) return "image/png";
  return "";
}

async function ensureVisionBinary({ root = path.resolve(".") } = {}) {
  if (process.platform !== "darwin") {
    throw nativeOcrError(
      "NATIVE_OCR_UNAVAILABLE",
      "当前平台不支持Apple Vision OCR"
    );
  }
  if (!binaryPromise) {
    binaryPromise = (async () => {
      const bundledCandidates = [
        path.join(root, "ocr", "bin", "apple-vision-ocr"),
        path.join(root, "build", "apple-vision-ocr")
      ];
      for (const candidate of bundledCandidates) {
        try {
          const file = await stat(candidate);
          if (file.isFile()) return candidate;
        } catch {}
      }
      const sourcePath = path.join(root, "scripts", "apple-vision-ocr.swift");
      const source = await readFile(sourcePath);
      const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
      const binaryPath = path.join(tmpdir(), `qh-duty-vision-ocr-${hash}`);
      try {
        const file = await stat(binaryPath);
        if (file.isFile()) return binaryPath;
      } catch {}
      await execFileAsync("swiftc", [sourcePath, "-o", binaryPath], {
        timeout: 60_000,
        maxBuffer: 4 * 1024 * 1024
      });
      return binaryPath;
    })().catch((error) => {
      binaryPromise = null;
      throw nativeOcrError(
        "NATIVE_OCR_START_FAILED",
        `无法启动Apple Vision OCR：${error.message}`
      );
    });
  }
  return binaryPromise;
}

function decodeImage(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw nativeOcrError("INVALID_OCR_REQUEST", "OCR请求格式无效");
  }
  const mimeType = String(input.mimeType || "").toLowerCase();
  if (!MIME_EXTENSIONS[mimeType]) {
    throw nativeOcrError("INVALID_OCR_IMAGE", "OCR仅支持JPEG或PNG图片");
  }
  if (typeof input.dataBase64 !== "string" || !input.dataBase64) {
    throw nativeOcrError("INVALID_OCR_IMAGE", "OCR请求缺少图片数据");
  }
  const buffer = Buffer.from(input.dataBase64, "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw nativeOcrError("INVALID_OCR_IMAGE", "OCR图片大小无效或超过5MB");
  }
  if (detectMime(buffer) !== mimeType) {
    throw nativeOcrError("INVALID_OCR_IMAGE", "OCR图片内容与类型不一致");
  }
  return { buffer, mimeType };
}

export async function recognizeNativeImage(input, {
  root = path.resolve(".")
} = {}) {
  const { buffer, mimeType } = decodeImage(input);
  const binary = await ensureVisionBinary({ root });
  const directory = await mkdtemp(path.join(tmpdir(), "qh-duty-ocr-"));
  const imagePath = path.join(directory, `image${MIME_EXTENSIONS[mimeType]}`);
  try {
    await writeFile(imagePath, buffer, { flag: "wx" });
    const { stdout } = await execFileAsync(binary, [imagePath], {
      timeout: 45_000,
      maxBuffer: 16 * 1024 * 1024
    });
    let result;
    try {
      [result] = JSON.parse(stdout);
    } catch {
      throw nativeOcrError("NATIVE_OCR_FAILED", "Apple Vision OCR返回格式无效");
    }
    if (result?.error) {
      throw nativeOcrError("NATIVE_OCR_FAILED", result.error);
    }
    const text = String(result?.text || "");
    return {
      ok: true,
      engine: "apple-vision",
      ocrText: text,
      timeOcrText: String(result?.timeText || ""),
      confidence: text.trim() ? 99 : 0
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function resetNativeOcrForTests() {
  binaryPromise = null;
}
