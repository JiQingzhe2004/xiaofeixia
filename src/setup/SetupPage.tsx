/**
 * 初始化设置页面 — 整合所有步骤
 *
 * 流程：
 * Step 0: 欢迎  → 点击"开始"
 * Step 1: 创建应用 → 浏览器授权 → 轮询完成
 * Step 2: 用户登录 → 浏览器授权 → 轮询换 token
 * Step 3: 完成 → 进入主界面
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Box, Fade, Paper, Stepper, Step, StepLabel } from "@mui/material";

import StepWelcome from "./StepWelcome";
import StepCreatingApp from "./StepCreatingApp";
import StepLogin from "./StepLogin";
import StepComplete from "./StepComplete";

import {
  beginAppCreation,
  pollUntilComplete,
  type AppCreationBeginResult,
  type AppCreationPollResult,
  type PollStatusEvent,
} from "../services/appCreationService";
import {
  beginDeviceAuth,
  loginPollUntilComplete,
  fetchUserInfo,
  type UserInfo,
  type LoginPollStatusEvent,
} from "../services/userLoginService";
import type { Brand } from "../services/brandResolver";
import { useNotice } from "../components/notice/NoticeCenter";

const STEP_LABELS = ["欢迎", "创建应用", "登录授权", "完成"];
const PIG_EASTER_EGGS = [
  "你打到小猪了，好疼！",
  "小猪哼了一声，记你一下。",
  "别戳了，小猪的翅膀都抖了一下。",
];

interface Props {
  onSetupComplete: () => void;
}

export default function SetupPage({ onSetupComplete }: Props) {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pushNotice, clearNotices } = useNotice();

  // 应用创建
  const [appCreationData, setAppCreationData] = useState<AppCreationBeginResult | null>(null);
  const [appResult, setAppResult] = useState<AppCreationPollResult | null>(null);
  const [pollStatus, setPollStatus] = useState<PollStatusEvent | null>(null);
  const [appCreationPolling, setAppCreationPolling] = useState(false);

  // 用户登录
  const [loginStarted, setLoginStarted] = useState(false);
  const [loginPollStatus, setLoginPollStatus] = useState<LoginPollStatusEvent | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleTaskError = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("用户取消")) {
      pushNotice(message, { severity: "warning" });
      setError(null);
      return;
    }
    setError(message);
  }, [pushNotice]);

  // ── Step 0 → 1: 创建应用 ──
  const handleBeginAppCreation = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPollStatus(null);
    setAppCreationData(null);
    setAppCreationPolling(false);
    setActiveStep(1);
    try {
      const data = await beginAppCreation();
      setAppCreationData(data);
    } catch (err: unknown) {
      handleTaskError(err);
      setActiveStep(0);
    } finally {
      setLoading(false);
    }
  }, [handleTaskError]);

  const handleOpenAppAuthorizationPage = useCallback(async () => {
    if (!appCreationData) return;
    setLoading(true);
    setError(null);
    setPollStatus(null);
    setAppCreationPolling(true);
    try {
      window.shellBridge?.openExternal(appCreationData.verificationUrl);

      abortRef.current = new AbortController();
      const result = await pollUntilComplete(
        appCreationData.deviceCode,
        appCreationData.interval,
        (s) => setPollStatus(s),
        abortRef.current.signal
      );

      setAppResult(result);

      window.configBridge?.saveAppConfig({
        clientId: result.clientId!,
        clientSecret: result.clientSecret!,
        brand: result.brand || "feishu",
        userInfo: result.userInfo,
      });

      setActiveStep(2);
    } catch (err: unknown) {
      handleTaskError(err);
    } finally {
      setLoading(false);
    }
  }, [appCreationData, handleTaskError]);

  // ── Step 2: 开始登录 ──
  const handleBeginLogin = useCallback(async () => {
    if (!appResult) return;
    setLoading(true);
    setError(null);
    setLoginStarted(true);
    try {
      const brand = (appResult.brand || "feishu") as Brand;
      const data = await beginDeviceAuth(appResult.clientId!, appResult.clientSecret!, brand);

      // 打开浏览器
      const authUrl = data.verificationUriComplete || data.verificationUri;
      if (authUrl) window.shellBridge?.openExternal(authUrl);

      // 轮询
      abortRef.current = new AbortController();
      const tokenResult = await loginPollUntilComplete({
        deviceCode: data.deviceCode,
        appId: appResult.clientId!,
        appSecret: appResult.clientSecret!,
        brand,
        initialInterval: data.interval,
        onStatus: (s) => setLoginPollStatus(s),
        signal: abortRef.current.signal,
      });

      // 拿用户信息
      const info = await fetchUserInfo(tokenResult.accessToken!, brand);
      setUserInfo(info);

      // 保存 token
      window.configBridge?.saveUserToken({
        accessToken: tokenResult.accessToken!,
        refreshToken: tokenResult.refreshToken,
        expiresIn: tokenResult.expiresIn,
        refreshTokenExpiresIn: tokenResult.refreshTokenExpiresIn,
        scope: tokenResult.scope,
        userInfo: info,
      });

      setActiveStep(3);
    } catch (err: unknown) {
      handleTaskError(err);
      setLoginStarted(false);
    } finally {
      setLoading(false);
    }
  }, [appResult, handleTaskError]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setAppCreationPolling(false);
    setLoading(false);
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const handleBackToWelcome = useCallback(() => {
    setError(null);
    clearNotices();
    setPollStatus(null);
    setAppCreationData(null);
    setAppCreationPolling(false);
    setLoading(false);
    setActiveStep(0);
  }, [clearNotices]);

  const handlePigClick = useCallback(() => {
    const message = PIG_EASTER_EGGS[Math.floor(Math.random() * PIG_EASTER_EGGS.length)];
    pushNotice(message, { severity: "warning" });
  }, [pushNotice]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "background.default",
        color: "text.primary",
        px: 3,
        py: 6,
        pt: window.appWindow?.customTitleBar ? "56px" : 6,
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 840,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            mb: 5,
            px: 1,
            py: 1.5,
            backgroundColor: "background.default",
          }}
        >
          <Stepper activeStep={activeStep} alternativeLabel>
            {STEP_LABELS.map((label) => (
              <Step key={label}>
                <StepLabel
                  sx={{
                    "& .MuiStepLabel-label": {
                      color: "text.secondary",
                      fontWeight: 500,
                      fontSize: "0.85rem",
                    },
                    "& .MuiStepLabel-label.Mui-active": {
                      color: "text.primary",
                      fontWeight: 700,
                    },
                    "& .MuiStepLabel-label.Mui-completed": {
                      color: "text.secondary",
                    },
                  }}
                >
                  {label}
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        </Paper>

        <Fade in timeout={360} key={activeStep}>
          <Box
            sx={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              minHeight: 340,
              maxWidth: 760,
              mx: "auto",
              transform: "translateY(0)",
              animation: "setup-step-enter 360ms cubic-bezier(0.22, 1, 0.36, 1)",
              "@keyframes setup-step-enter": {
                from: {
                  opacity: 0,
                  transform: "translateY(14px)",
                },
                to: {
                  opacity: 1,
                  transform: "translateY(0)",
                },
              },
            }}
          >
            {activeStep === 0 && (
              <StepWelcome
                onNext={handleBeginAppCreation}
                loading={loading}
                onPigClick={handlePigClick}
              />
            )}

            {activeStep === 1 && (
              <StepCreatingApp
              data={appCreationData}
              status={pollStatus}
              loading={loading}
              error={error}
              polling={appCreationPolling}
              onBack={handleBackToWelcome}
              onCancel={handleCancel}
              onRetry={handleBeginAppCreation}
              onCopy={copyToClipboard}
              onOpenAuthorizationPage={handleOpenAppAuthorizationPage}
            />
          )}

            {activeStep === 2 && (
              <StepLogin
                appResult={appResult}
                loginStarted={loginStarted}
                status={loginPollStatus}
                loading={loading}
                error={error}
                onBegin={handleBeginLogin}
                onCancel={handleCancel}
              />
            )}

            {activeStep === 3 && (
              <StepComplete userInfo={userInfo} onFinish={onSetupComplete} />
            )}
          </Box>
        </Fade>
      </Box>
    </Box>
  );
}
