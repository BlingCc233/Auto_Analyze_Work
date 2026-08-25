function withTimeout(promise, milliseconds) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`local server cleanup exceeded ${milliseconds}ms`)),
      milliseconds
    );
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function createAppLifecycle({
  app,
  BrowserWindow,
  disposeOfficialSession,
  closeLocalServer,
  logger = console,
  platform = process.platform,
  shutdownTimeoutMs = 3000
}) {
  let shutdownPromise = null;
  let shutdownComplete = false;

  const logFailure = (label, error) => {
    const message = String(error?.message || error || "unknown error").slice(0, 500);
    logger.error?.(`[shutdown] ${label}: ${message}`);
  };

  const destroyWindows = () => {
    const windows = typeof BrowserWindow?.getAllWindows === "function"
      ? BrowserWindow.getAllWindows()
      : [];
    for (const window of windows) {
      try {
        if (!window?.isDestroyed?.()) window.destroy();
      } catch (error) {
        logFailure("window destroy failed", error);
      }
    }
  };

  const shutdown = (exitCode = 0) => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      try {
        await disposeOfficialSession?.();
      } catch (error) {
        logFailure("official session cleanup failed", error);
      }
      destroyWindows();
      try {
        await withTimeout(
          Promise.resolve(closeLocalServer?.()),
          shutdownTimeoutMs
        );
      } catch (error) {
        logFailure("local server cleanup failed", error);
      }
      shutdownComplete = true;
      app.exit(exitCode);
    })();
    return shutdownPromise;
  };

  const handleMainWindowClose = (event) => {
    if (platform === "darwin" || shutdownPromise) return;
    event?.preventDefault?.();
    app.quit();
  };

  const handleBeforeQuit = (event) => {
    if (shutdownComplete) return;
    event?.preventDefault?.();
    void shutdown(0);
  };

  return {
    handleBeforeQuit,
    handleMainWindowClose,
    isShuttingDown: () => Boolean(shutdownPromise),
    shutdown
  };
}

module.exports = { createAppLifecycle };
