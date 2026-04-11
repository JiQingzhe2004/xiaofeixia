import { useState, useEffect } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { WindowDragRegion, TITLEBAR_HEIGHT } from "./components/windowChrome";
import SetupPage from "./setup/SetupPage";
import AuthWindowPage from "./auth/AuthWindowPage";
import MainPage from "./main/MainPage";

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
  const [userName, setUserName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");

  useEffect(() => {
    void loadInitStatus();
  }, []);

  async function loadInitStatus() {
    try {
      if (window.configBridge) {
        const status = await window.configBridge.getInitStatus();
        setUserName(status.user?.userInfo?.name || "");
        setAvatarUrl(status.user?.userInfo?.avatarUrl || "");
        setAppState(status.hasApp && status.hasUser ? "main" : "setup");
      } else {
        // 纯浏览器开发环境
        setAppState("setup");
      }
    } catch {
      setAppState("setup");
    }
  }

  async function handleLogout() {
    try {
      await window.configBridge?.clearConfig();
    } finally {
      setUserName("");
      setAvatarUrl("");
      setAppState("setup");
    }
  }

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
        <SetupPage onSetupComplete={() => void loadInitStatus()} />
      </>
    );
  }

  return (
    <MainPage
      userName={userName}
      avatarUrl={avatarUrl}
      onLogout={handleLogout}
      onReauthorized={() => void loadInitStatus()}
    />
  );
}
