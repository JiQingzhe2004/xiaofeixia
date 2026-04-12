import { Box, CircularProgress, Typography } from "@mui/material";
import { WindowDragRegion, TITLEBAR_HEIGHT } from "../components/windowChrome";

export default function AuthWindowPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const title = searchParams.get("title") || "授权";

  return (
    <>
      <WindowDragRegion title={title} />
      <Box
        sx={{
          pt: window.appWindow?.customTitleBar ? `${TITLEBAR_HEIGHT}px` : 0,
          minHeight: "100vh",
          bgcolor: "background.default",
        }}
      >
        <Box
          sx={{
            height: "calc(100vh - 40px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1.5,
            color: "text.secondary",
          }}
        >
          <CircularProgress size={24} />
          <Typography variant="body2">正在载入页面...</Typography>
        </Box>
      </Box>
    </>
  );
}
