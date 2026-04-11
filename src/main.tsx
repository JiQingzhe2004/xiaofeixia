import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  GlobalStyles,
  useMediaQuery,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import App from "./App";
import { TitleBarSync } from "./components/windowChrome";
import { NoticeProvider } from "./components/notice/NoticeCenter";
import type { UiPreferences } from "./types/uiPreferences";

function Root() {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [themeMode, setThemeMode] = useState<"system" | "light" | "dark">("system");

  useEffect(() => {
    let active = true;
    async function loadUiPreferences() {
      try {
        const preferences = await window.configBridge?.getUiPreferences();
        if (!active) return;
        setThemeMode(preferences?.themeMode || "system");
      } catch {
        if (!active) return;
        setThemeMode("system");
      }
    }
    void loadUiPreferences();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<UiPreferences>;
      setThemeMode(customEvent.detail?.themeMode || "system");
    };
    window.addEventListener("ui-preferences-updated", listener as EventListener);
    return () => window.removeEventListener("ui-preferences-updated", listener as EventListener);
  }, []);

  const resolvedMode =
    themeMode === "system" ? (prefersDark ? "dark" : "light") : themeMode;
  const theme = useMemo(
    () =>
      createTheme({
        palette: { mode: resolvedMode },
      }),
    [resolvedMode]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      <GlobalStyles
        styles={(theme) => {
          const thumbColor =
            theme.palette.mode === "dark"
              ? alpha(theme.palette.common.white, 0.2)
              : alpha(theme.palette.text.primary, 0.16);
          const thumbHoverColor =
            theme.palette.mode === "dark"
              ? alpha(theme.palette.common.white, 0.3)
              : alpha(theme.palette.text.primary, 0.24);
          const thumbActiveColor =
            theme.palette.mode === "dark"
              ? alpha(theme.palette.common.white, 0.42)
              : alpha(theme.palette.text.primary, 0.34);

          return {
            html: {
              height: "100%",
              scrollbarGutter: "stable",
            },
            body: {
              height: "100%",
            },
            "#root": {
              height: "100%",
            },
            img: {
              WebkitUserDrag: "none",
              userSelect: "none",
            },
            ".app-drag-region": {
              userSelect: "none",
              WebkitUserSelect: "none",
              "-webkit-app-region": "drag",
              "app-region": "drag",
            },
            ".app-no-drag-region": {
              "-webkit-app-region": "no-drag",
              "app-region": "no-drag",
            },
            "*": {
              scrollbarWidth: "thin",
              scrollbarColor: `${thumbColor} transparent`,
            },
            "*::-webkit-scrollbar": {
              width: 10,
              height: 10,
            },
            "*::-webkit-scrollbar-track": {
              backgroundColor: "transparent",
            },
            "*::-webkit-scrollbar-thumb": {
              backgroundColor: thumbColor,
              borderRadius: 999,
              border: "2px solid transparent",
              backgroundClip: "padding-box",
              transition: "background-color 160ms ease",
            },
            "*::-webkit-scrollbar-thumb:hover": {
              backgroundColor: thumbHoverColor,
            },
            "*::-webkit-scrollbar-thumb:active": {
              backgroundColor: thumbActiveColor,
            },
            "*::-webkit-scrollbar-corner": {
              backgroundColor: "transparent",
            },
          };
        }}
      />
      <NoticeProvider>
        <TitleBarSync />
        <App />
      </NoticeProvider>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
