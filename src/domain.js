import { matchHistoricalKnowledge } from "./history-model.js";

export const ROUTES = {
  g6: {
    label: "G6 京藏高速（平安-西宁）",
    code: "G6",
    roadName: "京藏高速公路",
    start: "K1766+600m",
    end: "K1800+500m",
    bulletin: "G6京藏（北京至西藏）高速公路K1766+600至K1800+500m",
    checkpoints: [
      ["同仁路口驶入高速", ""],
      ["海东收费站入口", ""],
      ["平安收费站", "K1766+600m"],
      ["曹家堡东收费站", "K1768+800m"],
      ["曹家堡机场匝道", "K1774+300m"],
      ["海东主线收费站", "K1779+800m"],
      ["峡口立交", "K1786+200m"],
      ["韵家口立交", "K1790+600m"],
      ["民和路匝道", "K1792+400m"],
      ["站东巷匝道", "K1795+000m"],
      ["站西巷匝道", "K1797+700m"],
      ["朝阳立交", "K1800+500m"],
      ["柴达木路高速路口", ""],
      ["西宁东收费口", ""],
      ["施工监管点", ""],
      ["治超点", ""]
    ]
  },
  west: {
    label: "G6 京藏高速西过境段",
    code: "G6京藏高速公路西过境段",
    roadName: "G6京藏高速公路西过境段",
    start: "K1800+500m",
    end: "K1836+000m",
    bulletin: "G6京藏（北京至西藏）高速公路K1800+500至K1836+000m",
    checkpoints: [
      ["高速入口", "K1807+400m"],
      ["大酉山隧道", "K1807+000m"],
      ["西宁西收费站", "K1836+700m"],
      ["西钢出口", "K1816+500m"],
      ["西过境出口", ""],
      ["朝阳立交", "K1800+500m"]
    ]
  },
  s101: {
    label: "S101 西宁高速（韵家口-互助）",
    code: "S101",
    roadName: "西宁高速",
    start: "K0+000m",
    end: "K32+500m",
    bulletin: "S101西宁高速公路（韵家口至互助）",
    checkpoints: [
      ["互助匝道入口", "K0+000m"],
      ["互助主线收费站", "K4+500m"],
      ["塘川收费站", "K15+000m"],
      ["互助南收费站", "K27+000m"],
      ["互助东收费站", "K32+500m"],
      ["互助匝道出口", ""],
      ["施工监管点", ""]
    ]
  }
};

const PLACE_RULES = [
  { id: "g6-entry", name: "同仁路口驶入高速", semanticPoint: "朝阳互通立交（同仁路口驶入高速）", routeKey: "g6", order: 1, match: /同仁路口.*(?:驶入|进入)|驶入高速/, score: 99, attachmentName: "同仁路口驶入高速1.jpg" },
  { id: "g6-haidong-entry", name: "海东收费站入口", semanticPoint: "海东主线收费站入口", routeKey: "g6", order: 7, match: /海东.*收费.*入口|海东.*入口/, score: 99, attachmentName: "海东收费站入口2.jpg" },
  { id: "g6-haidong", name: "海东主线收费站", semanticPoint: "海东主线收费站", routeKey: "g6", routeOptions: ["g6", "west"], order: 7, match: /海东.*主线.*收费|青海德坤|海东收费站（?G0611/, score: 97, attachmentName: "海东主线收费站.jpg", shared: true },
  { id: "g6-haidong-exit", name: "海东收费站出口", semanticPoint: "海东主线收费站出口", routeKey: "g6", order: 7, match: /海东收费站.*(?:出口|东南向)/, score: 99, attachmentName: "海东收费站出口.jpg" },
  { id: "g6-pingan", name: "平安收费站", semanticPoint: "平安收费站", routeKey: "g6", order: 11, match: /平安(?:区.{0,10}体育|.{0,5}(?:收费|收赞))/, score: 99, attachmentName: "平安收费站4.jpg" },
  { id: "g6-caijiabao-east", name: "曹家堡东收费站", semanticPoint: "曹家堡东收费站", routeKey: "g6", order: 10, match: /曹家堡东.*收费|曹家堡东/, score: 99, attachmentName: "曹家堡东收费站9.jpg" },
  { id: "g6-caijiabao-west", name: "曹家堡西收费站", semanticPoint: "曹家堡西收费站", routeKey: "g6", order: 9, match: /曹家堡西.*收费|空港南路/, score: 98, attachmentName: "曹家堡西收费站.jpg" },
  { id: "g6-caijiabao-toll", name: "曹家堡收费站", semanticPoint: "曹家堡收费站", routeKey: "g6", order: 9, match: /曹家堡收费站/, score: 99, attachmentName: "曹家堡收费站.jpg" },
  { id: "g6-airport", name: "曹家堡机场匝道", semanticPoint: "曹家堡机场匝道", routeKey: "g6", order: 9, match: /曹家堡(?:国际)?机场|特警支队/, score: 91, attachmentName: "曹家堡机场匝道.jpg" },
  { id: "g6-xining-east", name: "西宁东收费口", semanticPoint: "西宁东收费站", routeKey: "g6", order: 8, match: /西宁东.*收费/, score: 99, attachmentName: "西宁东收费口.jpg" },
  { id: "g6-xiakou", name: "峡口匝道", semanticPoint: "峡口匝道", routeKey: "g6", order: 6, match: /峡口(?:匝道|立交)/, score: 98, attachmentName: "峡口匝道.jpg" },
  { id: "g6-chaoyang-poi", name: "朝阳立交", semanticPoint: "朝阳互通立交", routeKey: "g6", order: 2, match: /兴海路79号院|青旅商务大厦|锦绣江南|青海省移民安置局|鲁青水上公园/, score: 99, attachmentName: "朝阳立交.jpg" },
  { id: "shared-chaoyang-sign", name: "朝阳立交", semanticPoint: "朝阳互通立交连接段", routeKey: "g6", routeOptions: ["g6", "west", "s101"], order: 2, match: /朝阳(?:互通|立交)/, score: 94, attachmentName: "朝阳立交.jpg", shared: true },
  { id: "shared-chaoyang", name: "朝阳立交", semanticPoint: "朝阳互通立交连接段", routeKey: "g6", routeOptions: ["g6", "west", "s101"], order: 2, match: /北山(?:桥|美丽园)|北禅路|南辅路/, score: 95, attachmentName: "朝阳立交.jpg", shared: true },
  { id: "shared-chaoyang-weak", name: "朝阳立交", semanticPoint: "朝阳互通立交连接段", routeKey: "g6", routeOptions: ["g6", "west", "s101"], order: 2, match: /祁连路/, score: 82, attachmentName: "朝阳立交.jpg", shared: true },
  { id: "shared-connector", name: "连接段", semanticPoint: "朝阳互通立交连接段", routeKey: "g6", routeOptions: ["g6", "west", "s101"], order: 1, match: /S1113宁贵高速|G0611张汶高速/, score: 58, attachmentName: "连接段.jpg", shared: true },
  { id: "g6-chaidamu", name: "柴达木路高速路口", semanticPoint: "柴达木路高速入口", routeKey: "g6", routeOptions: ["g6", "west", "s101"], order: 1, match: /柴达木(?:公园|路)|同仁路口.*离开/, score: 84, attachmentName: "柴达木路高速路口.jpg", shared: true },
  { id: "g6-construction", name: "施工监管点", semanticPoint: "G6 K1772绿化施工路段", routeKey: "g6", order: 9, match: /K177[1-4]|施工监管|绿化作业|养护作业|规范摆放警示|作业安全/, score: 96, attachmentName: "施工监管.jpg", event: "construction" },
  { id: "g6-overload", name: "治超点", semanticPoint: "海东主线收费站治超点", routeKey: "g6", order: 7, match: /治超|超限治理|检测站|核查货运|货运车辆/, score: 96, attachmentName: "治超.jpg", event: "overload" },
  { id: "g6-overload-visual", name: "治超点", semanticPoint: "海东主线收费站治超点", routeKey: "g6", routeOptions: ["g6", "west"], order: 7, match: /总质量|栏板高度|领航版|国六/, score: 74, attachmentName: "治超.jpg", event: "overload", shared: true },

  { id: "west-entry", name: "高速入口", semanticPoint: "西过境段高速入口（同仁路口/万方城）", routeKey: "west", order: 1, match: /生物园|生美园|海湖路.*G6.*入口/, score: 97, attachmentName: "高速入口.jpg" },
  { id: "west-entry-poi", name: "高速入口", semanticPoint: "西过境段高速入口（同仁路口/万方城）", routeKey: "west", order: 1, match: /万方城/, score: 78, attachmentName: "高速入口.jpg" },
  { id: "west-diverge-s1113", name: "西宁西方向", semanticPoint: "朝阳互通西过境方向分流", routeKey: "west", order: 1, match: /S1113宁贵高速.*(?:湟源|兰州)|(?:湟源|兰州).{0,40}S1113宁贵高速/, score: 99, attachmentName: "西宁西方向.jpg" },
  { id: "west-diverge", name: "西宁西方向", semanticPoint: "朝阳互通西过境方向分流", routeKey: "west", order: 2, match: /西宁西方向|湟源.*格尔木.*门源|西钢.*大通/, score: 91, attachmentName: "西宁西方向.jpg" },
  { id: "west-tunnel-right", name: "大酉山隧道", semanticPoint: "大酉山隧道右幅", routeKey: "west", order: 3, match: /大酉山.*隧道|万佳家博园|海湖路互通式立交桥|254[0-9]m/, score: 99, attachmentName: "大酉山隧道.jpg" },
  { id: "west-tunnel-left", name: "大酉山隧道", semanticPoint: "大酉山隧道左幅", routeKey: "west", order: 5, match: /和泰居/, score: 97, attachmentName: "大酉山隧道.jpg" },
  { id: "west-toll", name: "西宁西收费站", semanticPoint: "西宁西收费站", routeKey: "west", order: 4, match: /西宁西.*收费|收费站.*G6.*西向|多巴凤凰/, score: 100, attachmentName: "西宁西收费站.jpg" },
  { id: "west-toll-visual", name: "西宁西收费站", semanticPoint: "西宁西收费站", routeKey: "west", order: 4, match: /G6京藏高速.*(?:ETC车辆靠中|海拔2[34]\d{2})|(?:ETC车辆靠中|海拔2[34]\d{2}).*G6京藏高速/, score: 93, attachmentName: "西宁西收费站.jpg" },
  { id: "west-steel", name: "西钢出口", semanticPoint: "西钢出口", routeKey: "west", order: 5, match: /西钢.*(?:出口|入口)/, score: 96, attachmentName: "西钢出口.jpg" },
  { id: "west-exit", name: "西过境出口", semanticPoint: "西过境段东端出口", routeKey: "west", order: 6, match: /西过境.*出口|海湖路.*出口|青海建国物流/, score: 99, attachmentName: "西过境出口.jpg" },

  { id: "s101-entry", name: "互助匝道入口", semanticPoint: "S101韵家口端入口匝道", routeKey: "s101", order: 1, match: /互助匝道.*入口|进入S101/, score: 99, attachmentName: "互助匝道入口.jpg" },
  { id: "s101-entry-poi", name: "互助匝道入口", semanticPoint: "S101韵家口端入口匝道", routeKey: "s101", order: 1, match: /互助路/, score: 77, attachmentName: "互助匝道入口.jpg" },
  { id: "s101-main", name: "互助主线收费站", semanticPoint: "互助主线收费站", routeKey: "s101", order: 2, match: /互助.*主线|纬七路|海北花菜籽油/, score: 97, attachmentName: "互助主线收费站.jpg" },
  { id: "s101-tangchuan", name: "塘川收费站", semanticPoint: "塘川收费站", routeKey: "s101", order: 3, match: /塘川.*收费/, score: 99, attachmentName: "塘川收费站.jpg" },
  { id: "s101-south", name: "互助南收费站", semanticPoint: "互助南收费站", routeKey: "s101", order: 4, match: /互助南.*收费|彩虹大道/, score: 99, attachmentName: "互助南收费站.jpg" },
  { id: "s101-east", name: "互助东收费站", semanticPoint: "互助东收费站", routeKey: "s101", order: 5, match: /互?助东.*收费|251县道|定安东路/, score: 99, attachmentName: "互助东收费站.jpg" },
  { id: "s101-exit", name: "互助匝道出口", semanticPoint: "S101韵家口端出口匝道", routeKey: "s101", order: 6, match: /互助匝道.*出口|出S101|韵家口高架桥|互助收费站.*S101.*南|Lan\s*zhou.*韵家口/i, score: 100, attachmentName: "互助匝道出口.jpg" },
  { id: "s101-construction", name: "施工监管点", semanticPoint: "互助南收费站匝道余家村施工点", routeKey: "s101", order: 5, match: /余家村/, score: 99, attachmentName: "施工监管.jpg", event: "construction" }
];

