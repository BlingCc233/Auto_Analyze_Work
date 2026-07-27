import Tesseract, { OEM, PSM } from "tesseract.js";
import { isTrustedLocalAppOrigin } from "./local-origin.js";

let workerPromise;
let progressListener;
let nativeOcrAvailable = true;

function loadImage(source) {
  const objectUrl = source instanceof File ? URL.createObjectURL(source) : source;
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ image, objectUrl, revoke: source instanceof File });
    image.onerror = reject;
    image.src = objectUrl;
  });
}

function cropCanvas(image, {
  x,
  y,
  width,
  height,
  scale = 1.6,
  mode = "original"
}) {
  const sourceX = Math.round(image.naturalWidth * x);
  const sourceY = Math.round(image.naturalHeight * y);
  const sourceWidth = Math.max(1, Math.round(image.naturalWidth * width));
  const sourceHeight = Math.max(1, Math.round(image.naturalHeight * height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );
  if (mode === "original") return canvas;

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    const red = pixels.data[offset];
    const green = pixels.data[offset + 1];
    const blue = pixels.data[offset + 2];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const brightNeutral = red > 148
      && green > 148
      && blue > 148
      && maximum - minimum < 82;
    const value = brightNeutral ? 0 : 255;
    pixels.data[offset] = value;
    pixels.data[offset + 1] = value;
    pixels.data[offset + 2] = value;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker(
      ["chi_sim", "eng"],
      OEM.LSTM_ONLY,
      {
        langPath: "/ocr-data",
        gzip: false,
        cacheMethod: "none",
        logger(message) {
          if (message.status === "recognizing text") progressListener?.(message.progress);
        }
      }
    );
  }
  return workerPromise;
}

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

async function recognizeWithNativeBridge(source, onProgress) {
  if (
    !nativeOcrAvailable
    || !isTrustedLocalAppOrigin()
  ) return null;
  try {
    onProgress?.(0.05);
    const blob = await sourceBlob(source);
    const mimeType = blob.type === "image/png" ? "image/png" : "image/jpeg";
    const response = await fetch("/api/ocr", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mimeType,
        dataBase64: await blobBase64(blob)
      })
    });
    if (!response.ok) throw new Error(`本地OCR返回HTTP ${response.status}`);
    const result = await response.json();
    if (!result?.ok) {
      if (result?.error?.code === "NATIVE_OCR_UNAVAILABLE") nativeOcrAvailable = false;
      return null;
    }
    onProgress?.(1);
    return {
      ocrText: result.ocrText || "",
      timeOcrText: result.timeOcrText || "",
      confidence: Number(result.confidence) || 0,
      engine: result.engine || "native"
    };
  } catch {
    return null;
  }
}

export async function recognizePatrolImage(source, onProgress) {
  const nativeResult = await recognizeWithNativeBridge(source, onProgress);
  if (nativeResult) return nativeResult;

  const loaded = await loadImage(source);
  progressListener = onProgress;
  try {
    const worker = await getWorker(onProgress);
    const watermark = cropCanvas(loaded.image, {
      x: 0,
      y: 0.38,
      width: 0.78,
      height: 0.62,
      scale: 1.55,
      mode: "bright-text"
    });
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
      tessedit_char_whitelist: ""
    });
    const full = await worker.recognize(watermark);

    const timeCrop = cropCanvas(loaded.image, {
      x: 0,
      y: 0.53,
      width: 0.28,
      height: 0.2,
      scale: 2.2,
      mode: "bright-text"
    });
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: "1",
      tessedit_char_whitelist: "0123456789:.-"
    });
    const time = await worker.recognize(timeCrop);
    return {
      ocrText: full.data.text || "",
      timeOcrText: time.data.text || "",
      confidence: Math.max(full.data.confidence || 0, time.data.confidence || 0)
    };
  } finally {
    progressListener = null;
    if (loaded.revoke) URL.revokeObjectURL(loaded.objectUrl);
  }
}

export async function disposeOcrWorker() {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}
