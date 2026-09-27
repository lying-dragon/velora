const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  utilityProcess,
  Menu,
} = require("electron");
const path = require("node:path"),
  fs = require("node:fs/promises"),
  http = require("node:http");
const { StravaUi } = require("./strava-ui.cjs");
const ROOT = path.resolve(__dirname, ".."),
  ORIGIN = "http://127.0.0.1:5173";
let mainWindow, staticServer, companion, bridge;
const strava = new StravaUi();
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      dialog.showErrorBox("VELORA 시작 오류", error.message);
      app.quit();
    });
}
async function local(pathname, init = {}) {
  const response = await fetch("http://127.0.0.1:18766" + pathname, {
    ...init,
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "저장 서비스 오류");
  return data;
}
async function start() {
  try {
    const status = await local("/status");
    if (status.transport !== "browser-ui")
      throw Error(
        "이전 저장 서비스가 실행 중입니다. 기존 npm run integrations를 종료하고 앱을 다시 여세요.",
      );
  } catch (e) {
    if (!/fetch|ECONN|timeout/i.test(e.message)) throw e;
    companion = utilityProcess.fork(
      path.join(ROOT, "services/server.mjs"),
      [],
      { serviceName: "VELORA Storage", stdio: "pipe" },
    );
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("저장 서비스 시작 시간 초과")),
        10000,
      );
      companion.stdout.once("data", () => {
        clearTimeout(timer);
        resolve();
      });
      companion.once("exit", () =>
        reject(Error("저장 서비스를 시작하지 못했습니다.")),
      );
    });
  }
  // The same fixed origin preserves browser storage and uses a bundled production build.
  let existing = false;
  try {
    const r = await fetch(ORIGIN, { signal: AbortSignal.timeout(600) });
    existing = r.ok && (await r.text()).includes("VELORA");
  } catch {}
  if (!existing) {
    const MIME = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".css": "text/css",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".webmanifest": "application/manifest+json",
    };
    staticServer = http.createServer(async (req, res) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
        const file = path.resolve(
          ROOT,
          "dist",
          "." + (pathname === "/" ? "/index.html" : pathname),
        );
        if (!file.startsWith(path.join(ROOT, "dist") + path.sep)) throw Error();
        const bytes = await fs.readFile(file);
        res.writeHead(200, {
          "Content-Type":
            MIME[path.extname(file)] || "application/octet-stream",
          "Cache-Control": "no-cache",
        });
        res.end(bytes);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    await new Promise((resolve, reject) => {
      staticServer.once("error", reject);
      staticServer.listen(5173, "127.0.0.1", resolve);
    });
  }
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 740,
    minHeight: 620,
    title: "VELORA",
    backgroundColor: "#143c36",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== ORIGIN) event.preventDefault();
  });
  const session = mainWindow.webContents.session;
  session.setPermissionCheckHandler(
    (wc, permission, requestOrigin) =>
      wc === mainWindow.webContents &&
      requestOrigin === ORIGIN &&
      ["bluetooth", "usb", "serial"].includes(permission),
  );
  session.setPermissionRequestHandler((wc, permission, callback) =>
    callback(
      wc === mainWindow.webContents &&
        ["bluetooth", "usb", "serial"].includes(permission),
    ),
  );
  session.on("select-usb-device", async (event, details, callback) => {
    event.preventDefault();
    if (details.frame?.url && !details.frame.url.startsWith(ORIGIN)) {
      callback("");
      return;
    }
    const list = details.deviceList;
    const { response } = await dialog.showMessageBox(mainWindow, {
      title: "ANT+ USB 동글 선택",
      message: "연결할 장치를 선택하세요.",
      buttons: [
        ...list.map((d) => d.productName || `USB ${d.vendorId}:${d.productId}`),
        "취소",
      ],
      cancelId: list.length,
    });
    callback(list[response]?.deviceId || "");
  });
  let bt = null;
  mainWindow.webContents.on(
    "select-bluetooth-device",
    (event, devices, callback) => {
      event.preventDefault();
      if (bt) {
        bt.devices = devices;
        return;
      }
      bt = { devices, callback };
      setTimeout(async () => {
        const pending = bt;
        if (!pending) return;
        const list = [...pending.devices];
        const { response } = await dialog.showMessageBox(mainWindow, {
          title: "Bluetooth 장치 선택",
          message: list.length
            ? "로라 또는 심박계를 선택하세요."
            : "장치를 찾지 못했습니다. 페달을 밟거나 심박계를 착용하고 다시 연결하세요.",
          buttons: [...list.map((d) => d.deviceName || d.deviceId), "취소"],
          cancelId: list.length,
        });
        bt = null;
        pending.callback(list[response]?.deviceId || "");
      }, 2500);
    },
  );
  const valid = (event) => {
    if (
      event.sender !== mainWindow.webContents ||
      new URL(event.senderFrame.url).origin !== ORIGIN
    )
      throw Error("허용되지 않은 요청");
  };
  ipcMain.handle("strava:open", async (event) => {
    valid(event);
    await strava.open();
    return { opened: true };
  });
  ipcMain.handle("strava:upload", async (event, id) => {
    valid(event);
    if (typeof id !== "string" || !/^[-a-z0-9]{10,60}$/.test(id))
      throw Error("기록 ID 오류");
    const ride = await local(`/rides/${id}/files`);
    return strava.upload(ride, (value) =>
      local(`/rides/${id}/state`, {
        method: "PUT",
        body: JSON.stringify(value),
      }),
    );
  });
  ipcMain.handle("data:open", async (event) => {
    valid(event);
    const { dataDir } = await local("/status");
    return shell.openPath(dataDir);
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "VELORA",
        submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }],
      },
      {
        label: "편집",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "보기",
        submenu: [
          { role: "reload" },
          { role: "togglefullscreen" },
          { role: "resetZoom" },
        ],
      },
    ]),
  );
  await mainWindow.loadURL(ORIGIN);
  app.on("activate", () => mainWindow?.show());
}
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  companion?.kill();
  bridge?.kill();
  staticServer?.close();
});
