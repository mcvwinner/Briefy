# 更新日志

本项目的所有显著变更记录于此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.0.4] - 2026-08-27

### 新增

- **编辑器核心（M4）**：
  - `LayoutSpec` 数据层（`src/shared/layout.ts`）：页/区块/提示词/内容形式/状态，坐标单位 mm，未来直接序列化为 `.briefy`；
  - `useLayout` Hook：区块增删改、多页管理、选中态，全部不可变更新；
  - A4 画布 `PageView`："添加内容"进入框选模式后在纸上拖出矩形创建区块；
  - 区块拖动移动 + 8 方向缩放手柄（pointer 事件手写实现，无第三方拖拽库）；
  - Delete 键删除选中区块；
  - 属性面板：提示词编辑（实时同步到区块标签）、内容形式下拉（纯文字/图文/表格/图片）、尺寸 SpinButton；
- 交互修正："添加内容"不再依赖 AI Key 配置（排版设计与生成解耦），只有"生成"需要 Key。

## [0.0.3] - 2026-08-27

### 新增

- **UI 全面迁移到 Fluent UI v9**（@fluentui/react-components + react-icons），对齐 Word/Win11 视觉风格；
- 设置弹窗：AI 服务配置（API Key / Base URL / 模型名），保存按钮在 Key 为空时禁用；
- 主进程 IPC：`settings:get` / `settings:set`，配置持久化到 userData 目录的 `settings.json`，读取时过滤脏字段；
- 预加载桥暴露类型安全的 `window.briefy` API（getSettings/saveSettings）；
- 工具栏联动：未配置 API Key 时"添加内容/生成"禁用、设置按钮显示高亮提醒，状态栏显示 AI 配置状态。

### 修复

- 图标名错误（`FileAddRegular` → `DocumentAddRegular`）导致构建失败。

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
