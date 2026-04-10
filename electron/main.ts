import { app, BrowserWindow, Menu, ipcMain, shell } from "electron";
import * as path from "node:path";
import * as tokenStore from "./tokenStore";

const TITLEBAR_HEIGHT = 40;
type Brand = "feishu" | "lark";

function resolveBrand(brand: Brand = "feishu") {
  if (brand === "lark") {
    return {
      openBase: "https://open.larksuite.com",
      accountsBase: "https://accounts.larksuite.com",
    };
  }
  return {
    openBase: "https://open.feishu.cn",
    accountsBase: "https://accounts.feishu.cn",
  };
}

async function parseJsonResponse(resp: Response) {
  const text = await resp.text();
  if (!text) return {} as Record<string, unknown>;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`请求失败: HTTP ${resp.status} 返回的不是 JSON`);
  }
}

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.js");

  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    title: "肥猪",
    // 官方教程：隐藏默认标题栏；macOS 保留左上角红绿灯
    // https://www.electronjs.org/zh/docs/latest/tutorial/custom-title-bar
    titleBarStyle: "hidden",
    // Windows / Linux：通过 titleBarOverlay 显示原生最小化、最大化、关闭
    ...(process.platform !== "darwin"
      ? {
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: "#000000",
            height: TITLEBAR_HEIGHT,
          },
        }
      : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(
      __dirname,
      `../resources/icons/${process.platform === "win32" ? "icon.ico" : "icon_1024.png"}`
    ),
  });

  win.on("page-title-updated", (e) => {
    e.preventDefault();
  });

  if (!app.isPackaged) {
    win.loadURL("http://127.0.0.1:5173/");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
    // 生产环境下禁止打开开发者工具
    win.webContents.on("devtools-opened", () => {
      win.webContents.closeDevTools();
    });
    // 拦截快捷键 F12 和 Ctrl+Shift+I
    win.webContents.on("before-input-event", (event, input) => {
      if (
        input.key === "F12" ||
        ((input.control || input.meta) && input.shift && input.key.toLowerCase() === "i")
      ) {
        event.preventDefault();
      }
    });
  }
}

// ── 标题栏 IPC ──
ipcMain.handle("window:setTitleBarOverlay", (event, opts) => {
  if (process.platform === "darwin") return;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || typeof win.setTitleBarOverlay !== "function") return;
  const height = Math.min(50, Math.max(24, Number(opts?.height) || TITLEBAR_HEIGHT));
  const color = typeof opts?.color === "string" ? opts.color : "#00000000";
  const symbolColor = typeof opts?.symbolColor === "string" ? opts.symbolColor : "#ffffff";
  win.setTitleBarOverlay({ color, symbolColor, height });
});

// ── 初始化状态 IPC ──
ipcMain.handle("config:getInitStatus", () => {
  return tokenStore.getInitStatus();
});

// ── 保存应用配置 IPC ──
ipcMain.handle("config:saveAppConfig", (_event, config) => {
  tokenStore.saveAppConfig(config);
  return { success: true };
});

// ── 保存用户 Token IPC ──
ipcMain.handle("config:saveUserToken", (_event, tokenData) => {
  tokenStore.saveUserToken(tokenData);
  return { success: true };
});

// ── 获取应用配置 IPC ──
ipcMain.handle("config:getAppConfig", () => {
  return tokenStore.getAppConfig();
});

// ── 清空配置 IPC ──
ipcMain.handle("config:clearConfig", () => {
  tokenStore.clearConfig();
  return { success: true };
});

// ── 打开外部链接 IPC ──
ipcMain.handle("shell:openExternal", (_event, url) => {
  return shell.openExternal(url);
});

// ── OAuth / App Registration IPC ──
ipcMain.handle("auth:beginAppCreation", async () => {
  const { accountsBase } = resolveBrand("feishu");
  const { openBase } = resolveBrand("feishu");
  const url = `${accountsBase}/oauth/v1/app/registration`;

  const body = new URLSearchParams({
    action: "begin",
    archetype: "PersonalAgent",
    auth_method: "client_secret",
    request_user_info: "open_id tenant_brand",
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await parseJsonResponse(resp);

  if (!resp.ok || data.error) {
    throw new Error(
      String(data.error_description || data.error || `创建应用请求失败: ${resp.status}`)
    );
  }

  return {
    deviceCode: String(data.device_code || ""),
    userCode: String(data.user_code || ""),
    verificationUrl: `${openBase}/page/cli?user_code=${String(data.user_code || "")}`,
    interval: Number(data.interval || 5),
    expiresIn: Number(data.expires_in || 1800),
  };
});

ipcMain.handle("auth:pollAppCreation", async (_event, deviceCode: string, brand: Brand = "feishu") => {
  const { accountsBase } = resolveBrand(brand);
  const url = `${accountsBase}/oauth/v1/app/registration`;

  const body = new URLSearchParams({
    action: "poll",
    device_code: deviceCode,
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await parseJsonResponse(resp);

  if (!resp.ok && !data.error) {
    throw new Error(
      String(data.error_description || data.error || `轮询请求失败: ${resp.status}`)
    );
  }

  return data;
});

ipcMain.handle(
  "auth:beginDeviceAuth",
  async (
    _event,
    params: { appId: string; appSecret: string; brand?: Brand; scopes?: string[] }
  ) => {
    const { appId, appSecret, brand = "feishu", scopes = [] } = params;
    const { accountsBase } = resolveBrand(brand);
    const url = `${accountsBase}/oauth/v1/device_authorization`;

    const scopeSet = new Set(scopes);
    scopeSet.add("offline_access");
    const scopeString = Array.from(scopeSet).join(" ");

    const body = new URLSearchParams({
      client_id: appId,
      scope: scopeString,
    });

    const authString = Buffer.from(`${appId}:${appSecret}`).toString("base64");
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${authString}`,
      },
      body: body.toString(),
    });
    const data = await parseJsonResponse(resp);

    if (!resp.ok || data.error) {
      throw new Error(
        String(data.error_description || data.error || `设备授权请求失败: ${resp.status}`)
      );
    }

    return {
      deviceCode: String(data.device_code || ""),
      userCode: String(data.user_code || ""),
      verificationUri: String(data.verification_uri || ""),
      verificationUriComplete: String(
        data.verification_uri_complete || data.verification_uri || ""
      ),
      expiresIn: Number(data.expires_in || 240),
      interval: Number(data.interval || 5),
    };
  }
);

ipcMain.handle(
  "auth:pollForToken",
  async (
    _event,
    params: { deviceCode: string; appId: string; appSecret: string; brand?: Brand }
  ) => {
    const { deviceCode, appId, appSecret, brand = "feishu" } = params;
    const { openBase } = resolveBrand(brand);
    const url = `${openBase}/open-apis/authen/v2/oauth/token`;

    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: deviceCode,
      client_id: appId,
      client_secret: appSecret,
    });

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await parseJsonResponse(resp);

    if (!resp.ok && !data.error) {
      throw new Error(`Token 请求失败: ${resp.status}`);
    }

    return data;
  }
);

ipcMain.handle(
  "auth:fetchUserInfo",
  async (_event, params: { accessToken: string; brand?: Brand }) => {
    const { accessToken, brand = "feishu" } = params;
    const { openBase } = resolveBrand(brand);
    const url = `${openBase}/open-apis/authen/v1/user_info`;

    const resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await parseJsonResponse(resp);

    if (!resp.ok) {
      throw new Error(`获取用户信息失败: ${resp.status}`);
    }

    return data;
  }
);

app.whenReady().then(() => {
  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
  }
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
