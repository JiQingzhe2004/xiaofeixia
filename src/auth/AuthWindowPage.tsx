import { Box, CircularProgress, Typography } from "@mui/material";
import { WindowDragRegion, TITLEBAR_HEIGHT } from "../components/windowChrome";

export default function AuthWindowPage() {
  return (
    <>
      <WindowDragRegion />
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
          <Typography variant="body2">正在载入授权页面...</Typography>
        </Box>
      </Box>
    </>
  );
}
