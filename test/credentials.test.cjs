"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { test } = require("node:test");

const credentialsPath = require.resolve("../electron/credentials.cjs");
const {
  CREDENTIALS,
  configureUserStore,
  findCredentials,
  findStoredCredentials,
  listStoredUsernames,
  listUsernames,
  rememberCredentials
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

test("remembers manually entered accounts and replaces an updated password", () => {
  const directory = mkdtempSync(join(tmpdir(), "qh-duty-credentials-"));
  try {
    configureUserStore({ filePath: join(directory, "credentials.dat") });
    rememberCredentials("马玲瑞", "old-password");
    rememberCredentials("值班员", "duty-password");
    rememberCredentials("马玲瑞", "new-password");

    assert.deepEqual(listStoredUsernames(), ["马玲瑞", "值班员"]);
    assert.deepEqual(findStoredCredentials("马玲瑞"), {
      username: "马玲瑞",
      password: "new-password"
    });
    assert.equal(readFileSync(join(directory, "credentials.dat"), "utf8").includes("new-password"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
