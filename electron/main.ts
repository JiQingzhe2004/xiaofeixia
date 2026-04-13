import { app, BrowserWindow, Menu, WebContentsView, ipcMain, shell } from "electron";
import * as path from "node:path";
import * as Lark from "@larksuiteoapi/node-sdk";
import * as tokenStore from "./tokenStore";

const TITLEBAR_HEIGHT = 40;
type Brand = "feishu" | "lark";
type ConversationSource = "user" | "bot" | "mixed";
type ConversationListResult = {
  items: Array<{
    id: string;
    type: "p2p" | "group";
    title: string;
    subtitle?: string;
    avatarUrl?: string;
    chatId?: string;
    userOpenId: string;
    source: ConversationSource;
  }>;
};
type ConversationListItem = ConversationListResult["items"][number];
type ListChatMessagesResult = {
  items: Array<{
    messageId: string;
    chatId: string;
    senderName?: string;
    senderAvatarUrl?: string;
    senderOpenId?: string;
    isSelf?: boolean;
    messageType: string;
    contentText: string;
    createTime: string;
  }>;
  hasMore: boolean;
  pageToken?: string;
};
type RealtimeIncomingMessagePayload = {
  eventType: "im.message.receive_v1";
  messageId: string;
  chatId: string;
  chatType: string;
  messageType: string;
  contentText: string;
  createTime: string;
  rawCreateTime?: string;
  senderOpenId?: string;
};
type RealtimeConversationChangedPayload = {
  eventType: "im.chat.access_event.bot_p2p_chat_entered_v1";
  chatId: string;
  userOpenId: string;
  title?: string;
  avatarUrl?: string;
  lastMessageAt?: number;
};
type RealtimeConnectionStatus = {
  state: "disabled" | "connecting" | "connected" | "reconnecting" | "error";
  message: string;
  updatedAt: number;
};
type UserProfileSummary = {
  title: string;
  avatarUrl?: string;
};
type RecentP2PConversationSnapshot = {
  chatId: string;
  userOpenId: string;
  fallbackTitle?: string;
  fallbackAvatarUrl?: string;
  lastMessagePreview?: string;
  lastMessageAt?: number;
};
type RecentP2PConversationCache = {
  key: string;
  items: ConversationListItem[];
  expiresAt: number;
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
let messagesWindow: BrowserWindow | null = null;
let authWindow: BrowserWindow | null = null;
let authView: WebContentsView | null = null;
let suppressAuthWindowClosedEvent = false;
let messageWsClient: Lark.WSClient | null = null;
let messageWsClientConfigKey = "";
const userProfileCache = new Map<string, UserProfileSummary>();
const userProfilePending = new Map<string, Promise<UserProfileSummary>>();
let realtimeConnectionStatus: RealtimeConnectionStatus = {
  state: "disabled",
  message: "实时连接未启用",
  updatedAt: Date.now(),
};
let recentUserP2PChatCache: RecentP2PConversationCache | null = null;

const RECENT_P2P_CHAT_PAGE_SIZE = 50;
const RECENT_P2P_CHAT_MAX_PAGES = 4;
const RECENT_P2P_CHAT_TARGET_COUNT = 24;
const RECENT_P2P_CHAT_CACHE_TTL = 30 * 1000;

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

function hasScopes(grantedScopeValue: string | undefined, requiredScopes: string[]) {
  const grantedScopes = parseGrantedScopes(grantedScopeValue);
  return requiredScopes.every((scope) => grantedScopes.has(scope));
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

async function getTenantAccessToken(params: {
  brand: Brand;
  appId: string;
  appSecret: string;
}) {
  const { brand, appId, appSecret } = params;
  const { openBase } = resolveBrand(brand);
  const url = `${openBase}/open-apis/auth/v3/tenant_access_token/internal`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  });
  const payload = await parseJsonResponse(resp);
  const code = Number(payload.code ?? 0);
  if (!resp.ok || code !== 0) {
    throw new FeishuApiError(getApiErrorMessage(payload, resp.status, "获取 tenant_access_token 失败"), {
      code: Number.isFinite(code) ? code : undefined,
      status: resp.status,
    });
  }

  const token = String(payload.tenant_access_token || "");
  if (!token) {
    throw new Error("获取 tenant_access_token 失败：未返回 token。");
  }
  return token;
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

function extractAvatarUrl(source: unknown) {
  if (typeof source === "string") {
    return source;
  }

  if (!source || typeof source !== "object") {
    return "";
  }

  const avatar = source as Record<string, unknown>;
  return String(
    avatar.avatar_origin ||
      avatar.avatar_url ||
      avatar.default_avatar_url ||
      avatar.image_url ||
      ""
  );
}

function normalizeUserConversation(user: Record<string, unknown>): ConversationListItem {
  const openId = String(user.open_id || user.user_id || "");
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
    subtitle: String(
      user.enterprise_email ||
        user.email ||
        user.mobile ||
        user.department_name ||
        user.department ||
        ""
    ),
    avatarUrl: extractAvatarUrl(user.avatar) || undefined,
    userOpenId: openId,
    source: "user",
  };
}

