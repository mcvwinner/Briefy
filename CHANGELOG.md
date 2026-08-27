# 更新日志

本项目的所有显著变更记录于此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.0.2] - 2026-08-27

### 新增

- Word 风格主框架：顶部工具栏（新建/打开/保存/添加内容/生成/设置）+ 中央 A4 画布 + 右侧属性面板 + 底部状态栏；
- A4 页面渲染组件（mm→px 换算，1mm ≈ 3.7795px @96dpi）；
- 依赖安装：Electron 44 / React 19 / Vite 7 / electron-vite 5（npmmirror 镜像，含 Electron 二进制镜像下载）。

### 修复

- 无（首个功能版本）。

## [0.0.1] - 2026-08-27

### 新增

- 产品需求文档 `docs/PRD.md`（含技术选型决策记录）；
- AI 协作守则 `AGENTS.md`；
- Electron + React + TypeScript 项目骨架：
  - 主进程 `src/main/index.ts`（窗口创建、外部链接处理、开发/生产加载切换）
  - 预加载脚本 `src/preload/index.ts`
  - 渲染进程 React 入口与占位界面
- 构建配置：`electron.vite.config.ts`、`tsconfig.json`；
- `LICENSE`（MIT）、`README.md`、`.gitignore`。
