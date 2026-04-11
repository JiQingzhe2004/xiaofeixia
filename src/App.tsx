import { useState, useEffect } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { WindowDragRegion, TITLEBAR_HEIGHT } from "./components/windowChrome";
import SetupPage from "./setup/SetupPage";
import AuthWindowPage from "./auth/AuthWindowPage";
import MainPage from "./main/MainPage";
import MessagesPage from "./messages/MessagesPage";

export default function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const isAuthShell = searchParams.get("auth-shell") === "1";
  const isMessagesWindow = searchParams.get("messages-window") === "1";

  if (isAuthShell) {
    return <AuthWindowPage />;
  }

  if (isMessagesWindow) {
    return <MessagesWindowApp />;
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

function MessagesWindowApp() {
  const [appState, setAppState] = useState<"setup" | "main" | null>(null);

  useEffect(() => {
    void loadInitStatus();
  }, []);

  async function loadInitStatus() {
    try {
      if (window.configBridge) {
        const status = await window.configBridge.getInitStatus();
        setAppState(status.hasApp && status.hasUser ? "main" : "setup");
      } else {
        setAppState("setup");
      }
    } catch {
      setAppState("setup");
    }
  }

  if (appState === null) {
    return (
      <>
        <WindowDragRegion title="消息" />
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
            正在加载消息窗口...
          </Typography>
        </Box>
      </>
    );
  }

  if (appState === "setup") {
    return (
      <>
        <WindowDragRegion title="消息" />
        <Box
          sx={{
            minHeight: "100vh",
            pt: window.appWindow?.customTitleBar ? `${TITLEBAR_HEIGHT}px` : 0,
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            px: 3,
            textAlign: "center",
          }}
        >
          <Box>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              请先完成初始化
            </Typography>
            <Typography variant="body2" color="text.secondary">
              当前消息窗口依赖主应用的登录与授权状态，请先在主窗口完成初始化后再打开。
            </Typography>
          </Box>
        </Box>
      </>
    );
  }

  return (
    <>
      <WindowDragRegion title="消息" />
      <Box
        sx={{
          height: "100vh",
          bgcolor: "background.default",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            mt: window.appWindow?.customTitleBar ? `${TITLEBAR_HEIGHT}px` : 0,
            height: window.appWindow?.customTitleBar
              ? `calc(100% - ${TITLEBAR_HEIGHT}px)`
              : "100%",
            minHeight: 0,
            WebkitAppRegion: "no-drag",
          }}
        >
          <MessagesPage />
        </Box>
      </Box>
    </>
  );
}
