import {
  Box, Typography, Button, CircularProgress,
  Alert, Skeleton,
} from "@mui/material";
import { ArrowLeft, ArrowRight, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  AppCreationBeginResult,
  AppCreationPollResult,
  PollStatusEvent,
} from "../services/appCreationService";

interface Props {
  data: AppCreationBeginResult | null;
  appResult?: AppCreationPollResult | null;
  status: PollStatusEvent | null;
  loading: boolean;
  error: string | null;
  polling: boolean;
  onBack: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onCopy: (text: string) => void;
  onOpenAuthorizationPage: () => void;
  onContinue: () => void;
}

/** 步骤 1: 等待用户在浏览器授权创建应用 */
export default function StepCreatingApp({
  data, appResult, status, loading, error, polling, onBack, onCancel, onRetry, onCopy, onOpenAuthorizationPage, onContinue,
}: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = () => {
    if (!data?.userCode) return;
    onCopy(data.userCode);
    setCopied(true);
  };

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: 680,
        mx: "auto",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <Typography variant="h5" sx={{ color: "text.primary", fontWeight: 600, mb: 1 }}>
        创建飞书应用
      </Typography>

      <Typography sx={{ mb: 3, color: "text.secondary", maxWidth: 520, lineHeight: 1.7 }}>
        {appResult
          ? "应用已经创建完成，可以直接进入登录授权。"
          : "先打开授权页面，再在浏览器中完成授权。"}
      </Typography>

      {!data && loading && !polling && (
        <Box
          sx={{
            width: "100%",
            maxWidth: 640,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            mb: 4,
          }}
        >
          <Skeleton variant="text" width={320} height={28} sx={{ mb: 1 }} />
          <Skeleton variant="text" width={180} height={22} sx={{ mb: 2 }} />
          <Box sx={{ display: "flex", justifyContent: "center", gap: 1, flexWrap: "wrap", maxWidth: 520 }}>
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} variant="circular" width={42} height={42} />
            ))}
          </Box>
          <Box sx={{ mt: 3, display: "flex", gap: 1.5, justifyContent: "center", flexWrap: "wrap" }}>
            <Skeleton variant="rounded" width={102} height={44} sx={{ borderRadius: "999px" }} />
            <Skeleton variant="rounded" width={124} height={44} sx={{ borderRadius: "999px" }} />
          </Box>
        </Box>
      )}

      {data?.userCode && (
        <Box
          sx={{
            p: 0,
            mb: 4,
            width: "100%",
            maxWidth: 640,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {!!appResult && (
            <Box
              sx={{
                mb: 2,
                px: 2,
                py: 1,
                borderRadius: "999px",
                backgroundColor: "action.hover",
                color: "text.secondary",
                fontSize: "0.9rem",
              }}
            >
              应用已创建成功，现在可以直接继续登录授权。
            </Box>
          )}

          {!polling && (
            <Box
              sx={{
                mb: 2.5,
                display: "flex",
                gap: 1.5,
                alignItems: "center",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <Button
                size="large"
                startIcon={<ArrowLeft size={14} />}
                onClick={onBack}
                sx={{
                  minHeight: 44,
                  px: 2.5,
                  borderRadius: "999px",
                  textTransform: "none",
                  fontSize: "0.9rem",
                  backgroundColor: "#d32f2f",
                  color: "#fff",
                  "&:hover": { backgroundColor: "#c62828" },
                }}
              >
                上一步
              </Button>

              <Button
                size="large"
                startIcon={appResult ? <ArrowRight size={14} /> : <ExternalLink size={14} />}
                onClick={appResult ? onContinue : onOpenAuthorizationPage}
                sx={{
                  minHeight: 44,
                  px: 2.5,
                  borderRadius: "999px",
                  textTransform: "none",
                  fontSize: "0.9rem",
                  backgroundColor: "text.primary",
                  color: "background.default",
                  "&:hover": { backgroundColor: "text.primary", opacity: 0.92 },
                }}
              >
                {appResult ? "继续登录授权" : "打开授权页"}
              </Button>
            </Box>
          )}

          {!appResult && (
            <>
              <Typography sx={{ mb: 1, display: "block", color: "text.secondary", maxWidth: 460 }}>
                如果浏览器未自动打开，请手动访问并输入以下授权码：
              </Typography>
              <Typography
                sx={{
                  mb: 2,
                  fontSize: "0.85rem",
                  color: copied ? "text.primary" : "text.secondary",
                }}
              >
                {copied ? "已复制授权码" : "点击授权码即可复制"}
              </Typography>

              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: 1,
                  cursor: "pointer",
                  userSelect: "none",
                  maxWidth: 520,
                }}
                onClick={handleCopy}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleCopy();
                  }
                }}
              >
                {Array.from(data.userCode).map((char, index) => (
                  <Box
                    key={`${char}-${index}`}
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: "999px",
                      backgroundColor: "text.primary",
                      color: "background.default",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.08rem",
                      fontWeight: 800,
                      fontFamily:
                        '"SF Pro Display", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
                      lineHeight: 1,
                    }}
                  >
                    {char}
                  </Box>
                ))}
              </Box>
            </>
          )}
        </Box>
      )}

      {loading && polling && (
        <Box
          sx={{
            mb: 3,
            px: 1.5,
            py: 1,
            borderRadius: "999px",
            display: "inline-flex",
            alignItems: "center",
            gap: 1.25,
            backgroundColor: "action.hover",
          }}
        >
          <CircularProgress size={16} sx={{ color: "text.primary" }} />
          <Typography sx={{ color: "text.secondary", fontSize: "0.88rem" }}>
            {status?.type === "pending"
              ? `等待授权中... (第 ${status.attempt} 次检查)`
              : "等待授权中..."}
          </Typography>
          <Button
            onClick={onCancel}
            sx={{
              borderRadius: 999,
              color: "#d32f2f",
              minHeight: 28,
              px: 1.5,
              fontSize: "0.8rem",
              textTransform: "none",
              "&:hover": {
                backgroundColor: "rgba(211,47,47,0.08)",
              },
            }}
          >
            取消
          </Button>
        </Box>
      )}

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3, width: "100%", maxWidth: 460, borderRadius: 2, textAlign: "left" }}
          action={
            <Button color="inherit" size="small" onClick={onRetry} startIcon={<RefreshCw size={14} />}>
              重试
            </Button>
          }
        >
          {error}
        </Alert>
      )}

    </Box>
  );
}