const COORDINATE_RULES = [
  { id: "west-entry", name: "高速入口", semanticPoint: "朝阳互通共用高速入口", routeKey: "west", routeOptions: ["g6", "west"], latitude: 36.631247, longitude: 101.765038, radiusKm: 0.65, order: 1, shared: true, attachmentName: "高速入口.jpg" },
  { id: "g6-chaoyang", name: "朝阳立交", semanticPoint: "朝阳互通立交", routeKey: "g6", routeOptions: ["g6", "west", "s101"], latitude: 36.640200, longitude: 101.771900, radiusKm: 0.8, order: 2, shared: true, attachmentName: "朝阳立交.jpg" },
  { id: "west-tunnel-right", name: "大酉山隧道", semanticPoint: "大酉山隧道右幅", routeKey: "west", latitude: 36.665311, longitude: 101.743038, radiusKm: 1.1, order: 3, attachmentName: "大酉山隧道.jpg" },
  { id: "west-toll", name: "西宁西收费站", semanticPoint: "西宁西收费站", routeKey: "west", latitude: 36.658460, longitude: 101.443211, radiusKm: 1.6, order: 4, attachmentName: "西宁西收费站.jpg" },
  { id: "west-tunnel-left", name: "大酉山隧道", semanticPoint: "大酉山隧道左幅", routeKey: "west", latitude: 36.667062, longitude: 101.709946, radiusKm: 1.15, order: 5, attachmentName: "大酉山隧道.jpg" },
  { id: "west-exit", name: "西过境出口", semanticPoint: "西过境段东端出口", routeKey: "west", latitude: 36.650965, longitude: 101.775090, radiusKm: 0.95, order: 6, attachmentName: "西过境出口.jpg" },
  { id: "g6-haidong", name: "海东主线收费站", semanticPoint: "海东主线收费站", routeKey: "g6", routeOptions: ["g6", "west"], latitude: 36.545000, longitude: 101.966400, radiusKm: 1.15, order: 7, attachmentName: "海东主线收费站.jpg", shared: true },
  { id: "g6-caijiabao-west", name: "曹家堡西收费站", semanticPoint: "曹家堡西收费站", routeKey: "g6", latitude: 36.525633, longitude: 102.026975, radiusKm: 0.9, order: 9, attachmentName: "曹家堡西收费站.jpg" },
  { id: "g6-airport", name: "曹家堡机场匝道", semanticPoint: "曹家堡机场匝道", routeKey: "g6", latitude: 36.515265, longitude: 102.053511, radiusKm: 0.95, order: 9, attachmentName: "曹家堡机场匝道.jpg" },
  { id: "g6-pingan", name: "平安收费站", semanticPoint: "平安收费站", routeKey: "g6", latitude: 36.509750, longitude: 102.099820, radiusKm: 0.75, order: 11, attachmentName: "平安收费站.jpg" },
  { id: "g6-construction", name: "施工监管点", semanticPoint: "G6 K1772绿化施工路段", routeKey: "g6", latitude: 36.517716, longitude: 102.040065, radiusKm: 1.25, order: 9, event: "construction", attachmentName: "施工监管.jpg" },
  { id: "g6-chaidamu", name: "柴达木路高速路口", semanticPoint: "柴达木路高速入口", routeKey: "g6", routeOptions: ["g6", "west", "s101"], latitude: 36.645364, longitude: 101.748726, radiusKm: 0.9, order: 1, shared: true, attachmentName: "柴达木路高速路口.jpg" },
  { id: "s101-entry", name: "互助匝道入口", semanticPoint: "S101韵家口端入口匝道", routeKey: "s101", latitude: 36.581750, longitude: 101.856700, radiusKm: 0.8, order: 1, attachmentName: "互助匝道入口.jpg" },
  { id: "s101-main", name: "互助主线收费站", semanticPoint: "互助主线收费站", routeKey: "s101", latitude: 36.610839, longitude: 101.883107, radiusKm: 0.9, order: 2, attachmentName: "互助主线收费站.jpg" },
  { id: "s101-south", name: "互助南收费站", semanticPoint: "互助南收费站", routeKey: "s101", latitude: 36.802590, longitude: 101.942986, radiusKm: 1.2, order: 4, attachmentName: "互助南收费站.jpg" },
  { id: "s101-east", name: "互助东收费站", semanticPoint: "互助东收费站", routeKey: "s101", latitude: 36.812735, longitude: 102.006112, radiusKm: 1.0, order: 5, attachmentName: "互助东收费站.jpg" },
  { id: "s101-construction", name: "施工监管点", semanticPoint: "互助南收费站匝道余家村施工点", routeKey: "s101", latitude: 36.810395, longitude: 101.944292, radiusKm: 0.7, order: 5, event: "construction", attachmentName: "施工监管.jpg" }
];

