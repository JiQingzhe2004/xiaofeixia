import { useEffect } from "react";
import { useTheme, Box, Typography } from "@mui/material";

export const TITLEBAR_HEIGHT = 40;

/** Windows / Linux：按 MUI 明暗主题同步 titleBarOverlay 的 symbolColor */
export function TitleBarSync() {
  const theme = useTheme();

  useEffect(() => {
    if (!window.appWindow?.customTitleBar) return;
    if (window.appWindow.platform === "darwin") return;
    const isDark = theme.palette.mode === "dark";
    window.appWindow.setTitleBarOverlay({
      color: "#00000000",
      symbolColor: isDark ? "#f3f3f3" : "rgba(0,0,0,0.78)",
      height: TITLEBAR_HEIGHT,
    });
  }, [theme.palette.mode]);

  return null;
}

/**
 * 可拖拽标题栏区域
 * https://www.electronjs.org/zh/docs/latest/tutorial/custom-title-bar
 */
export function WindowDragRegion(props?: { title?: string }) {
  if (!window.appWindow?.customTitleBar) return null;
  return (
    <Box
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: TITLEBAR_HEIGHT,
        zIndex: (t) => t.zIndex.modal - 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.default",
        WebkitAppRegion: "drag",
      }}
    >
      <Typography
        variant="body1"
        sx={{
          fontWeight: 700,
          userSelect: "none",
          color: "text.primary",
          letterSpacing: "0.2em",
          opacity: 0.95,
        }}
      >
        {props?.title || "肥猪"}
      </Typography>
    </Box>
  );
}
