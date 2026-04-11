/**
 * 用户登录服务
 * 实现飞书设备码 OAuth 登录流程
 */

import type { Brand } from "./brandResolver";

// ── 类型定义 ──

export interface DeviceAuthResult {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export interface TokenResult {
  status: string;
  message?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
  scope?: string;
}

export interface UserInfo {
  openId: string;
  name: string;
  avatarUrl?: string;
}

export interface LoginPollStatusEvent {
  type: "success" | "pending" | "slow_down" | "unknown" | "warning";
  data?: TokenResult;
  attempt?: number;
  interval?: number;
  message?: string;
}

// ── 发起设备授权 ──

export async function beginDeviceAuth(
  appId: string,
  appSecret: string,
  brand: Brand = "feishu",
  scopes: string[] = []
): Promise<DeviceAuthResult> {
  if (!window.authBridge) {
    throw new Error("当前环境不支持登录授权，请在 Electron 中运行");
  }

  const data = await window.authBridge.beginDeviceAuth({ appId, appSecret, brand, scopes });

  return {
    deviceCode: String(data.deviceCode || ""),
    userCode: String(data.userCode || ""),
    verificationUri: String(data.verificationUri || ""),
    verificationUriComplete: String(data.verificationUriComplete || ""),
    expiresIn: Number(data.expiresIn || 240),
    interval: Number(data.interval || 5),
  };
}

// ── 轮询换取 token ──

/**
 * 注意：换 token 走 open 域名，不走 accounts
 */
export async function pollForToken(
  deviceCode: string,
  appId: string,
  appSecret: string,
  brand: Brand = "feishu"
): Promise<TokenResult> {
  if (!window.authBridge) {
    throw new Error("当前环境不支持登录授权，请在 Electron 中运行");
  }

  const data = await window.authBridge.pollForToken({ deviceCode, appId, appSecret, brand });

  if (data.error) {
    return { status: String(data.error), message: String(data.error_description || "") };
  }

  return {
    status: "success",
    accessToken: String(data.access_token || ""),
    refreshToken: data.refresh_token ? String(data.refresh_token) : undefined,
    expiresIn: data.expires_in ? Number(data.expires_in) : undefined,
    refreshTokenExpiresIn: data.refresh_token_expires_in
      ? Number(data.refresh_token_expires_in)
      : undefined,
    scope: data.scope ? String(data.scope) : undefined,
  };
}

// ── 获取用户信息 ──

export async function fetchUserInfo(
  accessToken: string,
  brand: Brand = "feishu"
): Promise<UserInfo> {
  if (!window.authBridge) {
    throw new Error("当前环境不支持获取用户信息，请在 Electron 中运行");
  }

  const json = await window.authBridge.fetchUserInfo({ accessToken, brand });
  const data = (json.data || {}) as Record<string, unknown>;

  return {
    openId: String(data.open_id || ""),
    name: String(data.name || ""),
    avatarUrl:
      typeof data.avatar_url === "string" && data.avatar_url.length > 0
        ? data.avatar_url
        : undefined,
  };
}

// ── 完整登录轮询循环 ──

export async function loginPollUntilComplete(params: {
  deviceCode: string;
  appId: string;
  appSecret: string;
  brand?: Brand;
  initialInterval?: number;
  onStatus?: (event: LoginPollStatusEvent) => void;
  signal?: AbortSignal;
}): Promise<TokenResult> {
  const {
    deviceCode,
    appId,
    appSecret,
    brand = "feishu",
    initialInterval = 5,
    onStatus,
    signal,
  } = params;

  let interval = initialInterval;
  const MAX_POLLS = 200;
  const MAX_INTERVAL = 60;

  for (let i = 0; i < MAX_POLLS; i++) {
    if (signal?.aborted) throw new Error("用户取消操作");

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, interval * 1000);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("用户取消操作"));
      }, { once: true });
    });

    const result = await pollForToken(deviceCode, appId, appSecret, brand);

    switch (result.status) {
      case "success":
        if (!result.refreshToken) {
          onStatus?.({ type: "warning", message: "未获取到 refresh_token" });
        }
        onStatus?.({ type: "success", data: result });
        return result;
      case "authorization_pending":
        onStatus?.({ type: "pending", attempt: i + 1 });
        break;
      case "slow_down":
        interval = Math.min(interval + 5, MAX_INTERVAL);
        onStatus?.({ type: "slow_down", interval });
        break;
      case "access_denied":
        throw new Error("用户拒绝了授权");
      case "expired_token":
      case "invalid_grant":
        throw new Error("设备码已过期，请重新开始");
      default:
        onStatus?.({ type: "unknown" });
    }
  }

  throw new Error("轮询超时：已达到最大轮询次数");
}