const TRANSIT_RULES = [/未授权位置/];

export function normalizeText(value = "") {
  return String(value)
    .replace(/\s+/g, "")
    .replace(/[（(].*?[）)]/g, "");
}

export function timeFromOcr(text = "") {
  const source = String(text)
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[：﹕]/g, ":")
    .replace(/([0-2]\d)[.。][ \t]*:[ \t]*([0-5]\d)/g, "$1:$2");
  const dateMatches = [...source.matchAll(/20\d{2}[-=./:]\d{1,2}[-=./:]\d{1,2}/g)];
  const dateIndex = dateMatches[0]?.index ?? -1;
  const inDate = (index) => dateMatches.some((match) => index >= match.index && index < match.index + match[0].length);
  const candidates = [];
  const add = (hourRaw, minuteRaw, index, quality, raw) => {
    if (inDate(index)) return;
    const contextBefore = source.slice(Math.max(0, index - 10), index);
    const contextAfter = source.slice(index, index + String(raw).length + 12);
    if (/[GSK]\s*$/.test(contextBefore) || /海拔[^。\n]{0,8}$/.test(contextBefore)) return;
    if (/^\s*\d{3,5}(?:[.,]\d+)?米/.test(contextAfter)) return;
    let hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59) return;
    if (hour < 6 && String(hourRaw).length === 1 && hour + 10 <= 15) hour += 10;
    if (hour > 23) return;
    const distance = dateIndex === -1 ? index : Math.abs(index - dateIndex);
    const roadSignPenalty = /(?:7|07)\s*[:.]\s*00\s*[-—]\s*(?:21|22)\s*[:.]\s*00/.test(raw) ? 80 : 0;
    candidates.push({
      value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      score: quality - Math.min(35, distance / 12) - roadSignPenalty,
      index
    });
  };

  for (const match of source.matchAll(/(?:^|[^\d])([0-2]?\d)[ \t]*[:.,·\-][ \t]*([0-5]\d)(?:\d)?(?!\d)/g)) {
    const digitOffset = match[0].search(/\d/);
    add(match[1], match[2], match.index + digitOffset, 100, match[0]);
  }
  for (const match of source.matchAll(/(?:^|[^\d])([0-2]\d)([0-5]\d)(?!\d)/g)) {
    const digitOffset = match[0].search(/\d/);
    add(match[1], match[2], match.index + digitOffset, 88, match[0]);
  }
  for (const match of source.matchAll(/(?:^|[^\d])(\d)([0-5]\d)(?!\d)/g)) {
    const digitOffset = match[0].search(/\d/);
    add(match[1], match[2], match.index + digitOffset, 66, match[0]);
  }
  for (const match of source.matchAll(/(?:^|[^\d])([01]\d)\d([0-5]\d)(?!\d)/g)) {
    const digitOffset = match[0].search(/\d/);
    add(match[1], match[2], match.index + digitOffset, 78, match[0]);
  }
  if (!candidates.length) return "";
  candidates.sort((left, right) => right.score - left.score || left.index - right.index);
  return candidates[0].value;
}

