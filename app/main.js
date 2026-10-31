// DeepSeek-chan 桌面宠物 —— 主进程
//
// 设计取舍：默认状态下窗口对鼠标完全透明。
// 不做"悬停热区"，因为任何热区都会在那一小块抢走点击。
// 要操作时按 Ctrl+Alt+L 进入拖动模式，操作完再按一次退出。
//
// 视线跟随靠轮询全局鼠标坐标实现，跟窗口是否接收鼠标无关。

const { app, BrowserWindow, ipcMain, screen, Menu, Tray, globalShortcut, nativeImage, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

// 透明窗口在部分显卡驱动下用 GPU 合成会"有窗口无内容"，强制软渲染最稳
app.disableHardwareAcceleration();

const ROOT = __dirname;
const CFG_PATH = path.join(ROOT, "config.json");

const DEFAULT_CFG = {
  width: 380,
  height: 660,
  x: null,
  y: null,
  lookGain: 1.0,
  smooth: 0.42,
  topmost: true,
  expression: "",
  // 模型不随包分发：用户自己选择 .model3.json 所在目录
  modelPath: "",
};

let cfg = { ...DEFAULT_CFG };
try {
  cfg = { ...DEFAULT_CFG, ...JSON.parse(fs.readFileSync(CFG_PATH, "utf8").replace(/^\uFEFF/, "")) };
} catch {}

function saveCfg() {
  try {
    fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2), "utf8");
  } catch {}
}

let win = null;
let tray = null;
let interactive = false;
let draggingNow = false;
let dragTimer = null;
let dragAnchor = null;
let cursorTimer = null;

// 模型透明遮罩（渲染层每 250ms 推一次），用于判断鼠标是不是真的压在模型身上
let mask = null;
let panelOpen = false;
let hotNow = false;
let lastPanelOpen = false;

function maskHit(lx, ly) {
  if (!mask) return false;
  const b = win.getBounds();
  if (lx < 0 || ly < 0 || lx >= b.width || ly >= b.height) return false;
  const mx = Math.min(mask.w - 1, Math.floor((lx / b.width) * mask.w));
  const my = Math.min(mask.h - 1, Math.floor((ly / b.height) * mask.h));
  // 命中格本身或周围一圈都算（3x3 膨胀：边缘抖动、快速点击都更容易命中）
  const bits = mask.bits;
  const w = mask.w;
  const h = mask.h;
  for (let dy = -1; dy <= 1; dy += 1) {
    const yy = my + dy;
    if (yy < 0 || yy >= h) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      const xx = mx + dx;
      if (xx < 0 || xx >= w) continue;
      if (bits[yy * w + xx]) return true;
    }
  }
  return false;
}