function normalizeChatConversation(
  rawItem: Record<string, unknown>,
  source: ConversationSource = "user"
): ConversationListItem {
  const item = ((rawItem.meta_data as Record<string, unknown> | undefined) || rawItem) as Record<
    string,
    unknown
  >;
  const chatId = String(item.chat_id || "");
  const chatMode = String(item.chat_mode || item.chat_type || "");
  const userOpenId = String(item.p2p_target_id || item.p2p_chatter_id || item.open_id || "");
  const type: ConversationListItem["type"] = chatMode.toLowerCase() === "p2p" ? "p2p" : "group";
  const title = String(item.name || item.chat_name || item.display_name || chatId || userOpenId);
  const description = String(item.description || item.chat_mode || "");

  return {
    id: type === "p2p" && userOpenId ? `user:${userOpenId}` : `chat:${chatId}`,
    type,
    title,
    subtitle:
      description || (type === "p2p" ? "私聊会话" : "群聊会话"),
    avatarUrl: extractAvatarUrl(item.avatar) || undefined,
    chatId: chatId || undefined,
    userOpenId: userOpenId || "",
    source,
  };
}

function normalizeBotRecentChat(chat: tokenStore.BotRecentChat): ConversationListItem {
  return {
    id: `user:${chat.userOpenId}`,
    type: "p2p",
    title: chat.title || chat.userOpenId || "机器人会话",
    subtitle: chat.lastMessagePreview || "机器人私聊会话",
    avatarUrl: chat.avatarUrl || undefined,
    chatId: chat.chatId,
    userOpenId: chat.userOpenId,
    source: "bot",
  };
}

function normalizeChatSearchQuery(query: string) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery.includes("-")) {
    return trimmedQuery;
  }

  let normalizedQuery = trimmedQuery;
  if (
    normalizedQuery.length >= 2 &&
    ((normalizedQuery.startsWith('"') && normalizedQuery.endsWith('"')) ||
      (normalizedQuery.startsWith("'") && normalizedQuery.endsWith("'")))
  ) {
    normalizedQuery = normalizedQuery.slice(1, -1);
  } else {
    try {
      const parsed = JSON.parse(normalizedQuery) as unknown;
      if (typeof parsed === "string") {
        normalizedQuery = parsed;
      }
    } catch {
      // keep raw query when it is not a JSON-quoted string
    }
  }

  return JSON.stringify(normalizedQuery);
}

function isChatListConversation(item: ConversationListItem) {
  return item.type === "p2p" ? !!item.userOpenId : !!item.chatId;
}

function matchesConversationQuery(item: ConversationListItem, query: string) {
  const keyword = query.trim().toLocaleLowerCase();
  if (!keyword) {
    return true;
  }

  return [item.title, item.subtitle || "", item.userOpenId || ""].some((value) =>
    value.toLocaleLowerCase().includes(keyword)
  );
}

function mergeContactItems(userItems: ConversationListItem[], botRecentItems: ConversationListItem[]) {
  return mergeConversationLists([...userItems, ...botRecentItems]).filter((item) => item.userOpenId);
}

function mergeConversationSource(
  left: ConversationSource,
  right: ConversationSource
): ConversationSource {
  if (left === right) return left;
  return "mixed";
}

function isLikelyUserOpenId(value?: string) {
  return /^ou_[a-z0-9]+$/i.test(String(value || "").trim());
}

function pickConversationTitle(base: ConversationListItem, incoming: ConversationListItem) {
  const baseTitle = String(base.title || "").trim();
  const incomingTitle = String(incoming.title || "").trim();
  const baseLooksLikeId =
    !baseTitle ||
    baseTitle === String(base.userOpenId || "").trim() ||
    isLikelyUserOpenId(baseTitle);
  const incomingLooksLikeId =
    !incomingTitle ||
    incomingTitle === String(incoming.userOpenId || "").trim() ||
    isLikelyUserOpenId(incomingTitle);

  if (baseLooksLikeId && incomingTitle && !incomingLooksLikeId) {
    return incomingTitle;
  }
  if (incomingLooksLikeId && baseTitle) {
    return baseTitle;
  }
  return baseTitle || incomingTitle;
}

function pickPrimaryConversation(base: ConversationListItem, incoming: ConversationListItem) {
  const baseWeight = base.source === "user" || base.source === "mixed" ? 2 : 1;
  const incomingWeight = incoming.source === "user" || incoming.source === "mixed" ? 2 : 1;
  return incomingWeight > baseWeight ? incoming : base;
}

function mergeConversationItem(base: ConversationListItem, incoming: ConversationListItem): ConversationListItem {
  const primary = pickPrimaryConversation(base, incoming);
  const secondary = primary === base ? incoming : base;

  return {
    ...primary,
    title: pickConversationTitle(primary, secondary),
    subtitle: primary.subtitle || secondary.subtitle,
    avatarUrl: primary.avatarUrl || secondary.avatarUrl,
    chatId: primary.chatId || secondary.chatId,
    userOpenId: primary.userOpenId || secondary.userOpenId,
    source: mergeConversationSource(base.source, incoming.source),
  };
}

function mergeConversationLists(items: ConversationListItem[]) {
  const deduped = new Map<string, ConversationListItem>();
  const orderedIds: string[] = [];
  items
    .filter((item) => item.chatId || item.userOpenId)
    .forEach((item) => {
      const existing = deduped.get(item.id);
      if (!existing) {
        deduped.set(item.id, item);
        orderedIds.push(item.id);
        return;
      }
      deduped.set(item.id, mergeConversationItem(existing, item));
    });

  return orderedIds
    .map((id) => deduped.get(id))
    .filter((item): item is ConversationListItem => !!item);
}

function sendToWindow(window: BrowserWindow | null, channel: string, payload: unknown) {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(channel, payload);
}

function broadcastToRenderers(channel: string, payload: unknown) {
  sendToWindow(mainWindow, channel, payload);
  sendToWindow(messagesWindow, channel, payload);
}

