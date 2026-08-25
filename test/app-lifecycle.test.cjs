const test = require("node:test");
const assert = require("node:assert/strict");
const { createAppLifecycle } = require("../electron/app-lifecycle.cjs");

function closeEvent() {
  return {
    prevented: false,
    preventDefault() { this.prevented = true; }
  };
}

test("closing the Windows workbench requests a full application quit", () => {
  let quitCalls = 0;
  const lifecycle = createAppLifecycle({
    app: { quit() { quitCalls += 1; }, exit() {} },
    BrowserWindow: { getAllWindows: () => [] },
    platform: "win32"
  });
  const event = closeEvent();
  lifecycle.handleMainWindowClose(event);
  assert.equal(event.prevented, true);
  assert.equal(quitCalls, 1);
});

test("quit waits for resource cleanup, destroys every window and exits once", async () => {
  const order = [];
  const windows = [1, 2].map((id) => ({
    isDestroyed: () => false,
    destroy: () => order.push(`destroy-${id}`)
  }));
  const app = {
    quit() {},
    exit(code) { order.push(`exit-${code}`); }
  };
  const lifecycle = createAppLifecycle({
    app,
    BrowserWindow: { getAllWindows: () => windows },
    disposeOfficialSession: async () => order.push("dispose-official"),
    closeLocalServer: async () => {
      await Promise.resolve();
      order.push("close-server");
    },
    shutdownTimeoutMs: 100
  });
  const event = closeEvent();
  lifecycle.handleBeforeQuit(event);
  lifecycle.handleBeforeQuit(closeEvent());
  await lifecycle.shutdown();
  assert.equal(event.prevented, true);
  assert.deepEqual(order, [
    "dispose-official",
    "destroy-1",
    "destroy-2",
    "close-server",
    "exit-0"
  ]);
});

test("macOS keeps the application alive when its main window closes", () => {
  let quitCalls = 0;
  const lifecycle = createAppLifecycle({
    app: { quit() { quitCalls += 1; }, exit() {} },
    BrowserWindow: { getAllWindows: () => [] },
    platform: "darwin"
  });
  const event = closeEvent();
  lifecycle.handleMainWindowClose(event);
  assert.equal(event.prevented, false);
  assert.equal(quitCalls, 0);
});