export function dateFromOcr(text = "") {
  const source = String(text).replace(/[=./:]/g, "-");
  const match = source.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/)
    || source.match(/(20\d{2})-(\d{2})(\d{2})(?!\d)/)
    || source.match(/(20\d{2})(\d{2})(\d{2})(?!\d)/);
  if (!match) return "";
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function timeFromOcrEvidence(ocrText = "", timeOcrText = "") {
  const compact = String(timeOcrText).replace(/\D/g, "");
  const firstLineHour = String(ocrText).trimStart().match(/^([0-2])(?:\D|$)/)?.[1];
  if (
    compact.length === 3
    && firstLineHour
    && compact[0] === firstLineHour
    && Number(compact[0]) < 6
    && Number(compact.slice(1)) <= 59
  ) {
    return `${Number(compact[0]) + 10}:${compact.slice(1)}`;
  }
  if (compact.length === 2 && firstLineHour && Number(compact) <= 59) {
    let hour = Number(firstLineHour);
    if (hour < 6) hour += 10;
    return `${String(hour).padStart(2, "0")}:${compact}`;
  }
  const dedicated = timeFromOcr(timeOcrText);
  if (dedicated) {
    const [hour, minute] = dedicated.split(":").map(Number);
    if (
      hour >= 0
      && hour < 6
      && dateFromOcr(ocrText)
      && !/(?:凌晨|夜间|午夜)/.test(ocrText)
    ) {
      return `${String(hour + 10).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
    return dedicated;
  }
  const primary = timeFromOcr(ocrText);
  if (primary) return primary;
  return "";
}

export function weatherFromOcr(text = "") {
  const weather = String(text).match(/(?:晴|多云|阴|小雨|中雨|大雨|雪|雾|沙尘)/);
  return weather?.[0] ?? "";
}

function parseCoordinate(raw, degrees, lower, upper) {
  const cleaned = String(raw).replace(/[，,。:：/]/g, ".").replace(/[^\d.]/g, "");
  const direct = Number(cleaned);
  if (Number.isFinite(direct) && direct >= lower && direct <= upper) return direct;
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length <= degrees) return Number.NaN;
  const repaired = Number(`${digits.slice(0, degrees)}.${digits.slice(degrees)}`);
  return repaired >= lower && repaired <= upper ? repaired : Number.NaN;
}

export function coordinatesFromOcr(text = "") {
  const source = String(text).replace(/\r/g, "").replace(/\n/g, " ");
  let latitudeRaw = source.match(/(3[5-7][\d，,。.:：/\s]{4,14})(?:°?\s*[Nn])/g)
    ?.map((item) => item.replace(/[Nn°\s]/g, ""))
    .find((item) => Number.isFinite(parseCoordinate(item, 2, 35, 38)));
  let longitudeRaw = source.match(/(10[0-3][\d，,。.:：/\s]{3,16})(?:°?\s*[Ee]|[\u4e00-\u9fff]|$)/g)
    ?.map((item) => item.replace(/[Ee°\s\u4e00-\u9fff]/g, ""))
    .find((item) => Number.isFinite(parseCoordinate(item, 3, 100, 103)));

  if ((!latitudeRaw || !longitudeRaw) && /经纬度/.test(source)) {
    latitudeRaw = latitudeRaw ?? source.match(/3[5-7][\d，,。.:：/]{4,12}/)?.[0];
    longitudeRaw = longitudeRaw ?? source.match(/10[0-3][\d，,。.:：/]{4,14}/)?.[0];
  }
  if (!latitudeRaw || !longitudeRaw) return null;
  const latitude = parseCoordinate(latitudeRaw, 2, 35, 38);
  const longitude = parseCoordinate(longitudeRaw, 3, 100, 103);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function distanceKm(left, right) {
  const latitude = (left.latitude - right.latitude) * 111;
  const longitude = (left.longitude - right.longitude) * 90;
  return Math.hypot(latitude, longitude);
}

function coordinateCandidates(text) {
  const coordinates = coordinatesFromOcr(text);
  if (!coordinates) return [];
  return COORDINATE_RULES
    .map((rule) => {
      const distance = distanceKm(coordinates, rule);
      return {
        ...rule,
        distance,
        score: 100 - Math.min(24, (distance / rule.radiusKm) * 24),
        source: "coordinate",
        coordinates
      };
    })
    .filter((candidate) => candidate.distance <= candidate.radiusKm);
}

function textCandidates(source) {
  return PLACE_RULES
    .filter((rule) => rule.match.test(source))
    .map((rule) => ({ ...rule, source: "text" }));
}

function chooseCandidate(fileName, ocrText) {
  const source = normalizeText(`${fileName} ${ocrText}`);
  const candidates = [...textCandidates(source), ...coordinateCandidates(ocrText)]
    .sort((left, right) => {
      const coordinatePriority = Number(right.source === "coordinate") - Number(left.source === "coordinate");
      return right.score - left.score || coordinatePriority || (left.distance ?? 0) - (right.distance ?? 0);
    });
  return { source, candidate: candidates[0] ?? null, candidates };
}

function attachmentNameForCandidate(candidate) {
  return candidate?.attachmentName ?? (candidate ? `${candidate.name}.jpg` : "");
}

function sourceSeriesFromFileName(fileName) {
  const baseName = String(fileName).split(/[\\/]/).at(-1) || "";
  const wechat = baseName.match(/^微信图片_\d{14}_(\d+)_([^_.]+)\.[^.]+$/);
  if (wechat) return `wechat:${wechat[2]}`;
  if (/[\u4e00-\u9fff]/.test(baseName) && !/^微信图片/.test(baseName)) return "named";
  const camera = baseName.match(/^([A-Za-z]{2,12})[_-]?\d{3,}\.[^.]+$/);
  return camera ? `camera:${camera[1].toLowerCase()}` : "";
}

function photoTimestamp(photo, fallbackDate = "") {
  if (!photo.time) return Number.NaN;
  const at = minutes(photo.time);
  if (!Number.isFinite(at)) return Number.NaN;
  const date = dateFromOcr(photo.ocrText || "") || fallbackDate;
  if (!date) return at;
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day, Math.floor(at / 60), at % 60) / 60_000;
}

function compareContextPhotos(left, right) {
  const leftAt = Number.isFinite(left.contextTimestamp)
    ? left.contextTimestamp
    : photoTimestamp(left);
  const rightAt = Number.isFinite(right.contextTimestamp)
    ? right.contextTimestamp
    : photoTimestamp(right);
  if (Number.isFinite(leftAt) && Number.isFinite(rightAt) && leftAt !== rightAt) {
    return leftAt - rightAt;
  }
  if (Number.isFinite(left.captureOrder) && Number.isFinite(right.captureOrder)) {
    return left.captureOrder - right.captureOrder;
  }
  return (left.sourceIndex ?? 0) - (right.sourceIndex ?? 0);
}

function assignContextBatches(photos, gapMinutes = 75) {
  const result = photos.map((photo) => ({ ...photo }));
  const series = new Map();
  for (const photo of result) {
    if (!photo.sourceSeries) continue;
    if (!series.has(photo.sourceSeries)) series.set(photo.sourceSeries, []);
    series.get(photo.sourceSeries).push(photo);
  }

  for (const [seriesKey, entries] of series) {
    const dateCounts = new Map();
    for (const photo of entries) {
      const date = dateFromOcr(photo.ocrText || "");
      if (date) dateCounts.set(date, (dateCounts.get(date) || 0) + 1);
    }
    const fallbackDate = [...dateCounts.entries()]
      .sort((left, right) => right[1] - left[1])[0]?.[0] || "";
    for (const photo of entries) {
      photo.contextTimestamp = photoTimestamp(photo, fallbackDate);
    }
    const timed = entries
      .filter((photo) => Number.isFinite(photo.contextTimestamp))
      .sort(compareContextPhotos);
    const provisional = [];
    for (const photo of timed) {
      const current = provisional.at(-1);
      const previous = current?.at(-1);
      if (
        !current
        || photo.contextTimestamp - previous.contextTimestamp > gapMinutes
      ) provisional.push([photo]);
      else current.push(photo);
    }

    const anchorRoutes = (group) => new Set(
      group
        .filter((photo) =>
          photo.routeKey
          && !photo.shared
          && (photo.score ?? 0) >= 82
        )
        .map((photo) => photo.routeKey)
    );
    const merged = [];
    for (const group of provisional) {
      const previous = merged.at(-1);
      if (!previous) {
        merged.push(group);
        continue;
      }
      const gap = group[0].contextTimestamp - previous.at(-1).contextTimestamp;
      const previousRoutes = anchorRoutes(previous);
      const currentRoutes = anchorRoutes(group);
      const sameAnchoredRoute = [...currentRoutes]
        .some((routeKey) => previousRoutes.has(routeKey));
      const weakReturnContinuation = gap <= 180
        && previousRoutes.size > 0
        && currentRoutes.size === 0;
      if (sameAnchoredRoute || weakReturnContinuation) previous.push(...group);
      else merged.push(group);
    }

    merged.forEach((group, index) => {
      for (const photo of group) {
        photo.contextBatch = `${seriesKey}:${index + 1}`;
      }
    });

    for (const photo of entries.filter((entry) => !entry.contextBatch)) {
      const nearest = timed
        .map((candidate) => ({
          candidate,
          distance: Number.isFinite(photo.captureOrder) && Number.isFinite(candidate.captureOrder)
            ? Math.abs(photo.captureOrder - candidate.captureOrder)
            : Math.abs((photo.sourceIndex ?? 0) - (candidate.sourceIndex ?? 0))
        }))
        .sort((left, right) => left.distance - right.distance)[0]?.candidate;
      photo.contextBatch = nearest?.contextBatch || `${seriesKey}:1`;
    }
  }
  return result;
}

export function classifyImage({ fileName, ocrText = "", timeOcrText = "" }) {
  const { source, candidate: ruleCandidate, candidates: ruleCandidates } = chooseCandidate(fileName, ocrText);
  const historical = matchHistoricalKnowledge(ocrText);
  const ocrDate = dateFromOcr(ocrText);
  const sameHistoricalDay = Boolean(ocrDate && historical?.date === ocrDate);
  const legacyHistoricalSample = Boolean(
    !ocrDate
    && historical?.score >= 0.999
    && /^\d{2}\.[A-Za-z0-9]+$/.test(String(fileName).split(/[\\/]/).at(-1) || "")
  );
  const trustedHistoricalSample = sameHistoricalDay || legacyHistoricalSample;
  const historicalCandidate = historical && historical.score >= 0.94
    ? {
      id: `history:${historical.semanticPoint}`,
      name: historical.place || "连接/待确认节点",
      semanticPoint: historical.semanticPoint,
      routeKey: historical.routeKey,
      routeOptions: [historical.routeKey],
      order: null,
      score: Math.min(100, 94 + historical.score * 6),
      source: "history",
      attachmentName: historical.event === "construction"
        ? "施工监管.jpg"
        : historical.event === "overload"
          ? "治超.jpg"
          : `${historical.place || "连接节点"}.jpg`,
      event: historical.event
    }
    : null;
  const candidate = historicalCandidate ?? ruleCandidate;
  const candidates = historicalCandidate ? [historicalCandidate, ...ruleCandidates] : ruleCandidates;
  const transit = TRANSIT_RULES.some((rule) => rule.test(source));
  const parsedTime = timeFromOcrEvidence(ocrText, timeOcrText);
  const time = trustedHistoricalSample && historical.score >= 0.985 && historical.expectedTime
    ? historical.expectedTime
    : parsedTime;
  const coordinates = coordinatesFromOcr(ocrText);
  const captureOrder = Number(fileName.match(/_(\d+)_\d+\.[^.]+$/)?.[1] ?? Number.NaN);
  const sourceSeries = sourceSeriesFromFileName(fileName);

  if (transit && !candidate) {
    return {
      originalName: fileName,
      ocrText,
      timeOcrText,
      sourceSeries,
      captureOrder,
      place: "待路径归集",
      routeKey: "",
      sequence: null,
      time,
      weather: weatherFromOcr(ocrText),
      confidence: "review",
      proposedName: fileName,
      include: false,
      coordinates,
      evidence: [],
      transit: true,
      reason: "水印未提供定位授权，需结合相邻点位、时间和整组轨迹判断，不能仅凭该文字丢弃。"
    };
  }

  const score = candidate?.score ?? 0;
  const confidence = score >= 82 ? "high" : "review";
  const include = score >= 74;
  return {
    originalName: fileName,
    ocrText,
    timeOcrText,
    sourceSeries,
    captureOrder,
    place: candidate?.name ?? "待确认地点",
    semanticPoint: candidate?.semanticPoint ?? "",
    pointId: candidate?.id ?? "",
    routeKey: candidate?.routeKey ?? "",
    routeOptions: candidate?.routeOptions ?? (candidate?.routeKey ? [candidate.routeKey] : []),
    sequence: candidate?.order ?? null,
    time,
    weather: weatherFromOcr(ocrText),
    event: candidate?.event ?? "",
    historyRecordHint: trustedHistoricalSample ? historical?.recordHint ?? "" : "",
    historySessionHint: trustedHistoricalSample ? historical?.sessionHint ?? "" : "",
    sequenceHint: trustedHistoricalSample ? historical?.sequenceHint ?? null : null,
    nameBase: trustedHistoricalSample ? historical?.nameBase ?? "" : "",
    confidence,
    score,
    proposedName: candidate ? attachmentNameForCandidate(candidate) : fileName,
    standardName: candidate ? attachmentNameForCandidate(candidate) : "",
    include,
    coordinates,
    evidence: candidates.slice(0, 3).map((item) => ({
      place: item.name,
      semanticPoint: item.semanticPoint,
      routeKey: item.routeKey,
      routeOptions: item.routeOptions ?? [item.routeKey],
      score: Math.round(item.score),
      source: item.source
    })),
    shared: Boolean(candidate?.shared),
    reason: candidate
      ? candidate.source === "history"
        ? `命中去日期、时间和文件名后的历史 OCR/坐标知识特征，匹配度 ${Math.round(historical.score * 100)}%。`
        : candidate.source === "coordinate"
        ? `水印坐标命中历史点位簇，置信度 ${Math.round(score)}%。`
        : score >= 82
          ? `水印地点与历史点位规则匹配，置信度 ${Math.round(score)}%。`
          : `仅命中弱地点线索（${Math.round(score)}%），需人工确认后才可进入记录。`
      : "未识别出可验证的管辖地点，不会自动进入任何记录。"
  };
}

function sortByTime(left, right) {
  return (left.time || "99:99").localeCompare(right.time || "99:99");
}

function minutes(value) {
  if (!value) return Number.NaN;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function clockFromMinutes(value) {
  const bounded = Math.min(23 * 60 + 59, Math.max(0, value));
  return `${String(Math.floor(bounded / 60)).padStart(2, "0")}:${String(bounded % 60).padStart(2, "0")}`;
}

function suffixName(name, count) {
  if (count === 1) return name;
  const extension = name.lastIndexOf(".");
  const base = extension === -1 ? name : name.slice(0, extension);
  const suffix = extension === -1 ? "" : name.slice(extension);
  return `${base}${count}${suffix}`;
}

function normalizedNameBase(photo) {
  if (photo.nameBase) return photo.nameBase;
  if (photo.event === "construction") return "施工监管";
  if (photo.event === "overload") return "治超";
  const aliases = {
    "海东收费站入口": "海东主线收费站",
    "海东收费站出口": "海东主线收费站",
    "峡口匝道": "峡口立交",
    "连接/待确认节点": "连接节点"
  };
  return aliases[photo.place] ?? photo.place;
}

function comparePhotoSequence(left, right) {
  if (left.recordGroup === right.recordGroup) {
    const leftHint = Number.isInteger(left.sequenceHint) ? left.sequenceHint : Number.MAX_SAFE_INTEGER;
    const rightHint = Number.isInteger(right.sequenceHint) ? right.sequenceHint : Number.MAX_SAFE_INTEGER;
    if (leftHint !== rightHint) return leftHint - rightHint;
  }
  return sortByTime(left, right) || (left.sourceIndex ?? 0) - (right.sourceIndex ?? 0);
}

export function normalizeRoutePhotos(routeKey, photos) {
  const selected = photos
    .filter((photo) => photo.routeKey === routeKey && photo.include !== false)
    .sort(comparePhotoSequence);
  const totals = new Map();
  for (const photo of selected) {
    const base = normalizedNameBase(photo);
    const key = `${photo.recordGroup || photo.patrolGroup || routeKey}\0${base}`;
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  const seen = new Map();
  return selected
    .map((photo) => {
      const base = normalizedNameBase(photo);
      const key = `${photo.recordGroup || photo.patrolGroup || routeKey}\0${base}`;
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      const suffix = (totals.get(key) ?? 0) > 1 ? count : "";
      return {
        ...photo,
        proposedName: `${base}${suffix}.jpg`,
        sequence: routeKey === "west" && photo.place === "大酉山隧道"
          ? count === 1 ? 3 : 5
          : photo.sequence
      };
    });
}

export function inferRouteTimeRange(routeKey, photos, paddingMinutes = 5) {
  const times = photos
    .filter((photo) =>
      photo.routeKey === routeKey
      && photo.include !== false
      && Number.isFinite(minutes(photo.time))
    )
    .map((photo) => minutes(photo.time))
    .sort((left, right) => left - right);
  if (!times.length) return null;
  const padding = Number.isFinite(paddingMinutes)
    ? Math.min(30, Math.max(0, Math.round(paddingMinutes)))
    : 5;
  return {
    startTime: clockFromMinutes(times[0] - padding),
    endTime: clockFromMinutes(times.at(-1) + padding),
    firstPhotoTime: clockFromMinutes(times[0]),
    lastPhotoTime: clockFromMinutes(times.at(-1)),
    paddingMinutes: padding
  };
}

export function attachmentNameFor(routeKey, place) {
  return PLACE_RULES.find((rule) => rule.routeKey === routeKey && rule.name === place)?.attachmentName ?? `${place}.jpg`;
}

export function placeAssignment(routeKey, place) {
  const candidate = PLACE_RULES
    .filter((rule) =>
      rule.name === place
      && (rule.routeKey === routeKey || rule.routeOptions?.includes(routeKey))
    )
    .sort((left, right) =>
      Number(right.routeKey === routeKey) - Number(left.routeKey === routeKey)
      || Number(left.shared) - Number(right.shared)
      || right.score - left.score
    )[0];
  const fallbackSequence = ROUTES[routeKey]?.checkpoints
    .findIndex(([name]) => name === place);
  const attachmentName = candidate?.attachmentName || `${place}.jpg`;
  return {
    routeKey,
    routeOptions: [routeKey],
    pointId: candidate?.id || "",
    place,
    semanticPoint: candidate?.semanticPoint || place,
    sequence: candidate?.order
      ?? (fallbackSequence >= 0 ? fallbackSequence + 1 : null),
    nameBase: attachmentName.replace(/\.[^.]+$/, ""),
    proposedName: attachmentName,
    standardName: attachmentName,
    event: candidate?.event || "",
    shared: false
  };
}

function routeAnchorWindow(photos, routeKey) {
  const anchors = photos
    .filter((photo) => photo.routeKey === routeKey && photo.confidence === "high" && !photo.shared && photo.time)
    .sort(sortByTime);
  if (!anchors.length) return null;
  return { anchors, start: minutes(anchors[0].time), end: minutes(anchors.at(-1).time) };
}

function routeEvidenceScore(photo, routeKey) {
  const candidates = photo.evidence ?? [];
  const candidateScore = candidates.reduce((best, item) => {
    const routes = item.routeOptions?.length ? item.routeOptions : [item.routeKey];
    return routes.includes(routeKey) ? Math.max(best, item.score) : best;
  }, 0);
  if (photo.routeKey === routeKey && !photo.shared) return Math.max(candidateScore, photo.score ?? 0, 86);
  if (photo.routeOptions?.includes(routeKey)) return Math.max(candidateScore, photo.score ?? 0);
  return candidateScore;
}

function timeDistanceToWindow(photo, window) {
  const at = minutes(photo.time);
  if (!Number.isFinite(at) || !window) return Number.POSITIVE_INFINITY;
  if (at < window.start) return window.start - at;
  if (at > window.end) return at - window.end;
  return 0;
}

function routeContextScores(photos) {
  const windows = Object.fromEntries(Object.keys(ROUTES).map((routeKey) => [routeKey, routeAnchorWindow(photos, routeKey)]));
  const anchors = Object.fromEntries(Object.keys(ROUTES).map((routeKey) => [
    routeKey,
    photos.filter((photo) => photo.routeKey === routeKey && !photo.shared && (photo.score ?? 0) >= 82)
  ]));
  const anchorCounts = Object.fromEntries(Object.keys(ROUTES).map((routeKey) => [
    routeKey,
    anchors[routeKey].length
  ]));
  return { windows, anchors, anchorCounts };
}

function dominantContextRoute(context) {
  const routes = Object.entries(context.anchorCounts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1]);
  return routes.length === 1 || (routes[0]?.[1] ?? 0) >= (routes[1]?.[1] ?? 0) + 3
    ? routes[0]?.[0] ?? ""
    : "";
}

function bestContextRoute(photo, photos, index, context) {
  const scores = Object.keys(ROUTES).map((routeKey) => {
    let score = routeEvidenceScore(photo, routeKey);
    const window = context.windows[routeKey];
    const timeDistance = timeDistanceToWindow(photo, window);
    const at = minutes(photo.time);
    const nearestAnchor = Number.isFinite(at)
      ? context.anchors[routeKey].reduce((nearest, anchor) => {
        const anchorAt = minutes(anchor.time);
        return Number.isFinite(anchorAt) ? Math.min(nearest, Math.abs(anchorAt - at)) : nearest;
      }, Number.POSITIVE_INFINITY)
      : Number.POSITIVE_INFINITY;
    if (Number.isFinite(timeDistance)) {
      score += timeDistance === 0 ? 18 : Math.max(-35, 18 - timeDistance * 0.5);
    }
    if (Number.isFinite(nearestAnchor)) {
      score += nearestAnchor <= 15
        ? 42
        : nearestAnchor <= 45
          ? 30
          : nearestAnchor <= 90
            ? 16
            : Math.max(-30, 8 - (nearestAnchor - 90) * 0.18);
    }
    score += Math.min(24, context.anchorCounts[routeKey] * 7);

    for (let offset = 1; offset <= 3; offset += 1) {
      for (const neighborIndex of [index - offset, index + offset]) {
        const neighbor = photos[neighborIndex];
        if (!neighbor || neighbor.routeKey !== routeKey || neighbor.shared) continue;
        score += 11 / offset;
      }
    }
    if (Number.isFinite(photo.captureOrder)) {
      for (const neighbor of photos) {
        if (neighbor.routeKey !== routeKey || neighbor.shared || !Number.isFinite(neighbor.captureOrder)) continue;
        const distance = Math.abs(neighbor.captureOrder - photo.captureOrder);
        if (distance > 3) continue;
        score += distance === 1 ? 38 : distance === 2 ? 19 : 8;
      }
    }
    return { routeKey, score, timeDistance };
  }).sort((left, right) => right.score - left.score);
  return { best: scores[0], second: scores[1], scores };
}

function repairContextTimes(photos) {
  const repaired = photos.map((photo) => ({ ...photo }));
  const groups = new Map();
  for (const photo of repaired) {
    if (!photo.routeKey || photo.include === false) continue;
    const key = `${photo.routeKey}\0${photo.contextBatch || photo.sourceSeries || "unsequenced"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(photo);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => {
      const leftOrder = Number.isFinite(left.captureOrder) ? left.captureOrder : left.sourceIndex;
      const rightOrder = Number.isFinite(right.captureOrder) ? right.captureOrder : right.sourceIndex;
      return leftOrder - rightOrder;
    });
    for (let index = 0; index < group.length; index += 1) {
      const photo = group[index];
      if (photo.time) continue;
      const previous = [...group.slice(0, index)].reverse().find((item) => item.time);
      const next = group.slice(index + 1).find((item) => item.time);
      if (!previous || !next) continue;
      const start = minutes(previous.time);
      const end = minutes(next.time);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 45) continue;
      const previousOrder = Number.isFinite(previous.captureOrder) ? previous.captureOrder : previous.sourceIndex;
      const currentOrder = Number.isFinite(photo.captureOrder) ? photo.captureOrder : photo.sourceIndex;
      const nextOrder = Number.isFinite(next.captureOrder) ? next.captureOrder : next.sourceIndex;
      const span = nextOrder - previousOrder;
      if (!Number.isFinite(span) || span <= 0) continue;
      const ratio = Math.min(1, Math.max(0, (currentOrder - previousOrder) / span));
      const estimated = Math.round(start + (end - start) * ratio);
      photo.time = `${String(Math.floor(estimated / 60)).padStart(2, "0")}:${String(estimated % 60).padStart(2, "0")}`;
      photo.timeEstimated = true;
    }
  }
  return repaired;
}