function updateRealtimeConnectionStatus(
  state: RealtimeConnectionStatus["state"],
  message: string
) {
  const nextStatus: RealtimeConnectionStatus = {
    state,
    message,
    updatedAt: Date.now(),
  };

  const unchanged =
    realtimeConnectionStatus.state === nextStatus.state &&
    realtimeConnectionStatus.message === nextStatus.message;

  realtimeConnectionStatus = nextStatus;
  if (!unchanged) {
    broadcastToRenderers("messages:realtimeStatus", nextStatus);
  }
}

function handleWsLog(level: "error" | "warn" | "info" | "debug" | "trace", args: unknown[]) {
  const text = args.map((item) => String(item ?? "")).join(" ");

  if (text.includes("reconnect success") || text.includes("ws connect success") || text.includes("ws client ready")) {
    updateRealtimeConnectionStatus("connected", "实时连接已建立");
  } else if (text.includes("reconnect")) {
    updateRealtimeConnectionStatus("reconnecting", "实时连接正在重连");
  } else if (text.includes("ws connect failed") || text.includes("connect failed")) {
    updateRealtimeConnectionStatus("error", "实时连接建立失败");
  } else if (text.includes("ws error")) {
    updateRealtimeConnectionStatus("error", "实时连接出现异常");
  } else if (text.includes("client closed") || text.includes("closed manually")) {
    updateRealtimeConnectionStatus("disabled", "实时连接已关闭");
  }

  if (level === "error") {
    console.error("[Feishu WS]", ...args);
  } else if (level === "warn") {
    console.warn("[Feishu WS]", ...args);
  }
}

const feishuWsLogger = {
  error: (...args: unknown[]) => handleWsLog("error", args),
  warn: (...args: unknown[]) => handleWsLog("warn", args),
  info: (...args: unknown[]) => handleWsLog("info", args),
  debug: (...args: unknown[]) => handleWsLog("debug", args),
  trace: (...args: unknown[]) => handleWsLog("trace", args),
};

function normalizeRealtimeIncomingMessage(
  data: Parameters<NonNullable<Lark.EventHandles["im.message.receive_v1"]>>[0]
): RealtimeIncomingMessagePayload | null {
  const messageId = String(data.message?.message_id || "");
  const chatId = String(data.message?.chat_id || "");
  if (!messageId || !chatId) {
    return null;
  }

  return {
    eventType: "im.message.receive_v1",
    messageId,
    chatId,
    chatType: String(data.message?.chat_type || ""),
    messageType: String(data.message?.message_type || ""),
    contentText: parseMessageContent(String(data.message?.message_type || ""), data.message?.content),
    createTime: formatMessageTime(data.message?.create_time),
    rawCreateTime: data.message?.create_time || undefined,
    senderOpenId: data.sender?.sender_id?.open_id || undefined,
  };
}

async function fetchUserProfileByOpenId(userOpenId: string) {
  try {
    const { brand, accessToken } = getAuthContext();
    const data = await callOpenApiWithRefresh<{
      users?: Array<Record<string, unknown>>;
    }>({
      brand,
      accessToken,
      method: "POST",
      apiPath: "/open-apis/contact/v3/users/basic_batch",
      query: {
        user_id_type: "open_id",
      },
      body: {
        user_ids: [userOpenId],
      },
    });

    const user = data.users?.[0] || {};
    const fallbackTitle = String(user.name || user.nickname || user.en_name || user.user_id || "");

    try {
      const detail = await callOpenApiWithRefresh<{
        user?: Record<string, unknown>;
      }>({
        brand,
        accessToken,
        method: "GET",
        apiPath: `/open-apis/contact/v3/users/${encodeURIComponent(userOpenId)}`,
        query: {
          user_id_type: "open_id",
        },
      });

      const detailUser = detail.user || {};
      return {
        title: String(
          detailUser.name ||
            detailUser.nickname ||
            detailUser.en_name ||
            fallbackTitle ||
            userOpenId
        ),
        avatarUrl: extractAvatarUrl(detailUser.avatar) || undefined,
      };
    } catch {
      return {
        title: fallbackTitle || userOpenId,
        avatarUrl: undefined,
      };
    }
  } catch {
    try {
      const { brand, accessToken } = getAuthContext();
      const data = await callOpenApiWithRefresh<{
      user?: Record<string, unknown>;
    }>({
      brand,
      accessToken,
      method: "GET",
      apiPath: `/open-apis/contact/v3/users/${encodeURIComponent(userOpenId)}`,
      query: {
        user_id_type: "open_id",
      },
    });

    const user = data.user || {};
    return {
      title: String(user.name || user.nickname || user.en_name || userOpenId),
      avatarUrl: extractAvatarUrl(user.avatar) || undefined,
    };
    } catch {
      return {
        title: userOpenId,
        avatarUrl: undefined,
      };
    };
  }
}

function extractMentionOpenId(mention: Record<string, unknown>) {
  const directId = mention.id;
  if (typeof directId === "string" && directId.startsWith("ou_")) {
    return directId;
  }

  if (directId && typeof directId === "object") {
    const openId = String((directId as Record<string, unknown>).open_id || "");
    if (openId) {
      return openId;
    }
  }

  const userId = mention.user_id;
  if (typeof userId === "string" && userId.startsWith("ou_")) {
    return userId;
  }

  if (userId && typeof userId === "object") {
    const openId = String((userId as Record<string, unknown>).open_id || "");
    if (openId) {
      return openId;
    }
  }

  return "";
}

