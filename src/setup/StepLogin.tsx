import {
  Box, Typography, Button, CircularProgress,
  Alert, Skeleton, TextField,
} from "@mui/material";
import { ArrowLeft, ExternalLink, CheckCircle, RefreshCw } from "lucide-react";
import type { AppCreationPollResult } from "../services/appCreationService";
import type { LoginPollStatusEvent } from "../services/userLoginService";

interface Props {
  appResult: AppCreationPollResult | null;
  loginStarted: boolean;
  status: LoginPollStatusEvent | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onBegin: () => void;
  onCancel: () => void;
}

/** 步骤 2: 用户登录 — 应用创建成功后登录飞书账号 */
export default function StepLogin({
  appResult, loginStarted, status, loading, error, onBack, onBegin, onCancel,
}: Props) {
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
      <CheckCircle size={32} color="currentColor" style={{ marginBottom: 16 }} />

      <Typography variant="h5" sx={{ color: "text.primary", fontWeight: 600, mb: 1 }}>
        应用创建成功
      </Typography>

      <Typography sx={{ mb: 4, color: "text.secondary", maxWidth: 520, lineHeight: 1.7 }}>
        继续完成账号授权，后续就可以正常使用肥猪。
      </Typography>

      {!appResult && loading && (
        <Box
          sx={{
            width: "100%",
            maxWidth: 450,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            mb: 4,
          }}
        >
          <Box sx={{ textAlign: "left" }}>
            <Skeleton variant="text" width={80} height={22} sx={{ mb: 0.75 }} />
            <Skeleton variant="rounded" height={40} sx={{ borderRadius: "999px" }} />
          </Box>
          <Box sx={{ textAlign: "left" }}>
            <Skeleton variant="text" width={60} height={22} sx={{ mb: 0.75 }} />
            <Skeleton variant="rounded" height={40} sx={{ borderRadius: "999px" }} />
          </Box>
        </Box>
      )}

      {appResult && (
        <Box
          sx={{
            py: 1,
            mb: 4,
            width: "100%",
            maxWidth: 450,
            textAlign: "left",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <Box>
            <Typography sx={{ color: "text.secondary", mb: 0.75 }}>
              App ID:
            </Typography>
            <TextField
              fullWidth
              value={appResult.clientId || ""}
              variant="outlined"
              size="small"
              InputProps={{ readOnly: true }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: "999px",
                  "& .MuiOutlinedInput-notchedOutline": {
                    borderColor: "divider",
                  },
                  "&:hover .MuiOutlinedInput-notchedOutline": {
                    borderColor: "divider",
                  },
                },
              }}
            />
          </Box>

          <Box>
            <Typography sx={{ color: "text.secondary", mb: 0.75 }}>
              品牌:
            </Typography>
            <TextField
              fullWidth
              value={appResult.brand || ""}
              variant="outlined"
              size="small"
              InputProps={{ readOnly: true }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: "999px",
                  "& .MuiOutlinedInput-notchedOutline": {
                    borderColor: "divider",
                  },
                  "&:hover .MuiOutlinedInput-notchedOutline": {
                    borderColor: "divider",
                  },
                },
              }}
            />
          </Box>
        </Box>
      )}

      <Typography sx={{ mb: 4, color: "text.secondary", maxWidth: 520, lineHeight: 1.7 }}>
        点击下方按钮，浏览器将打开飞书登录页面。
      </Typography>

      {!loginStarted && !loading && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1.5,
            flexWrap: "wrap",
          }}
        >
          <Button
            onClick={onBack}
            startIcon={<ArrowLeft size={16} />}
            sx={{
              minHeight: 44,
              px: 2.5,
              borderRadius: "999px",
              textTransform: "none",
              fontSize: "0.9rem",
              backgroundColor: "#d32f2f",
              color: "#fff",
              "&:hover": {
                backgroundColor: "#c62828",
              },
            }}
          >
            上一步
          </Button>

          <Button
            variant="contained"
            size="large"
            onClick={onBegin}
            startIcon={<ExternalLink size={18} />}
            sx={{
              px: 3,
              minHeight: 48,
              borderRadius: "999px",
              fontSize: "0.95rem",
              fontWeight: 600,
              textTransform: "none",
              backgroundColor: "text.primary",
              color: "background.default",
              boxShadow: "none",
              "&:hover": {
                backgroundColor: "text.primary",
                boxShadow: "none",
                opacity: 0.92,
              },
            }}
          >
            打开授权页登录
          </Button>
        </Box>
      )}

      {loading && loginStarted && (
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
              ? `等待登录中... (第 ${status.attempt} 次检查)`
              : "等待登录中..."}
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
            <Button color="inherit" size="small" onClick={onBegin} startIcon={<RefreshCw size={14} />}>
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
