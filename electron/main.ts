import { app, BrowserWindow, Menu, WebContentsView, ipcMain, shell } from "electron";
import * as path from "node:path";
import * as tokenStore from "./tokenStore";

const TITLEBAR_HEIGHT = 40;
type Brand = "feishu" | "lark";
type SearchUsersResult = {
  items: Array<{
    id: string;
    type: "p2p";
    title: string;
    subtitle?: string;
    avatarUrl?: string;
    userOpenId: string;
  }>;
};
type SearchChatsResult = {
  items: Array<{
    id: string;
    type: "group";
    title: string;
    subtitle?: string;
    avatarUrl?: string;
    chatId: string;
  }>;
};
type ListChatMessagesResult = {
  items: Array<{
    messageId: string;
    chatId: string;
    senderName?: string;
    senderAvatarUrl?: string;
    messageType: string;
    contentText: string;
    createTime: string;
  }>;
  hasMore: boolean;
  pageToken?: string;
};
class FeishuApiError extends Error {
  code?: number;
  status?: number;

  constructor(message: string, options?: { code?: number; status?: number }) {
    super(message);
    this.name = "FeishuApiError";
    this.code = options?.code;
    this.status = options?.status;
  }
}
let mainWindow: BrowserWindow | null = null;
let authWindow: BrowserWindow | null = null;
let authView: WebContentsView | null = null;
let suppressAuthWindowClosedEvent = false;

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

