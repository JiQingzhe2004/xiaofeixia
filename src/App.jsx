import { Box, Button, Container, Typography } from "@mui/material";
import { WindowDragRegion, TITLEBAR_HEIGHT } from "./windowChrome.jsx";

export default function App() {
  return (
    <>
      <WindowDragRegion />
      <Container
        maxWidth="sm"
        sx={{ pt: window.appWindow?.customTitleBar ? `${TITLEBAR_HEIGHT}px` : 0 }}
      >
        <Box sx={{ py: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            肥猪
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            前端已接入 Material UI（MUI），可在 <code>src/App.jsx</code>{" "}
            中继续编写界面。
          </Typography>
          <Button variant="contained" color="primary">
            MUI 按钮示例
          </Button>
        </Box>
      </Container>
    </>
  );
}