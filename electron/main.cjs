const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("path");

const preloadPath = path.join(__dirname, "preload.cjs");
const TITLEBAR_HEIGHT = 40;

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    title: "肥猪",
    // 官方教程：隐藏默认标题栏；macOS 保留左上角红绿灯
    // https://www.electronjs.org/zh/docs/latest/tutorial/custom-title-bar
    titleBarStyle: "hidden",
    // Windows / Linux：通过 titleBarOverlay 显示原生最小化、最大化、关闭
    ...(process.platform !== "darwin"
      ? {
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: "#000000",
            height: TITLEBAR_HEIGHT,
          },
        }
      : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, `../resources/icons/${process.platform === "win32" ? "icon.ico" : "icon_1024.png"}`),
  });

  win.on("page-title-updated", (e) => {
    e.preventDefault();
  });

  if (!app.isPackaged) {
    win.loadURL("http://127.0.0.1:5173/");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
    // 生产环境下禁止打开开发者工具
    win.webContents.on("devtools-opened", () => {
      win.webContents.closeDevTools();
    });
    // 拦截快捷键 F12 和 Ctrl+Shift+I
    win.webContents.on("before-input-event", (event, input) => {
      if (input.key === "F12" || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === "i")) {
        event.preventDefault();
      }
    });
  }
}

ipcMain.handle("window:setTitleBarOverlay", (event, opts) => {
  if (process.platform === "darwin") return;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || typeof win.setTitleBarOverlay !== "function") return;
  const height = Math.min(50, Math.max(24, Number(opts?.height) || TITLEBAR_HEIGHT));
  const color = typeof opts?.color === "string" ? opts.color : "#00000000";
  const symbolColor = typeof opts?.symbolColor === "string" ? opts.symbolColor : "#ffffff";
  win.setTitleBarOverlay({ color, symbolColor, height });
});

app.whenReady().then(() => {
  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
  }
  createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
