/**
 * dsh-desktop-pet —— DSH 宿主机半侧
 *
 * 只做一件事：在 DSH 启动时把桌宠（Electron 应用）拉起来。
 * 不常驻、不监控、不改 DSH 界面；桌宠进程独立运行，DSH 关了它也在。
 *
 * 关键坑：DSH 自己的进程环境里带着 ELECTRON_RUN_AS_NODE=1，
 * 直接 spawn 会让 Electron 以纯 Node 模式启动（报 app is undefined）。
 * 所以这里必须把它从子进程环境里删掉。
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const name = "dsh-desktop-pet";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(HERE, "..", "app");

/** 依次尝试几个常见的 Electron 位置，返回第一个存在的。 */
function findElectron() {
  const local = process.env.LOCALAPPDATA || "";
  const home = os.homedir();
  const candidates = [
    // 插件自带的（用户手动放入）
    path.join(HERE, "..", "electron", "electron.exe"),
    // DSH 自带的 Electron（最省事，不用额外下载）
    path.join(home, ".dsh", "electron", "electron.exe"),
    path.join(local, ".dsh", "electron", "electron.exe"),
    // 官方 electron npm 包解压位置
    path.join(local, "Programs", "electron", "electron.exe"),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p;
    } catch {}
  }
  return null;
}

export function apply(ctx, config) {
  const cfg = { autostart: true, ...(config || {}) };
  const log = ctx?.logger?.info ? ctx.logger : console;

  if (!cfg.autostart) {
    log.info?.("[desktop-pet] 已安装但未启用（autostart=false）");
    return;
  }
  if (!existsSync(APP_DIR)) {
    log.warn?.("[desktop-pet] 缺少 app 目录：" + APP_DIR);
    return;
  }

  const bin = findElectron();
  if (!bin) {
    log.warn?.(
      "[desktop-pet] 没找到 Electron 运行时。\n" +
        "  已尝试：<插件>/electron/electron.exe、" +
        " %LOCALAPPDATA%\\.dsh\\electron\\electron.exe、" +
        " %LOCALAPPDATA%\\Programs\\electron\\electron.exe\n" +
        "  把 electron.exe 放到插件目录的 electron/ 子目录即可。",
    );
    return;
  }

  // 复制环境变量并删掉会改变 Electron 启动模式的开关
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;

  let child = null;
  try {
    child = spawn(bin, [APP_DIR], {
      detached: true,
      stdio: "ignore",
      cwd: APP_DIR,
      env,
      windowsHide: true,
    });
    child.unref();
    log.info?.("[desktop-pet] 已启动桌宠：" + bin);
  } catch (e) {
    log.error?.("[desktop-pet] 启动失败：" + e);
        return;
  }

  // 插件被卸载/重载时，把桌宠一起收掉（但 DSH 正常关闭不影响它，因为 detached）
  if (typeof ctx?.on === "function") {
    ctx.on("dispose", () => {
      try {
        if (child && !child.killed) child.kill();
      } catch {}
    });
  }
}