function extractSenderProfilesFromMentions(items: Array<Record<string, unknown>>) {
  const profiles = new Map<string, UserProfileSummary>();

  items.forEach((item) => {
    const mentions = item.mentions;
    if (!Array.isArray(mentions)) {
      return;
    }

    mentions.forEach((rawMention) => {
      if (!rawMention || typeof rawMention !== "object") {
        return;
      }

      const mention = rawMention as Record<string, unknown>;
      const openId = extractMentionOpenId(mention);
      const title = String(mention.name || mention.display_name || "");
      if (!openId || !title) {
        return;
      }

      const profile = {
        title,
        avatarUrl: extractAvatarUrl(mention.avatar) || undefined,
      };
      profiles.set(openId, profile);
      userProfileCache.set(openId, profile);
    });
  });

  return profiles;
}

async function getCachedUserProfileByOpenId(userOpenId: string) {
  if (!userOpenId) {
    return {
      title: "",
      avatarUrl: undefined,
    };
  }

  const cachedProfile = userProfileCache.get(userOpenId);
  if (cachedProfile) {
    return cachedProfile;
  }

  const pendingProfile = userProfilePending.get(userOpenId);
  if (pendingProfile) {
    return pendingProfile;
  }

  const profilePromise = fetchUserProfileByOpenId(userOpenId)
    .then((profile) => {
      userProfileCache.set(userOpenId, profile);
      return profile;
    })
    .finally(() => {
      userProfilePending.delete(userOpenId);
    });

  userProfilePending.set(userOpenId, profilePromise);
  return profilePromise;
}

function parseRawTimestamp(rawValue: string) {
  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) {
    return undefined;
  }
  return rawValue.length >= 13 ? numericValue : numericValue * 1000;
}

async function persistBotRecentChatFromRealtimeMessage(payload: RealtimeIncomingMessagePayload) {
  if (payload.chatType !== "p2p" || !payload.senderOpenId) {
    return;
  }

  const profile = await fetchUserProfileByOpenId(payload.senderOpenId);
  tokenStore.saveBotRecentChat({
    chatId: payload.chatId,
    userOpenId: payload.senderOpenId,
    title: profile.title,
    avatarUrl: profile.avatarUrl,
    lastMessagePreview: payload.contentText,
    lastMessageAt: parseRawTimestamp(payload.rawCreateTime || "") ?? Date.now(),
  });
}

async function persistBotRecentChatEnteredEvent(data: {
  chatId: string;
  userOpenId: string;
  lastMessageAt?: number;
}) {
  const profile = await fetchUserProfileByOpenId(data.userOpenId);
  tokenStore.saveBotRecentChat({
    chatId: data.chatId,
    userOpenId: data.userOpenId,
    title: profile.title,
    avatarUrl: profile.avatarUrl,
    lastMessageAt: data.lastMessageAt ?? Date.now(),
  });

  const payload: RealtimeConversationChangedPayload = {
    eventType: "im.chat.access_event.bot_p2p_chat_entered_v1",
    chatId: data.chatId,
    userOpenId: data.userOpenId,
    title: profile.title,
    avatarUrl: profile.avatarUrl,
    lastMessageAt: data.lastMessageAt ?? Date.now(),
  };
  broadcastToRenderers("messages:conversationChanged", payload);
}

function stopMessageRealtimeSubscription() {
  if (!messageWsClient) {
    messageWsClientConfigKey = "";
    updateRealtimeConnectionStatus("disabled", "实时连接未启用");
    return;
  }

  const currentClient = messageWsClient;
  messageWsClient = null;
  messageWsClientConfigKey = "";
  currentClient.close({ force: true });
  updateRealtimeConnectionStatus("disabled", "实时连接已关闭");
}

async function ensureMessageRealtimeSubscription() {
  const appConfig = tokenStore.getAppConfig();
  if (!appConfig?.clientId || !appConfig?.clientSecret) {
    stopMessageRealtimeSubscription();
    return;
  }

  const brand = (appConfig.brand || "feishu") as Brand;
  const configKey = `${brand}:${appConfig.clientId}:${appConfig.clientSecret}`;
  if (messageWsClient && messageWsClientConfigKey === configKey) {
    return;
  }

  stopMessageRealtimeSubscription();
  updateRealtimeConnectionStatus("connecting", "正在建立实时连接");

  const eventDispatcher = new Lark.EventDispatcher({
    logger: feishuWsLogger,
    loggerLevel: Lark.LoggerLevel.trace,
  }).register({
    "im.message.receive_v1": async (data) => {
      const payload = normalizeRealtimeIncomingMessage(data);
      if (!payload) return;
      await persistBotRecentChatFromRealtimeMessage(payload);
      broadcastToRenderers("messages:incomingMessage", payload);
    },
    "im.chat.access_event.bot_p2p_chat_entered_v1": async (data) => {
      const chatId = String(data.chat_id || "");
      const userOpenId = String(data.operator_id?.open_id || "");
      if (!chatId || !userOpenId) {
        return;
      }

      await persistBotRecentChatEnteredEvent({
        chatId,
        userOpenId,
        lastMessageAt: parseRawTimestamp(String(data.last_message_create_time || "")) ?? Date.now(),
      });
    },
  });

  const wsClient = new Lark.WSClient({
    appId: appConfig.clientId,
    appSecret: appConfig.clientSecret,
    domain: brand === "lark" ? Lark.Domain.Lark : Lark.Domain.Feishu,
    autoReconnect: true,
    logger: feishuWsLogger,
    loggerLevel: Lark.LoggerLevel.trace,
  });

  messageWsClient = wsClient;
  messageWsClientConfigKey = configKey;

  try {
    await wsClient.start({ eventDispatcher });
  } catch (error) {
    if (messageWsClient === wsClient) {
      stopMessageRealtimeSubscription();
    }
    updateRealtimeConnectionStatus("error", "实时连接启动失败");
    console.error("[Feishu WS] 启动长连接失败", error);
  }
}

