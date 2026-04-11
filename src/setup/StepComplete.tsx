import { Box, Typography, Button } from "@mui/material";
import { CheckCircle } from "lucide-react";
import type { UserInfo } from "../services/userLoginService";

interface Props {
  userInfo: UserInfo | null;
  onFinish: () => void;
}

/** 步骤 3: 设置完成 */
export default function StepComplete({ userInfo, onFinish }: Props) {
  return (
    <Box sx={{ maxWidth: 560 }}>
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: "999px",
          backgroundColor: "text.primary",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 3,
        }}
      >
        <CheckCircle size={18} color="currentColor" />
      </Box>

      <Typography
        variant="h4"
        sx={{
          color: "text.primary",
          fontWeight: 600,
          fontSize: { xs: "2rem", sm: "2.5rem" },
          mb: 2,
        }}
      >
        设置完成
      </Typography>

      {userInfo && (
        <Typography sx={{ mb: 1.5, color: "text.primary", opacity: 0.8 }}>
          欢迎你，<strong>{userInfo.name || "用户"}</strong>
        </Typography>
      )}

      <Typography sx={{ mb: 5, color: "text.secondary", maxWidth: 520 }}>
        一切就绪，现在可以做一只快乐的小猪了🐽。
      </Typography>

      <Button
        variant="contained"
        size="large"
        onClick={onFinish}
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
        进入主界面
      </Button>
    </Box>
  );
}
