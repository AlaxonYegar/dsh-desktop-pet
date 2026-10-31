// 渲染进程与主进程之间的桥：只暴露必要的几个方法
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pet", {
  ready: () => ipcRenderer.send("renderer-ready"),
  onCursor: (cb) => ipcRenderer.on("cursor", (_e, d) => cb(d)),
  onInteractive: (cb) => ipcRenderer.on("interactive", (_e, v) => cb(v)),
  onExpression: (cb) => ipcRenderer.on("expression", (_e, n) => cb(n)),
  dragBegin: () => ipcRenderer.send("drag-begin"),
  dragEnd: () => ipcRenderer.send("drag-end"),
  zoom: (dir) => ipcRenderer.send("zoom", dir),
  showMenu: () => ipcRenderer.send("show-menu"),
  onHot: (cb) => ipcRenderer.on("hot", (_e, v) => cb(v)),
  mask: (m) => ipcRenderer.send("mask", m),
  uiState: (open) => ipcRenderer.send("ui-state", open),
  action: (a) => ipcRenderer.send("menu-action", a),
  // 模型导入：读取已保存的模型路径 / 打开文件选择框
  getModelPath: () => ipcRenderer.invoke("get-model-path"),
  pickModel: () => ipcRenderer.invoke("pick-model"),
  onRequestPickModel: (cb) => ipcRenderer.on("request-pick-model", () => cb()),
});
