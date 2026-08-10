# 鸣潮 Mod 管理器（WWMI）

基础版 WWMI mod 管理工具，Electron + 原生 HTML/CSS/JS，界面参考 JASM 风格。

## 功能

- **分类浏览**：左侧显示 Mods 目录下的分类（character / Echoes / interface / mod / 武器等），右侧卡片网格展示 mod
- **启用/停用**：开关切换 = 给 mod 文件夹加/去 `DISABLED_` 前缀（与 WWMI `d3dx.ini` 的 `exclude_recursive = DISABLED*` 机制一致）
- **一键刷新 / 目录监听**：FileSystemWatcher 监听 Mods 目录，300ms 防抖自动重扫
- **F10 重载**：手动或自动向游戏窗口发送 F10（`reload_fixes`），切换 mod 后无需进游戏再按
- **预览图**：优先显示 `preview.png` / `.jasm_cover.png`，否则取目录内任意图片
- **分组**：识别「分类 > 角色/子目录 > mod」层级

## 环境要求

- Windows 10/11 x64
- Node.js 18+（开发运行）；打包成 exe 后无需 Node

## 启动

```bash
npm install   # 首次
npm start
```

## Mods 目录

默认 `D:\当temp\。WWI丶\Mods`，可在左下角路径处点击选择其他目录。设置保存在
`%APPDATA%\wwmi-mod-manager\config.json`。

## 目录结构

```
src/
  main/main.js       主进程（扫描 / IPC / 监听 / F10）
  main/send-f10.ps1  PowerShell 发送 F10 给游戏
  preload/preload.js contextBridge 安全桥
  renderer/          HTML + CSS + JS（JASM 风格界面）
```

## 「切换」说明

部分 mod 名自带「切换」（如 f11/f9、0/1、上下左右切换）字样，指的是 mod 内的
快捷键（由 WWMI 的 [KeySwap] 实现），与本管理器开关是两回事。这类 mod 同样通过开关整体启用/停用。

## 打包 exe

```bash
npm run dist   # 使用 electron-builder
```

## 安全

- 渲染进程禁用 Node 集成，仅通过白名单 IPC 通信
- 本地图片经 `modimg://` 协议加载，限制只能访问 Mods 根目录内文件