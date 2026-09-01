"use strict";

// This reversible payload keeps credentials out of casual source inspection.
// It is obfuscation, not cryptographic secret storage; only the desktop main
// process decodes it and the renderer receives usernames only.
const PAYLOAD = "3aXZxBRjZflO3ogAdp8MTwq9BOxOGTZIqPNas0DHIGJ/dZw+u4PKiCEaHa5XLEg6bqc48qRCb1FJbLI4Cz5SdRLx8knMdRCt8CFJppamzDL3rrz+GvSXeeg+agieu7LxlrFkL9CLsDTvcyZwoTIZh74S+vlswCnjOQrFM8CDZt9MBzEIbBfX0f+gfSCAwg9vrYyT4gSdtB/d4Sys2YQmYmEoGtXadhjbjIUw4nIEBqHA8Wd7Br0dRsDhRkagtef0BpxM/T+qo4w6sU4EHv4wwKG6QEwUEPy6ft+OBarL/Uw3oJbixdEUAqR8Fky7RRBjOBtxghNdpdm4D5ArQ1XXGreG+IqJS3Vy/LZJcSztKEdEIW7dH9bL6esZ3meUrzZKhdk3WLXydyZ+Qb+3C/RLthWfq87OiYfaOyIwYFEEsRPRvfC5IviRpmTAkHig8OJigumlIafehYB/quEoAh4kiwkW1+Tbz5/29oucMXa0xbO+lklI5tlOvnQedjgFhUVfDvsyF+pdrnD6PqpgY6caeAoA2EoSqKTdFryIo/NsAwp9Z5B6Fd4AF+4o+NjuROTHWVsiPqM6PzeTkGrBzIHasmFYsqT3R0ICORQ+zpv92w72uN2No5CbbaqOBFY1Jo/0YMGiYpm1krepQyhTUoePB+0iBHvznLI4UfzE55mAxy2qs5wvB+G7SlLLjIYuJCix9QRWPztnfTbhquFqideMUSJVRvoaZlUpCt6Yc49u3xyL8vqxzmDFYPBsEIg7qZbGvdmSyM2CMc50X3MEp7yotwBiHaiisq15Gix42I6qQK/BaW98kLW3T+D5uCExGtc7jc1AJz7f+SbuEGqBsz9SudveUHi5c2gQIVsrvT2xaC8Oin8sy3iKwxwrQY9JsWX6VAOQWRInP7VqiuW2bEAf6FpbXkoyk8xQnkv2B1G6Ms1LaIW24JmVV1juA7lbbCNCjulFm9AQe66jU4SqpxY4I6uLy6ahCcJnVy2YXwsplGjdlUG0XUIVvMFwbF/Nqp54Q6jAmVQEN5iAXnz5g/X8f9kwdkRC";
const SEED = 0x2df4a0b7;

function nextMask(state) {
  let value = state >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function decodeCredentials() {
  const encrypted = Buffer.from(PAYLOAD, "base64");
  const decoded = Buffer.allocUnsafe(encrypted.length);
  let state = SEED;
  for (let index = 0; index < encrypted.length; index += 1) {
    state = nextMask(state);
    decoded[index] = encrypted[index] ^ (state & 0xff);
  }
  const entries = JSON.parse(decoded.toString("utf8"));
  if (!Array.isArray(entries) || entries.some((entry) =>
    !entry
    || typeof entry.username !== "string"
    || !entry.username.trim()
    || typeof entry.password !== "string"
    || !entry.password
  )) {
    throw new Error("凭据载荷格式无效");
  }
  const usernames = new Set();
  for (const entry of entries) {
    if (usernames.has(entry.username)) throw new Error("凭据载荷存在重复用户名");
    usernames.add(entry.username);
  }
  return Object.freeze(entries.map((entry) => Object.freeze({
    username: entry.username,
    password: entry.password
  })));
}

const CREDENTIALS = decodeCredentials();

function listUsernames() {
  return CREDENTIALS.map((entry) => entry.username);
}

function findCredentials(username) {
  return CREDENTIALS.find(
    (entry) => entry.username === String(username).trim()
  ) || null;
}

module.exports = {
  CREDENTIALS,
  listUsernames,
  findCredentials
};
