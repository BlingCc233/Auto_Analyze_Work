import { isTrustedLocalAppOrigin } from "./local-origin.js";

async function sourceBlob(source) {
  if (source instanceof Blob) return source;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`无法读取OCR图片：HTTP ${response.status}`);
  return response.blob();
}

async function blobBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("无法读取OCR图片"));
    reader.readAsDataURL(blob);
  });
}

export async function recognizePatrolImage(source, onProgress) {
  if (!isTrustedLocalAppOrigin()) {
    throw new Error("精准OCR仅在巡查工作台桌面应用中可用");
  }

  onProgress?.(0.05);
  const blob = await sourceBlob(source);
  const mimeType = blob.type === "image/png" ? "image/png" : "image/jpeg";
  let response;
  try {
    response = await fetch("/api/ocr", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mimeType,
        dataBase64: await blobBase64(blob)
      })
    });
  } catch (error) {
    throw new Error(`精准OCR不可用：${error?.message || "无法连接本地PP-OCRv6服务"}`);
  }

  if (!response.ok) {
    throw new Error(`精准OCR不可用：本地服务返回HTTP ${response.status}`);
  }
  const result = await response.json();
  if (!result?.ok) {
    throw new Error(`精准OCR不可用：${result?.error?.message || "PP-OCRv6识别失败"}`);
  }
  if (result.engine !== "ppocrv6-tiny-wasm") {
    throw new Error(`精准OCR引擎异常：${result.engine || "未返回引擎标识"}`);
  }

  onProgress?.(1);
  return {
    ocrText: result.ocrText || "",
    timeOcrText: result.timeOcrText || "",
    confidence: Number(result.confidence) || 0,
    engine: result.engine
  };
}

export async function disposeOcrWorker() {}
