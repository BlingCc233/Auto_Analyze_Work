import knowledge from "./history-knowledge.js";

export function normalizeKnowledgeText(value = "") {
  return String(value)
    .normalize("NFKC")
    .replace(/\r/g, "\n")
    .replace(/20\d{2}[-=./:]\d{1,2}[-=./:]\d{1,2}/g, " DATE ")
    .replace(/(?:^|[^\d])(?:[0-2]?\d)[:：.,·-][0-5]\d(?:\d)?(?!\d)/g, " TIME ")
    .replace(/(?:^|[^\d])(?:[0-2]\d)[0-5]\d(?!\d)/g, " TIME ")
    .replace(/星期[一二三四五六日天]/g, " WEEK ")
    .replace(/[晴阴雨雪雾多云]{1,3}\s*-?\d{1,2}\s*°?\s*[Cc]?/g, " WEATHER ")
    .replace(/防伪[^\n]*/g, "")
    .replace(/(?:今日水印|相机真实可验|相机\s*真实可验)/g, "")
    .replace(/工作单位[：:][^\n]*/g, "")
    .replace(/(?:备注|线路名称|线路)[：:][^\n]*(?:\n[SG]\d{1,4}[^\n]*)?/g, "")
    .replace(/海拔[：:]?\s*[\d.,，。]+\s*米?/g, "")
    .replace(/\b[A-Z0-9]{12,}\b/g, "")
    .replace(/\s+/g, "")
    .replace(/[，,。；;：:（）()【】[\]°]/g, "")
    .toLowerCase();
}

function ngrams(value, size = 2) {
  const compact = normalizeKnowledgeText(value);
  if (!compact) return new Set();
  if (compact.length <= size) return new Set([compact]);
  const result = new Set();
  for (let index = 0; index <= compact.length - size; index += 1) {
    result.add(compact.slice(index, index + size));
  }
  return result;
}

function similarity(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const containment = intersection / Math.min(left.size, right.size);
  const dice = (2 * intersection) / (left.size + right.size);
  return containment * 0.62 + dice * 0.38;
}

const indexedKnowledge = knowledge.map((item) => ({
  ...item,
  tokens: ngrams(item.normalizedText)
}));

export function matchHistoricalKnowledge(ocrText = "") {
  const normalizedText = normalizeKnowledgeText(ocrText);
  if (!normalizedText) return null;
  const tokens = ngrams(normalizedText);
  const matches = indexedKnowledge
    .map((item) => ({ item, score: similarity(tokens, item.tokens) }))
    .sort((left, right) => right.score - left.score);
  const best = matches[0];
  if (!best || best.score < 0.9) return null;
  const second = matches[1];
  return {
    ...best.item,
    score: best.score,
    margin: best.score - (second?.score ?? 0)
  };
}
