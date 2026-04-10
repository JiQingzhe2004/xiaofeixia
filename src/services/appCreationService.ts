/**
 * 应用创建服务
 * 实现飞书设备码创建应用的完整流程
 */

import { resolveBrand, type Brand } from "./brandResolver";

// ── 类型定义 ──

export interface AppCreationBeginResult {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  interval: number;
  expiresIn: number;
}

export interface AppCreationPollResult {
  status: string;
  message?: string;
  clientId?: string;
  clientSecret?: string;
  userInfo?: Record<string, unknown>;
  brand?: string;
}

export interface PollStatusEvent {
  type: "success" | "pending" | "slow_down" | "unknown" | "warning";
  data?: AppCreationPollResult;
  attempt?: number;
  interval?: number;
  status?: string;
  message?: string;
}

// ── 开始创建应用 ──

/**
 * 发起创建应用请求
 * 注意：无论最终品牌是什么，begin 阶段固定走 feishu 的 accounts 域名
 */
export async function beginAppCreation(): Promise<AppCreationBeginResult> {
  if (!window.authBridge) {
    throw new Error("当前环境不支持创建应用，请在 Electron 中运行");
  }

  const data = await window.authBridge.beginAppCreation();

  return {
    deviceCode: String(data.deviceCode || ""),
    userCode: String(data.userCode || ""),
    verificationUrl: String(data.verificationUrl || ""),
    interval: Number(data.interval || 5),
    expiresIn: Number(data.expiresIn || 1800),
  };
}

// ── 轮询创建结果 ──

/**
 * 单次轮询
 * 包含品牌切换逻辑：feishu 拿到空 secret + tenant_brand=="lark" 时切到 lark 域名重 poll
 */
export async function pollAppCreation(
  deviceCode: string,
  brand: Brand = "feishu"
): Promise<AppCreationPollResult> {
  if (!window.authBridge) {
    throw new Error("当前环境不支持创建应用，请在 Electron 中运行");
  }

  const data = await window.authBridge.pollAppCreation(deviceCode, brand);
  const userInfo = (data.user_info || {}) as { tenant_brand?: string } & Record<string, unknown>;

  if (data.error) {
    return { status: String(data.error), message: String(data.error_description || "") };
  }

  if (data.client_id) {
    // 关键品牌切换逻辑
    if (!data.client_secret && userInfo.tenant_brand === "lark" && brand !== "lark") {
      return pollAppCreation(deviceCode, "lark");
    }
    return {
      status: "success",
      clientId: String(data.client_id),
      clientSecret: String(data.client_secret || ""),
      userInfo,
      brand: String(userInfo.tenant_brand || brand),
    };
  }

  return { status: "authorization_pending" };
}

// ── 完整轮询循环 ──

export async function pollUntilComplete(
  deviceCode: string,
  initialInterval: number = 5,
  onStatus?: (event: PollStatusEvent) => void,
  signal?: AbortSignal
): Promise<AppCreationPollResult> {
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

    const result = await pollAppCreation(deviceCode);

    switch (result.status) {
      case "success":
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
        onStatus?.({ type: "unknown", status: result.status });
    }
  }

  throw new Error("轮询超时：已达到最大轮询次数");
}