function buildApiUrl(brand: Brand, apiPath: string, query?: Record<string, string | number | undefined>) {
  const { openBase } = resolveBrand(brand);
  const url = new URL(apiPath, openBase);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

function getAuthContext() {
  const appConfig = tokenStore.getAppConfig();
  const userToken = tokenStore.getUserToken();

  if (!appConfig?.clientId || !appConfig?.clientSecret || !userToken?.accessToken) {
    throw new Error("请先完成初始化并重新登录后再使用消息功能。");
  }

  return {
    brand: (appConfig.brand || "feishu") as Brand,
    clientId: appConfig.clientId,
    clientSecret: appConfig.clientSecret,
    accessToken: userToken.accessToken,
    refreshToken: userToken.refreshToken,
    expiresIn: userToken.expiresIn,
    refreshTokenExpiresIn: userToken.refreshTokenExpiresIn,
    scope: userToken.scope,
    userInfo: userToken.userInfo,
    currentUserName: userToken.userInfo?.name || "",
    currentUserOpenId: userToken.userInfo?.openId || "",
  };
}

function parseGrantedScopes(scopeValue?: string) {
  return new Set(
    String(scopeValue || "")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function ensureScopes(grantedScopeValue: string | undefined, requiredScopes: string[]) {
  const grantedScopes = parseGrantedScopes(grantedScopeValue);
  const missingScopes = requiredScopes.filter((scope) => !grantedScopes.has(scope));
  if (missingScopes.length === 0) return;

  throw new Error(
    `当前登录缺少消息页所需权限：${missingScopes.join("、")}。请先在飞书应用权限里开启这些权限，再退出登录并重新登录。`
  );
}

function getApiErrorMessage(data: Record<string, unknown>, status: number, fallback: string) {
  const code = data.code;
  const msg = typeof data.msg === "string" ? data.msg : "";
  if (msg) {
    return `${fallback}: ${msg}${code !== undefined ? ` [${String(code)}]` : ""}`;
  }
  return `${fallback}: HTTP ${status}`;
}

async function callOpenApi<T = Record<string, unknown>>(params: {
  brand: Brand;
  accessToken: string;
  method: "GET" | "POST";
  apiPath: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}): Promise<T> {
  const { brand, accessToken, method, apiPath, query, body } = params;
  const resp = await fetch(buildApiUrl(brand, apiPath, query), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await parseJsonResponse(resp);
  const code = Number(payload.code ?? 0);
  if (!resp.ok || code !== 0) {
    throw new FeishuApiError(getApiErrorMessage(payload, resp.status, "飞书接口请求失败"), {
      code: Number.isFinite(code) ? code : undefined,
      status: resp.status,
    });
  }
  return ((payload.data as Record<string, unknown>) || {}) as T;
}

async function refreshUserAccessToken() {
  const authContext = getAuthContext();
  if (!authContext.refreshToken) {
    throw new Error("登录态已过期，请重新登录。");
  }

  const { openBase } = resolveBrand(authContext.brand);
  const url = `${openBase}/open-apis/authen/v2/oauth/token`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: authContext.refreshToken,
    client_id: authContext.clientId,
    client_secret: authContext.clientSecret,
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await parseJsonResponse(resp);

  if (!resp.ok || data.error || Number(data.code ?? 0) !== 0) {
    const message =
      typeof data.error_description === "string" && data.error_description
        ? data.error_description
        : typeof data.msg === "string" && data.msg
          ? data.msg
          : `刷新登录态失败: HTTP ${resp.status}`;
    throw new Error(message);
  }

  const accessToken = String(data.access_token || "");
  if (!accessToken) {
    throw new Error("刷新登录态失败：未返回 access_token。");
  }

  tokenStore.saveUserToken({
    accessToken,
    refreshToken: data.refresh_token ? String(data.refresh_token) : authContext.refreshToken,
    expiresIn: data.expires_in ? Number(data.expires_in) : authContext.expiresIn,
    refreshTokenExpiresIn: data.refresh_token_expires_in
      ? Number(data.refresh_token_expires_in)
      : authContext.refreshTokenExpiresIn,
    scope: data.scope ? String(data.scope) : authContext.scope,
    userInfo: authContext.userInfo,
  });

  return accessToken;
}

async function callOpenApiWithRefresh<T = Record<string, unknown>>(params: {
  brand: Brand;
  accessToken: string;
  method: "GET" | "POST";
  apiPath: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}): Promise<T> {
  try {
    return await callOpenApi<T>(params);
  } catch (error) {
    if (!(error instanceof FeishuApiError) || error.code !== 99991677) {
      throw error;
    }

    const refreshedAccessToken = await refreshUserAccessToken();
    return callOpenApi<T>({
      ...params,
      accessToken: refreshedAccessToken,
    });
  }
}

function parseMessageContent(messageType: string, rawContent: unknown) {
  if (typeof rawContent !== "string" || rawContent.length === 0) return "";

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(rawContent) as Record<string, unknown>;
  } catch {
    return rawContent;
  }

  if (messageType === "text") {
    return typeof parsed.text === "string" ? parsed.text : "";
  }

  if (messageType === "post") {
    const localeBody = Object.values(parsed).find(
      (value): value is Record<string, unknown> =>
        !!value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).content)
    );
    const paragraphs = Array.isArray(localeBody?.content) ? localeBody.content : [];
    const texts: string[] = [];

    paragraphs.forEach((paragraph) => {
      if (!Array.isArray(paragraph)) return;
      paragraph.forEach((segment) => {
        if (!segment || typeof segment !== "object") return;
        const text = (segment as Record<string, unknown>).text;
        if (typeof text === "string" && text.trim()) {
          texts.push(text.trim());
        }
      });
    });

    return texts.join(" ").trim();
  }

  const placeholders: Record<string, string> = {
    image: "[图片]",
    file: "[文件]",
    audio: "[语音]",
    media: "[视频]",
    video: "[视频]",
    sticker: "[表情]",
    share_chat: "[聊天分享]",
    share_user: "[名片]",
    interactive: "[卡片消息]",
    system: "[系统消息]",
  };

  return placeholders[messageType] || `[${messageType || "消息"}]`;
}

function formatMessageTime(rawValue: unknown) {
  const numericValue = Number(rawValue);
  const timestamp = String(rawValue ?? "");
  if (!Number.isFinite(numericValue) || !timestamp) {
    return "";
  }

  const date = new Date(timestamp.length >= 13 ? numericValue : numericValue * 1000);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getSenderOpenId(sender: Record<string, unknown> | undefined) {
  const senderId = sender?.sender_id;
  if (!senderId || typeof senderId !== "object") return "";
  const openId = (senderId as Record<string, unknown>).open_id;
  return typeof openId === "string" ? openId : "";
}

async function searchUsers(query: string): Promise<SearchUsersResult> {
  const { brand, accessToken, scope } = getAuthContext();
  ensureScopes(scope, ["contact:user:search"]);
  const data = await callOpenApiWithRefresh<{ users?: Array<Record<string, unknown>> }>({
    brand,
    accessToken,
    method: "GET",
    apiPath: "/open-apis/search/v1/user",
    query: {
      query,
      page_size: 20,
    },
  });

  const items = (data.users || []).map((user) => {
    const avatar = user.avatar;
    const avatarUrl =
      avatar && typeof avatar === "object"
        ? String((avatar as Record<string, unknown>).avatar_origin || "")
        : "";
    const openId = String(user.open_id || "");

    return {
      id: `user:${openId}`,
      type: "p2p" as const,
      title: String(
        user.name ||
          user.user_name ||
          user.display_name ||
          user.employee_name ||
          user.cn_name ||
          openId
      ),
      subtitle: String(user.enterprise_email || user.email || user.mobile || ""),
      avatarUrl: avatarUrl || undefined,
      userOpenId: openId,
    };
  });

  return { items: items.filter((item) => item.userOpenId) };
}

async function searchChats(query: string): Promise<SearchChatsResult> {
  const { brand, accessToken, scope } = getAuthContext();
  ensureScopes(scope, ["im:chat:read"]);
  const data = await callOpenApiWithRefresh<{ items?: Array<Record<string, unknown>> }>({
    brand,
    accessToken,
    method: "POST",
    apiPath: "/open-apis/im/v2/chats/search",
    query: {
      page_size: 20,
    },
    body: {
      query,
    },
  });

  const items = (data.items || [])
    .map((item) => {
      const meta = (item.meta_data || {}) as Record<string, unknown>;
      const chatId = String(meta.chat_id || "");
      const avatar = meta.avatar;
      const avatarUrl =
        avatar && typeof avatar === "object"
          ? String(
              (avatar as Record<string, unknown>).avatar_origin ||
                (avatar as Record<string, unknown>).avatar_url ||
                ""
            )
          : "";

      return {
        id: `chat:${chatId}`,
        type: "group" as const,
        title: String(meta.name || chatId),
        subtitle: String(meta.description || meta.chat_mode || ""),
        avatarUrl: avatarUrl || undefined,
        chatId,
      };
    })
    .filter((item) => item.chatId);

  return { items };
}

async function resolveP2PChat(userOpenId: string) {
  const { brand, accessToken, scope } = getAuthContext();
  ensureScopes(scope, ["contact:user.base:readonly"]);
  const data = await callOpenApiWithRefresh<{ p2p_chats?: Array<Record<string, unknown>> }>({
    brand,
    accessToken,
    method: "POST",
    apiPath: "/open-apis/im/v1/chat_p2p/batch_query",
    query: {
      chatter_id_type: "open_id",
    },
    body: {
      chatter_ids: [userOpenId],
    },
  });

  const chatId = String(data.p2p_chats?.[0]?.chat_id || "");
  if (!chatId) {
    throw new Error("尚未建立私聊会话。");
  }
  return { chatId };
}

async function listChatMessages(params: {
  chatId: string;
  pageToken?: string;
  pageSize?: number;
  sort?: "asc" | "desc";
}): Promise<ListChatMessagesResult> {
  const { brand, accessToken, currentUserName, currentUserOpenId, scope } = getAuthContext();
  ensureScopes(scope, ["im:message.group_msg:get_as_user", "im:message.p2p_msg:get_as_user"]);
  const pageSize = Math.min(50, Math.max(1, params.pageSize || 30));
  const data = await callOpenApiWithRefresh<{
    items?: Array<Record<string, unknown>>;
    has_more?: boolean;
    page_token?: string;
  }>({
    brand,
    accessToken,
    method: "GET",
    apiPath: "/open-apis/im/v1/messages",
    query: {
      container_id_type: "chat",
      container_id: params.chatId,
      sort_type: params.sort === "asc" ? "ByCreateTimeAsc" : "ByCreateTimeDesc",
      page_size: pageSize,
      page_token: params.pageToken,
      card_msg_content_type: "raw_card_content",
    },
  });

  const items = (data.items || []).map((item) => {
    const sender = (item.sender || {}) as Record<string, unknown>;
    const senderOpenId = getSenderOpenId(sender);
    const senderAvatar = sender.avatar;
    const senderAvatarUrl =
      senderAvatar && typeof senderAvatar === "object"
        ? String(
            (senderAvatar as Record<string, unknown>).avatar_origin ||
              (senderAvatar as Record<string, unknown>).avatar_url ||
              ""
          )
        : "";
    const messageType = String(item.msg_type || "");
    const body = (item.body || {}) as Record<string, unknown>;

    return {
      messageId: String(item.message_id || ""),
      chatId: String(item.chat_id || params.chatId),
      senderName: senderOpenId
        ? senderOpenId === currentUserOpenId
          ? currentUserName || "我"
          : undefined
        : undefined,
      senderAvatarUrl: senderAvatarUrl || undefined,
      messageType,
      contentText: parseMessageContent(messageType, body.content),
      createTime: formatMessageTime(item.create_time),
    };
  });

  return {
    items,
    hasMore: !!data.has_more,
    pageToken: data.page_token ? String(data.page_token) : undefined,
  };
}

function getSharedWindowChromeOptions() {
  return {
    titleBarStyle: "hidden" as const,
    ...(process.platform !== "darwin"
      ? {
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: "#000000",
            height: TITLEBAR_HEIGHT,
          },
        }
      : {}),
    icon: path.join(
      __dirname,
      `../resources/icons/${process.platform === "win32" ? "icon.ico" : "icon_1024.png"}`
    ),
  };
}

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.js");

  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    title: "肥猪",
    ...getSharedWindowChromeOptions(),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
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

  mainWindow = win;
}

