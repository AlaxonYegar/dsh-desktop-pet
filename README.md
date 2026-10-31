# dsh-desktop-pet

[![release](https://img.shields.io/github/v/release/AlaxonYegar/dsh-desktop-pet?color=4a7dfb)](https://github.com/AlaxonYegar/dsh-desktop-pet/releases)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-1f6feb)](https://github.com/topics/dsh-plugin)
[![platform](https://img.shields.io/badge/platform-Windows%20x64-0078d4)](https://github.com/AlaxonYegar/dsh-desktop-pet)

<p align="center"><img src="icon.png" width="120" alt="dsh-desktop-pet"></p>

给你的 DeepSeek Harness 配一只**桌面桌宠**：常驻桌面、始终置顶、鼠标穿透（只有压在模型不透明
像素上才接收点击）、不抢焦点、不占任务栏、可拖着到处跑。

> 作者 **AlaxonYegar** ｜ 完全免费，MIT 许可，功能无删减
>
> **本插件不含任何 Live2D 模型文件。** 安装后首次启动会让你选择自己已获授权的
> `*.model3.json` 所在文件夹。

## 为什么值得装

| | 普通桌宠 | dsh-desktop-pet |
|---|---|---|
| 鼠标穿透 | 常挡点击 | 按像素判断，空白区域全穿透 |
| 抢焦点 | 点她就打断输入 | `focusable: false`，永不抢焦点 |
| 任务栏 | 多一个图标 | `skipTaskbar: true` |
| 尺寸 | 固定 | 五档 + 滚轮 + 快捷键 |
| 模型 | 写死 | 自带导入，任意 `.model3.json` |
| 多显示器 | 拖不过去 | 支持 |
| 开机自启 | 手动 | 托盘一键，VBS 静默无黑框 |

## 安装

在 DSH 插件市场搜索 **dsh-desktop-pet**，或执行：

```sh
dsh plugin --profile web add dsh-desktop-pet
```

装完重开 DSH，桌面右下角会出现桌宠（首次是「选择模型」界面）。

## 运行时依赖

插件**不打包 Electron**（那会让体积从 240KB 涨到 100MB+），复用已有的：

| 顺序 | 位置 |
|---|---|
| 1 | `<插件目录>/electron/electron.exe`（自己放） |
| 2 | `%USERPROFILE%\.dsh\electron\electron.exe`（**DSH 自带，通常已有**） |
| 3 | `%LOCALAPPDATA%\.dsh\electron\electron.exe` |
| 4 | `%LOCALAPPDATA%\Programs\electron\electron.exe` |

DSH 自带的命中第 2 条，所以多数用户开箱即用。都找不到时插件只在日志提示，不会报错、
不影响 DSH 运行。

## 使用

| 操作 | 效果 |
|---|---|
| 左键按住拖动 | 移动（整屏任意位置，含任务栏区域、多显示器） |
| 右键单击 | 打开/关闭操作面板 |
| 滚轮 | 缩放 |
| `Ctrl+Alt+H` | 隐藏 / 显示 |
| `Ctrl+Alt+L` | 强制可交互（像素命中不准时） |
| `Ctrl+Alt+↑` `↓` | 放大 / 缩小 |
| `Ctrl+Alt+Q` | 退出 |

托盘菜单另有：大小档位、回到右下角、始终置顶、**开机自启**、退出。

## 配置

```yaml
- id: desktop-pet
  name: dsh-desktop-pet
  config:
    autostart: true      # 设为 false 则只安装、不自动拉起
```

## 工作原理

宿主半侧只做一件事：DSH 启动时 `spawn` 一个 Electron 进程载入 `app/`，然后 `unref()`。
桌宠是独立进程——**关掉 DSH 它照常在桌面上**。

有个必须处理的坑：DSH 自身环境里带着 `ELECTRON_RUN_AS_NODE=1`，直接 spawn 会让 Electron
以纯 Node 模式启动并崩溃（`app is undefined`）。插件会在子进程环境里删掉这个变量。

## 目录结构

```
lib/index.js           宿主半侧：查找 Electron、拉起桌宠
app/                   桌宠本体（Electron 应用）
  main.js              主进程：窗口、托盘、拖动、像素命中、自启
  pet.html             渲染层：Live2D 渲染 + 操作面板
  preload.js           IPC 桥
  lib/                 渲染依赖（PixiJS / pixi-live2d-display / Live2D Cubism Core）
cordis.patch.yml       挂载声明
```

## 授权

**完全免费，MIT。** 代码可自由使用、修改、再分发。

- 本项目代码：`LICENSE`（MIT）
- 第三方组件（Electron / PixiJS / pixi-live2d-display）：MIT，声明见 `NOTICE.md`
- **Live2D Cubism Core**：适用 Live2D Inc. 的专有许可，见 `NOTICE.md`
- 模型：**不在本包内**。请使用你已获授权的模型。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。
