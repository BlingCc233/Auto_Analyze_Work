"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");

const credentialsPath = require.resolve("../electron/credentials.cjs");
const {
  CREDENTIALS,
  findCredentials,
  listUsernames
} = require(credentialsPath);

test("credential payload decodes distinct accounts without plaintext source", () => {
  const source = readFileSync(credentialsPath, "utf8");

  assert.equal(CREDENTIALS.length, 16);
  assert.equal(new Set(listUsernames()).size, CREDENTIALS.length);

  for (const credential of CREDENTIALS) {
    assert.equal(findCredentials(credential.username), credential);
    assert.equal(source.includes(credential.username), false);
    assert.equal(source.includes(credential.password), false);
  }
});
