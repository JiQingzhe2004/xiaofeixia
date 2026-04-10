import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  useMediaQuery,
} from "@mui/material";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import App from "./App";
import { TitleBarSync } from "./components/windowChrome";
import { NoticeProvider } from "./components/notice/NoticeCenter";

function Root() {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const theme = useMemo(
    () =>
      createTheme({
        palette: { mode: prefersDark ? "dark" : "light" },
      }),
    [prefersDark]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
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