async function collectPagedItems(
  fetchPage: (
    pageToken?: string
  ) => Promise<{ items?: Array<Record<string, unknown>>; has_more?: boolean; page_token?: string }>,
  options?: { maxPages?: number }
) {
  const items: Array<Record<string, unknown>> = [];
  let pageToken = "";
  let page = 0;
  const maxPages = options?.maxPages || 100;

  do {
    const data = await fetchPage(pageToken || undefined);
    items.push(...(data.items || []));
    pageToken = data.has_more && data.page_token ? String(data.page_token) : "";
    page += 1;
  } while (pageToken && page < maxPages);

  return items;
}

function chunkStrings(items: string[], chunkSize: number) {
  if (!items.length || chunkSize <= 0) {
    return [] as string[][];
  }

  const chunks: string[][] = [];
  for (let start = 0; start < items.length; start += chunkSize) {
    chunks.push(items.slice(start, start + chunkSize));
  }
  return chunks;
}

function extractMessageIdFromSearchItem(item: Record<string, unknown>) {
  const metaData = item.meta_data;
  if (!metaData || typeof metaData !== "object") {
    return "";
  }

  return String((metaData as Record<string, unknown>).message_id || "");
}

async function callMessageMGet(params: {
  brand: Brand;
  accessToken: string;
  messageIds: string[];
}) {
  const { brand, accessToken, messageIds } = params;
  const { openBase } = resolveBrand(brand);
  const url = new URL("/open-apis/im/v1/messages/mget", openBase);
  url.searchParams.set("card_msg_content_type", "raw_card_content");
  messageIds.forEach((messageId) => {
    url.searchParams.append("message_ids", messageId);
  });

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await parseJsonResponse(resp);
  const code = Number(payload.code ?? 0);
  if (!resp.ok || code !== 0) {
    throw new FeishuApiError(getApiErrorMessage(payload, resp.status, "飞书接口请求失败"), {
      code: Number.isFinite(code) ? code : undefined,
      status: resp.status,
    });
  }

  return ((payload.data as Record<string, unknown>) || {}) as {
    items?: Array<Record<string, unknown>>;
  };
}

async function callMessageMGetWithRefresh(params: {
  brand: Brand;
  accessToken: string;
  messageIds: string[];
}) {
  try {
    return await callMessageMGet(params);
  } catch (error) {
    if (!(error instanceof FeishuApiError) || error.code !== 99991677) {
      throw error;
    }

    const refreshedAccessToken = await refreshUserAccessToken();
    return callMessageMGet({
      ...params,
      accessToken: refreshedAccessToken,
    });
  }
}

async function batchGetMessagesByIds(params: {
  brand: Brand;
  accessToken: string;
  messageIds: string[];
}) {
  const items: Array<Record<string, unknown>> = [];
  for (const batch of chunkStrings(params.messageIds, 50)) {
    const data = await callMessageMGetWithRefresh({
      ...params,
      messageIds: batch,
    });
    items.push(...(data.items || []));
  }
  return items;
}

async function batchQueryChatContexts(params: {
  brand: Brand;
  accessToken: string;
  chatIds: string[];
}) {
  const contexts = new Map<string, Record<string, unknown>>();
  for (const batch of chunkStrings(params.chatIds, 50)) {
    const data = await callOpenApiWithRefresh<{ items?: Array<Record<string, unknown>> }>({
      brand: params.brand,
      accessToken: params.accessToken,
      method: "POST",
      apiPath: "/open-apis/im/v1/chats/batch_query",
      query: {
        user_id_type: "open_id",
      },
      body: {
        chat_ids: batch,
      },
    });

    (data.items || []).forEach((item) => {
      const chatId = String(item.chat_id || "");
      if (!chatId) return;
      contexts.set(chatId, item);
    });
  }
  return contexts;
}