function getRendererEntryUrl(search = "") {
  if (!app.isPackaged) {
    return `http://127.0.0.1:5173/${search}`;
  }
  return path.join(__dirname, "../dist/index.html");
}

function updateAuthViewBounds() {
  if (!authWindow || authWindow.isDestroyed() || !authView) return;
  const bounds = authWindow.getContentBounds();
  authView.setBounds({
    x: 0,
    y: TITLEBAR_HEIGHT,
    width: bounds.width,
    height: Math.max(0, bounds.height - TITLEBAR_HEIGHT),
  });
}

function closeAuthWindow(notify = false) {
  if (authView && authWindow && !authWindow.isDestroyed()) {
    authWindow.contentView.removeChildView(authView);
    authView = null;
  }

  if (!authWindow || authWindow.isDestroyed()) {
    authWindow = null;
    return false;
  }

  const current = authWindow;
  authWindow = null;
  suppressAuthWindowClosedEvent = !notify;
  current.close();

  if (notify && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("auth:windowClosed");
  }

  return true;
}

function openAuthWindow(url: string) {
  closeAuthWindow(false);

  authWindow = new BrowserWindow({
    width: 640,
    height: 860,
    minWidth: 560,
    minHeight: 760,
    title: "授权",
    autoHideMenuBar: true,
    parent: mainWindow ?? undefined,
    modal: false,
    ...getSharedWindowChromeOptions(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  authWindow.on("page-title-updated", (e) => {
    e.preventDefault();
  });

  authWindow.on("closed", () => {
    authWindow?.removeListener("resize", updateAuthViewBounds);
    authView = null;
    authWindow = null;
    if (!suppressAuthWindowClosedEvent && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("auth:windowClosed");
    }
    suppressAuthWindowClosedEvent = false;
  });

  authWindow.on("resize", updateAuthViewBounds);

  authView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  authView.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    void shell.openExternal(targetUrl);
    return { action: "deny" };
  });

  authWindow.contentView.addChildView(authView);

  if (!app.isPackaged) {
    void authWindow.loadURL(getRendererEntryUrl("?auth-shell=1"));
  } else {
    void authWindow.loadFile(getRendererEntryUrl(), { search: "?auth-shell=1" });
  }

  authWindow.webContents.once("did-finish-load", () => {
    updateAuthViewBounds();
    void authView?.webContents.loadURL(url);
  });
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

ipcMain.handle("config:getUiPreferences", () => {
  return tokenStore.getUiPreferences();
});

ipcMain.handle("config:saveUiPreferences", (_event, preferences) => {
  tokenStore.saveUiPreferences(preferences);
  return { success: true };
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

// ── 消息 / 联系人读取 IPC ──
ipcMain.handle("messages:searchUsers", (_event, query: string) => {
  return searchUsers(String(query || "").trim());
});

ipcMain.handle("messages:searchChats", (_event, query: string) => {
  return searchChats(String(query || "").trim());
});

ipcMain.handle("messages:resolveP2PChat", (_event, userOpenId: string) => {
  return resolveP2PChat(String(userOpenId || "").trim());
});

ipcMain.handle(
  "messages:listChatMessages",
  (_event, params: { chatId: string; pageToken?: string; pageSize?: number; sort?: "asc" | "desc" }) => {
    return listChatMessages(params);
  }
);

ipcMain.handle("auth:openAuthWindow", (_event, url: string) => {
  openAuthWindow(url);
  return { success: true };
});

ipcMain.handle("auth:closeAuthWindow", () => {
  return { success: true, closed: closeAuthWindow(false) };
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
