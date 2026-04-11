import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("appWindow", {
  /** 主进程已启用 titleBarStyle: hidden（自定义标题栏模式） */
  customTitleBar: true,
  platform: process.platform,
  openMessagesWindow: () => ipcRenderer.invoke("window:openMessagesWindow"),
  /** 仅 Windows / Linux 有效；macOS 使用红绿灯，不通过 overlay 调色 */
  setTitleBarOverlay: (opts: { color?: string; symbolColor?: string; height?: number }) =>
    ipcRenderer.invoke("window:setTitleBarOverlay", opts),
});

contextBridge.exposeInMainWorld("configBridge", {
  /** 获取初始化状态 */
  getInitStatus: () => ipcRenderer.invoke("config:getInitStatus"),
  /** 保存应用配置 */
  saveAppConfig: (config: Record<string, unknown>) =>
    ipcRenderer.invoke("config:saveAppConfig", config),
  /** 保存用户 Token */
  saveUserToken: (tokenData: Record<string, unknown>) =>
    ipcRenderer.invoke("config:saveUserToken", tokenData),
  /** 获取应用配置 */
  getAppConfig: () => ipcRenderer.invoke("config:getAppConfig"),
  /** 获取界面偏好 */
  getUiPreferences: () => ipcRenderer.invoke("config:getUiPreferences"),
  /** 保存界面偏好 */
  saveUiPreferences: (preferences: Record<string, unknown>) =>
    ipcRenderer.invoke("config:saveUiPreferences", preferences),
  /** 清空所有配置 */
  clearConfig: () => ipcRenderer.invoke("config:clearConfig"),
});

contextBridge.exposeInMainWorld("shellBridge", {
  /** 用系统默认浏览器打开外部链接 */
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
});

contextBridge.exposeInMainWorld("messagesBridge", {
  listContacts: () => ipcRenderer.invoke("messages:listContacts"),
  listChats: () => ipcRenderer.invoke("messages:listChats"),
  searchUsers: (query: string) => ipcRenderer.invoke("messages:searchUsers", query),
  searchChats: (query: string) => ipcRenderer.invoke("messages:searchChats", query),
  resolveP2PChat: (userOpenId: string) => ipcRenderer.invoke("messages:resolveP2PChat", userOpenId),
  listChatMessages: (params: {
    chatId: string;
    pageToken?: string;
    pageSize?: number;
    sort?: "asc" | "desc";
  }) => ipcRenderer.invoke("messages:listChatMessages", params),
});

contextBridge.exposeInMainWorld("authBridge", {
  beginAppCreation: () => ipcRenderer.invoke("auth:beginAppCreation"),
  pollAppCreation: (deviceCode: string, brand?: "feishu" | "lark") =>
    ipcRenderer.invoke("auth:pollAppCreation", deviceCode, brand),
  openAuthWindow: (url: string) => ipcRenderer.invoke("auth:openAuthWindow", url),
  closeAuthWindow: () => ipcRenderer.invoke("auth:closeAuthWindow"),
  onAuthWindowClosed: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("auth:windowClosed", listener);
    return () => ipcRenderer.removeListener("auth:windowClosed", listener);
  },
  beginDeviceAuth: (params: {
    appId: string;
    appSecret: string;
    brand?: "feishu" | "lark";
    scopes?: string[];
  }) => ipcRenderer.invoke("auth:beginDeviceAuth", params),
  pollForToken: (params: {
    deviceCode: string;
    appId: string;
    appSecret: string;
    brand?: "feishu" | "lark";
  }) => ipcRenderer.invoke("auth:pollForToken", params),
  fetchUserInfo: (params: { accessToken: string; brand?: "feishu" | "lark" }) =>
    ipcRenderer.invoke("auth:fetchUserInfo", params),
});