async function loadRecentUserP2PChats() {
  const { brand, accessToken, scope, currentUserOpenId } = getAuthContext();
  if (!hasScopes(scope, ["search:message"])) {
    return [] as ConversationListItem[];
  }

  const cacheKey = `${brand}:${currentUserOpenId || "anonymous"}`;
  if (
    recentUserP2PChatCache?.key === cacheKey &&
    recentUserP2PChatCache.expiresAt > Date.now()
  ) {
    return recentUserP2PChatCache.items;
  }

  const conversations = new Map<string, RecentP2PConversationSnapshot>();
  let pageToken = "";
  let page = 0;

  while (page < RECENT_P2P_CHAT_MAX_PAGES && conversations.size < RECENT_P2P_CHAT_TARGET_COUNT) {
    const data = await callOpenApiWithRefresh<{
      items?: Array<Record<string, unknown>>;
      has_more?: boolean;
      page_token?: string;
    }>({
      brand,
      accessToken,
      method: "POST",
      apiPath: "/open-apis/im/v1/messages/search",
      query: {
        page_size: RECENT_P2P_CHAT_PAGE_SIZE,
        page_token: pageToken || undefined,
      },
      body: {
        query: "",
        filter: {
          chat_type: "p2p",
        },
      },
    });

    const messageIds = Array.from(
      new Set((data.items || []).map(extractMessageIdFromSearchItem).filter(Boolean))
    );
    if (!messageIds.length) {
      pageToken = data.has_more && data.page_token ? String(data.page_token) : "";
      if (!pageToken) {
        break;
      }
      page += 1;
      continue;
    }

    const messageItems = await batchGetMessagesByIds({
      brand,
      accessToken,
      messageIds,
    });
    const chatIds = Array.from(
      new Set(
        messageItems
          .map((item) => String(item.chat_id || ""))
          .filter((chatId) => !!chatId && !conversations.has(chatId))
      )
    );
    const chatContexts =
      chatIds.length > 0
        ? await batchQueryChatContexts({
            brand,
            accessToken,
            chatIds,
          })
        : new Map<string, Record<string, unknown>>();

    messageItems.forEach((item) => {
      const chatId = String(item.chat_id || "");
      if (!chatId || conversations.has(chatId)) {
        return;
      }

      const chatContext = chatContexts.get(chatId);
      if (String(chatContext?.chat_mode || "").toLowerCase() !== "p2p") {
        return;
      }

      const userOpenId = String(
        chatContext?.p2p_target_id || chatContext?.p2p_chatter_id || chatContext?.open_id || ""
      );
      if (!userOpenId || userOpenId === currentUserOpenId) {
        return;
      }

      const body = ((item.body as Record<string, unknown> | undefined) || {}) as Record<
        string,
        unknown
      >;
      const messageType = String(item.msg_type || "");
      const sender = ((item.sender as Record<string, unknown> | undefined) || {}) as Record<
        string,
        unknown
      >;
      const senderOpenId = getSenderOpenId(sender);
      const senderName = String(
        sender.name || sender.user_name || sender.display_name || sender.sender_name || ""
      );
      const senderAvatarUrl = extractAvatarUrl(sender.avatar) || undefined;
      const contextTitle = String(
        chatContext?.name || chatContext?.chat_name || chatContext?.display_name || ""
      );
      const contextAvatarUrl = extractAvatarUrl(chatContext?.avatar) || undefined;
      conversations.set(chatId, {
        chatId,
        userOpenId,
        fallbackTitle: contextTitle || (senderOpenId === userOpenId ? senderName : "") || userOpenId,
        fallbackAvatarUrl:
          contextAvatarUrl || (senderOpenId === userOpenId ? senderAvatarUrl : undefined),
        lastMessagePreview: parseMessageContent(messageType, body.content) || "私聊会话",
        lastMessageAt: parseRawTimestamp(String(item.create_time || "")) ?? Date.now(),
      });
    });

    pageToken = data.has_more && data.page_token ? String(data.page_token) : "";
    if (!pageToken) {
      break;
    }
    page += 1;
  }

  const profileMap = new Map<string, UserProfileSummary>();
  await Promise.all(
    Array.from(new Set(Array.from(conversations.values()).map((item) => item.userOpenId))).map(
      async (userOpenId) => {
        profileMap.set(userOpenId, await getCachedUserProfileByOpenId(userOpenId));
      }
    )
  );

  const items = Array.from(conversations.values())
    .sort((left, right) => (right.lastMessageAt || 0) - (left.lastMessageAt || 0))
    .map((item) => {
      const profile = profileMap.get(item.userOpenId);
      return {
        id: `user:${item.userOpenId}`,
        type: "p2p" as const,
        title: profile?.title || item.fallbackTitle || item.userOpenId,
        subtitle: item.lastMessagePreview || "私聊会话",
        avatarUrl: profile?.avatarUrl || item.fallbackAvatarUrl,
        chatId: item.chatId,
        userOpenId: item.userOpenId,
        source: "user" as const,
      };
    });

  recentUserP2PChatCache = {
    key: cacheKey,
    items,
    expiresAt: Date.now() + RECENT_P2P_CHAT_CACHE_TTL,
  };
  return items;
}

async function loadOptionalRecentUserP2PChats(query?: string) {
  try {
    const items = await loadRecentUserP2PChats();
    return query ? items.filter((item) => matchesConversationQuery(item, query)) : items;
  } catch (error) {
    console.warn("[Messages] 加载用户 P2P 会话失败", error);
    return [] as ConversationListItem[];
  }
}

async function loadUserChatList(brand: Brand, accessToken: string) {
  return collectPagedItems((pageToken) =>
    callOpenApiWithRefresh<{
      items?: Array<Record<string, unknown>>;
      has_more?: boolean;
      page_token?: string;
    }>({
      brand,
      accessToken,
      method: "GET",
      apiPath: "/open-apis/im/v1/chats",
      query: {
        sort_type: "ByActiveTimeDesc",
        page_size: 100,
        page_token: pageToken,
      },
    })
  );
}

async function loadBotChatList(brand: Brand, clientId: string, clientSecret: string) {
  try {
    const tenantAccessToken = await getTenantAccessToken({
      brand,
      appId: clientId,
      appSecret: clientSecret,
    });

    return collectPagedItems((pageToken) =>
      callOpenApi<{
        items?: Array<Record<string, unknown>>;
        has_more?: boolean;
        page_token?: string;
      }>({
        brand,
        accessToken: tenantAccessToken,
        method: "GET",
        apiPath: "/open-apis/im/v1/chats",
        query: {
          sort_type: "ByActiveTimeDesc",
          page_size: 100,
          page_token: pageToken,
        },
      })
    );
  } catch (error) {
    console.warn("[Messages] 加载机器人群聊列表失败", error);
    return [];
  }
}

