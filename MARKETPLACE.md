# 上架材料

给 `awesome-dsh-plugin` / DSH 插件市场提交时可以直接抄的内容。

## 一句话简介（≤ 60 字）

> 给 DSH 配一只桌面 Live2D 桌宠：常驻置顶、鼠标穿透、不抢焦点、支持开机自启，自带模型导入。

## 英文简介

> A desktop Live2D pet for DSH: always-on-top, per-pixel mouse pass-through,
> never steals focus, multi-monitor, autostart, and built-in model import.
> Ships without any model files.

## 标签

```
desktop-pet  live2d  always-on-top  windows  mouse-transparent
```

## 清单条目（按 awesome-dsh-plugin 的格式调整）

```yaml
- name: dsh-desktop-pet
  repo: https://github.com/AlaxonYegar/dsh-desktop-pet
  author: 王嘉烨
  description: 桌面 Live2D 桌宠：常驻置顶、鼠标穿透、不抢焦点、开机自启，自带模型导入
  license: MIT
  platform: windows
  tags: [desktop-pet, live2d, always-on-top, mouse-transparent]
```

## PR 标题

```
Add dsh-desktop-pet — desktop Live2D pet for DSH
```

## PR 描述

```markdown
### 插件简介
dsh-desktop-pet 让 DSH 用户拥有一只常驻桌面的 Live2D 桌宠。桌宠是独立的 Electron
进程，关掉 DSH 后仍驻留桌面。

### 特点
- 鼠标穿透：按画布 alpha 逐像素判断，空白区域完全穿透，不挡操作
- 不抢焦点（`focusable: false`）与不占任务栏（`skipTaskbar: true`）
- 无边界拖动，支持多显示器
- 浅色操作面板 + 托盘菜单 + 快捷键
- 开机自启（VBS 静默，无黑框）
- 自带模型导入：任意 `.model3.json` 目录

### 不含模型
本插件**不打包任何 Live2D 模型文件**，用户需自行导入已获授权的模型。
Live2D Cubism Core 的许可在 NOTICE.md 中单独声明。

### 运行时
不打包 Electron，优先复用 DSH 自带的 `%USERPROFILE%\.dsh\electron\electron.exe`。
体积仅约 240KB。

### 许可
MIT
```

## 发布前检查

| 项 | 状态 |
|---|---|
| `package.json` → `repository` / `homepage` / `bugs` | ✅ `AlaxonYegar/dsh-desktop-pet` |
| `README.md` → 顶部徽章 | ✅ 已指向 `AlaxonYegar` |
| `LICENSE` 版权人 | ✅ 王嘉烨 |
| 仓库内是否含模型文件 | ✅ 无（`.gitignore` 已挡） |

## 发布流程

```sh
cd dsh-desktop-pet
git remote add origin https://github.com/AlaxonYegar/dsh-desktop-pet.git
git push -u origin main
```

然后在 GitHub 上打 tag `v1.0.0` 并发布 Release，附件放插件 zip。
