import type { DragEvent } from "react";
import { Box, Typography, Button, CircularProgress } from "@mui/material";
import { Rocket } from "lucide-react";

const LOGO_SRC = new URL("../../resources/icons/feizhu.png", import.meta.url).href;

interface Props {
  onNext: () => void;
  loading: boolean;
  onPigClick: () => void;
}

/** 步骤 0: 欢迎页 */
export default function StepWelcome({ onNext, loading, onPigClick }: Props) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 300px" },
        alignItems: "center",
        gap: { xs: 5, md: 8 },
      }}
    >
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
          <Rocket size={18} color="currentColor" />
        </Box>

        <Typography
          variant="h4"
          sx={{
            color: "text.primary",
            fontWeight: 600,
            fontSize: { xs: "2rem", sm: "2.5rem" },
            lineHeight: 1.1,
            mb: 2,
          }}
        >
          欢迎使用肥猪
        </Typography>

        <Typography sx={{ mb: 1.5, lineHeight: 1.75, color: "text.primary", opacity: 0.8 }}>
          肥猪是一款飞书聊天记录导出工具。
        </Typography>
        <Typography sx={{ mb: 5, lineHeight: 1.75, color: "text.secondary", maxWidth: 520 }}>
          首次使用需要完成两个步骤：创建飞书应用，然后使用飞书账号登录。
          <br />
          整个过程大约需要 1 分钟。
        </Typography>

        <Button
          variant="contained"
          size="large"
          onClick={onNext}
          disabled={loading}
          startIcon={
            loading ? <CircularProgress size={20} color="inherit" /> : <Rocket size={20} />
          }
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
          {loading ? "正在连接..." : "开始设置"}
        </Button>
      </Box>

      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          alignItems: "flex-end",
          justifyContent: "flex-end",
          minHeight: 360,
          pt: 6,
        }}
      >
        <Box
          component="button"
          type="button"
          onClick={onPigClick}
          sx={{
            border: 0,
            padding: 0,
            background: "transparent",
            display: "block",
            cursor: "pointer",
            borderRadius: "999px",
            lineHeight: 0,
            WebkitTapHighlightColor: "transparent",
            "&:focus-visible": {
              outline: "2px solid",
              outlineColor: "divider",
              outlineOffset: "8px",
            },
          }}
        >
          <Box
            component="img"
            src={LOGO_SRC}
            alt="肥猪 Logo"
            draggable={false}
            onDragStart={(event: DragEvent<HTMLImageElement>) => event.preventDefault()}
            sx={{
            width: "100%",
            maxWidth: 260,
            height: "auto",
            objectFit: "contain",
            filter: "drop-shadow(0 24px 48px rgba(0,0,0,0.16))",
            transform: "translate(20px, 24px)",
            userSelect: "none",
            WebkitUserDrag: "none",
          }}
          />
        </Box>
      </Box>
    </Box>
  );
}
