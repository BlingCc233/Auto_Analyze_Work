const { contextBridge, ipcRenderer } = require("electron");

const dutyDesktop = Object.freeze({
  officialStatus: () => ipcRenderer.invoke("official-status"),
  officialOpenLogin: () => ipcRenderer.invoke("official-open-login"),
  officialPersonnel: (query) => ipcRenderer.invoke("official-personnel", query),
  officialQueryDay: (query) => ipcRenderer.invoke("official-query-day", query),
  officialSubmitPlan: (plan) => ipcRenderer.invoke("official-submit-plan", plan),
  officialReadback: (query) => ipcRenderer.invoke("official-readback", query),
  officialRollback: (request) => ipcRenderer.invoke("official-rollback", request),
  openOfficial: () => ipcRenderer.invoke("official-open-login"),
  // 自动登录
  officialAutoLogin: (username) => ipcRenderer.invoke("official-auto-login", { username }),
  officialCredentials: () => ipcRenderer.invoke("official-credentials")
});

contextBridge.exposeInMainWorld("dutyDesktop", dutyDesktop);