async function searchUserChats(brand: Brand, accessToken: string, query: string) {
  const data = await callOpenApiWithRefresh<{ items?: Array<Record<string, unknown>> }>({
    brand,
    accessToken,
    method: "POST",
    apiPath: "/open-apis/im/v2/chats/search",
    query: {
      page_size: 20,
    },
    body: {
      query: normalizeChatSearchQuery(query),
    },
  });

  return (data.items || []).map((item) => normalizeChatConversation(item, "user"));
}

async function searchBotChats(brand: Brand, clientId: string, clientSecret: string, query: string) {
  try {
    const tenantAccessToken = await getTenantAccessToken({
      brand,
      appId: clientId,
      appSecret: clientSecret,
    });
    const data = await callOpenApi<{ items?: Array<Record<string, unknown>> }>({
      brand,
      accessToken: tenantAccessToken,
      method: "POST",
      apiPath: "/open-apis/im/v2/chats/search",
      query: {
        page_size: 20,
      },
      body: {
        query: normalizeChatSearchQuery(query),
      },
    });

    return (data.items || []).map((item) => normalizeChatConversation(item, "bot"));
  } catch (error) {
    console.warn("[Messages] 搜索机器人群聊失败", error);
    return [];
  }
}

async function searchUsers(query: string): Promise<ConversationListResult> {
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

  const items = (data.users || []).map(normalizeUserConversation);
  const botRecentItems = tokenStore
    .getBotRecentChats()
    .map(normalizeBotRecentChat)
    .filter((item) => matchesConversationQuery(item, query));

  return { items: mergeContactItems(items.filter((item) => item.userOpenId), botRecentItems) };
}

async function listContacts(): Promise<ConversationListResult> {
  const { brand, accessToken, scope } = getAuthContext();
  ensureScopes(scope, ["contact:contact.base:readonly"]);
  const users = await collectPagedItems((pageToken) =>
    callOpenApiWithRefresh<{
      items?: Array<Record<string, unknown>>;
      has_more?: boolean;
      page_token?: string;
    }>({
      brand,
      accessToken,
      method: "GET",
      apiPath: "/open-apis/contact/v3/users",
      query: {
        user_id_type: "open_id",
        page_size: 100,
        page_token: pageToken,
      },
    })
  );

  const userItems = users.map(normalizeUserConversation).filter((item) => item.userOpenId);
  const botRecentItems = tokenStore.getBotRecentChats().map(normalizeBotRecentChat);

  return { items: mergeContactItems(userItems, botRecentItems) };
}

async function searchChats(query: string): Promise<ConversationListResult> {
  const { brand, accessToken, scope, clientId, clientSecret } = getAuthContext();
  ensureScopes(scope, ["im:chat:read"]);
  const [userItems, botItems, recentUserP2PItems] = await Promise.all([
    searchUserChats(brand, accessToken, query),
    searchBotChats(brand, clientId, clientSecret, query),
    loadOptionalRecentUserP2PChats(query),
  ]);
  const botRecentItems = tokenStore
    .getBotRecentChats()
    .map(normalizeBotRecentChat)
    .filter((item) => matchesConversationQuery(item, query));
  const items = mergeConversationLists([
    ...userItems,
    ...botItems,
    ...recentUserP2PItems,
    ...botRecentItems,
  ]).filter(isChatListConversation);

  return { items };
}

