/// <reference types="vite/client" />
import type { UiPreferences } from "./types/uiPreferences";

/** Electron preload 暴露的窗口控制 API */
interface AppWindowBridge {
  customTitleBar: boolean;
  platform: string;
  openMessagesWindow: () => Promise<{ success: boolean }>;
  setTitleBarOverlay: (opts: {
    color?: string;
    symbolColor?: string;
    height?: number;
  }) => Promise<void>;
}

/** Electron preload 暴露的配置存储 API */
interface ConfigBridge {
  getInitStatus: () => Promise<{
    hasApp: boolean;
    hasUser: boolean;
    app: AppConfig | null;
    user: UserToken | null;
  }>;
  saveAppConfig: (config: {
    clientId: string;
    clientSecret: string;
    brand: string;
    userInfo?: Record<string, unknown>;
  }) => Promise<{ success: boolean }>;
  saveUserToken: (data: {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    refreshTokenExpiresIn?: number;
    scope?: string;
    userInfo?: { openId?: string; name?: string; avatarUrl?: string };
  }) => Promise<{ success: boolean }>;
  getAppConfig: () => Promise<AppConfig | null>;
  getUiPreferences: () => Promise<UiPreferences>;
  saveUiPreferences: (preferences: UiPreferences) => Promise<{ success: boolean }>;
  clearConfig: () => Promise<{ success: boolean }>;
}

/** Electron preload 暴露的 Shell API */
interface ShellBridge {
  openExternal: (url: string) => Promise<void>;
}

interface MessageConversationItem {
  id: string;
  type: "p2p" | "group";
  title: string;
  subtitle?: string;
  avatarUrl?: string;
  chatId?: string;
  userOpenId?: string;
  source: "user" | "bot" | "mixed";
  contactCategory?: "directory" | "discovered";
}

interface MessageItem {
  messageId: string;
  chatId: string;
  senderName?: string;
  senderAvatarUrl?: string;
  senderOpenId?: string;
  senderType?: string;
  isCurrentBot?: boolean;
  isSelf?: boolean;
  messageType: string;
  contentText: string;
  createTime: string;
}

interface RealtimeMessageItem {
  eventType: "im.message.receive_v1";
  messageId: string;
  chatId: string;
  chatType: string;
  messageType: string;
  contentText: string;
  createTime: string;
  senderOpenId?: string;
}

interface RealtimeConnectionStatus {
  state: "disabled" | "connecting" | "connected" | "reconnecting" | "error";
  message: string;
  updatedAt: number;
}

interface RealtimeConversationChangedItem {
  eventType: "im.chat.access_event.bot_p2p_chat_entered_v1";
  chatId: string;
  userOpenId: string;
  title?: string;
  avatarUrl?: string;
  lastMessageAt?: number;
}

interface MessagesBridge {
  listContacts: () => Promise<{ items: MessageConversationItem[] }>;
  listChats: () => Promise<{ items: MessageConversationItem[] }>;
  searchUsers: (query: string) => Promise<{ items: MessageConversationItem[] }>;
  searchChats: (query: string) => Promise<{ items: MessageConversationItem[] }>;
  resolveP2PChat: (userOpenId: string) => Promise<{ chatId: string }>;
  getRealtimeStatus: () => Promise<RealtimeConnectionStatus>;
  listChatMessages: (params: {
    chatId: string;
    pageToken?: string;
    pageSize?: number;
    sort?: "asc" | "desc";
    identity?: "user" | "bot" | "auto";
  }) => Promise<{ items: MessageItem[]; hasMore: boolean; pageToken?: string }>;
  exportChatLab: (conversation: MessageConversationItem) => Promise<{
    canceled: boolean;
    filePath?: string;
    fileName?: string;
    format?: "json" | "jsonl";
    messageCount?: number;
  }>;
  onIncomingMessage: (callback: (payload: RealtimeMessageItem) => void) => () => void;
  onConversationChanged: (callback: (payload: RealtimeConversationChangedItem) => void) => () => void;
  onRealtimeStatusChange: (callback: (payload: RealtimeConnectionStatus) => void) => () => void;
}

interface AuthBridge {
  beginAppCreation: () => Promise<Record<string, unknown>>;
  pollAppCreation: (
    deviceCode: string,
    brand?: "feishu" | "lark"
  ) => Promise<Record<string, unknown>>;
  openAuthWindow: (url: string, title?: string) => Promise<{ success: boolean }>;
  closeAuthWindow: () => Promise<{ success: boolean; closed: boolean }>;
  onAuthWindowClosed: (callback: () => void) => () => void;
  beginDeviceAuth: (params: {
    appId: string;
    appSecret: string;
    brand?: "feishu" | "lark";
    scopes?: string[];
  }) => Promise<Record<string, unknown>>;
  pollForToken: (params: {
    deviceCode: string;
    appId: string;
    appSecret: string;
    brand?: "feishu" | "lark";
  }) => Promise<Record<string, unknown>>;
  fetchUserInfo: (params: {
    accessToken: string;
    brand?: "feishu" | "lark";
  }) => Promise<Record<string, unknown>>;
}

interface AppConfig {
  clientId: string;
  clientSecret: string;
  brand: string;
  userInfo?: Record<string, unknown>;
  uiPreferences?: UiPreferences;
  createdAt?: string;
}

interface UserToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
  scope?: string;
  userInfo?: { openId?: string; name?: string; avatarUrl?: string };
  loginAt?: string;
}

declare global {
  interface Window {
    appWindow?: AppWindowBridge;
    configBridge?: ConfigBridge;
    shellBridge?: ShellBridge;
    messagesBridge?: MessagesBridge;
    authBridge?: AuthBridge;
  }
}

export {};
