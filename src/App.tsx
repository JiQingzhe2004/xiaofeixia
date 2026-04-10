import { useState, useEffect } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { WindowDragRegion, TITLEBAR_HEIGHT } from "./components/windowChrome";
import SetupPage from "./setup/SetupPage";
import AuthWindowPage from "./auth/AuthWindowPage";

/** 主页面占位 — 初始化完成后显示 */
function MainPage() {
  return (
    <>
      <WindowDragRegion />
      <Box
        sx={{
          pt: window.appWindow?.customTitleBar ? `${TITLEBAR_HEIGHT}px` : 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <Typography variant="h5" color="text.secondary" fontWeight={600}>
          🎉 主界面开发中…
        </Typography>
      </Box>
    </>
  );
}

export default function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const isAuthShell = searchParams.get("auth-shell") === "1";

  if (isAuthShell) {
    return <AuthWindowPage />;
  }

  return <MainApp />;
}

function MainApp() {
  // null: 检查中, "setup": 需要初始化, "main": 已初始化
  const [appState, setAppState] = useState<"setup" | "main" | null>(null);

  useEffect(() => {
    async function checkInit() {
      try {
        if (window.configBridge) {
          const status = await window.configBridge.getInitStatus();
          setAppState(status.hasApp && status.hasUser ? "main" : "setup");
        } else {
          // 纯浏览器开发环境
          setAppState("setup");
        }
      } catch {
        setAppState("setup");
      }
    }
    checkInit();
  }, []);

  if (appState === null) {
    return (
      <>
        <WindowDragRegion />
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <CircularProgress />
          <Typography variant="body2" color="text.secondary">
            正在检查配置...
          </Typography>
        </Box>
      </>
    );
  }

  if (appState === "setup") {
    return (
      <>
        <WindowDragRegion />
        <SetupPage onSetupComplete={() => setAppState("main")} />
      </>
    );
  }

  return <MainPage />;
}
