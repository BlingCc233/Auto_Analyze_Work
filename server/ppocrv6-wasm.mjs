import { readFile } from "node:fs/promises";
import path from "node:path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import yaml from "js-yaml";
import * as ort from "onnxruntime-web";

const DET_SIZE = 1280;
const REC_HEIGHT = 48;
const REC_WIDTH = 320;
let runtimePromise;

function wasmError(code, message) {
  return Object.assign(new Error(message), { code });
}

function decodeImage(buffer, mimeType) {
  if (mimeType === "image/png") {
    const image = PNG.sync.read(buffer);
    return { width: image.width, height: image.height, data: image.data };
  }
  const image = jpeg.decode(buffer, {
    formatAsRGBA: true,
    tolerantDecoding: true,
    useTArray: true
  });
  return { width: image.width, height: image.height, data: image.data };
}

function bilinearPixel(image, x, y, channel) {
  const left = Math.max(0, Math.min(image.width - 1, Math.floor(x)));
  const top = Math.max(0, Math.min(image.height - 1, Math.floor(y)));
  const right = Math.min(image.width - 1, left + 1);
  const bottom = Math.min(image.height - 1, top + 1);
  const xWeight = x - left;
  const yWeight = y - top;
  const offset = (px, py) => (py * image.width + px) * 4 + channel;
  const topValue = image.data[offset(left, top)] * (1 - xWeight)
    + image.data[offset(right, top)] * xWeight;
  const bottomValue = image.data[offset(left, bottom)] * (1 - xWeight)
    + image.data[offset(right, bottom)] * xWeight;
  return topValue * (1 - yWeight) + bottomValue * yWeight;
}

function detTensor(image) {
  const scale = Math.min(1, DET_SIZE / Math.max(image.width, image.height));
  const width = Math.max(32, Math.round(image.width * scale / 32) * 32);
  const height = Math.max(32, Math.round(image.height * scale / 32) * 32);
  const data = new Float32Array(3 * width * height);
  const means = [0.485, 0.456, 0.406];
  const stds = [0.229, 0.224, 0.225];
  const sourceChannels = [2, 1, 0];
  for (let y = 0; y < height; y += 1) {
    const sourceY = (y + 0.5) * image.height / height - 0.5;
    for (let x = 0; x < width; x += 1) {
      const sourceX = (x + 0.5) * image.width / width - 0.5;
      const target = y * width + x;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = bilinearPixel(image, sourceX, sourceY, sourceChannels[channel]) / 255;
        data[channel * width * height + target] = (value - means[channel]) / stds[channel];
      }
    }
  }
  return {
    tensor: new ort.Tensor("float32", data, [1, 3, height, width]),
    width,
    height
  };
}

