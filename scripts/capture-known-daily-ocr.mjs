import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recognizeNativeImage } from "../server/native-ocr.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const truth = JSON.parse(fs.readFileSync(path.join(root, "data/known-daily-ground-truth.json"), "utf8"));
const rows = [];
for (const [index, [folder, name]] of truth.entries()) {
  const file = path.join(root, "daily", folder, name);
  const mimeType = path.extname(file).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  const result = await recognizeNativeImage({
    mimeType,
    dataBase64: fs.readFileSync(file).toString("base64")
  }, { root });
  rows.push({
    file: `daily/${folder}/${name}`,
    text: result.ocrText || "",
    timeText: result.timeOcrText || ""
  });
  if ((index + 1) % 10 === 0 || index + 1 === truth.length) {
    console.error(`known daily ${index + 1}/${truth.length}`);
  }
}
fs.writeFileSync(
  path.join(root, "data/known-daily-ppocrv6-ocr.json"),
  `${JSON.stringify(rows, null, 2)}\n`
);
console.log(`已生成 ${rows.length} 张已知 daily 的 PP-OCRv6 缓存。`);
