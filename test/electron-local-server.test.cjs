const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdir, mkdtemp, rm, stat, writeFile } = require("node:fs/promises");
const { request } = require("node:http");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const {
  businessDate,
  resolveNativeOcrRuntimeRoot,
  startLocalServer
} = require("../electron/local-server.cjs");

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00
]);

async function createFixture({ directDist = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "qh-electron-server-"));
  const appRoot = directDist ? join(root, "dist") : root;
  const distRoot = directDist ? appRoot : join(appRoot, "dist");
  const dailyRoot = join(root, "daily");
  await mkdir(join(distRoot, "assets"), { recursive: true });
  await mkdir(dailyRoot, { recursive: true });
  await writeFile(
    join(distRoot, "index.html"),
    '<!doctype html><div id="app">workbench</div><script src="/assets/app.js"></script>'
  );
  await writeFile(join(distRoot, "assets", "app.js"), "globalThis.loaded = true;");
  return {
    root,
    appRoot,
    distRoot,
    dailyRoot,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

async function closeServer(server) {
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
    server.closeAllConnections?.();
  });
}

function rawRequest(url, {
  method = "GET",
  headers = {},
  body = ""
} = {}) {
  const target = new URL(url);
  return new Promise((resolveRequest, rejectRequest) => {
    const req = request({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method,
      headers: {
        connection: "close",
        ...headers
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolveRequest({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    req.on("error", rejectRequest);
    if (body) req.write(body);
    req.end();
  });
}

async function withServer(options, action) {
  const local = await startLocalServer({ ...options, port: 0 });
  try {
    return await action(local);
  } finally {
    await local.close();
  }
}

test("close drains active local sockets and is idempotent", async () => {
  const fixture = await createFixture();
  const local = await startLocalServer({
    appRoot: fixture.appRoot,
    dailyRoot: fixture.dailyRoot,
    port: 0
  });
  try {
    const response = await rawRequest(`${local.url}/`);
    assert.equal(response.status, 200);
    await Promise.all([local.close(), local.close()]);
    assert.equal(local.server.listening, false);
  } finally {
    if (local.server.listening) await closeServer(local.server);
    await fixture.cleanup();
  }
});

test("uses the external Resources directory as the packaged OCR runtime root", () => {
  const resources = join(tmpdir(), "Patrol.app", "Contents", "Resources");
  assert.equal(
    resolveNativeOcrRuntimeRoot(join(resources, "app.asar"), resources),
    resources
  );
  assert.equal(
    resolveNativeOcrRuntimeRoot("/workspace/patrol", resources),
    resolve("/workspace/patrol")
  );
});

test("uses the current China business date instead of the latest historical folder", async () => {
  const fixture = await createFixture();
  try {
    await mkdir(join(fixture.dailyRoot, "260727"));
    assert.equal(
      businessDate(new Date("2026-07-27T16:30:00.000Z")),
      "2026-07-28"
    );
    await withServer({
      appRoot: fixture.appRoot,
      dailyRoot: fixture.dailyRoot,
      now: () => new Date("2026-07-27T16:30:00.000Z")
    }, async ({ url }) => {
      const response = await rawRequest(`${url}/api/today`);
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.body), { date: "2026-07-28" });
    });
  } finally {
    await fixture.cleanup();
  }
});

test("serves built assets and uses index.html only for SPA navigation", async () => {
  const fixture = await createFixture();
  try {
    await withServer({
      appRoot: fixture.appRoot,
      dailyRoot: fixture.dailyRoot
    }, async ({ url, distRoot }) => {
      assert.equal(distRoot, fixture.distRoot);

      const index = await rawRequest(`${url}/`);
      assert.equal(index.status, 200);
      assert.match(index.body, /id="app"/);

      const asset = await rawRequest(`${url}/assets/app.js`);
      assert.equal(asset.status, 200);
      assert.equal(asset.headers["content-type"], "application/javascript; charset=utf-8");
      assert.match(asset.body, /loaded/);

      const route = await rawRequest(`${url}/records/2026-07-26`, {
        headers: { accept: "text/html" }
      });
      assert.equal(route.status, 200);
      assert.match(route.body, /workbench/);

      const missingAsset = await rawRequest(`${url}/assets/missing.js`);
      assert.equal(missingAsset.status, 404);
      assert.equal(missingAsset.body, "Not found");
    });
  } finally {
    await fixture.cleanup();
  }
});

test("accepts an appRoot that already points at the built dist directory", async () => {
  const fixture = await createFixture({ directDist: true });
  try {
    await withServer({
      appRoot: fixture.appRoot,
      dailyRoot: fixture.dailyRoot
    }, async ({ url, distRoot }) => {
      assert.equal(distRoot, fixture.distRoot);
      const response = await rawRequest(url);
      assert.equal(response.status, 200);
      assert.match(response.body, /workbench/);
    });
  } finally {
    await fixture.cleanup();
  }
});

test("POST /api/ocr forwards only a validated image to the native OCR bridge", async () => {
  const fixture = await createFixture();
  const calls = [];
  try {
    await withServer({
      appRoot: fixture.appRoot,
      dailyRoot: fixture.dailyRoot,
      nativeOcr: async (payload, options) => {
        calls.push({ payload, options });
        return {
          ok: true,
          engine: "apple-vision",
          ocrText: "11:41 西宁市",
          timeOcrText: "11:41",
          confidence: 99
        };
      }
    }, async ({ url }) => {
      const response = await rawRequest(`${url}/api/ocr`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: url,
          "sec-fetch-site": "same-origin"
        },
        body: JSON.stringify({
          mimeType: "image/png",
          dataBase64: PNG_BYTES.toString("base64"),
          ignoredGroundTruthHint: "must-not-be-forwarded"
        })
      });
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.body), {
        ok: true,
        engine: "apple-vision",
        ocrText: "11:41 西宁市",
        timeOcrText: "11:41",
        confidence: 99
      });
    });

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].payload, {
      mimeType: "image/png",
      dataBase64: PNG_BYTES.toString("base64")
    });
    assert.equal(calls[0].options.root, fixture.appRoot);
  } finally {
    await fixture.cleanup();
  }
});

