const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const waitOn = require("wait-on");

const electronBinary = require("electron");
const projectRoot = path.resolve(__dirname, "..");
const electronDistDir = path.join(projectRoot, "electron-dist");
const electronMainFile = path.join(electronDistDir, "main.js");

let electronProcess = null;
let restartTimer = null;
let shuttingDown = false;
let watchReady = false;

function log(message) {
  process.stdout.write(`[dev-electron] ${message}\n`);
}

function killElectron() {
  if (!electronProcess) return;
  const current = electronProcess;
  electronProcess = null;
  if (!current.killed && current.exitCode === null) {
    current.kill("SIGTERM");
  }
}

function startElectron() {
  if (shuttingDown) return;
  killElectron();

  log("starting Electron");
  electronProcess = spawn(electronBinary, ["."], {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: false,
  });

  electronProcess.on("exit", () => {
    electronProcess = null;
    if (!shuttingDown) {
      log("Electron exited");
    }
  });

  electronProcess.on("error", (error) => {
    log(`Electron failed to start: ${error instanceof Error ? error.message : String(error)}`);
  });
}

function scheduleRestart(reason) {
  if (shuttingDown || !watchReady) return;
  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (!fs.existsSync(electronMainFile)) return;
    log(`restarting Electron (${reason})`);
    startElectron();
  }, 180);
}

function watchElectronDist() {
  const watcher = fs.watch(
    electronDistDir,
    { recursive: true },
    (_eventType, filename) => {
      if (!filename) return;
      if (!filename.endsWith(".js") && !filename.endsWith(".json")) return;
      scheduleRestart(filename);
    }
  );

  watcher.on("error", (error) => {
    log(`watch error: ${error instanceof Error ? error.message : String(error)}`);
  });

  return watcher;
}

async function main() {
  log("waiting for Vite and Electron build output");
  await waitOn({
    resources: ["http://127.0.0.1:5173", electronMainFile],
    timeout: 120000,
  });

  startElectron();
  watchReady = true;
  const watcher = watchElectronDist();

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    watcher.close();
    killElectron();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  log(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
