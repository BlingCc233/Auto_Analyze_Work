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
      ["事故处理点", ""],
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
      ["朝阳立交", "K1800+500m"],
      ["事故处理点", ""],
      ["施工监管点", ""]
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
      ["事故处理点", ""],
      ["施工监管点", ""]
    ]
  }
};

const PLACE_RULES = [
  { id: "g6-entry", name: "同仁路口驶入高速", semanticPoint: "朝阳互通立交（同仁路口驶入高速）", routeKey: "g6", order: 1, match: /同仁路口.*(?:驶入|进入)|驶入高速/, score: 99, attachmentName: "同仁路口驶入高速1.jpg" },
  { id: "g6-haidong-entry", name: "海东收费站入口", semanticPoint: "海东主线收费站入口", routeKey: "g6", order: 7, match: /海东.*收费.*入口|海东.*入口/, score: 99, attachmentName: "海东收费站入口2.jpg" },
  { id: "g6-haidong", name: "海东主线收费站", semanticPoint: "海东主线收费站", routeKey: "g6", routeOptions: ["g6", "west"], order: 7, match: /海东.*主线.*收费|青海德坤|海东收费站（?G0611|海东市.*G0611张汶高速/, score: 97, attachmentName: "海东主线收费站.jpg", shared: true },
  { id: "g6-haidong-exit", name: "海东收费站出口", semanticPoint: "海东主线收费站出口", routeKey: "g6", order: 7, match: /海东收费站.*(?:出口|东南向)/, score: 99, attachmentName: "海东收费站出口.jpg" },
  { id: "g6-pingan", name: "平安收费站", semanticPoint: "平安收费站", routeKey: "g6", order: 11, match: /平安(?:区.{0,10}(?:体育|安居)|.{0,5}(?:收费|收赞))/, score: 99, attachmentName: "平安收费站4.jpg" },
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
  { id: "g6-chaidamu", name: "柴达木路高速路口", semanticPoint: "柴达木路高速入口", routeKey: "g6", routeOptions: ["g6", "west", "s101"], order: 1, match: /(?:柴|禁)达木(?:公园|路|错)|同仁路口.*离开/, score: 99, attachmentName: "柴达木路高速路口.jpg", shared: true },
  { id: "g6-construction", name: "施工监管点", semanticPoint: "G6 K1772绿化施工路段", routeKey: "g6", order: 9, match: /K177[1-4]|施工监管|绿化作业|养护作业|规范摆放警示|作业安全/, score: 96, attachmentName: "施工监管.jpg", event: "construction" },
  { id: "g6-overload", name: "治超点", semanticPoint: "海东主线收费站治超点", routeKey: "g6", order: 7, match: /治超|超限治理|检测站|核查货运|货运车辆/, score: 96, attachmentName: "治超.jpg", event: "overload" },
  { id: "g6-overload-visual", name: "治超点", semanticPoint: "海东主线收费站治超点", routeKey: "g6", routeOptions: ["g6", "west"], order: 7, match: /总质量|栏板高度|领航版|国六/, score: 74, attachmentName: "治超.jpg", event: "overload", shared: true },

  { id: "west-entry", name: "高速入口", semanticPoint: "西过境段高速入口（同仁路口/万方城）", routeKey: "west", order: 1, match: /生物园|生美园|生韵国区|海湖路.*G6.*入口/, score: 97, attachmentName: "高速入口.jpg" },
  { id: "west-entry-poi", name: "高速入口", semanticPoint: "朝阳互通共用高速入口（同仁路口/万方城）", routeKey: "west", routeOptions: ["g6", "west"], order: 1, match: /万方城/, score: 78, attachmentName: "高速入口.jpg", shared: true },
  { id: "west-diverge-s1113", name: "西宁西方向", semanticPoint: "朝阳互通西过境方向分流", routeKey: "west", order: 1, match: /S1113宁贵高速.*(?:湟源|兰州)|(?:湟源|兰州).{0,40}S1113宁贵高速/, score: 99, attachmentName: "西宁西方向.jpg" },
  { id: "west-diverge", name: "西宁西方向", semanticPoint: "朝阳互通西过境方向分流", routeKey: "west", order: 2, match: /西宁西方向|西宁北站|湟源.*格尔木.*门源|门源.*湟源.*格尔木|西钢.*大通|西宁城区.*海湖大道.*西钢.*多巴/, score: 98, attachmentName: "西宁西方向.jpg" },
  { id: "west-tunnel-right", name: "大酉山隧道", semanticPoint: "大酉山隧道右幅", routeKey: "west", order: 3, match: /大[酉西面]山.*[隧腿]道|万佳家博园|天津路|海湖路互通式立交桥|254[0-9]m/, score: 99, attachmentName: "大酉山隧道.jpg" },
  { id: "west-tunnel-left", name: "大酉山隧道", semanticPoint: "大酉山隧道左幅", routeKey: "west", order: 5, match: /和泰居/, score: 97, attachmentName: "大酉山隧道.jpg" },
  { id: "west-toll", name: "西宁西收费站", semanticPoint: "西宁西收费站", routeKey: "west", order: 4, match: /西宁西.*收费|收费站.*G6.*西向|多巴凤凰|109国道/, score: 100, attachmentName: "西宁西收费站.jpg" },
  { id: "west-toll-visual", name: "西宁西收费站", semanticPoint: "西宁西收费站", routeKey: "west", order: 4, match: /G6京藏高速.*ETC车辆靠中|ETC车辆靠中.*G6京藏高速/, score: 93, attachmentName: "西宁西收费站.jpg" },
  { id: "west-steel", name: "西钢出口", semanticPoint: "西钢出口", routeKey: "west", order: 4, match: /西宁特殊钢|西钢(?:.*(?:出口|入口))?|阳光宝贝幼儿园/, score: 96, attachmentName: "西钢出口.jpg" },
  { id: "west-exit", name: "西过境出口", semanticPoint: "西过境段东端出口", routeKey: "west", order: 6, match: /西过境.*出口|海湖路.*出口|青海建国物流/, score: 99, attachmentName: "西过境出口.jpg" },

  { id: "s101-entry", name: "互助匝道入口", semanticPoint: "S101韵家口端入口匝道", routeKey: "s101", order: 1, match: /互助匝道.*入口|进入S101/, score: 99, attachmentName: "互助匝道入口.jpg" },
  { id: "s101-entry-poi", name: "互助匝道入口", semanticPoint: "S101韵家口端入口匝道", routeKey: "s101", order: 1, match: /互助路/, score: 77, attachmentName: "互助匝道入口.jpg" },
  { id: "s101-main", name: "互助主线收费站", semanticPoint: "互助主线收费站", routeKey: "s101", order: 2, match: /互助.*主线|纬七路|海北花菜籽油/, score: 97, attachmentName: "互助主线收费站.jpg" },
  { id: "s101-tangchuan", name: "塘川收费站", semanticPoint: "塘川收费站", routeKey: "s101", order: 3, match: /塘川.*收费/, score: 99, attachmentName: "塘川收费站.jpg" },
  { id: "s101-south", name: "互助南收费站", semanticPoint: "互助南收费站", routeKey: "s101", order: 4, match: /互助南.*收费|彩虹大道/, score: 99, attachmentName: "互助南收费站.jpg" },
  { id: "s101-east", name: "互助东收费站", semanticPoint: "互助东收费站", routeKey: "s101", order: 5, match: /互?助东.*收费|251县道|定安东路/, score: 99, attachmentName: "互助东收费站.jpg" },
  { id: "s101-exit", name: "互助匝道出口", semanticPoint: "S101韵家口端出口匝道", routeKey: "s101", order: 6, match: /互助匝道.*出口|出S101|韵家口高架桥|互助收费站.*S101.*南/i, score: 100, attachmentName: "互助匝道出口.jpg" },
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
    .replace(/(?<=\d)[Ee](?=\d)/g, ":")
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
    if (/^\d{1,2}-\d{2}-[A-Za-z]/.test(contextAfter)) return;
    let hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59) return;
    if (hour < 6 && String(hourRaw).length === 1 && hour + 10 <= 15) hour += 10;
    if (hour > 23) return;
    const distance = dateIndex === -1 ? index : Math.abs(index - dateIndex);
    const watermarkPrefixBonus = dateIndex >= 0 && index < dateIndex ? 42 : 0;
    const roadSignPenalty = /(?:7|07)\s*[:.]\s*00\s*[-—]\s*(?:21|22)\s*[:.]\s*00/.test(raw) ? 80 : 0;
    candidates.push({
      value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      score: quality + watermarkPrefixBonus - Math.min(35, distance / 12) - roadSignPenalty,
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

function watermarkPrefixTime(text = "") {
  const source = String(text)
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/(?<=\d)[Ee](?=\d)/g, ":")
    .replace(/[：﹕]/g, ":");
  const lines = source.split(/\r?\n/).map((line) => line.trim());
  const dateLineIndex = lines.findIndex((line) =>
    /20\d{2}(?:[-=./:]?\d{1,2}[-=./:]\d{1,2}|[-=./:]\d{2}[1Il]\d{2})/.test(line)
  );
  if (dateLineIndex <= 0) return "";

  const candidates = [];
  const add = (hourRaw, minuteRaw, lineIndex, quality) => {
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    if (
      !Number.isInteger(hour)
      || !Number.isInteger(minute)
      || hour > 23
      || minute > 59
    ) return;
    candidates.push({
      value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      score: quality + lineIndex
    });
  };

  lines.slice(0, dateLineIndex).forEach((line, lineIndex) => {
    if (/^[SGK]\s*\d/i.test(line)) return;
    let match = line.match(/^[^\d]{0,2}([0-2]?\d)\s*[:.,·-]\s*([0-5]\d)(?:\d)?(?:\D.*)?$/);
    if (match) {
      add(match[1], match[2], lineIndex, 120);
      return;
    }
    match = line.match(/^[^\d]{0,2}([0-2]\d)([0-5]\d)(?:\d)?(?:\D.*)?$/);
    if (match) {
      add(match[1], match[2], lineIndex, 116);
      return;
    }
    match = line.match(/^[^\d]{0,2}(\d)([0-5]\d)(?:\d)?(?:\D.*)?$/);
    if (match) add(match[1], match[2], lineIndex, 108);
  });

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.value || "";
}

export function dateFromOcr(text = "") {
  const source = String(text).replace(/[=./:]/g, "-");
  const match = source.match(/(20\d{2})-(\d{2})-(\d{2})(?!\d)/)
    || source.match(/(20\d{2})(\d{2})-(\d{2})(?!\d)/)
    || source.match(/(20\d{2})-(\d{2})(\d{2})(?!\d)/)
    || source.match(/(20\d{2})(\d{2})(\d{2})(?!\d)/);
  if (!match) return "";
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function timeFromOcrEvidence(ocrText = "", timeOcrText = "") {
  const watermarkTime = watermarkPrefixTime(ocrText);
  if (watermarkTime) return watermarkTime;

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

function eventFromText(source = "") {
  if (/交通事故|事故现场|碰撞|追尾|侧翻|车辆抛锚|路产损失|应急处置/.test(source)) return "accident";
  if (/施工监管|绿化作业|养护作业|规范摆放警示|作业安全|施工现场/.test(source)) return "construction";
  if (/治超|超限治理|检测站|核查货运|货运车辆/.test(source)) return "overload";
  return "";
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

function repairIsolatedSeriesTimeOutliers(photos) {
  const result = photos.map((photo) => ({ ...photo }));
  const series = new Map();
  for (const photo of result) {
    if (!photo.sourceSeries || !Number.isFinite(photo.captureOrder)) continue;
    if (!series.has(photo.sourceSeries)) series.set(photo.sourceSeries, []);
    series.get(photo.sourceSeries).push(photo);
  }

  for (const entries of series.values()) {
    entries.sort((left, right) => left.captureOrder - right.captureOrder);
    for (let index = 1; index < entries.length - 1; index += 1) {
      const previous = entries[index - 1];
      const photo = entries[index];
      const next = entries[index + 1];
      const previousAt = minutes(previous.time);
      const currentAt = minutes(photo.time);
      const nextAt = minutes(next.time);
      const contiguous = photo.captureOrder - previous.captureOrder <= 2
        && next.captureOrder - photo.captureOrder <= 2;
      const bracketed = Number.isFinite(previousAt)
        && Number.isFinite(nextAt)
        && nextAt > previousAt
        && nextAt - previousAt <= 90;
      const isIsolatedRollback = Number.isFinite(currentAt)
        && currentAt < previousAt - 15
        && currentAt < nextAt - 15;
      const isMissing = !photo.time;
      if (!contiguous || !bracketed || (!isIsolatedRollback && !isMissing)) continue;

      const span = next.captureOrder - previous.captureOrder;
      const ratio = (photo.captureOrder - previous.captureOrder) / span;
      const estimated = Math.round(previousAt + (nextAt - previousAt) * ratio);
      photo.time = clockFromMinutes(estimated);
      photo.timeEstimated = true;
      photo.timeCorrectionReason = isMissing
        ? "同一连拍序列缺少水印时间，已按相邻可信时钟和拍摄序号插值。"
        : "水印时钟与同一连拍序列的前后可信时钟发生孤立逆序，已按拍摄序号校正。";
    }
  }
  return result;
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
    const g6MainlineEvidence = (group) => group.some((photo) =>
      photo.routeOptions?.includes("g6")
      && (photo.score ?? 0) >= 82
      && (photo.pointId === "g6-haidong" || /海东|G0611张汶高速/.test(normalizeText(photo.ocrText)))
    );
    const g6ReturnExitEvidence = (group) => group.some((photo) =>
      photo.routeOptions?.includes("g6")
      && (photo.score ?? 0) >= 82
      && /(?:柴|禁)达木|海湖路.{0,8}通海|塔尔寺.{0,8}祁连路/.test(normalizeText(photo.ocrText))
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
      const previousCaptureOrder = previous.at(-1)?.captureOrder;
      const currentCaptureOrder = group[0]?.captureOrder;
      const adjacentCaptures = Number.isFinite(previousCaptureOrder)
        && Number.isFinite(currentCaptureOrder)
        && Math.abs(currentCaptureOrder - previousCaptureOrder) <= 2;
      const g6ReturnContinuation = gap <= 120
        && adjacentCaptures
        && g6MainlineEvidence(previous)
        && g6ReturnExitEvidence(group);
      if (sameAnchoredRoute || weakReturnContinuation || g6ReturnContinuation) previous.push(...group);
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

function markExactOcrDuplicates(photos) {
  const seen = new Map();
  return photos.map((photo) => {
    const text = String(photo.ocrText || "").replace(/\s+/g, "");
    if (text.length < 40) return photo;
    const key = `${photo.sourceSeries || ""}\0${photo.time || ""}\0${text}`;
    const original = seen.get(key);
    if (!original) {
      seen.set(key, photo);
      return photo;
    }
    return {
      ...photo,
      duplicateOf: original.originalName,
      routeKey: "",
      routeOptions: [],
      include: false,
      confidence: "excluded",
      reason: `与${original.originalName}的完整OCR、水印时间和防伪信息完全一致，按重复照片自动排除。`
    };
  });
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
  const exactHistoricalSample = Boolean(
    historical?.exact
    && historical?.margin >= 0.05
  );
  const trustedHistoricalSample = sameHistoricalDay
    || legacyHistoricalSample
    || exactHistoricalSample;
  const mayUseHistoricalCandidate = trustedHistoricalSample || Boolean(
    historical
    && historical.score >= 0.97
    && historical.margin >= 0.08
    && (!ruleCandidate || ruleCandidate.score < 82)
  );
  const historicalCandidate = historical
    && mayUseHistoricalCandidate
    && historical.include !== false
    && historical.score >= 0.94
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
          : historical.event === "accident"
            ? "事故现场.jpg"
          : `${historical.place || "连接节点"}.jpg`,
      event: historical.event
    }
    : null;
  const candidate = historicalCandidate ?? ruleCandidate;
  const candidates = historicalCandidate ? [historicalCandidate, ...ruleCandidates] : ruleCandidates;
  const detectedEvent = candidate?.event || eventFromText(source);
  const transit = TRANSIT_RULES.some((rule) => rule.test(source));
  const parsedTime = timeFromOcrEvidence(ocrText, timeOcrText);
  const time = historical?.exact && historical.expectedTime
    ? historical.expectedTime
    : parsedTime;
  const coordinates = coordinatesFromOcr(ocrText);
  const captureOrder = Number(fileName.match(/_(\d+)_\d+\.[^.]+$/)?.[1] ?? Number.NaN);
  const sourceSeries = sourceSeriesFromFileName(fileName);

  if (historical?.exact && historical.include === false) {
    return {
      originalName: fileName,
      ocrText,
      timeOcrText,
      sourceSeries,
      captureOrder,
      place: "已核验排除",
      semanticPoint: "",
      pointId: "",
      routeKey: "",
      routeOptions: [],
      sequence: null,
      time,
      weather: weatherFromOcr(ocrText),
      confidence: "excluded",
      score: Math.round(historical.score * 100),
      proposedName: fileName,
      standardName: "",
      include: false,
      coordinates,
      evidence: [],
      shared: false,
      verifiedHistoricalExclusion: true,
      reason: "与已核验的非巡查/返程历史照片特征精确匹配，自动排除。"
    };
  }

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
    event: detectedEvent,
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
  if (photo.manualName && photo.nameBase) return photo.nameBase;
  if (photo.event === "accident") return "事故现场";
  if (photo.event === "construction") return "施工监管";
  if (photo.event === "overload") return "治超";
  if (photo.event === "facility-survey") return "路域设施勘察";
  if (photo.nameBase) return photo.nameBase;
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

function seriesTopologyRoute(photos, context) {
  const usable = photos.filter((photo) => !photo.duplicateOf && !photo.verifiedHistoricalExclusion);
  const source = normalizeText(usable.map((photo) => photo.ocrText || "").join("\n"));
  const anchoredRoutes = Object.entries(context.anchorCounts)
    .filter(([, count]) => count > 0)
    .map(([routeKey]) => routeKey);
  if (anchoredRoutes.length > 1) return "";
  const hasWestAnchor = /大[酉西面]山|西宁西.*收费|西宁特殊钢|西钢|西过境.*出口/.test(source);
  const hasS101Anchor = /互助(?:主线|南|东).*收费|塘川.*收费/.test(source);
  const hasG6Trajectory = /海东(?:市|收费)|平安区|曹家堡|西宁东.*收费/.test(source);

  if (hasWestAnchor && !hasS101Anchor) return "west";
  if (hasS101Anchor && !hasWestAnchor) return "s101";
  if (hasG6Trajectory && !hasWestAnchor && !hasS101Anchor) return "g6";

  return anchoredRoutes.length === 1 ? anchoredRoutes[0] : dominantContextRoute(context);
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
    const last = group.at(-1);
    if (
      last
      && !last.time
      && ["柴达木路高速路口", "朝阳立交", "互助匝道出口"].includes(last.place)
    ) {
      const previous = [...group.slice(0, -1)].reverse().find((item) => item.time);
      const previousAt = minutes(previous?.time);
      if (Number.isFinite(previousAt)) {
        last.time = clockFromMinutes(previousAt + 15);
        last.timeEstimated = true;
      }
    }
  }
  return repaired;
}

const SESSION_START_PLACES = {
  g6: new Set(["同仁路口驶入高速", "朝阳立交"]),
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
      const key = photo.sourceSeries || photo.contextBatch || "unsequenced";
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
          && SESSION_START_PLACES[routeKey].has(photo.place);
        if (gap > 360 || resetAtStart) seriesSessions.push([photo]);
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
  name,
  event = photo.event
}) {
  Object.assign(photo, {
    pointId,
    place,
    semanticPoint,
    sequence,
    nameBase: name || place,
    standardName: `${name || place}.jpg`,
    proposedName: `${name || place}.jpg`,
    event,
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
    entries.sort(compareContextPhotos);
    const firstTunnelIndex = entries.findIndex((photo) =>
      photo.pointId === "west-tunnel-right" || photo.place === "大酉山隧道"
    );
    if (firstTunnelIndex > 0) {
      const beforeTunnel = entries.slice(0, firstTunnelIndex);
      let hasConfirmedEntry = beforeTunnel.some((photo) => photo.place === "高速入口");
      if (!hasConfirmedEntry) {
        const entry = beforeTunnel.find((photo) =>
          photo.shared
          && photo.pointId === "shared-connector"
          && /S1113宁贵高速/.test(normalizeText(photo.ocrText))
        );
        if (entry) {
          setTopologyPoint(entry, {
            pointId: "west-entry",
            place: "高速入口",
            semanticPoint: "西过境段高速入口（S1113宁贵高速连接段）",
            sequence: 1
          });
          entry.reason = "该图位于G0611/G6分流及大酉山隧道之前，按西过境巡查起点自动确认为高速入口。";
          hasConfirmedEntry = true;
        }
      }
      const entryIndex = beforeTunnel.findIndex((photo) => photo.place === "高速入口");
      const diverge = beforeTunnel.find((photo, index) =>
        index > entryIndex
        && photo.shared
        && /G0611张汶高速/.test(normalizeText(photo.ocrText))
        && /G6|湟源|格尔木/.test(normalizeText(photo.ocrText))
      );
      if (diverge && diverge.place !== "西宁西方向") {
        setTopologyPoint(diverge, {
          pointId: "west-diverge",
          place: "西宁西方向",
          semanticPoint: "朝阳互通西过境方向分流",
          sequence: 2
        });
        diverge.reason = "该图位于高速入口与大酉山隧道之间，且出现G0611/G6及湟源方向标志，自动确认为西宁西方向分流点。";
      }
      const directionCandidates = beforeTunnel.filter((photo) => photo.place === "西宁西方向");
      if (
        !hasConfirmedEntry
        && directionCandidates.length === 1
        && /进入/.test(normalizeText(directionCandidates[0].ocrText))
      ) {
        setTopologyPoint(directionCandidates[0], {
          pointId: "west-entry",
          place: "高速入口",
          semanticPoint: "西过境段高速入口（朝阳互通）",
          sequence: 1
        });
        hasConfirmedEntry = true;
      }
      if (!hasConfirmedEntry && directionCandidates.length > 1) {
        setTopologyPoint(directionCandidates[0], {
          pointId: "west-entry",
          place: "高速入口",
          semanticPoint: "西过境段高速入口（同仁路口/朝阳互通）",
          sequence: 1
        });
      }
      if (!hasConfirmedEntry && directionCandidates.length > 1) {
        setTopologyPoint(directionCandidates[1], {
          pointId: "west-diverge",
          place: "西宁西方向",
          semanticPoint: "朝阳互通西过境方向分流",
          sequence: 2
        });
      }
    }
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
    let firstConfirmedTollIndex = entries.findIndex((photo, index) =>
      index > firstTunnelIndex
      && photo.pointId?.startsWith("west-toll")
      && photo.confidence === "high"
    );
    if (firstConfirmedTollIndex < 0 && firstTunnelIndex >= 0) {
      for (let index = firstTunnelIndex + 1; index < entries.length - 1; index += 1) {
        const first = entries[index];
        const second = entries[index + 1];
        const gap = minutes(second.time) - minutes(first.time);
        const bothGenericG6 = [first, second].every((photo) =>
          ["连接/待确认节点", "待确认地点"].includes(photo.place)
          && /G6京藏高速/.test(normalizeText(photo.ocrText))
        );
        if (!bothGenericG6 || !Number.isFinite(gap) || gap < 0 || gap > 5) continue;
        for (const photo of [first, second]) {
          setTopologyPoint(photo, {
            pointId: "west-toll",
            place: "西宁西收费站",
            semanticPoint: "西宁西收费站",
            sequence: 4
          });
          photo.reason = "同一序列在大酉山隧道后连续拍摄两张G6收费站区域照片，结合后续返程方向自动确认。";
        }
        firstConfirmedTollIndex = index;
        break;
      }
    }

    if (firstConfirmedTollIndex >= 0) {
      const returnTunnel = entries.slice(firstConfirmedTollIndex + 1).find((photo) =>
        photo.place === "大酉山隧道"
      );
      if (returnTunnel) {
        setTopologyPoint(returnTunnel, {
          pointId: "west-tunnel-left",
          place: "大酉山隧道",
          semanticPoint: "大酉山隧道左幅",
          sequence: 5
        });
        returnTunnel.reason = "该图位于西宁西收费站调头之后，按湟源往西宁返程拓扑确认为大酉山隧道左幅。";
      }
    }

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
        const previous = entries[index - 1];
        const previousGap = minutes(photo.time) - minutes(previous?.time);
        if (
          (
            photo.pointId?.startsWith("west-toll")
            || (
              ["连接/待确认节点", "待确认地点"].includes(photo.place)
              && /G6京藏高速/.test(normalizeText(photo.ocrText))
            )
          )
          && Number.isFinite(elapsed)
          && elapsed >= 16
          && Number.isFinite(previousGap)
          && previousGap >= 16
        ) {
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
    const tollIndex = entries.findIndex((photo) => photo.pointId?.startsWith("west-toll"));
    if (tollIndex >= 0) {
      const exit = entries.slice(tollIndex + 1).find((photo) =>
        /(?:G?0?611|6061).*(?:大通|门源)|(?:大通|门源).*(?:G?0?611|6061)/.test(normalizeText(photo.ocrText))
      );
      if (exit) {
        setTopologyPoint(exit, {
          pointId: "west-exit",
          place: "西过境出口",
          semanticPoint: "西过境段东端出口",
          sequence: 6
        });
      }
    }
    if (seriesKey !== "unsequenced" && returnTunnelIndex >= 0) {
      const returnTunnel = entries[returnTunnelIndex];
      const exit = entries.slice(returnTunnelIndex + 1).find((photo) => {
        const elapsed = minutes(photo.time) - minutes(returnTunnel.time);
        const source = normalizeText(photo.ocrText);
        return Number.isFinite(elapsed)
          && elapsed >= 0
          && elapsed <= 25
          && (photo.shared || ["连接段", "连接/待确认节点"].includes(photo.place))
          && /S1113宁贵高速/.test(source)
          && /昆仑大道|西塔高速|胜利路|城区/.test(source);
      });
      if (exit) {
        setTopologyPoint(exit, {
          pointId: "west-exit",
          place: "西过境出口",
          semanticPoint: "驶出西过境管辖路段返回大队",
          sequence: 6
        });
        exit.reason = "该图位于返程大酉山隧道之后，水印及路牌显示S1113宁贵高速城区出口方向，自动确认为驶离管辖路段返回大队。";
      }
    }
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

function refineContextSurveyPoints(photos) {
  const result = photos.map((photo) => ({ ...photo }));
  const groups = new Map();
  for (const photo of result) {
    if (!photo.routeKey || photo.include === false) continue;
    const key = `${photo.routeKey}\0${photo.contextBatch || photo.sourceSeries || "unsequenced"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(photo);
  }

  for (const entries of groups.values()) {
    entries.sort(compareContextPhotos);
    for (let index = 1; index < entries.length - 1; index += 1) {
      const photo = entries[index];
      if (
        photo.manualAssignment
        || photo.transit
        || photo.pointId
        || !["连接/待确认节点", "待确认地点"].includes(photo.place)
      ) continue;
      const previous = [...entries.slice(0, index)].reverse().find((item) =>
        item.pointId && item.confidence !== "context"
      );
      const next = entries.slice(index + 1).find((item) =>
        item.pointId && item.confidence !== "context"
      );
      const at = minutes(photo.time);
      const previousAt = minutes(previous?.time);
      const nextAt = minutes(next?.time);
      if (
        !previous
        || !next
        || !Number.isFinite(at)
        || !Number.isFinite(previousAt)
        || !Number.isFinite(nextAt)
        || at < previousAt
        || at > nextAt
        || nextAt - previousAt > 75
      ) continue;
      const previousSequence = Number(previous.sequence);
      const nextSequence = Number(next.sequence);
      const sequence = Number.isFinite(previousSequence) && Number.isFinite(nextSequence)
        ? previousSequence
          + (nextSequence - previousSequence)
          * ((at - previousAt) / Math.max(1, nextAt - previousAt))
        : Number.isFinite(previousSequence) ? previousSequence : nextSequence;
      setTopologyPoint(photo, {
        pointId: `${photo.routeKey}-facility-survey`,
        place: "路域设施勘察",
        semanticPoint: "相邻巡查点位间桥下空间、路域环境及沿线设施勘察",
        sequence,
        event: "facility-survey"
      });
      photo.reason = `拍摄时间位于${previous.place}与${next.place}两个已确认点位之间，按同线路拓扑默认归入路域设施勘察；如非巡查照片可手动排除。`;
    }
  }
  return result;
}

function refineG6Turnarounds(photos) {
  const result = photos.map((photo) => ({ ...photo }));
  const groups = new Map();
  for (const photo of result) {
    if (photo.routeKey !== "g6" || photo.include === false) continue;
    const key = photo.sourceSeries || photo.contextBatch || "unsequenced";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(photo);
  }
  const mainlineTolls = new Set([
    "海东主线收费站",
    "海东收费站入口",
    "海东收费站出口",
    "西宁东收费口"
  ]);
  const isStartEvidence = (photo) => ["同仁路口驶入高速", "高速入口"].includes(photo.place)
    || /同仁路口.*(?:驶入|进入)|驶入高速|万方城|祁连路派出所/.test(normalizeText(photo.ocrText))
    || /S1113宁贵高速/.test(normalizeText(photo.ocrText));
  const isReturnExitEvidence = (photo) => /(?:柴|禁)达木|海湖路.{0,8}通海|塔尔寺.{0,8}祁连路|北禅路/.test(normalizeText(photo.ocrText));
  const isGeneric = (photo) => !photo.manualAssignment
    && !photo.historyRecordHint
    && ["连接/待确认节点", "待确认地点", "待路径归集", "高速入口"].includes(photo.place);
  const setHaidong = (photo, direction = "") => setTopologyPoint(photo, {
    pointId: "g6-haidong",
    place: "海东主线收费站",
    semanticPoint: `海东主线收费站${direction ? `（${direction}）` : ""}`,
    sequence: direction === "西宁方向" ? 12 : 7
  });

  for (const allEntries of groups.values()) {
    allEntries.sort(compareContextPhotos);
    const sourceSeries = allEntries[0]?.sourceSeries || "";
    const mixedRouteSeries = Boolean(sourceSeries && result.some((photo) =>
      photo.sourceSeries === sourceSeries
      && photo.include !== false
      && photo.routeKey
      && photo.routeKey !== "g6"
    ));
    const sessions = [];
    for (const photo of allEntries) {
      const current = sessions.at(-1);
      const previous = current?.at(-1);
      const gap = previous ? minutes(photo.time) - minutes(previous.time) : 0;
      if (current && gap > 75 && isStartEvidence(photo)) sessions.push([photo]);
      else if (current) current.push(photo);
      else sessions.push([photo]);
    }

    for (const entries of sessions) {
      if (
        !mixedRouteSeries
        && entries.length >= 2
        && !entries[0].historyRecordHint
        && isStartEvidence(entries[0])
      ) {
        setTopologyPoint(entries[0], {
          pointId: "g6-entry",
          place: "同仁路口驶入高速",
          semanticPoint: "朝阳互通立交（同仁路口驶入高速）",
          sequence: 1
        });
      }

      const terminalIndex = entries.findIndex((photo, index) =>
        index > 0
        && (photo.place === "柴达木路高速路口" || isReturnExitEvidence(photo) || /同仁路口.*离开/.test(normalizeText(photo.ocrText)))
      );
      if (!mixedRouteSeries && terminalIndex > 0 && !entries[terminalIndex].manualAssignment) {
        setTopologyPoint(entries[terminalIndex], {
          pointId: "g6-chaidamu",
          place: "柴达木路高速路口",
          semanticPoint: "离开G6返回大队",
          sequence: 13
        });
      }
      if (!mixedRouteSeries && terminalIndex > 0) {
        for (const photo of entries) {
          if (
            photo.manualAssignment
            || photo.pointId !== "g6-haidong"
            || photo.confidence !== "context"
            || (photo.score ?? 0) < 94
          ) continue;
          setTopologyPoint(photo, {
            pointId: "g6-haidong",
            place: "海东主线收费站",
            semanticPoint: "海东主线收费站",
            sequence: 7
          });
        }
      }
      const endIndex = terminalIndex >= 0 ? terminalIndex : entries.length;
      const interior = entries.slice(1, endIndex);
      for (let index = 1; index < entries.length - 1; index += 1) {
        const photo = entries[index];
        const previous = entries[index - 1];
        const next = entries[index + 1];
        if (!isGeneric(photo) || !mainlineTolls.has(previous.place) || !mainlineTolls.has(next.place)) continue;
        const previousAt = minutes(previous.time);
        const at = minutes(photo.time);
        const nextAt = minutes(next.time);
        if (
          !Number.isFinite(previousAt)
          || !Number.isFinite(at)
          || !Number.isFinite(nextAt)
          || at <= previousAt
          || at >= nextAt
          || nextAt - previousAt > 40
        ) continue;
        setTopologyPoint(photo, {
          pointId: "g6-pingan",
          place: "平安收费站",
          semanticPoint: "平安收费站调头",
          sequence: 11
        });
      }
      const pinganIndex = interior.findIndex((photo) => photo.place === "平安收费站");
      const haidongIndexes = interior
        .map((photo, index) => ["海东主线收费站", "海东收费站入口", "海东收费站出口"].includes(photo.place) ? index : -1)
        .filter((index) => index >= 0);

      if (!mixedRouteSeries && pinganIndex >= 0) {
        const outbound = interior.slice(0, pinganIndex).findLast(isGeneric);
        const returning = interior.slice(pinganIndex + 1).find(isGeneric);
        if (outbound) setHaidong(outbound, "平安方向");
        if (returning) setHaidong(returning, "西宁方向");
      } else if (!mixedRouteSeries) {
        const firstHaidongIndex = haidongIndexes[0] ?? -1;
        const candidates = interior
          .map((photo, index) => ({ photo, index }))
          .filter(({ photo, index }) => isGeneric(photo) && index !== firstHaidongIndex);
        if (firstHaidongIndex < 0 && candidates.length) {
          setHaidong(candidates.shift().photo, "平安方向");
        }
        if (candidates.length) {
          const pingan = candidates.shift().photo;
          setTopologyPoint(pingan, {
            pointId: "g6-pingan",
            place: "平安收费站",
            semanticPoint: "平安收费站调头",
            sequence: 11
          });
        }
        if (candidates.length) setHaidong(candidates.shift().photo, "西宁方向");
      }

      for (let index = 1; index < entries.length - 1; index += 1) {
      const photo = entries[index];
      const previous = entries[index - 1];
      const next = entries[index + 1];
      if (
        photo.manualAssignment
        || photo.pointId
        || !["连接/待确认节点", "待确认地点"].includes(photo.place)
        || !mainlineTolls.has(previous.place)
        || !mainlineTolls.has(next.place)
      ) continue;
      const previousAt = minutes(previous.time);
      const at = minutes(photo.time);
      const nextAt = minutes(next.time);
      if (
        !Number.isFinite(previousAt)
        || !Number.isFinite(at)
        || !Number.isFinite(nextAt)
        || at <= previousAt
        || at >= nextAt
        || nextAt - previousAt > 40
      ) continue;
      setTopologyPoint(photo, {
        pointId: "g6-pingan",
        place: "平安收费站",
        semanticPoint: "平安收费站调头",
        sequence: 11
      });
      photo.reason = `照片位于${previous.place}与${next.place}两次主线收费站拍摄之间，按G6东行至平安调头后原路返回的拓扑自动确认为平安收费站。`;
      }
    }
  }
  return result;
}

function refineSequentialRouteTransitions(photos) {
  const result = photos.map((photo) => ({ ...photo }));
  const batches = new Map();
  for (const photo of result) {
    const key = photo.contextBatch || photo.sourceSeries;
    if (!key || photo.duplicateOf) continue;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(photo);
  }

  for (const entries of batches.values()) {
    entries.sort(compareContextPhotos);
    const tollIndex = entries.findIndex((photo) =>
      photo.routeKey === "west" && photo.place === "西宁西收费站"
    );
    const returnTunnelIndex = entries.findIndex((photo, index) =>
      index > tollIndex
      && photo.routeKey === "west"
      && photo.place === "大酉山隧道"
    );
    if (returnTunnelIndex < 0) continue;
    const pivotIndex = entries.findIndex((photo, index) =>
      index > returnTunnelIndex
      && /南辅路|韵家口|峡口|西宁城区/.test(normalizeText(photo.ocrText))
    );
    if (pivotIndex < 0) continue;

    const later = entries.slice(pivotIndex + 1);
    const pinganIndex = later.findIndex((photo) =>
      photo.pointId === "g6-pingan"
      || photo.place === "平安收费站"
      || /平安区.{0,12}(?:安居|体育|收费)/.test(normalizeText(photo.ocrText))
    );
    if (pinganIndex < 0) continue;

    const pivot = entries[pivotIndex];
    setTopologyPoint(pivot, {
      pointId: "west-exit",
      place: "西过境出口",
      semanticPoint: "离开西过境段并转往G6平安方向",
      sequence: 6
    });
    pivot.routeKey = "west";
    pivot.routeOptions = ["west"];
    pivot.reason = "西过境返程大酉山隧道后到达朝阳/南辅路节点，自动确认为西过境出口。";

    for (let index = 0; index < later.length; index += 1) {
      const photo = later[index];
      const source = normalizeText(photo.ocrText);
      photo.routeKey = "g6";
      photo.routeOptions = ["g6"];
      if (index === 0) {
        setTopologyPoint(photo, {
          pointId: "g6-entry",
          place: "同仁路口驶入高速",
          semanticPoint: "朝阳互通转入G6平安方向",
          sequence: 1
        });
      } else if (index < pinganIndex) {
        setTopologyPoint(photo, {
          pointId: "g6-haidong",
          place: "海东主线收费站",
          semanticPoint: "海东主线收费站（平安方向）",
          sequence: 7
        });
      } else if (index === pinganIndex) {
        setTopologyPoint(photo, {
          pointId: "g6-pingan",
          place: "平安收费站",
          semanticPoint: "平安收费站调头",
          sequence: 11
        });
      } else if (/柴达木路|海湖路.*通海路|塔尔寺.*祁连路/.test(source)) {
        setTopologyPoint(photo, {
          pointId: "g6-chaidamu",
          place: "柴达木路高速路口",
          semanticPoint: "离开G6返回大队",
          sequence: 13
        });
      } else {
        setTopologyPoint(photo, {
          pointId: "g6-haidong",
          place: "海东主线收费站",
          semanticPoint: "海东主线收费站（西宁方向）",
          sequence: 12
        });
      }
      photo.reason = "根据西过境返程后的G6转入节点、平安收费站调头锚点及返程时间顺序自动确认。";
    }
  }
  return result;
}

function excludePostRouteTransit(photos) {
  const result = photos.map((photo) => ({ ...photo }));
  const groups = new Map();
  for (const photo of result) {
    const key = photo.contextBatch || photo.sourceSeries;
    if (!key || photo.duplicateOf) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(photo);
  }
  for (const entries of groups.values()) {
    entries.sort(compareContextPhotos);
    const exitIndex = entries.findIndex((photo) =>
      photo.routeKey === "west" && photo.pointId === "west-exit"
    );
    if (exitIndex < 0) continue;
    const exitAt = minutes(entries[exitIndex].time);
    for (const photo of entries.slice(exitIndex + 1)) {
      const elapsed = minutes(photo.time) - exitAt;
      if (
        !Number.isFinite(elapsed)
        || elapsed < 15
        || photo.pointId
        || (photo.evidence?.length ?? 0) > 0
      ) continue;
      Object.assign(photo, {
        routeKey: "",
        routeOptions: [],
        include: false,
        confidence: "excluded",
        reason: "已越过西过境东端出口，且后续照片没有命中三条管辖线路点位，按返程照片自动排除。"
      });
    }
  }
  return result;
}

export function resolvePhotoAssignments(photos) {
  let classified = assignContextBatches(
    markExactOcrDuplicates(
      repairIsolatedSeriesTimeOutliers(
        photos.map((photo, sourceIndex) => ({ sourceIndex, ...photo }))
      )
    )
  );
  const globalContext = routeContextScores(classified);
  const contexts = new Map();
  const seriesContexts = new Map();
  const seriesRoutes = new Map();
  for (const photo of classified) {
    const contextKey = photo.contextBatch || photo.sourceSeries;
    if (!contextKey || contexts.has(contextKey)) continue;
    contexts.set(
      contextKey,
      routeContextScores(classified.filter((item) =>
        (item.contextBatch || item.sourceSeries) === contextKey
      ))
    );
    if (photo.sourceSeries && !seriesContexts.has(photo.sourceSeries)) {
      const seriesPhotos = classified.filter((item) => item.sourceSeries === photo.sourceSeries);
      const seriesContext = routeContextScores(seriesPhotos);
      seriesContexts.set(photo.sourceSeries, seriesContext);
      seriesRoutes.set(photo.sourceSeries, seriesTopologyRoute(seriesPhotos, seriesContext));
    }
  }

  classified = classified.map((photo, index) => {
    if (photo.duplicateOf) return photo;
    if (photo.verifiedHistoricalExclusion) return { ...photo, include: false };
    const seriesRoute = photo.sourceSeries ? seriesRoutes.get(photo.sourceSeries) || "" : "";
    if (photo.manualAssignment) {
      return {
        ...photo,
        include: photo.confidence !== "excluded"
          && Boolean(photo.routeKey)
          && photo.include !== false
      };
    }
    if (
      photo.routeKey
      && !photo.shared
      && (photo.score ?? 0) >= 82
      && (photo.historyRecordHint || !seriesRoute || seriesRoute === photo.routeKey)
    ) {
      return { ...photo, include: true };
    }
    const contextKey = photo.contextBatch || photo.sourceSeries;
    const useSeriesContext = Boolean(seriesRoute && photo.sourceSeries);
    const context = useSeriesContext
      ? seriesContexts.get(photo.sourceSeries)
      : contexts.get(contextKey) || globalContext;
    const contextPhotos = (useSeriesContext
      ? classified.filter((item) => item.sourceSeries === photo.sourceSeries)
      : contextKey
        ? classified.filter((item) =>
          (item.contextBatch || item.sourceSeries) === contextKey
        )
        : [...classified]
    ).sort(compareContextPhotos);
    const contextIndex = contextPhotos.findIndex((item) => item.sourceIndex === photo.sourceIndex);
    const dominantRoute = seriesRoute || dominantContextRoute(context);
    const { best, second } = bestContextRoute(
      photo,
      contextPhotos,
      contextIndex < 0 ? index : contextIndex,
      context
    );
    const margin = best.score - (second?.score ?? 0);
    const withinPatrol = Number.isFinite(best.timeDistance) && best.timeDistance <= 35;
    const adjacentRouteCandidate = photo.shared
      ? [
        ...contextPhotos.slice(contextIndex + 1),
        ...contextPhotos.slice(0, contextIndex).reverse()
      ].find((neighbor) =>
        neighbor.sourceSeries === photo.sourceSeries
        && neighbor.routeKey
        && !neighbor.shared
        && (neighbor.score ?? 0) >= 82
        && Number.isFinite(neighbor.captureOrder)
        && Number.isFinite(photo.captureOrder)
        && Math.abs(neighbor.captureOrder - photo.captureOrder) <= 2
      )?.routeKey || ""
      : "";
    const adjacentExclusiveRoute = adjacentRouteCandidate && adjacentRouteCandidate !== best.routeKey
      ? adjacentRouteCandidate
      : "";
    const routeKey = seriesRoute
      || adjacentExclusiveRoute
      || (dominantRoute && best.score < 70 ? dominantRoute : best.routeKey);
    const routeWindow = context.windows[routeKey];
    const routeDistance = timeDistanceToWindow(photo, routeWindow);
    const dominantWindowMatch = dominantRoute === routeKey
      && context.anchorCounts[routeKey] >= 2
      && (!Number.isFinite(routeDistance) || routeDistance <= 360);
    const attachable = (Boolean(seriesRoute)
      || best.score >= 72 && (margin >= 7 || dominantRoute === routeKey)
      || dominantWindowMatch)
      && (!photo.transit || Boolean(seriesRoute) || dominantWindowMatch || routeDistance <= 35);

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
          : photo.event === "accident"
            ? "事故处理点"
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
      confidence: adjacentExclusiveRoute
        ? "topology"
        : topologyConfirmed
          ? photo.pointId?.startsWith("g6-haidong") && (photo.score ?? 0) >= 94
            ? "high"
            : "topology"
        : photo.shared || photo.transit || !photo.pointId
          ? "context"
          : margin >= 18 && (withinPatrol || dominantRoute === routeKey) ? "high" : "context",
      reason: adjacentExclusiveRoute
        ? `根据紧邻的${ROUTES[adjacentExclusiveRoute].label}唯一点位和拍摄顺序自动确认。`
        : topologyConfirmed
        ? `根据${ROUTES[routeKey].label}同批次已验证点位、相邻图片与拍摄时序自动确认。`
        : routeChanged || photo.shared || photo.transit
        ? `根据${ROUTES[routeKey].label}的唯一点位、相邻图片与拍摄时序自动归集（路线优势 ${Math.round(margin)} 分）。`
        : photo.reason
    };
  });

  return assignPatrolGroups(
    refineContextSurveyPoints(
      refineG6Turnarounds(
        repairContextTimes(
          excludePostRouteTransit(
            refineSequentialRouteTransitions(
              refineWestTopology(classified)
            )
          )
        )
      )
    )
  );
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

function standardConclusion(route, confirmedCondition, hasEvents = false) {
  if (hasEvents) {
    return confirmedCondition === "畅通"
      ? "上述事故处理、施工监管或专项巡查事项已按现场情况登记；除上述已记录事项外，巡查结束时已核验路段通行秩序正常。"
      : "上述事故处理、施工监管或专项巡查事项及处置结果以现场核验登记为准；未拍摄路段情况需由提交人确认。";
  }
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
  if (photo.event === "accident") return `${cnTime(photo.time)}巡查至${photo.place}，发现交通事故并开展现场安全警戒和处置；人员伤亡、路产损失及恢复通行情况以现场核验登记为准。`;
  if (photo.event === "construction") return `${cnTime(photo.time)}巡查至${photo.place}，对现场作业开展施工监管，作业安全措施及通行组织以现场核验结果为准。`;
  if (photo.event === "overload") return `${cnTime(photo.time)}巡查至${photo.place}，开展超限治理相关巡查，检查情况以现场登记为准。`;
  if (photo.event === "facility-survey") return `${cnTime(photo.time)}对沿线路域环境、桥下空间及公路附属设施开展现场勘察，未发现异常情况。`;
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
  let exitedRoute = false;
  for (const [index, photo] of photos.entries()) {
    if (index === 0 && ["高速入口", "西宁西方向"].includes(photo.place)) continue;
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
    } else if (photo.place === "西过境出口") {
      exitedRoute = true;
      lines.push(`${cnTime(photo.time)}从西过境出口驶离管辖路段，返回大队；`);
    } else if (photo.place !== "连接/待确认节点") {
      lines.push(eventLine(photo));
    }
  }
  lines.push(exitedRoute
    ? `${cnTime(endTime)}返回大队，巡查结束。`
    : `${cnTime(endTime)}离开管辖路段，返回大队，巡查结束。`);
  lines.push(standardConclusion(route, confirmedCondition, photos.some((photo) => photo.event)));
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
  lines.push(standardConclusion(route, confirmedCondition, ordered.some((photo) => photo.event)));
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
  const eventTypes = [...new Set(readiness.included.map((photo) => photo.event).filter(Boolean))];
  const eventLabels = eventTypes.map((event) => ({
    accident: "事故处理",
    construction: "施工监管",
    overload: "超限治理",
    "facility-survey": "路域设施勘察"
  })[event]).filter(Boolean);
  const baseFocus = "公路路面、公路附属设施、公路用地及建筑控制区监管";
  return {
    routeKey,
    date,
    dateLabel: toDisplayDate(date),
    vehicle,
    officers,
    checkCategory: "公路路政巡查",
    checkType: "公路巡查",
    focus: [baseFocus, ...eventLabels].join("；"),
    eventTypes,
    eventLabels,
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
      event: photo.event || "",
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