test("loads server/native-ocr.mjs and returns only after its temporary image is deleted", async () => {
  const fixture = await createFixture();
  const nativeServerRoot = join(fixture.appRoot, "server");
  const temporaryDirectory = join(fixture.appRoot, "native-ocr-temporary");
  try {
    await mkdir(nativeServerRoot, { recursive: true });
    await writeFile(
      join(nativeServerRoot, "native-ocr.mjs"),
      `import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
export async function recognizeNativeImage(input, { root }) {
  const directory = join(root, "native-ocr-temporary");
  await mkdir(directory);
  try {
    await writeFile(join(directory, "image.png"), Buffer.from(input.dataBase64, "base64"));
    return {
      ok: true,
      engine: "apple-vision-fixture",
      ocrText: "08:57 S1113",
      timeOcrText: "08:57",
      confidence: 99
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}`
    );

    await withServer({
      appRoot: fixture.appRoot,
      dailyRoot: fixture.dailyRoot
    }, async ({ url }) => {
      const response = await rawRequest(`${url}/api/ocr`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: url
        },
        body: JSON.stringify({
          mimeType: "image/png",
          dataBase64: PNG_BYTES.toString("base64")
        })
      });
      assert.equal(response.status, 200);
      assert.equal(JSON.parse(response.body).engine, "apple-vision-fixture");
      await assert.rejects(stat(temporaryDirectory), { code: "ENOENT" });
    });
  } finally {
    await fixture.cleanup();
  }
});

test("OCR limits reject oversized bodies and decoded images before native OCR", async () => {
  const fixture = await createFixture();
  let calls = 0;
  try {
    await withServer({
      appRoot: fixture.appRoot,
      dailyRoot: fixture.dailyRoot,
      limits: {
        maxBodyBytes: 128,
        maxImageBytes: PNG_BYTES.length - 1
      },
      nativeOcr: async () => {
        calls += 1;
        return { ok: true };
      }
    }, async ({ url }) => {
      const tooLargeBody = await rawRequest(`${url}/api/ocr`, {
        method: "POST",
        headers: {
          "content-length": "129",
          origin: url
        }
      });
      assert.equal(tooLargeBody.status, 413);
      assert.equal(JSON.parse(tooLargeBody.body).error.code, "REQUEST_TOO_LARGE");

      const tooLargeImage = await rawRequest(`${url}/api/ocr`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: url
        },
        body: JSON.stringify({
          mimeType: "image/png",
          dataBase64: PNG_BYTES.toString("base64")
        })
      });
      assert.equal(tooLargeImage.status, 413);
      assert.equal(JSON.parse(tooLargeImage.body).error.code, "INVALID_OCR_IMAGE");
    });
    assert.equal(calls, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("native OCR failures are sanitized for frontend fallback and server stays alive", async () => {
  const fixture = await createFixture();
  try {
    await withServer({
      appRoot: fixture.appRoot,
      dailyRoot: fixture.dailyRoot,
      nativeOcr: async () => {
        const error = new Error("Apple Vision temporarily unavailable");
        error.code = "NATIVE_OCR_UNAVAILABLE";
        throw error;
      }
    }, async ({ url }) => {
      const failed = await rawRequest(`${url}/api/ocr`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: url
        },
        body: JSON.stringify({
          mimeType: "image/png",
          dataBase64: PNG_BYTES.toString("base64")
        })
      });
      assert.equal(failed.status, 200);
      assert.deepEqual(JSON.parse(failed.body), {
        ok: false,
        error: {
          code: "NATIVE_OCR_UNAVAILABLE",
          message: "Apple Vision temporarily unavailable"
        }
      });

      const health = await rawRequest(`${url}/`);
      assert.equal(health.status, 200);
      assert.match(health.body, /workbench/);
    });
  } finally {
    await fixture.cleanup();
  }
});

test("rejects cross-origin OCR requests without invoking native OCR", async () => {
  const fixture = await createFixture();
  let calls = 0;
  try {
    await withServer({
      appRoot: fixture.appRoot,
      dailyRoot: fixture.dailyRoot,
      nativeOcr: async () => {
        calls += 1;
        return { ok: true };
      }
    }, async ({ url }) => {
      const response = await rawRequest(`${url}/api/ocr`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://example.invalid"
        },
        body: JSON.stringify({
          mimeType: "image/png",
          dataBase64: PNG_BYTES.toString("base64")
        })
      });
      assert.equal(response.status, 403);
      assert.equal(JSON.parse(response.body).error.code, "UNTRUSTED_LOCAL_REQUEST");
    });
    assert.equal(calls, 0);
  } finally {
    await fixture.cleanup();
  }
});