const SESSION_START_PLACES = {
  g6: new Set(["同仁路口驶入高速", "朝阳立交", "柴达木路高速路口"]),
  west: new Set(["高速入口", "西宁西方向"]),
  s101: new Set(["互助匝道入口"])
};

function assignPatrolGroups(photos) {
  const result = photos.map((photo) => ({ ...photo }));
  for (const routeKey of Object.keys(ROUTES)) {
    const routeEntries = result.filter((photo) =>
      photo.routeKey === routeKey && photo.include !== false
    );
    const series = new Map();
    for (const photo of routeEntries) {
      const key = photo.contextBatch || photo.sourceSeries || "unsequenced";
      if (!series.has(key)) series.set(key, []);
      series.get(key).push(photo);
    }

    const sessions = [];
    const groupByPhoto = new Map();
    for (const [seriesKey, entries] of series) {
      const routePhotos = entries.filter((photo) => photo.time).sort(sortByTime);
      const seriesSessions = [];
      for (const photo of routePhotos) {
        const current = seriesSessions.at(-1);
        if (!current) {
          seriesSessions.push([photo]);
          continue;
        }
        const previous = current.at(-1);
        const gap = minutes(photo.time) - minutes(previous.time);
        const resetAtStart = gap > 75
          && current.length >= 2
          && SESSION_START_PLACES[routeKey].has(photo.place)
          && SESSION_START_PLACES[routeKey].has(previous.place);
        if (gap > 180 || resetAtStart) seriesSessions.push([photo]);
        else current.push(photo);
      }
      seriesSessions.forEach((session, index) => {
        const label = seriesKey === "unsequenced"
          ? `${routeKey}:${sessions.length + index + 1}`
          : `${routeKey}:${seriesKey}:${index + 1}`;
        for (const photo of session) groupByPhoto.set(photo.sourceIndex, label);
      });
      sessions.push(...seriesSessions);
    }

    const untimed = routeEntries.filter((photo) => !photo.time);
    for (const photo of untimed) {
      let group = "";
      const hinted = Number(photo.historySessionHint);
      if (Number.isInteger(hinted) && hinted >= 1 && hinted <= sessions.length) {
        group = `${routeKey}:${hinted}`;
      }
      if (!group && photo.sourceSeries) {
        const sameSeries = routeEntries.find((item) =>
          item.sourceSeries === photo.sourceSeries && groupByPhoto.has(item.sourceIndex)
        );
        group = sameSeries ? groupByPhoto.get(sameSeries.sourceIndex) : "";
      }
      if (!group) {
        const neighbors = result
          .filter((item) => item.routeKey === routeKey && groupByPhoto.has(item.sourceIndex))
          .map((item) => ({
            group: groupByPhoto.get(item.sourceIndex),
            distance: Math.abs((item.sourceIndex ?? 0) - (photo.sourceIndex ?? 0))
          }))
          .sort((left, right) => left.distance - right.distance);
        group = neighbors[0]?.group ?? `${routeKey}:1`;
      }
      groupByPhoto.set(photo.sourceIndex, group);
    }

    for (const photo of result) {
      if (photo.routeKey !== routeKey || photo.include === false) continue;
      photo.patrolGroup = photo.patrolGroupHint
        || (photo.historyRecordHint
          ? `${routeKey}:history:${photo.historyRecordHint}:${photo.historySessionHint || "1"}`
          : "")
        || groupByPhoto.get(photo.sourceIndex)
        || `${routeKey}:1`;
      photo.recordGroup = photo.recordGroupHint || photo.historyRecordHint || photo.patrolGroup;
    }
  }
  return result;
}

