const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appWindow", {
  /** 主进程已启用 titleBarStyle: hidden（自定义标题栏模式） */
  customTitleBar: true,
  platform: process.platform,
  /** 仅 Windows / Linux 有效；macOS 使用红绿灯，不通过 overlay 调色 */
  setTitleBarOverlay: (opts) => ipcRenderer.invoke("window:setTitleBarOverlay", opts),
});
