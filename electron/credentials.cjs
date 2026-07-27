"use strict";

// 巡查工作台 —— 官方系统帐密
// 来源：pwd.md（仅主进程使用，不暴露给渲染进程）
const CREDENTIALS = Object.freeze([
  { username: "63010219890323162X", password: "23162X" },
  { username: "兰萍萍", password: "Jtzhzf@17334" },
  { username: "史正健", password: "jtzhzf@2026" },
  { username: "唐宁", password: "Tn29090130" },
  { username: "张彩琪", password: "Zcq@90114" },
  { username: "李彩燕", password: "lcy0425@" },
  { username: "李得祥", password: "jtzhzf@2026" },
  { username: "李文香", password: "Yjkdd@17831" },
  { username: "李芬红", password: "LFHlfh8230305#" },
  { username: "杨富强", password: "CGDD@2026" },
  { username: "段小燕", password: "Dxy17034#" },
  { username: "牟强", password: "mu@61403631" },
  { username: "王英", password: "yjk@17821" },
  { username: "韵家口高大", password: "Yjk@2026" },
  { username: "马玲瑞", password: "mlr626489@" },
  { username: "黄昇鹏", password: "Hsp@931123" }
]);

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
