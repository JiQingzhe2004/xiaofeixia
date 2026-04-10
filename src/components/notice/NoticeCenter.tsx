import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type { AlertColor, SlideProps } from "@mui/material";
import { Alert, Slide, Snackbar } from "@mui/material";

export interface NoticeOptions {
  severity?: AlertColor;
  duration?: number;
}

interface NoticeItem {
  id: number;
  message: string;
  severity: AlertColor;
  duration: number;
  open: boolean;
}

interface NoticeContextValue {
  pushNotice: (message: string, options?: NoticeOptions) => void;
  clearNotices: () => void;
}

const MAX_VISIBLE_NOTICES = 3;
const DEFAULT_DURATION = 3000;

const NoticeContext = createContext<NoticeContextValue | null>(null);

function NoticeTransition(props: SlideProps) {
  return <Slide {...props} direction="down" timeout={{ enter: 280, exit: 220 }} />;
}

const severityColorMap: Record<AlertColor, string> = {
  success: "success.main",
  info: "info.main",
  warning: "warning.main",
  error: "error.main",
};

export function NoticeProvider({ children }: PropsWithChildren) {
  const [notices, setNotices] = useState<NoticeItem[]>([]);

  const pushNotice = useCallback((message: string, options?: NoticeOptions) => {
    setNotices((prev) => (
      [
        ...prev,
        {
          id: Date.now() + Math.random(),
          message,
          severity: options?.severity ?? "warning",
          duration: options?.duration ?? DEFAULT_DURATION,
          open: true,
        },
      ].slice(-MAX_VISIBLE_NOTICES)
    ));
  }, []);

  const clearNotices = useCallback(() => {
    setNotices([]);
  }, []);

  const handleClose = useCallback((id: number, reason?: string) => {
    if (reason === "clickaway") return;
    setNotices((prev) => prev.map((notice) => (
      notice.id === id ? { ...notice, open: false } : notice
    )));
  }, []);

  const handleExited = useCallback((id: number) => {
    setNotices((prev) => prev.filter((notice) => notice.id !== id));
  }, []);

  const value = useMemo<NoticeContextValue>(() => ({
    pushNotice,
    clearNotices,
  }), [clearNotices, pushNotice]);

  return (
    <NoticeContext.Provider value={value}>
      {children}
      {[...notices].reverse().map((notice, index) => {
        const color = severityColorMap[notice.severity];
        return (
          <Snackbar
            key={notice.id}
            open={notice.open}
            autoHideDuration={notice.duration}
            onClose={(_, reason) => handleClose(notice.id, reason)}
            anchorOrigin={{ vertical: "top", horizontal: "center" }}
            TransitionComponent={NoticeTransition}
            slotProps={{
              transition: {
                mountOnEnter: true,
                unmountOnExit: true,
                onExited: () => handleExited(notice.id),
              },
            }}
            sx={{
              top: `${(window.appWindow?.customTitleBar ? 60 : 16) + index * 12}px !important`,
              zIndex: 1400 - index,
            }}
          >
            <Alert
              severity={notice.severity}
              onClose={() => handleClose(notice.id)}
              sx={{
                minWidth: 320,
                maxWidth: 420,
                width: "100%",
                borderRadius: "999px",
                backgroundColor: "#fff",
                color,
                boxShadow: index === 0 ? 3 : 1,
                opacity: 1 - index * 0.14,
                transform: `scale(${1 - index * 0.03})`,
                "& .MuiAlert-icon": {
                  color,
                },
              }}
            >
              {notice.message}
            </Alert>
          </Snackbar>
        );
      })}
    </NoticeContext.Provider>
  );
}

export function useNotice() {
  const context = useContext(NoticeContext);
  if (!context) {
    throw new Error("useNotice must be used within NoticeProvider");
  }
  return context;
}