function connectedBoxes(probabilities, width, height) {
  const visited = new Uint8Array(width * height);
  const boxes = [];
  const threshold = 0.2;
  const neighbors = [-1, 1, -width, width];
  for (let start = 0; start < probabilities.length; start += 1) {
    if (visited[start] || probabilities[start] < threshold) continue;
    const queue = [start];
    visited[start] = 1;
    let cursor = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let score = 0;
    let count = 0;
    while (cursor < queue.length) {
      const index = queue[cursor++];
      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      score += probabilities[index];
      count += 1;
      for (const offset of neighbors) {
        const next = index + offset;
        if (
          next < 0
          || next >= probabilities.length
          || visited[next]
          || probabilities[next] < threshold
          || (offset === -1 && x === 0)
          || (offset === 1 && x === width - 1)
        ) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    if (count < 10 || boxWidth < 3 || boxHeight < 3 || score / count < 0.4) continue;
    const padX = Math.max(2, Math.round(boxWidth * 0.2));
    const padY = Math.max(2, Math.round(boxHeight * 0.2));
    boxes.push({
      x1: Math.max(0, minX - padX),
      y1: Math.max(0, minY - padY),
      x2: Math.min(width - 1, maxX + padX),
      y2: Math.min(height - 1, maxY + padY),
      score: score / count
    });
  }
  return boxes.sort((left, right) => left.y1 - right.y1 || left.x1 - right.x1);
}

function cropImage(image, box, detWidth, detHeight) {
  const x1 = Math.max(0, Math.floor(box.x1 * image.width / detWidth));
  const y1 = Math.max(0, Math.floor(box.y1 * image.height / detHeight));
  const x2 = Math.min(image.width, Math.ceil((box.x2 + 1) * image.width / detWidth));
  const y2 = Math.min(image.height, Math.ceil((box.y2 + 1) * image.height / detHeight));
  return { image, x1, y1, x2, y2 };
}

function recTensor(crop) {
  const sourceWidth = Math.max(1, crop.x2 - crop.x1);
  const sourceHeight = Math.max(1, crop.y2 - crop.y1);
  const contentWidth = Math.max(
    1,
    Math.min(REC_WIDTH, Math.ceil(REC_HEIGHT * sourceWidth / sourceHeight))
  );
  const data = new Float32Array(3 * REC_HEIGHT * REC_WIDTH);
  for (let y = 0; y < REC_HEIGHT; y += 1) {
    const sourceY = crop.y1 + (y + 0.5) * sourceHeight / REC_HEIGHT - 0.5;
    for (let x = 0; x < contentWidth; x += 1) {
      const sourceX = crop.x1 + (x + 0.5) * sourceWidth / contentWidth - 0.5;
      const target = y * REC_WIDTH + x;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = bilinearPixel(crop.image, sourceX, sourceY, 2 - channel) / 255;
        data[channel * REC_HEIGHT * REC_WIDTH + target] = (value - 0.5) / 0.5;
      }
    }
  }
  return new ort.Tensor("float32", data, [1, 3, REC_HEIGHT, REC_WIDTH]);
}

function ctcDecode(output, dictionary) {
  const [, steps, classes] = output.dims;
  let previous = -1;
  let text = "";
  let score = 0;
  let count = 0;
  for (let step = 0; step < steps; step += 1) {
    const offset = step * classes;
    let best = 0;
    let probability = output.data[offset];
    for (let index = 1; index < classes; index += 1) {
      if (output.data[offset + index] > probability) {
        best = index;
        probability = output.data[offset + index];
      }
    }
    if (best !== 0 && best !== previous && dictionary[best - 1]) {
      text += dictionary[best - 1];
      score += probability;
      count += 1;
    }
    previous = best;
  }
  return { text: text.trim(), score: count ? score / count : 0 };
}

async function loadRuntime(root) {
  const detRoot = path.join(root, "ocr", "models", "PP-OCRv6_tiny_det");
  const recRoot = path.join(root, "ocr", "models", "PP-OCRv6_tiny_rec");
  const localDetRoot = path.join(root, "resources", "ppocrv6", "PP-OCRv6_tiny_det");
  const localRecRoot = path.join(root, "resources", "ppocrv6", "PP-OCRv6_tiny_rec");
  const resolveRoot = async (preferred, local) => {
    try {
      await readFile(path.join(preferred, "model.onnx"));
      return preferred;
    } catch {
      return local;
    }
  };
  const actualDetRoot = await resolveRoot(detRoot, localDetRoot);
  const actualRecRoot = await resolveRoot(recRoot, localRecRoot);
  const config = yaml.load(await readFile(path.join(actualRecRoot, "inference.yml"), "utf8"));
  const dictionary = config?.PostProcess?.character_dict;
  if (!Array.isArray(dictionary) || !dictionary.length) {
    throw wasmError("PPOCRV6_START_FAILED", "PP-OCRv6字符表无效");
  }
  ort.env.wasm.numThreads = 1;
  const [det, rec] = await Promise.all([
    ort.InferenceSession.create(path.join(actualDetRoot, "model.onnx"), {
      executionProviders: ["wasm"]
    }),
    ort.InferenceSession.create(path.join(actualRecRoot, "model.onnx"), {
      executionProviders: ["wasm"]
    })
  ]);
  return { det, rec, dictionary };
}

async function recognizeRegion(runtime, image) {
  const prepared = detTensor(image);
  const outputs = await runtime.det.run({ x: prepared.tensor });
  const probability = outputs[runtime.det.outputNames[0]];
  const boxes = connectedBoxes(probability.data, probability.dims[3], probability.dims[2]);
  const lines = [];
  for (const box of boxes.slice(0, 100)) {
    const crop = cropImage(image, box, prepared.width, prepared.height);
    const recOutputs = await runtime.rec.run({ x: recTensor(crop) });
    const decoded = ctcDecode(recOutputs[runtime.rec.outputNames[0]], runtime.dictionary);
    if (!decoded.text || decoded.score < 0.25) continue;
    lines.push({
      text: decoded.text,
      score: decoded.score,
      x: crop.x1,
      y: crop.y1
    });
  }
  return lines;
}

async function recognizeDirectCrop(runtime, image, {
  x1,
  y1,
  x2,
  y2
}) {
  const crop = {
    image,
    x1: Math.max(0, Math.floor(image.width * x1)),
    y1: Math.max(0, Math.floor(image.height * y1)),
    x2: Math.min(image.width, Math.ceil(image.width * x2)),
    y2: Math.min(image.height, Math.ceil(image.height * y2))
  };
  const outputs = await runtime.rec.run({ x: recTensor(crop) });
  const decoded = ctcDecode(outputs[runtime.rec.outputNames[0]], runtime.dictionary);
  if (!decoded.text || decoded.score < 0.25) return null;
  return {
    text: decoded.text,
    score: decoded.score,
    x: crop.x1,
    y: crop.y1
  };
}

function cropWatermarkClock(image, {
  x1 = 0,
  y1 = 0.50,
  x2 = 0.42,
  y2 = 0.68
} = {}) {
  const left = Math.max(0, Math.floor(image.width * x1));
  const top = Math.max(0, Math.floor(image.height * y1));
  const right = Math.min(image.width, Math.ceil(image.width * x2));
  const bottom = Math.min(image.height, Math.ceil(image.height * y2));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = ((y + top) * image.width + left) * 4;
    data.set(image.data.subarray(sourceStart, sourceStart + width * 4), y * width * 4);
  }
  return { width, height, data };
}

