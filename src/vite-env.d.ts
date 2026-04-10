/// <reference types="vite/client" />

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
    userInfo?: { openId?: string; name?: string };
  }) => Promise<{ success: boolean }>;
  getAppConfig: () => Promise<AppConfig | null>;
  clearConfig: () => Promise<{ success: boolean }>;
}

/** Electron preload 暴露的 Shell API */
interface ShellBridge {
  openExternal: (url: string) => Promise<void>;
}

interface AuthBridge {
  beginAppCreation: () => Promise<Record<string, unknown>>;
  pollAppCreation: (
    deviceCode: string,
    brand?: "feishu" | "lark"
  ) => Promise<Record<string, unknown>>;
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
  createdAt?: string;
}

interface UserToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
  scope?: string;
  userInfo?: { openId?: string; name?: string };
  loginAt?: string;
}

declare global {
  interface Window {
    appWindow?: AppWindowBridge;
    configBridge?: ConfigBridge;
    shellBridge?: ShellBridge;
    authBridge?: AuthBridge;
  }
}

export {};