async function listChats(): Promise<ConversationListResult> {
  const { brand, accessToken, scope, clientId, clientSecret } = getAuthContext();
  ensureScopes(scope, ["im:chat:read"]);
  const [userChats, botChats, recentUserP2PItems] = await Promise.all([
    loadUserChatList(brand, accessToken),
    loadBotChatList(brand, clientId, clientSecret),
    loadOptionalRecentUserP2PChats(),
  ]);
  const botRecentItems = tokenStore.getBotRecentChats().map(normalizeBotRecentChat);

  return {
    items: mergeConversationLists([
      ...userChats.map((item) => normalizeChatConversation(item, "user")),
      ...botChats.map((item) => normalizeChatConversation(item, "bot")),
      ...recentUserP2PItems,
      ...botRecentItems,
    ]).filter(isChatListConversation),
  };
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
  identity?: "user" | "bot" | "auto";
}): Promise<ListChatMessagesResult> {
  const {
    brand,
    accessToken,
    currentUserName,
    currentUserOpenId,
    scope,
    clientId,
    clientSecret,
    userInfo,
  } = getAuthContext();
  const pageSize = Math.min(50, Math.max(1, params.pageSize || 30));
  const identity = params.identity || "auto";
  const query = {
    container_id_type: "chat",
    container_id: params.chatId,
    sort_type: params.sort === "asc" ? "ByCreateTimeAsc" : "ByCreateTimeDesc",
    page_size: pageSize,
    page_token: params.pageToken,
    card_msg_content_type: "raw_card_content",
  };

  const loadAsUser = async () => {
    ensureScopes(scope, ["im:message.group_msg:get_as_user", "im:message.p2p_msg:get_as_user"]);
    return callOpenApiWithRefresh<{
      items?: Array<Record<string, unknown>>;
      has_more?: boolean;
      page_token?: string;
    }>({
      brand,
      accessToken,
      method: "GET",
      apiPath: "/open-apis/im/v1/messages",
      query,
    });
  };

  const loadAsBot = async () => {
    const tenantAccessToken = await getTenantAccessToken({
      brand,
      appId: clientId,
      appSecret: clientSecret,
    });
    return callOpenApi<{
      items?: Array<Record<string, unknown>>;
      has_more?: boolean;
      page_token?: string;
    }>({
      brand,
      accessToken: tenantAccessToken,
      method: "GET",
      apiPath: "/open-apis/im/v1/messages",
      query,
    });
  };

  const data =
    identity === "bot"
      ? await loadAsBot()
      : identity === "user"
        ? await loadAsUser()
        : await loadAsUser();
  const mentionProfiles = extractSenderProfilesFromMentions(data.items || []);

  const senderOpenIds = Array.from(
    new Set(
      (data.items || [])
        .map((item) => {
          const sender = (item.sender || {}) as Record<string, unknown>;
          return getSenderOpenId(sender);
        })
        .filter((openId) => !!openId && openId !== currentUserOpenId)
    )
  );
  const senderProfiles = new Map<string, UserProfileSummary>();
  mentionProfiles.forEach((profile, openId) => {
    senderProfiles.set(openId, profile);
  });

  await Promise.all(
    senderOpenIds.map(async (openId) => {
      const existingProfile = senderProfiles.get(openId);
      if (existingProfile?.title && existingProfile.avatarUrl) {
        return;
      }
      const profile = await getCachedUserProfileByOpenId(openId);
      senderProfiles.set(openId, {
        title:
          existingProfile?.title && existingProfile.title !== openId
            ? existingProfile.title
            : profile.title,
        avatarUrl: existingProfile?.avatarUrl || profile.avatarUrl,
      });
    })
  );

  const items = (data.items || []).map((item) => {
    const sender = (item.sender || {}) as Record<string, unknown>;
    const senderOpenId = getSenderOpenId(sender);
    const isSelf = !!senderOpenId && senderOpenId === currentUserOpenId;
    const senderId = String(sender.id || "");
    const senderType = String(sender.sender_type || "");
    const senderNameFromPayload = String(
      sender.name || sender.user_name || sender.display_name || sender.sender_name || ""
    );
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
    const senderProfile = senderOpenId ? senderProfiles.get(senderOpenId) : undefined;
    const senderName =
      messageType === "system" && !senderOpenId && !senderNameFromPayload
        ? "系统"
        : isSelf
          ? currentUserName || "我"
          : senderNameFromPayload ||
            senderProfile?.title ||
            (senderType === "app" ? "机器人应用" : senderOpenId || senderId || undefined);
    const resolvedAvatarUrl = isSelf
      ? userInfo?.avatarUrl || senderAvatarUrl || undefined
      : senderAvatarUrl || senderProfile?.avatarUrl || undefined;

    return {
      messageId: String(item.message_id || ""),
      chatId: String(item.chat_id || params.chatId),
      senderName,
      senderAvatarUrl: resolvedAvatarUrl,
      senderOpenId: senderOpenId || undefined,
      isSelf,
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
    title: "小飞侠",
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

function createMessagesWindow() {
  if (messagesWindow && !messagesWindow.isDestroyed()) {
    if (messagesWindow.isMinimized()) {
      messagesWindow.restore();
    }
    messagesWindow.focus();
    return messagesWindow;
  }

  const preloadPath = path.join(__dirname, "preload.js");
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: "消息",
    parent: mainWindow ?? undefined,
    autoHideMenuBar: true,
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

  win.on("closed", () => {
    messagesWindow = null;
  });

  if (!app.isPackaged) {
    void win.loadURL(getRendererEntryUrl("?messages-window=1"));
  } else {
    void win.loadFile(getRendererEntryUrl(), { search: "?messages-window=1" });
    win.webContents.on("devtools-opened", () => {
      win.webContents.closeDevTools();
    });
    win.webContents.on("before-input-event", (event, input) => {
      if (
        input.key === "F12" ||
        ((input.control || input.meta) && input.shift && input.key.toLowerCase() === "i")
      ) {
        event.preventDefault();
      }
    });
  }

  messagesWindow = win;
  return win;
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

function openAuthWindow(url: string, title = "授权") {
  closeAuthWindow(false);

  authWindow = new BrowserWindow({
    width: 640,
    height: 860,
    minWidth: 560,
    minHeight: 760,
    title,
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
    void authWindow.loadURL(
      getRendererEntryUrl(`?auth-shell=1&title=${encodeURIComponent(title)}`)
    );
  } else {
    void authWindow.loadFile(getRendererEntryUrl(), {
      search: `?auth-shell=1&title=${encodeURIComponent(title)}`,
    });
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

ipcMain.handle("window:openMessagesWindow", () => {
  createMessagesWindow();
  return { success: true };
});

// ── 初始化状态 IPC ──
ipcMain.handle("config:getInitStatus", () => {
  return tokenStore.getInitStatus();
});

// ── 保存应用配置 IPC ──
ipcMain.handle("config:saveAppConfig", (_event, config) => {
  tokenStore.saveAppConfig(config);
  void ensureMessageRealtimeSubscription();
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
  stopMessageRealtimeSubscription();
  tokenStore.clearConfig();
  return { success: true };
});

// ── 打开外部链接 IPC ──
ipcMain.handle("shell:openExternal", (_event, url) => {
  return shell.openExternal(url);
});

// ── 消息 / 联系人读取 IPC ──
ipcMain.handle("messages:listContacts", () => {
  return listContacts();
});

ipcMain.handle("messages:listChats", () => {
  return listChats();
});

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

ipcMain.handle("messages:getRealtimeStatus", () => {
  return realtimeConnectionStatus;
});

ipcMain.handle("auth:openAuthWindow", (_event, url: string, title?: string) => {
  openAuthWindow(url, title || "授权");
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
  void ensureMessageRealtimeSubscription();
});

app.on("before-quit", () => {
  stopMessageRealtimeSubscription();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