export async function recognizePpOcrWasm(buffer, mimeType, {
  root = path.resolve(".")
} = {}) {
  const started = performance.now();
  runtimePromise ??= loadRuntime(root).catch((error) => {
    runtimePromise = null;
    throw error;
  });
  const runtime = await runtimePromise;
  const image = decodeImage(buffer, mimeType);
  const [lines, detectedTimeLines, focusedTimeLines, ...directTimeLines] = await Promise.all([
    recognizeRegion(runtime, image),
    recognizeRegion(runtime, cropWatermarkClock(image)),
    // The large clock sits below the date on recent watermark layouts. Keep
    // this crop independent so date/weather text cannot become a clock value.
    recognizeRegion(runtime, cropWatermarkClock(image, {
      x1: 0,
      y1: 0.60,
      x2: 0.14,
      y2: 0.79
    })),
    recognizeDirectCrop(runtime, image, {
      x1: 0,
      y1: 0.61,
      x2: 0.11,
      y2: 0.78
    }),
    recognizeDirectCrop(runtime, image, {
      x1: 0,
      y1: 0.58,
      x2: 0.18,
      y2: 0.79
    }),
    // Older watermark templates place the clock above the recent layout.
    // Keep it after the targeted crops so it can only supply a fallback.
    recognizeDirectCrop(runtime, image, {
      x1: 0,
      y1: 0.56,
      x2: 0.17,
      y2: 0.68
    })
  ]);
  // Small road signs lose detail when the full photo is reduced to DET_SIZE.
  // Overlapping scene crops retain their native resolution and omit the clock.
  if (image.width >= 1600 && image.width > image.height) {
    for (const [x1, x2] of [[0, 0.55], [0.45, 1]]) {
      const y1 = 0.16;
      const scene = cropWatermarkClock(image, { x1, y1, x2, y2: 0.62 });
      const sceneLines = await recognizeRegion(runtime, scene);
      for (const line of sceneLines) {
        const translated = {
          ...line,
          x: line.x + Math.floor(image.width * x1),
          y: line.y + Math.floor(image.height * y1)
        };
        if (!lines.some((existing) =>
          existing.text === translated.text
          && Math.abs(existing.x - translated.x) < 40
          && Math.abs(existing.y - translated.y) < 40
        )) lines.push(translated);
      }
    }
  }
  const timeLines = [
    ...directTimeLines.filter(Boolean),
    ...focusedTimeLines,
    ...detectedTimeLines
  ];
  return {
    ok: true,
    engine: "ppocrv6-tiny-wasm",
    width: image.width,
    height: image.height,
    lines,
    timeLines,
    confidence: lines.length
      ? lines.reduce((sum, line) => sum + line.score, 0) / lines.length * 100
      : 0,
    durationMs: Math.round(performance.now() - started)
  };
}

export function resetPpOcrWasmForTests() {
  runtimePromise = null;
}
