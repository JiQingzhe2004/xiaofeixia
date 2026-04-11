/// <reference types="vite/client" />
import type { UiPreferences } from "./types/uiPreferences";

/** Electron preload 暴露的窗口控制 API */
interface AppWindowBridge {
  customTitleBar: boolean;
  platform: string;
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
}

interface MessageItem {
  messageId: string;
  chatId: string;
  senderName?: string;
  senderAvatarUrl?: string;
  messageType: string;
  contentText: string;
  createTime: string;
}

interface MessagesBridge {
  searchUsers: (query: string) => Promise<{ items: MessageConversationItem[] }>;
  searchChats: (query: string) => Promise<{ items: MessageConversationItem[] }>;
  resolveP2PChat: (userOpenId: string) => Promise<{ chatId: string }>;
  listChatMessages: (params: {
    chatId: string;
    pageToken?: string;
    pageSize?: number;
    sort?: "asc" | "desc";
  }) => Promise<{ items: MessageItem[]; hasMore: boolean; pageToken?: string }>;
}

interface AuthBridge {
  beginAppCreation: () => Promise<Record<string, unknown>>;
  pollAppCreation: (
    deviceCode: string,
    brand?: "feishu" | "lark"
  ) => Promise<Record<string, unknown>>;
  openAuthWindow: (url: string) => Promise<{ success: boolean }>;
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
