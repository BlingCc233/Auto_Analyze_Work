import test from "node:test";
import assert from "node:assert/strict";
import { rankOfficialPage } from "../server/official-cdp-bridge.mjs";

test("Chrome target ranking prefers authenticated cached official pages", () => {
  const authenticatedCached = rankOfficialPage({
    authenticated: true,
    serviceReady: true,
    cached: true,
    hasSession: true,
    routerReady: true,
    readyState: "complete"
  });
  const staleFirstTab = rankOfficialPage({
    authenticated: false,
    serviceReady: false,
    cached: false,
    hasSession: true,
    routerReady: true,
    readyState: "complete"
  });
  assert.ok(authenticatedCached.join("") > staleFirstTab.join(""));
  assert.deepEqual(authenticatedCached, [1, 1, 1, 1, 1, 1]);
});