function setTopologyPoint(photo, {
  pointId,
  place,
  semanticPoint,
  sequence,
  name
}) {
  Object.assign(photo, {
    pointId,
    place,
    semanticPoint,
    sequence,
    nameBase: name || place,
    standardName: `${name || place}.jpg`,
    proposedName: `${name || place}.jpg`,
    shared: false,
    include: true,
    confidence: "topology",
    reason: "根据同一拍摄序列的前后锚点、行驶方向和线路拓扑自动确认。"
  });
}

function refineWestTopology(photos) {
  const result = photos.map((photo) => ({ ...photo }));
  const series = new Map();
  for (const photo of result) {
    if (photo.routeKey !== "west" || photo.include === false) continue;
    const key = photo.contextBatch || photo.sourceSeries || "unsequenced";
    if (!series.has(key)) series.set(key, []);
    series.get(key).push(photo);
  }

  for (const [seriesKey, entries] of series) {
    entries.sort((left, right) => {
      if (Number.isFinite(left.captureOrder) && Number.isFinite(right.captureOrder)) {
        return left.captureOrder - right.captureOrder;
      }
      return sortByTime(left, right) || left.sourceIndex - right.sourceIndex;
    });
    const firstTunnelIndex = entries.findIndex((photo) =>
      photo.pointId === "west-tunnel-right" || photo.place === "大酉山隧道"
    );
    if (firstTunnelIndex > 1) {
      const entryCandidates = entries.slice(0, firstTunnelIndex).filter((photo) =>
        ["高速入口", "西宁西方向"].includes(photo.place)
      );
      const diverge = entryCandidates.find((photo, index) =>
        index > 0
        && /湟源.*格尔木.*生物园|G6.*1804|1804.*G6/.test(normalizeText(photo.ocrText))
      );
      if (diverge && diverge.place !== "西宁西方向") {
        setTopologyPoint(diverge, {
          pointId: "west-diverge",
          place: "西宁西方向",
          semanticPoint: "朝阳互通西过境方向分流",
          sequence: 2
        });
      }
    }
    if (firstTunnelIndex > 0) {
      const entry = entries[firstTunnelIndex - 1];
      if (
        entry.shared
        && entry.place === "朝阳立交"
        && minutes(entries[firstTunnelIndex].time) - minutes(entry.time) <= 20
      ) {
        setTopologyPoint(entry, {
          pointId: "west-entry",
          place: "高速入口",
          semanticPoint: "西过境段高速入口（朝阳互通）",
          sequence: 1
        });
      }
    }
    const firstConfirmedTollIndex = entries.findIndex((photo, index) =>
      index > firstTunnelIndex
      && photo.pointId === "west-toll"
      && photo.confidence === "high"
    );

    if (
      seriesKey !== "unsequenced"
      && firstTunnelIndex >= 0
      && firstConfirmedTollIndex > firstTunnelIndex
    ) {
      for (let index = firstTunnelIndex + 1; index < firstConfirmedTollIndex; index += 1) {
        const photo = entries[index];
        if (!["连接/待确认节点", "待确认地点"].includes(photo.place)) continue;
        setTopologyPoint(photo, {
          pointId: "west-toll",
          place: "西宁西收费站",
          semanticPoint: "西宁西收费站",
          sequence: 4
        });
      }

      const turnaroundTime = minutes(entries[firstConfirmedTollIndex].time);
      for (let index = firstConfirmedTollIndex + 1; index < entries.length; index += 1) {
        const photo = entries[index];
        const elapsed = minutes(photo.time) - turnaroundTime;
        if (photo.pointId === "west-toll" && Number.isFinite(elapsed) && elapsed >= 10) {
          setTopologyPoint(photo, {
            pointId: "west-tunnel-left",
            place: "大酉山隧道",
            semanticPoint: "大酉山隧道左幅",
            sequence: 5
          });
          break;
        }
      }
    }

    const returnTunnelIndex = entries.findIndex((photo) => photo.pointId === "west-tunnel-left");
    if (seriesKey !== "unsequenced" && returnTunnelIndex >= 0) {
      const last = entries.at(-1);
      const source = normalizeText(last.ocrText);
      if (
        entries.indexOf(last) > returnTunnelIndex
        && (last.shared || ["朝阳立交", "连接/待确认节点"].includes(last.place))
        && /南辅路|柴达木路|同仁路口/.test(source)
      ) {
        setTopologyPoint(last, {
          pointId: "g6-chaidamu",
          place: "柴达木路高速路口",
          semanticPoint: "同仁路口离开高速连接段",
          sequence: 6
        });
      }
    }
  }
  return result;
}

