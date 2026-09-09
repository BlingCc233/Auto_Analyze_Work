// ==UserScript==
// @name         青海交通执法自动登录助手
// @namespace    cn.qh.yunjiaokou.patrol-desk
// @version      0.0.9
// @description  在浏览器本地保存账号后，填写登录页并完成图形滑块验证。
// @match        http://110.167.233.70:8084/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const STORE_KEY = "qh-duty-desk-users";
  const LOGIN_BUTTON_ID = "yjx-login-btn";
  const STATUS_ID = "yjx-status";
  // Local-only defaults. This is reversible obfuscation, not encryption.
  const DEFAULT_PAYLOAD = "3aXZxBRjZflO3ogAdp8MTwq9BOxOGTZIqPNas0DHIGJ/dZw+u4PKiCEaHa5XLEg6bqc48qRCb1FJbLI4Cz5SdRLx8knMdRCt8CFJppamzDL3rrz+GvSXeeg+agieu7LxlrFkL9CLsDTvcyZwoTIZh74S+vlswCnjOQrFM8CDZt9MBzEIbBfX0f+gfSCAwg9vrYyT4gSdtB/d4Sys2YQmYmEoGtXadhjbjIUw4nIEBqHA8Wd7Br0dRsDhRkagtef0BpxM/T+qo4w6sU4EHv4wwKG6QEwUEPy6ft+OBarL/Uw3oJbixdEUAqR8Fky7RRBjOBtxghNdpdm4D5ArQ1XXGreG+IqJS3Vy/LZJcSztKEdEIW7dH9bL6esZ3meUrzZKhdk3WLXydyZ+Qb+3C/RLthWfq87OiYfaOyIwYFEEsRPRvfC5IviRpmTAkHig8OJigumlIafehYB/quEoAh4kiwkW1+Tbz5/29oucMXa0xbO+lklI5tlOvnQedjgFhUVfDvsyF+pdrnD6PqpgY6caeAoA2EoSqKTdFryIo/NsAwp9Z5B6Fd4AF+4o+NjuROTHWVsiPqM6PzeTkGrBzIHasmFYsqT3R0ICORQ+zpv92w72uN2No5CbbaqOBFY1Jo/0YMGiYpm1krepQyhTUoePB+0iBHvznLI4UfzE55mAxy2qs5wvB+G7SlLLjIYuJCix9QRWPztnfTv59edtitCbUH0EEaNNYEM+FtGUe8h2x9nl5IDoyPjLbqJ9Aog/sYvQ+8GKh9W3R8lxW3ABor676FE1RP+kpLplFSBwn5ayhcbECgxGA7u5HfHruCUpB8F9ldUbND/0iCDhGmmS7G4F4IzYRm+lfGQYZkMzdkubOGQW2RUAgTq5vl0oxIFH43ToVAeIRARhJ60RueSdHkId7E4EDx1rxMpGiVf5C1n9KtWAKID9iaXAIVdSDbcJfTFCivFYjZYIY+GCTcCuoxQ0ItLplPf2UJVhQTqEUAch03DFXhOLPzwK0pFGwVHD+I9qQ6zYhEJCL4DqZX/J+v/+f9oxZxtijg==";
  const DEFAULT_SEED = 0x2df4a0b7;
  const documentRef = document;

  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function nextMask(state) {
    let value = state >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
  }

  function localDefaultUsers() {
    try {
      const encrypted = Uint8Array.from(atob(DEFAULT_PAYLOAD), (character) => character.charCodeAt(0));
      const decoded = new Uint8Array(encrypted.length);
      let state = DEFAULT_SEED;
      for (let index = 0; index < encrypted.length; index += 1) {
        state = nextMask(state);
        decoded[index] = encrypted[index] ^ (state & 0xff);
      }
      return normalizeUsers(JSON.parse(new TextDecoder().decode(decoded)));
    } catch {
      return [];
    }
  }

  function normalizeUsers(value) {
    let entries = value;
    if (typeof entries === "string") {
      try {
        entries = JSON.parse(entries);
      } catch {
        entries = [];
      }
    }
    if (!Array.isArray(entries)) return [];
    const usernames = new Set();
    return entries.reduce((users, entry) => {
      const username = typeof entry?.username === "string" ? entry.username.trim() : "";
      const password = typeof entry?.password === "string" ? entry.password : "";
      if (!username || !password || usernames.has(username)) return users;
      usernames.add(username);
      users.push({ username, password });
      return users;
    }, []);
  }

  function loadUsers() {
    try {
      const stored = GM_getValue(STORE_KEY, null);
      if (stored && typeof stored.then === "function") {
        stored.then((value) => {
          users = value === null ? localDefaultUsers() : normalizeUsers(value);
          if (value === null) saveUsers();
          renderUsers();
        }).catch(() => {});
        return [];
      }
      if (stored === null) {
        const defaults = localDefaultUsers();
        GM_setValue(STORE_KEY, defaults);
        return defaults;
      }
      return normalizeUsers(stored);
    } catch {
      return [];
    }
  }

  function saveUsers() {
    GM_setValue(STORE_KEY, users);
  }

  function addStyle() {
    GM_addStyle(`
      .yjx-panel { position: fixed; right: 18px; top: 88px; z-index: 2147483647; width: 238px; padding: 10px; box-sizing: border-box; border: 1px solid #cfd8e3; border-radius: 6px; background: #ffffff; color: #243447; box-shadow: 0 5px 16px rgba(25, 45, 70, .2); font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .yjx-panel-title { margin: 0 0 8px; font-weight: 600; }
      .yjx-row { display: flex; gap: 6px; margin-top: 7px; }
      .yjx-panel select { flex: 1; min-width: 0; height: 30px; border: 1px solid #b8c4d2; border-radius: 3px; background: #fff; color: #243447; }
      .yjx-panel button { min-height: 30px; padding: 0 9px; border: 1px solid #b8c4d2; border-radius: 3px; background: #f6f8fa; color: #243447; cursor: pointer; }
      .yjx-panel button#yjx-login-btn { flex: 1; border-color: #1769aa; background: #1769aa; color: #fff; }
      .yjx-panel button:disabled { cursor: wait; opacity: .65; }
      #yjx-status { display: block; min-height: 18px; margin-top: 7px; color: #516170; font-size: 12px; }
    `);
  }

  function makeElement(tagName, properties = {}) {
    const element = documentRef.createElement(tagName);
    Object.assign(element, properties);
    return element;
  }

  let users = [];
  let selectElement;
  let loginButton;
  let statusElement;

  function setStatus(message) {
    if (statusElement) statusElement.textContent = message;
  }

  function renderUsers() {
    if (!selectElement) return;
    const selected = selectElement.value;
    while (selectElement.children.length) {
      selectElement.removeChild(selectElement.children[0]);
    }
    if (users.length === 0) {
      const placeholder = makeElement("option", {
        value: "",
        textContent: "请先配置本地账号"
      });
      selectElement.appendChild(placeholder);
      selectElement.value = "";
      return;
    }
    for (const user of users) {
      selectElement.appendChild(makeElement("option", {
        value: user.username,
        textContent: user.username
      }));
    }
    selectElement.value = users.some((user) => user.username === selected)
      ? selected
      : users[0].username;
  }

  function selectedUser() {
    return users.find((user) => user.username === selectElement?.value) || null;
  }

  function configureUser() {
    const ask = typeof window.prompt === "function" ? window.prompt.bind(window) : null;
    if (!ask) {
      setStatus("当前环境不支持本地账号配置。");
      return;
    }
    const username = ask("账号", selectedUser()?.username || "");
    if (username === null) return;
    const normalizedName = username.trim();
    if (!normalizedName) {
      setStatus("账号不能为空。");
      return;
    }
    const password = ask("密码", "");
    if (password === null || !password) {
      setStatus("未保存空密码。");
      return;
    }
    const index = users.findIndex((user) => user.username === normalizedName);
    const entry = { username: normalizedName, password };
    if (index >= 0) users[index] = entry;
    else users.push(entry);
    saveUsers();
    renderUsers();
    selectElement.value = normalizedName;
    setStatus("账号已保存在 Tampermonkey 本地存储。");
  }

  function removeUser() {
    const user = selectedUser();
    if (!user) return;
    users = users.filter((entry) => entry.username !== user.username);
    saveUsers();
    renderUsers();
    setStatus("已删除当前本地账号。");
  }

  function findInputs() {
    const username = documentRef.querySelector(
      'input[placeholder*="用户名"], input[name="username"], input[type="text"]'
    );
    const password = documentRef.querySelector('input[type="password"], input[name="password"]');
    return username && password ? { username, password } : null;
  }

  function syncReactiveValue(input, property, value) {
    const candidates = [
      input.__vue__,
      input.__vueParentComponent?.proxy,
      input._value
    ];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      if (candidate.$data && typeof candidate.$data === "object") candidate.$data[property] = value;
      if (property in candidate || candidate.$data) candidate[property] = value;
      if (typeof candidate.$forceUpdate === "function") candidate.$forceUpdate();
    }
  }

  function setInputValue(input, value, property) {
    const descriptor = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement?.prototype || Object.getPrototypeOf(input),
      "value"
    );
    if (descriptor?.set) descriptor.set.call(input, value);
    else input.value = value;
    syncReactiveValue(input, property, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur?.();
  }

  function elementVisible(element) {
    return Boolean(element && element.offsetParent !== null);
  }

  function findCaptcha() {
    const slider = documentRef.querySelector(".verify-slider");
    const panel = slider?.querySelector(".verify-img-out") || slider?.querySelector(".verify-image-panel");
    if (!elementVisible(slider) || !elementVisible(panel)) return null;
    const images = Array.from(panel.querySelectorAll("img.verify-image"))
      .filter((image) => image.complete !== false && image.naturalWidth > 0 && image.naturalHeight > 0);
    if (images.length < 2) return null;
    const track = slider.querySelector(".drag") || slider.querySelector(".verify-bar-area");
    const handle = track?.querySelector(".handler") || track?.querySelector(".handler_bg")
      || track?.querySelector(".slider-btn") || track?.querySelector(".verify-btn");
    if (!track || !handle || !elementVisible(handle)) return null;
    return handle ? { slider, handle, track, panel, images } : null;
  }

  function findCaptchaControl() {
    const slider = documentRef.querySelector(".verify-slider");
    const track = slider?.querySelector(".drag") || slider?.querySelector(".verify-bar-area");
    const handle = track?.querySelector(".handler") || track?.querySelector(".handler_bg")
      || track?.querySelector(".slider-btn") || track?.querySelector(".verify-btn");
    return slider && track && handle && elementVisible(handle) ? { slider, track, handle } : null;
  }

  function createMouseEvent(type, clientX, clientY) {
    return new MouseEvent(type, {
      bubbles: true,
      button: 0,
      buttons: type === "mouseup" ? 0 : 1,
      clientX,
      clientY,
      view: window
    });
  }

  function dispatchWindowMouse(type, clientX, clientY) {
    const target = typeof window.dispatchEvent === "function" ? window : documentRef;
    target.dispatchEvent(createMouseEvent(type, clientX, clientY));
  }

  async function activateCaptcha(timeout) {
    const visible = findCaptcha();
    if (visible) return { captcha: visible, pointerDown: false };
    const control = findCaptchaControl();
    if (!control) return null;
    const handleRect = control.handle.getBoundingClientRect();
    const startX = handleRect.x + Math.max(1, Math.min(handleRect.width / 2, 18));
    const startY = handleRect.y + Math.max(1, handleRect.height / 2);
    control.handle.dispatchEvent(createMouseEvent("mousedown", startX, startY));
    const captcha = await waitForCaptcha(timeout);
    if (captcha) return { captcha, pointerDown: true };
    dispatchWindowMouse("mouseup", startX, startY);
    return null;
  }

  function readImage(image) {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const canvas = documentRef.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    let alphaTotal = 0;
    for (let index = 3; index < data.length; index += 4) alphaTotal += data[index];
    return { width, height, data, alpha: alphaTotal / (width * height) };
  }

  function grayscale(data, offset) {
    return data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
  }

  function locateGap(images) {
    // This page always renders the movable piece before the background image.
    // Keep that order instead of accidentally choosing a logo elsewhere on the page.
    const decoded = images.map(readImage);
    let [piece, background] = decoded;
    if (!piece || !background || piece.width >= background.width || piece.height > background.height) {
      const byAlpha = [...decoded].sort((left, right) => left.alpha - right.alpha);
      piece = byAlpha[0];
      background = byAlpha[byAlpha.length - 1];
    }
    if (!piece || !background || piece.width >= background.width || piece.height > background.height) {
      return null;
    }

    const samples = [];
    for (let y = 0; y < piece.height; y += 2) {
      for (let x = 0; x < piece.width; x += 2) {
        const offset = (y * piece.width + x) * 4;
        if (piece.data[offset + 3] > 80) samples.push({ x, y, value: grayscale(piece.data, offset) });
      }
    }
    if (samples.length < 32) return null;
    const pieceMean = samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
    let best = { x: 0, score: -Infinity };
    const maxX = background.width - piece.width;

    for (let candidateX = 0; candidateX <= maxX; candidateX += 1) {
      let backgroundMean = 0;
      for (const sample of samples) {
        backgroundMean += grayscale(background.data, ((sample.y * background.width + candidateX + sample.x) * 4));
      }
      backgroundMean /= samples.length;
      let covariance = 0;
      let pieceVariance = 0;
      let backgroundVariance = 0;
      for (const sample of samples) {
        const pieceDelta = sample.value - pieceMean;
        const backgroundValue = grayscale(background.data, ((sample.y * background.width + candidateX + sample.x) * 4));
        const backgroundDelta = backgroundValue - backgroundMean;
        covariance += pieceDelta * backgroundDelta;
        pieceVariance += pieceDelta * pieceDelta;
        backgroundVariance += backgroundDelta * backgroundDelta;
      }
      const score = covariance / Math.sqrt(pieceVariance * backgroundVariance || 1);
      if (score > best.score) best = { x: candidateX, score };
    }
    return best.score > 0.35 ? { ...best, backgroundWidth: background.width } : null;
  }

  async function dragCaptcha(captcha, cssOffset, pointerDown = false) {
    const trackRect = captcha.track.getBoundingClientRect();
    const handleRect = captcha.handle.getBoundingClientRect();
    const currentOffset = handleRect.x - trackRect.x;
    const distance = Math.max(0, Math.min(
      Math.round(cssOffset - currentOffset),
      Math.max(0, Math.round(trackRect.width - handleRect.width - 4))
    ));
    const startX = handleRect.x + Math.max(1, Math.min(handleRect.width / 2, 18));
    const startY = handleRect.y + Math.max(1, handleRect.height / 2);
    if (!pointerDown) captcha.handle.dispatchEvent(createMouseEvent("mousedown", startX, startY));
    const steps = 18;
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      const eased = progress * progress * (3 - 2 * progress);
      dispatchWindowMouse("mousemove", startX + distance * eased, startY);
      await wait(12);
    }
    dispatchWindowMouse("mouseup", startX + distance, startY);
  }

  function installCaptchaObserver() {
    if (window.__yjxCaptchaObserverInstalled) return;
    window.__yjxCaptchaObserverInstalled = true;
    window.__yjxCaptchaState = { sequence: 0, accepted: false, completed: false };
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
      this.__yjxCaptchaUrl = String(url || "");
      return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function patchedSend(body) {
      const request = this;
      if (/captcha\/check/i.test(request.__yjxCaptchaUrl || "")) {
        request.addEventListener("load", () => {
          const state = window.__yjxCaptchaState || { sequence: 0 };
          state.sequence += 1;
          state.completed = true;
          state.accepted = false;
          if (request.status === 200) {
            try {
              const response = JSON.parse(request.responseText);
              state.accepted = (response.success === true || response.repCode === "0000")
                && response.repData
                && response.repData.result === true;
            } catch {
              state.accepted = false;
            }
          }
          window.__yjxCaptchaState = state;
        }, { once: true });
      }
      return originalSend.apply(this, arguments);
    };
  }

  function resetCaptchaState() {
    const previous = window.__yjxCaptchaState || { sequence: 0 };
    window.__yjxCaptchaState = {
      sequence: previous.sequence || 0,
      accepted: false,
      completed: false
    };
    return window.__yjxCaptchaState.sequence;
  }

  async function waitForCaptchaResult(sequence, timeout) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const state = window.__yjxCaptchaState;
      if (state?.sequence > sequence && state.completed) return state.accepted === true;
      await wait(50);
    }
    return false;
  }

  async function refreshCaptcha() {
    const refresh = documentRef.querySelector(".verify-refresh");
    if (!refresh) return false;
    refresh.click();
    await wait(180);
    return true;
  }

  function findLoginButton() {
    const buttons = Array.from(documentRef.querySelectorAll("button"));
    return buttons.find((button) => /登\s*录|登录/.test(button.textContent || "")) || null;
  }

  async function waitForCaptcha(timeout) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const captcha = findCaptcha();
      if (captcha) return captcha;
      await wait(80);
    }
    return null;
  }

  async function runLogin() {
    const user = selectedUser();
    if (!user) {
      setStatus("请先配置本地账号。");
      return;
    }
    const inputs = findInputs();
    if (!inputs) {
      setStatus("未找到登录表单。");
      return;
    }
    loginButton.disabled = true;
    try {
      installCaptchaObserver();
      setStatus("正在填写账号。");
      setInputValue(inputs.username, user.username, "username");
      setInputValue(inputs.password, user.password, "password");

      // The first click validates the form; pressing the slider handle then exposes
      // its hidden image challenge. Neither action is the final login attempt.
      setStatus("正在请求图形验证。");
      findLoginButton()?.click();
      let activation = await activateCaptcha(1800);
      let captcha = activation?.captcha;
      if (!captcha || !activation) {
        setStatus("图形验证未出现，未提交登录。");
        return;
      }

      let solved = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        captcha = captcha || await waitForCaptcha(900);
        const gap = captcha && locateGap(captcha.images);
        if (!captcha || !gap) {
          if (!await refreshCaptcha()) break;
          captcha = null;
          activation = null;
          continue;
        }
        const panelRect = captcha.panel.getBoundingClientRect();
        const baseOffset = gap.x * panelRect.width / gap.backgroundWidth;
        const sequence = resetCaptchaState();
        setStatus(`正在完成图形验证（${attempt + 1}/3）。`);
        await dragCaptcha(captcha, baseOffset, activation?.pointerDown === true);
        activation = null;
        solved = await waitForCaptchaResult(sequence, 1600);
        if (solved) break;
        if (!await refreshCaptcha()) break;
        await wait(120);
        captcha = null;
      }

      if (!solved) {
        setStatus("图形验证未通过，已停止登录提交。");
        return;
      }
      // VerifySlide emits the login-form token shortly after its XHR resolves.
      // Clicking in that interval makes the site report a false "not verified" state.
      await wait(180);
      setStatus("正在登录。");
      findLoginButton()?.click();
      await wait(700);
      setStatus("登录请求已提交。");
    } catch {
      setStatus("自动登录未完成，请刷新后重试。");
    } finally {
      loginButton.disabled = false;
    }
  }

  function buildPanel() {
    if (documentRef.getElementById(LOGIN_BUTTON_ID)) return;
    addStyle();
    const panel = makeElement("section", { className: "yjx-panel" });
    panel.appendChild(makeElement("div", {
      className: "yjx-panel-title",
      textContent: "自动登录"
    }));
    selectElement = makeElement("select", { ariaLabel: "本地账号" });
    panel.appendChild(selectElement);
    const commandRow = makeElement("div", { className: "yjx-row" });
    loginButton = makeElement("button", {
      id: LOGIN_BUTTON_ID,
      type: "button",
      textContent: "登录"
    });
    const configureButton = makeElement("button", {
      type: "button",
      textContent: "配置"
    });
    const removeButton = makeElement("button", {
      type: "button",
      textContent: "删除"
    });
    commandRow.appendChild(loginButton);
    commandRow.appendChild(configureButton);
    commandRow.appendChild(removeButton);
    panel.appendChild(commandRow);
    statusElement = makeElement("span", { id: STATUS_ID });
    panel.appendChild(statusElement);
    loginButton.addEventListener("click", () => { void runLogin(); });
    configureButton.addEventListener("click", configureUser);
    removeButton.addEventListener("click", removeUser);
    documentRef.body.appendChild(panel);
    users = loadUsers();
    renderUsers();
    setStatus(users.length ? "账号仅保存在 Tampermonkey 本地。" : "请先配置本地账号。");
  }

  buildPanel();
}());
