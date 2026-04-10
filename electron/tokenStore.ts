/**
 * Token 和应用配置持久化存储
 * 使用 Electron 的 app.getPath("userData") 在本地文件系统保存配置
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { app } from "electron";

const CONFIG_FILE = "feizhu-config.json";

export interface AppConfig {
  clientId: string;
  clientSecret: string;
  brand: string;
  userInfo?: Record<string, unknown>;
  createdAt?: string;
}

export interface UserToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
  scope?: string;
  userInfo?: { openId?: string; name?: string };
  loginAt?: string;
}

interface Config {
  app?: AppConfig;
  user?: UserToken;
}

function getConfigPath(): string {
  return path.join(app.getPath("userData"), CONFIG_FILE);
}

export function loadConfig(): Config {
  try {
    const filePath = getConfigPath();
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as Config;
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  const filePath = getConfigPath();
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}

export function saveAppConfig(data: {
  clientId: string;
  clientSecret: string;
  brand: string;
  userInfo?: Record<string, unknown>;
}): void {
  const config = loadConfig();
  config.app = {
    ...data,
    createdAt: new Date().toISOString(),
  };
  saveConfig(config);
}

export function saveUserToken(data: {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
  scope?: string;
  userInfo?: { openId?: string; name?: string };
}): void {
  const config = loadConfig();
  config.user = {
    ...data,
    loginAt: new Date().toISOString(),
  };
  saveConfig(config);
}

export function getAppConfig(): AppConfig | null {
  return loadConfig().app ?? null;
}

export function getUserToken(): UserToken | null {
  return loadConfig().user ?? null;
}

export function getInitStatus() {
  const config = loadConfig();
  return {
    hasApp: !!config.app?.clientId,
    hasUser: !!config.user?.accessToken,
    app: config.app ?? null,
    user: config.user ?? null,
  };
}

export function clearConfig(): void {
  saveConfig({});
}