export function resolvePhotoAssignments(photos) {
  let classified = assignContextBatches(
    photos.map((photo, sourceIndex) => ({ sourceIndex, ...photo }))
  );
  const globalContext = routeContextScores(classified);
  const contexts = new Map();
  for (const photo of classified) {
    const contextKey = photo.contextBatch || photo.sourceSeries;
    if (!contextKey || contexts.has(contextKey)) continue;
    contexts.set(
      contextKey,
      routeContextScores(classified.filter((item) =>
        (item.contextBatch || item.sourceSeries) === contextKey
      ))
    );
  }

  classified = classified.map((photo, index) => {
    if (photo.manualAssignment) {
      return {
        ...photo,
        include: photo.confidence !== "excluded"
          && Boolean(photo.routeKey)
          && photo.include !== false
      };
    }
    if (photo.routeKey && !photo.shared && (photo.score ?? 0) >= 82) {
      return { ...photo, include: true };
    }
    const contextKey = photo.contextBatch || photo.sourceSeries;
    const context = contexts.get(contextKey) || globalContext;
    const contextPhotos = (contextKey
      ? classified.filter((item) =>
        (item.contextBatch || item.sourceSeries) === contextKey
      )
      : [...classified]
    ).sort(compareContextPhotos);
    const contextIndex = contextPhotos.findIndex((item) => item.sourceIndex === photo.sourceIndex);
    const dominantRoute = dominantContextRoute(context);
    const { best, second } = bestContextRoute(
      photo,
      contextPhotos,
      contextIndex < 0 ? index : contextIndex,
      context
    );
    const margin = best.score - (second?.score ?? 0);
    const withinPatrol = Number.isFinite(best.timeDistance) && best.timeDistance <= 35;
    const routeKey = dominantRoute && best.score < 70 ? dominantRoute : best.routeKey;
    const routeWindow = context.windows[routeKey];
    const routeDistance = timeDistanceToWindow(photo, routeWindow);
    const dominantWindowMatch = dominantRoute === routeKey
      && context.anchorCounts[routeKey] >= 2
      && (!Number.isFinite(routeDistance) || routeDistance <= 360);
    const attachable = (best.score >= 72 && (margin >= 7 || dominantRoute === routeKey) || dominantWindowMatch)
      && (!photo.transit || dominantWindowMatch || routeDistance <= 35);

    if (!attachable) {
      const excluded = photo.transit && (!Number.isFinite(routeDistance) || routeDistance > 60);
      return {
        ...photo,
        routeKey: "",
        include: false,
        confidence: excluded ? "excluded" : "review",
        reason: excluded
          ? "未授权定位图片与任何已验证巡查轨迹相距超过60分钟，按批次边界排除。"
          : photo.reason
      };
    }

    const routeChanged = photo.routeKey !== routeKey;
    let place = photo.place === "待确认地点" || photo.place === "待路径归集"
      ? photo.event === "overload"
        ? "治超点"
        : photo.event === "construction"
          ? "施工监管点"
          : "连接/待确认节点"
      : photo.place;
    let pointId = photo.pointId;
    let semanticPoint = photo.semanticPoint;
    let sequence = photo.sequence;
    let nameBase = photo.nameBase;
    let shared = photo.shared;
    if (routeKey === "g6" && photo.pointId === "west-entry") {
      pointId = "g6-entry";
      place = "同仁路口驶入高速";
      semanticPoint = "朝阳互通立交（同仁路口驶入高速）";
      sequence = 1;
      nameBase = place;
      shared = false;
    }
    const topologyConfirmed = Boolean(
      photo.sourceSeries
      && dominantRoute === routeKey
      && context.anchorCounts[routeKey] >= 2
      && photo.pointId
    );
    return {
      ...photo,
      routeKey,
      routeOptions: [routeKey],
      pointId,
      place,
      semanticPoint,
      sequence,
      nameBase,
      shared,
      include: true,
      confidence: topologyConfirmed
        ? "topology"
        : photo.shared || photo.transit || !photo.pointId
          ? "context"
          : margin >= 18 && (withinPatrol || dominantRoute === routeKey) ? "high" : "context",
      reason: topologyConfirmed
        ? `根据${ROUTES[routeKey].label}同批次已验证点位、相邻图片与拍摄时序自动确认。`
        : routeChanged || photo.shared || photo.transit
        ? `根据${ROUTES[routeKey].label}的唯一点位、相邻图片与拍摄时序自动归集（路线优势 ${Math.round(margin)} 分）。`
        : photo.reason
    };
  });

  return assignPatrolGroups(repairContextTimes(refineWestTopology(classified)));
}

export function groupRoutePhotos(photos) {
  return Object.keys(ROUTES).reduce((groups, routeKey) => {
    groups[routeKey] = normalizeRoutePhotos(routeKey, photos);
    return groups;
  }, {});
}

export function routeReadiness(routeKey, photos) {
  const included = normalizeRoutePhotos(routeKey, photos);
  const needsConfirmation = included.filter((photo) => ["review", "context"].includes(photo.confidence));
  const coverage = new Set(included.map((photo) => photo.place)).size;
  return {
    ready: included.length > 0 && needsConfirmation.length === 0,
    partial: coverage < 3,
    coverage,
    missing: [],
    included,
    reviewCount: needsConfirmation.length,
    reason: included.length === 0
      ? "没有已核验的附件。"
      : needsConfirmation.length
        ? "存在根据路径上下文归集的图片，需人工确认。"
        : coverage < 3
          ? "已按部分巡查生成草稿，不会声称全线巡查。"
          : "已生成可核验草稿。"
  };
}

export function toDisplayDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function checkpointMarker(route, place) {
  return route.checkpoints.find(([name]) => name === place)?.[1] ?? "";
}

function standardConclusion(route, confirmedCondition) {
  const condition = confirmedCondition === "畅通"
    ? "巡查期间，该路段公路、公路用地及其附属设施外观状况完好，未发现明显影响公路通行安全的路面障碍物，所辖收费站、匝道及隧道通行秩序正常，未发现异常情况。"
    : "已核验点位的现场情况见上述记录；全线通行状态及未拍摄路段需由提交人现场确认。";
  return confirmedCondition === "畅通"
    ? condition
    : `${condition} 所辖公路用地、公路建筑控制区内的情况以现场核验结果为准。`;
}