const LOG_PATH = path.join(ROOT, "debug.log");
function dbg(...args) {
  try {
    fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${args.join(" ")}\n`, "utf8");
  } catch {}
}

// ---------------------------------------------------------------- 窗口几何

function clampToWorkArea(x, y, w, h) {
  // 按用户要求：整块屏幕（含任务栏、多屏）任意位置都能拖，不做边界钳制。
  // 万一拖到看不见的地方：托盘 →「回到右下角」，或按 Ctrl+Alt+H 隐藏再显示。
  return [Math.round(x), Math.round(y)];
}

function defaultXY(w, h) {
  const a = screen.getPrimaryDisplay().bounds;
  return [a.x + a.width - w - 28, a.y + a.height - Math.round(h * 0.78)];
}

function setSize(width) {
  const w = Math.max(200, Math.min(900, Math.round(width)));
  const h = Math.round(w * ((cfg.height / cfg.width) || 1.74));
  const b = win.getBounds();
  const x = b.x + (b.width - w);
  const y = b.y + (b.height - h);
  const [cx, cy] = clampToWorkArea(x, y, w, h);
  cfg.width = w;
  cfg.height = h;
  cfg.x = cx;
  cfg.y = cy;
  saveCfg();
  win.setBounds({ x: cx, y: cy, width: w, height: h });
  rebuildTray();
}

// ---------------------------------------------------------------- 交互模式

function setInteractive(v) {
  interactive = !!v;
  if (!win || win.isDestroyed()) return;
  // forward: true —— 穿透时仍然把鼠标移动送进页面，视线才跟得上
  win.setIgnoreMouseEvents(!interactive, { forward: true });
  win.setFocusable(interactive);
  try { win.webContents.send("interactive", interactive); } catch {}
  rebuildTray();
}

// ---------------------------------------------------------------- 菜单

function makeTrayIcon() {
  // 用模型贴图裁一块当托盘图标。空图标在 Windows 上根本不会显示，菜单就没入口了。
  try {
    const tex = path.join(ROOT, "model", "deepseek", "textures", "t00.png");
    let img = nativeImage.createFromPath(tex);
    if (!img.isEmpty()) {
      const { width, height } = img.getSize();
      const side = Math.min(width, height, 1024);
      const x = Math.round((width - side) / 2);
      const y = Math.min(Math.round(height * 0.06), Math.max(0, height - side));
      img = img.crop({ x, y, width: side, height: side });
      return img.resize({ width: 32, height: 32, quality: "best" });
    }
  } catch {}
  return nativeImage.createEmpty();
}

// ---------------------------------------------------------------- 开机自启
const STARTUP_DIR = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
const STARTUP_VBS = path.join(STARTUP_DIR, "DeepSeek-chan桌宠.vbs");

function autostartEnabled() {
  try { return fs.existsSync(STARTUP_VBS); } catch { return false; }
}

function setAutostart(on) {
  try {
    if (on) {
      const body = 'Set sh = CreateObject("WScript.Shell")\r\n' +
        'sh.CurrentDirectory = "' + ROOT + '"\r\n' +
        'sh.Run """' + path.join(ROOT, "启动.bat") + '""", 0, False\r\n';
      fs.writeFileSync(STARTUP_VBS, body, "utf8");
    } else if (fs.existsSync(STARTUP_VBS)) {
      fs.unlinkSync(STARTUP_VBS);
    }
    dbg("autostart=", on);
  } catch (e) {
    dbg("autostart failed", String(e));
  }
}

function menuTemplate() {
  const sizes = [260, 340, 420, 540, 680];
  return [
    {
      label: interactive ? "✓ 强制可交互（点此关闭）" : "强制可交互（Ctrl+Alt+L）",
      click: () => setInteractive(!interactive),
    },
    { type: "separator" },
    {
      label: `大小（当前 ${cfg.width}px）`,
      submenu: [
        ...sizes.map((px) => ({
          label: `${px}px`,
          type: "radio",
          checked: Math.abs(cfg.width - px) < 40,
          click: () => setSize(px),
        })),
        { type: "separator" },
        { label: "放大 +40px（Ctrl+Alt+↑）", click: () => setSize(cfg.width + 40) },
        { label: "缩小 -40px（Ctrl+Alt+↓）", click: () => setSize(cfg.width - 40) },
      ],
    },
    {
      label: `体型（当前 ${cfg.expression || "默认"}）`,
      submenu: [
        { label: "默认体型", type: "radio", checked: cfg.expression === "默认体型", click: () => applyExpression("默认体型") },
        { label: "体型 1", type: "radio", checked: cfg.expression === "体型1", click: () => applyExpression("体型1") },
        { label: "体型 2", type: "radio", checked: cfg.expression === "体型2", click: () => applyExpression("体型2") },
      ],
    },
    {
      label: "回到右下角",
      click: () => {
        const [x, y] = defaultXY(cfg.width, cfg.height);
        cfg.x = x; cfg.y = y; saveCfg();
        win.setBounds({ x, y, width: cfg.width, height: cfg.height });
      },
    },
    { type: "separator" },
    {
      label: cfg.topmost ? "✓ 始终置顶" : "始终置顶",
      click: () => {
        cfg.topmost = !cfg.topmost;
        saveCfg();
        win.setAlwaysOnTop(cfg.topmost, "screen-saver");
        rebuildTray();
      },
    },
    { label: "隐藏 / 显示（Ctrl+Alt+H）", click: () => { win.isVisible() ? win.hide() : win.show(); } },
    { label: autostartEnabled() ? "✓ 开机自启（后台常驻）" : "开机自启（后台常驻）", click: () => { setAutostart(!autostartEnabled()); rebuildTray(); } },
    { type: "separator" },
    {
      label: cfg.modelPath ? `更换模型…（${path.basename(path.dirname(cfg.modelPath))}）` : "选择模型…",
      click: () => { if (win && !win.isDestroyed()) win.webContents.send("request-pick-model"); },
    },
    { label: "重新载入当前模型", click: () => { if (win && !win.isDestroyed()) win.reload(); } },
    { type: "separator" },
    { label: "退出（Ctrl+Alt+Q）", click: () => { app.isQuitting = true; app.quit(); } },
  ];
}

function applyExpression(name) {
  cfg.expression = name;
  saveCfg();
  try { win.webContents.send("expression", name); } catch {}
  rebuildTray();
}

function rebuildTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
}

function popupMenu() {  if (!win || win.isDestroyed()) return;
  // 置顶窗口默认 focusable=false，原生菜单需要焦点才弹得出来，
  // 所以这里临时把焦点给它，菜单关掉后再还原。
  const wasFocusable = win.isFocusable();
  if (!wasFocusable) {
    win.setFocusable(true);
    win.focus();
  }
  Menu.buildFromTemplate(menuTemplate()).popup({
    window: win,
    callback: () => {
      if (!wasFocusable) {
        win.setFocusable(interactive);
        if (!interactive) win.setIgnoreMouseEvents(true, { forward: true });
      }
    },
  });
}

// 面板按钮的动作分发
function handleAction(a) {
  if (!a || !win || win.isDestroyed()) return;
  if (typeof a === "string" && a.startsWith("size:")) {
    setSize(parseInt(a.slice(5), 10));
    return;
  }
  switch (a) {
    case "grow": setSize(cfg.width + 40); break;
    case "shrink": setSize(cfg.width - 40); break;
    case "reset": {
      const [x, y] = defaultXY(cfg.width, cfg.height);
      cfg.x = x; cfg.y = y; saveCfg();
      win.setBounds({ x, y, width: cfg.width, height: cfg.height });
      break;
    }
    case "topmost":
      cfg.topmost = !cfg.topmost;
      saveCfg();
      win.setAlwaysOnTop(cfg.topmost, "screen-saver");
      rebuildTray();
      break;
    case "hide": win.hide(); break;
    case "quit": app.isQuitting = true; app.quit(); break;
    case "drag": setInteractive(!interactive); break;
  }
}

// ---------------------------------------------------------------- 窗口

function createWindow() {
  const w = cfg.width;
  const h = cfg.height;
  const fallback = defaultXY(w, h);
  const [x, y] = clampToWorkArea(cfg.x ?? fallback[0], cfg.y ?? fallback[1], w, h);

  win = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    transparent: true,
    frame: false,
    backgroundColor: "#00000000",
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    alwaysOnTop: cfg.topmost,
    webPreferences: {
      preload: path.join(ROOT, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // 本地 file:// 加载 model3.json 需要放开同源限制
      webSecurity: false,
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(cfg.topmost, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(ROOT, "pet.html"));

  // 置顶组里别的程序（比如 DSH）也可能置顶，定期把自己顶回去
  let tick = 0; globalThis.__dbgTick = globalThis.__dbgTick || 0;
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    if (cfg.topmost && ++tick % 40 === 0) {
      try { win.moveTop(); } catch {}
    }
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const lx = p.x - b.x;
    const ly = p.y - b.y;

    // 传窗口内相对坐标，渲染层换算成归一化偏移
    try {
      win.webContents.send("cursor", { x: lx, y: ly, w: b.width, h: b.height });
    } catch {}

    // 只有鼠标压在模型的不透明像素上、或面板开着时，才让窗口接收点击。
    // 例外：还没选模型时必须整窗可点，否则"选择模型"按钮点不到。
    const inModel = maskHit(lx, ly);
    const wantHot = !cfg.modelPath || panelOpen || inModel || draggingNow;

    if (panelOpen !== lastPanelOpen) {
      lastPanelOpen = panelOpen;
    }
    if (++globalThis.__dbgTick % 90 === 0) dbg("pos", lx, ly, "win=", b.x, b.y, b.width, b.height, "cursor=", p.x, p.y, "hit=", inModel, "hot=", hotNow, "opaque=", mask ? mask.bits.reduce((a,bb)=>a+bb,0) : -1);
    if (wantHot !== hotNow) {
      hotNow = wantHot;
      try { win.setIgnoreMouseEvents(!wantHot, { forward: true }); } catch {}
      try { win.webContents.send("hot", wantHot); } catch {}
    }
  }, 16);

  win.on("moved", () => {
    const b = win.getBounds();
    cfg.x = b.x;
    cfg.y = b.y;
    saveCfg();
  });

  win.on("closed", () => {
    if (cursorTimer) clearInterval(cursorTimer);
    win = null;
  });

  setInteractive(false);
}

// ---------------------------------------------------------------- 启动

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) { win.show(); win.setAlwaysOnTop(cfg.topmost, "screen-saver"); }
  });

  app.whenReady().then(() => {
    createWindow();

    tray = new Tray(makeTrayIcon());
    tray.setToolTip("DeepSeek-chan —— 单击/右键查看操作菜单（Ctrl+Alt+M）");
    rebuildTray();
    // 左键单击托盘也弹菜单，别让人去找右键
    tray.on("click", () => popupMenu());

    globalShortcut.register("Ctrl+Alt+L", () => setInteractive(!interactive));
    globalShortcut.register("Ctrl+Alt+H", () => { win.isVisible() ? win.hide() : win.show(); });
    globalShortcut.register("Ctrl+Alt+Up", () => setSize(cfg.width + 40));
    globalShortcut.register("Ctrl+Alt+Down", () => setSize(cfg.width - 40));
    globalShortcut.register("Ctrl+Alt+M", () => popupMenu());
    globalShortcut.register("Ctrl+Alt+Q", () => { app.isQuitting = true; app.quit(); });
  });

  ipcMain.on("show-menu", () => popupMenu());

  ipcMain.on("mask", (_e, m) => { mask = m; if (!globalThis.__maskLogged) { globalThis.__maskLogged = true; dbg("mask", m.w, m.h, "opaque=", m.bits.reduce((a,b)=>a+b,0)); } });
  ipcMain.on("ui-state", (_e, open) => { panelOpen = !!open; dbg("panelOpen=", panelOpen); });

  ipcMain.on("menu-action", (_e, a) => { dbg("action=", a); handleAction(a); });

  ipcMain.on("renderer-ready", () => {
    setInteractive(interactive);
    try { win.webContents.send("expression", cfg.expression); } catch {}
  });

  ipcMain.on("drag-begin", () => {
    draggingNow = true;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    dragAnchor = { px: p.x, py: p.y, bx: b.x, by: b.y, w: b.width, h: b.height };
    if (dragTimer) clearInterval(dragTimer);
    dragTimer = setInterval(() => {
      if (!dragAnchor || !win || win.isDestroyed()) return;
      const c = screen.getCursorScreenPoint();
      const [x, y] = clampToWorkArea(
        dragAnchor.bx + (c.x - dragAnchor.px),
        dragAnchor.by + (c.y - dragAnchor.py),
        dragAnchor.w,
        dragAnchor.h
      );
      win.setBounds({ x, y, width: dragAnchor.w, height: dragAnchor.h });
    }, 16);
  });

  ipcMain.on("drag-end", () => {
    draggingNow = false;
    dragAnchor = null;
    if (dragTimer) { clearInterval(dragTimer); dragTimer = null; }
    if (win && !win.isDestroyed()) {
      const b = win.getBounds();
      cfg.x = b.x; cfg.y = b.y;
      saveCfg();
    }
  });

  ipcMain.on("zoom", (_e, dir) => setSize(cfg.width + (dir > 0 ? 40 : -40)));

  // ---------------------------------------------------------- 模型导入
  ipcMain.handle("get-model-path", () => cfg.modelPath || "");

  ipcMain.handle("pick-model", async () => {
    const r = await dialog.showOpenDialog(win, {
      title: "选择 Live2D 模型文件夹（内含 *.model3.json）",
      buttonLabel: "使用这个文件夹",
      properties: ["openDirectory"],
    });
    if (r.canceled || !r.filePaths || !r.filePaths.length) return null;
    const dir = r.filePaths[0];
    let file = null;
    try {
      file = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith(".model3.json"));
    } catch {}
    if (!file) {
      await dialog.showMessageBox(win, {
        type: "warning",
        message: "这个文件夹里没找到 .model3.json",
        detail: "请选择模型的根目录（解压后包含 *.model3.json 的那一层）。",
      });
      return null;
    }
    cfg.modelPath = path.join(dir, file);
    saveCfg();
    dbg("model=", cfg.modelPath);
    if (win && !win.isDestroyed()) win.reload();
    return cfg.modelPath;
  });

  ipcMain.on("pick-expression", (_e, name) => {
    cfg.expression = name;
    saveCfg();
  });

  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("window-all-closed", () => app.quit());
}
