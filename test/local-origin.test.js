import test from "node:test";
import assert from "node:assert/strict";

import { isTrustedLocalAppOrigin } from "../src/local-origin.js";

test("accepts loopback app origins on development and packaged random ports", () => {
  assert.equal(isTrustedLocalAppOrigin({
    protocol: "http:",
    hostname: "127.0.0.1",
    port: "5173"
  }), true);
  assert.equal(isTrustedLocalAppOrigin({
    protocol: "http:",
    hostname: "127.0.0.1",
    port: "50006"
  }), true);
});

test("rejects non-loopback and non-http origins", () => {
  assert.equal(isTrustedLocalAppOrigin({
    protocol: "https:",
    hostname: "127.0.0.1"
  }), false);
  assert.equal(isTrustedLocalAppOrigin({
    protocol: "http:",
    hostname: "localhost"
  }), false);
  assert.equal(isTrustedLocalAppOrigin({
    protocol: "http:",
    hostname: "example.com"
  }), false);
});
