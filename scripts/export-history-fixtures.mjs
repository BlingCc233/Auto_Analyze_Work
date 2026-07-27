import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CdpOfficialBridge } from "../server/official-cdp-bridge.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "data", "history-corpus");
const START_DATE = process.env.START_DATE || "2026-07-01";
const END_DATE = process.env.END_DATE || "2026-07-25";
const MIN_RECORD = Number(process.env.MIN_RECORD || 0);
const MAX_RECORD_EXCLUSIVE = Number(process.env.MAX_RECORD_EXCLUSIVE || 1598);
const RECORD_FILTER = new Set(
  String(process.env.RECORDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const FORCE = process.argv.includes("--force");
const MAX_RECORDS_PER_RUN = 10;

if (!RECORD_FILTER.size) {
  throw new Error(
    "为避免批量请求官方附件，必须通过 RECORDS 显式指定记录编号，例如："
    + " RECORDS=01568,01569,01570 npm run export:history"
  );
}

if (RECORD_FILTER.size > MAX_RECORDS_PER_RUN) {
  throw new Error(
    `单次最多导出${MAX_RECORDS_PER_RUN}条记录，当前指定了${RECORD_FILTER.size}条`
  );
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function recordNumber(value) {
  return Number(String(value || "").replace(/\D/g, ""));
}

function imageExtension(value) {
  const extension = path.extname(String(value || "")).toLowerCase();
  return [".jpg", ".jpeg", ".png"].includes(extension)
    ? extension === ".jpeg" ? ".jpg" : extension
    : ".jpg";
}

function detectImage(buffer) {
  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) return ".jpg";
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) return ".png";
  return "";
}

class DownloadClient {
  constructor(page, downloadPath) {
    this.page = page;
    this.downloadPath = downloadPath;
    this.socket = null;
    this.sequence = 0;
    this.pending = new Map();
    this.waiters = [];
    this.downloads = new Map();
  }

  async open() {
    this.socket = new WebSocket(this.page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id && this.pending.has(message.id)) {
        const waiter = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message));
        else waiter.resolve(message.result);
        return;
      }
      if (message.method === "Browser.downloadWillBegin") {
        const waiter = this.waiters.shift();
        if (waiter) {
          this.downloads.set(message.params.guid, waiter);
          waiter.suggestedFilename = message.params.suggestedFilename;
        }
        return;
      }
      if (message.method === "Browser.downloadProgress") {
        const waiter = this.downloads.get(message.params.guid);
        if (!waiter) return;
        if (message.params.state === "completed") {
          this.downloads.delete(message.params.guid);
          waiter.resolve({
            filePath: path.join(this.downloadPath, message.params.guid),
            suggestedFilename: waiter.suggestedFilename
          });
        } else if (message.params.state === "canceled") {
          this.downloads.delete(message.params.guid);
          waiter.reject(new Error("官方附件下载被取消"));
        }
      }
    });
    await this.call("Browser.setDownloadBehavior", {
      behavior: "allowAndName",
      downloadPath: this.downloadPath,
      eventsEnabled: true
    });
  }

  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP调用超时：${method}`));
      }, 30_000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description
        || result.exceptionDetails.text
        || "官方页面执行失败"
      );
    }
    return result.result?.value;
  }

  async openRecord(row) {
    const result = await this.evaluate(`(async () => {
      location.hash = "#/dutyRecord";
      const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const list = [...document.querySelectorAll("*")]
          .map((element) => element.__vue__)
          .find((value) => value && Array.isArray(value.tableData) && typeof value.recordDetail === "function");
        if (list) {
          await list.recordDetail(${JSON.stringify(row)});
          for (let detailAttempt = 0; detailAttempt < 40; detailAttempt += 1) {
            const detail = [...document.querySelectorAll("*")]
              .map((element) => element.__vue__)
              .find((value) => value
                && Array.isArray(value.listAtt)
                && typeof value.download === "function"
                && String(value.inspectRecordForm && value.inspectRecordForm.recordId || "") === ${JSON.stringify(row.recordId)});
            if (detail) return { ok: true, attachmentCount: detail.listAtt.length };
            await sleep(100);
          }
          throw new Error("现场记录详情组件未就绪");
        }
        await sleep(100);
      }
      throw new Error("现场记录列表组件未就绪");
    })()`);
    if (!result?.ok) throw new Error(`无法打开记录${row.recordNum}`);
    return result;
  }

  downloadAttachment(index) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiterIndex = this.waiters.indexOf(waiter);
        if (waiterIndex >= 0) this.waiters.splice(waiterIndex, 1);
        reject(new Error("官方附件下载超时"));
      }, 45_000);
      const waiter = {
        suggestedFilename: "",
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      };
      this.waiters.push(waiter);
      this.evaluate(`(() => {
        const detail = [...document.querySelectorAll("*")]
          .map((element) => element.__vue__)
          .find((value) => value && Array.isArray(value.listAtt) && typeof value.download === "function");
        if (!detail || !detail.listAtt[${index}]) throw new Error("附件不存在");
        detail.download(detail.listAtt[${index}]);
        return true;
      })()`).catch((error) => {
        const waiterIndex = this.waiters.indexOf(waiter);
        if (waiterIndex >= 0) this.waiters.splice(waiterIndex, 1);
        waiter.reject(error);
      });
    });
  }

  close() {
    this.socket?.close();
    this.socket = null;
  }
}

async function queryRecords(official) {
  const response = await official._request({
    url: "/check/record/cheRecordPageList",
    method: "get",
    params: {
      current: 1,
      size: -1,
      checkStartTime: `${START_DATE} 00:00:00`,
      checkEndTime: `${END_DATE} 23:59:59`
    }
  });
  if (String(response?.code) !== "200" || !Array.isArray(response?.data?.records)) {
    throw new Error("官方历史现场记录列表返回格式不正确");
  }
  return response.data.records
    .filter((row) => {
      const number = recordNumber(row.recordNum);
      return number >= MIN_RECORD
        && number < MAX_RECORD_EXCLUSIVE
        && (!RECORD_FILTER.size || RECORD_FILTER.has(row.recordNum));
    })
    .sort((left, right) =>
      String(left.checkStartTime).localeCompare(String(right.checkStartTime))
      || recordNumber(left.recordNum) - recordNumber(right.recordNum)
    );
}

async function existingManifest() {
  try {
    return JSON.parse(await readFile(path.join(OUTPUT, "manifest.json"), "utf8"));
  } catch {
    return [];
  }
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });
  const downloadPath = await mkdtemp(path.join(tmpdir(), "qh-history-download-"));
  const bridge = new CdpOfficialBridge({ logger: { log() {}, error() {} } });
  let downloadClient;
  try {
    const active = await bridge._connectBest();
    const status = await active.official.status();
    if (!status.authenticated || !status.serviceReady) {
      throw new Error("官方Chrome会话尚未登录或请求服务未就绪");
    }
    downloadClient = new DownloadClient(active.page, downloadPath);
    await downloadClient.open();
    const records = await queryRecords(active.official);
    const previous = new Map(
      (await existingManifest()).map((entry) => [entry.recordNum, entry])
    );
    const manifest = [];

    for (const [recordIndex, row] of records.entries()) {
      const directory = path.join(OUTPUT, row.recordNum);
      const previousRecord = previous.get(row.recordNum);
      if (!FORCE && previousRecord?.attachments?.length) {
        let complete = true;
        for (const attachment of previousRecord.attachments) {
          try {
            const info = await stat(path.join(directory, attachment.file));
            if (!info.isFile() || info.size === 0) complete = false;
          } catch {
            complete = false;
          }
        }
        if (complete) {
          manifest.push(previousRecord);
          console.log(`[${recordIndex + 1}/${records.length}] ${row.recordNum}: 已存在，跳过`);
          continue;
        }
      }

      const detail = await active.official._recordDetail(row.recordId);
      const sourceAttachments = Array.isArray(detail.listAtt) ? detail.listAtt : [];
      await mkdir(directory, { recursive: true });
      await downloadClient.openRecord(row);
      const attachments = [];
      for (const [index, source] of sourceAttachments.entries()) {
        const downloaded = await downloadClient.downloadAttachment(index);
        const buffer = await readFile(downloaded.filePath);
        const detectedExtension = detectImage(buffer);
        if (!detectedExtension) {
          throw new Error(`${row.recordNum}第${index + 1}个附件不是JPEG或PNG`);
        }
        const expectedExtension = imageExtension(source.name);
        const extension = detectedExtension || expectedExtension;
        const file = `${String(index + 1).padStart(2, "0")}${extension}`;
        await rename(downloaded.filePath, path.join(directory, file));
        attachments.push({
          file,
          expectedName: String(source.name || "")
        });
      }
      manifest.push({
        recordNum: row.recordNum,
        recordId: row.recordId,
        routeCode: Array.isArray(detail.roadNum)
          ? detail.roadNum.join(";")
          : String(detail.roadNum || ""),
        roadName: Array.isArray(detail.roadName)
          ? detail.roadName.join(";")
          : String(detail.roadName || ""),
        startTime: detail.checkStartTime,
        endTime: detail.checkEndTime,
        people: detail.personNames || detail.personName || "",
        describes: detail.describes || "",
        attachments
      });
      console.log(
        `[${recordIndex + 1}/${records.length}] ${row.recordNum}: ${attachments.length} 张`
      );
      await sleep(80);
    }

    await writeFile(
      path.join(OUTPUT, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    const totalImages = manifest.reduce(
      (sum, record) => sum + record.attachments.length,
      0
    );
    console.log(`历史语料导出完成：${manifest.length} 条记录，${totalImages} 张匿名图片。`);
  } finally {
    downloadClient?.close();
    bridge.dispose();
    await rm(downloadPath, { recursive: true, force: true });
  }
}

await main();