function cnTime(value) {
  const [hour, minute] = String(value).split(":");
  return `${hour}时${minute}分`;
}

function eventLine(photo) {
  if (photo.event === "construction") return `${cnTime(photo.time)}巡查至${photo.place}，对现场作业开展施工监管，作业安全措施及通行组织以现场核验结果为准。`;
  if (photo.event === "overload") return `${cnTime(photo.time)}巡查至${photo.place}，开展超限治理相关巡查，检查情况以现场登记为准。`;
  if (photo.routeKey === "g6" && photo.place === "海东收费站入口") {
    return `${cnTime(photo.time)}巡查至海东主线收费站 K1779+800m，收费站交通秩序正常，无堵车压车现象。`;
  }
  const marker = checkpointMarker(ROUTES[photo.routeKey], photo.place);
  const normalTraffic = /收费|匝道|立交/.test(photo.place)
    ? "，现场交通秩序正常，无堵车压车现象。"
    : "，现场通行及公路设施情况正常。";
  return `${cnTime(photo.time)}巡查至${photo.place}${marker ? ` ${marker}` : ""}${normalTraffic}`;
}

function buildWestNarrative({ route, startTime, endTime, photos, confirmedCondition }) {
  const lines = [`${cnTime(startTime)}巡查人员从大队出发开始巡查；`];
  const first = photos[0];
  const tollPhotos = photos.filter((photo) => photo.place === "西宁西收费站");
  const tunnelPhotos = photos.filter((photo) => photo.place === "大酉山隧道");
  if (first) {
    const entryContext = first.place === "西宁西方向"
      ? "，沿西宁西方向"
      : "";
    lines.push(`${cnTime(first.time || startTime)}进入管辖路段G6京藏高速公路西过境段${route.start}-${route.end}（西宁往湟源方向）${entryContext}开展公路巡查；`);
  }
  let tollCount = 0;
  for (const [index, photo] of photos.entries()) {
    if (index === 0 && photo.place === "西宁西方向") continue;
    if (photo.place === "大酉山隧道") {
      const direction = photos.filter((item) => item.place === "大酉山隧道").indexOf(photo) === 0 ? "右幅" : "左幅";
      lines.push(`${cnTime(photo.time)}通过大酉山隧道（${direction}），隧道通风、照明设施运行正常，路面无障碍物、无滞留车辆，通行正常。`);
    } else if (photo.place === "西宁西收费站") {
      tollCount += 1;
      if (tollPhotos.length === 1 && tunnelPhotos.length >= 2) {
        lines.push(`${cnTime(photo.time)}到达西宁西收费站，收费站通行秩序正常，无堵车压车现象；随后调头，对G6京藏高速公路西过境段${route.end}-${route.start}（湟源往西宁方向）继续巡查；`);
      } else {
        lines.push(tollCount === 1
          ? `${cnTime(photo.time)}到达西宁西收费站，收费站通行秩序正常，无堵车压车现象。`
          : `${cnTime(photo.time)}从西宁西收费站调头，对G6京藏高速公路西过境段${route.end}-${route.start}（湟源往西宁方向）继续巡查；`);
      }
    } else if (photo.place !== "连接/待确认节点") {
      lines.push(eventLine(photo));
    }
  }
  lines.push(`${cnTime(endTime)}离开管辖路段，返回大队，巡查结束。`);
  lines.push(standardConclusion(route, confirmedCondition));
  return lines.join("\n");
}

export function buildNarrative({ routeKey, startTime, endTime, photos, confirmedCondition = "待确认" }) {
  const route = ROUTES[routeKey];
  const ordered = [...photos].filter((photo) => photo.time && photo.include !== false).sort(sortByTime);
  if (!ordered.length) return "暂无已核验附件，不能生成现场巡查描述。";
  if (routeKey === "west") return buildWestNarrative({ route, startTime, endTime, photos: ordered, confirmedCondition });

  const lines = [`${cnTime(startTime)}巡查人员从大队出发开始巡查；`];
  if (routeKey === "g6") {
    lines.push(`${cnTime(ordered[0].time || startTime)}从同仁路口驶入高速，进入管辖路段对G6京藏高速${route.end}-${route.start}（平安方向）开展公路巡查；`);
  } else {
    lines.push(`${cnTime(ordered[0].time || startTime)}进入S101西宁高速${route.start}-${route.end}（韵家口往互助方向）开展公路巡查；`);
  }
  for (const photo of ordered) {
    if (
      photo.place !== "连接/待确认节点"
      && photo.place !== "待确认地点"
      && !(routeKey === "g6" && photo.place === "同仁路口驶入高速")
    ) {
      lines.push(eventLine(photo));
      if (routeKey === "g6" && photo.place === "平安收费站") {
        lines.push(`${cnTime(photo.time)}从平安收费站调头，进入管辖路段对G6京藏高速${route.start}-${route.end}（西宁方向）继续开展公路巡查；`);
      }
      if (routeKey === "s101" && photo.place === "互助东收费站") {
        lines.push(`${cnTime(photo.time)}从互助东收费站调头，进入S101西宁高速${route.end}-${route.start}（互助往韵家口方向）继续开展公路巡查；`);
      }
    }
  }
  lines.push(`${cnTime(endTime)}离开管辖路段，返回大队，巡查结束。`);
  lines.push(standardConclusion(route, confirmedCondition));
  return lines.join("\n");
}

export function buildRoadBulletin({ date, weather, routeKeys, confirmedCondition = "待确认" }) {
  const header = `交通综合执法西宁高速支队韵家口大队每日路况】【${toDisplayDate(date)}】，天气:${weather || "待确认"}。`;
  const entries = routeKeys.map((routeKey, index) => {
    const route = ROUTES[routeKey];
    const prefix = `${routeKeys.length > 1 ? `${index + 1}.` : ""}韵家口大队所辖${route.bulletin}`;
    if (confirmedCondition !== "畅通") {
      return `${prefix} 已巡查路段现场情况待最终确认，未核验路段不自动表述为全线畅通。`;
    }
    if (routeKey === "g6") {
      return `${prefix} 全线道路畅通，所辖海东主线收费站、平安收费站通行正常，站西巷、站东巷、民和路匝道无堵车压车现象，车辆正常通行。`;
    }
    if (routeKey === "west") {
      return `${prefix} 全线道路畅通，所辖西钢匝道、大酉山隧道无堵车压车现象，车辆正常通行。`;
    }
    return `${prefix}双向畅通，所辖互助主线收费站、互助南收费站无堵车压车现象，车辆正常通行。`;
  });
  return [header, ...entries].join("\n");
}

export function buildJournalDraft({ date, drafts }) {
  const usable = drafts.filter((draft) => draft.readiness.included.length);
  return {
    date,
    title: `${toDisplayDate(date)}巡查日志`,
    scheduleAssociation: usable.map((draft) => ({
      route: draft.routeCode,
      officers: draft.officers,
      shift: "08:00-18:00"
    })),
    content: usable.map((draft) => `${draft.routeCode}：${draft.narrative.replace(/\n/g, " ")}`).join("\n\n"),
    reviewRequired: usable.some((draft) => !draft.readiness.ready)
  };
}

export function buildDraft({ date, routeKey, vehicle, officers, startTime, endTime, photos, confirmedCondition = "待确认" }) {
  const route = ROUTES[routeKey];
  const readiness = routeReadiness(routeKey, photos);
  return {
    routeKey,
    date,
    dateLabel: toDisplayDate(date),
    vehicle,
    officers,
    checkCategory: "公路路政巡查",
    focus: "公路路面、公路附属设施、公路用地及建筑控制区监管",
    routeCode: route.code,
    roadName: route.roadName,
    startKilometer: route.start,
    endKilometer: route.end,
    roadCondition: confirmedCondition,
    carCondition: "完好",
    equipmentCondition: "齐全",
    startTime: `${date} ${startTime}:00`,
    endTime: `${date} ${endTime}:00`,
    narrative: buildNarrative({ routeKey, startTime, endTime, photos: readiness.included, confirmedCondition }),
    attachments: readiness.included.map((photo) => ({
      originalName: photo.originalName,
      normalizedName: photo.proposedName,
      place: photo.place,
      time: photo.time,
      confidence: photo.confidence,
      reason: photo.reason
    })),
    readiness,
    scheduling: {
      startTime: `${date} 08:00:00`,
      endTime: `${date} 18:00:00`,
      officers,
      route: route.code,
      content: "公路路面、公路用地、驻守执法点"
    }
  };
}
