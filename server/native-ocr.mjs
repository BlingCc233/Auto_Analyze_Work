import path from "node:path";
import { formatPpOcrResult } from "./ppocrv6-runtime.mjs";
import {
  recognizePpOcrWasm,
  resetPpOcrWasmForTests
} from "./ppocrv6-wasm.mjs";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

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

function decodeImage(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw nativeOcrError("INVALID_OCR_REQUEST", "OCR请求格式无效");
  }
  const mimeType = String(input.mimeType || "").toLowerCase();
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw nativeOcrError("INVALID_OCR_IMAGE", "OCR仅支持JPEG或PNG图片");
  }
  if (typeof input.dataBase64 !== "string" || !input.dataBase64) {
    throw nativeOcrError("INVALID_OCR_IMAGE", "OCR请求缺少图片数据");
  }
  const buffer = Buffer.from(input.dataBase64, "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw nativeOcrError("INVALID_OCR_IMAGE", "OCR图片大小无效或超过20MB");
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
  try {
    return formatPpOcrResult(
      await recognizePpOcrWasm(buffer, mimeType, { root })
    );
  } catch (error) {
    if (error?.code === "PPOCRV6_START_FAILED") {
      throw nativeOcrError("NATIVE_OCR_START_FAILED", error.message);
    }
    if (error?.code === "PPOCRV6_UNAVAILABLE") {
      throw nativeOcrError("NATIVE_OCR_UNAVAILABLE", error.message);
    }
    throw nativeOcrError(
      "NATIVE_OCR_FAILED",
      `PP-OCRv6识别失败：${error?.message || "未知错误"}`
    );
  }
}

export function resetNativeOcrForTests() {
  resetPpOcrWasmForTests();
}
