# 更新日志

本项目的所有显著变更记录于此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.0.9] - 2026-08-27

### 修复

- **preload 脚本从未加载（严重）**：主进程引用 `../preload/index.js`，但 electron-vite v5 产物是 `index.mjs`，导致 `window.briefy` 桥不存在、所有 IPC（设置读写/生成）静默失效——这正是"保存无效果"的真正根因。现在按实际存在的产物文件自动探测扩展名。

### 验证记录

- 设置持久化链路实测打通：`%APPDATA%\briefy\settings.json` 正确落盘（apiKey/baseUrl/model/theme 四字段完整）。

## [0.0.8] - 2026-08-27

### 修复

- **设置弹窗"保存/取消无效"**：
  - 保存对象缺 `theme` 字段（v0.0.5 引入的字段未同步）导致 IPC 写入数据不完整；
  - Dialog 改为标准受控模式（`onOpenChange`），取消按钮可靠关闭弹窗；
  - 保存异常时兜底关闭弹窗并输出错误日志，不再卡死界面；
  - 保存成功后即时同步 App 状态，工具栏"生成"按钮立即解锁（无需重启）。

## [0.0.7] - 2026-08-27

### 新增

- **AI 生成流水线（核心功能）**：
  - 主进程 `ai.ts`：Vercel AI SDK + OpenAI 兼容 Provider，按区块提示词+内容形式组装报纸文风提示词；
  - IPC `ai:generate-block`：API Key 只在主进程使用，渲染进程不接触密钥；
  - "生成"按钮并发调度（上限 3 并发），跳过无提示词区块，逐块回填；
  - 区块状态机：empty → generating → done/error，画布内实时显示"生成中…"/错误信息/生成内容。

## [0.0.6] - 2026-08-27

### 修复

- 暗色模式下滚动条不变色：自定义 webkit 滚动条样式（thumb 跟随主题灰阶、圆角、hover 变色），并按主题切换 `color-scheme`，系统原生控件同步适配暗色。

## [0.0.5] - 2026-08-27

### 新增

- **多页管理**：底部 Word 式页签栏，添加/切换/删除页面（至少保留一页），删除当前页自动跳转相邻页；
- **暗色模式**（Fluent 设计要求项）：
  - 主题模型升级为 `webLightTheme` / `webDarkTheme`（更贴近 Win11 应用风格）；
  - 工具栏一键亮/暗切换，偏好持久化到 settings.json，Electron 重启后保留。

### 改进（Fluent 化打磨）

- 配色全面迁移到 Fluent Design Token（`colorNeutralBackground*`、`colorBrandStroke1` 等），消灭硬编码十六进制色值；
- 状态栏从"蓝底白字"改为 Fluent 浅灰细底 + 语义色状态图标（绿=已配置/红=未配置）；
- 属性面板改用 `Field` 规范组件 + token 间距排版，删除按钮改用 Fluent Button（红色语义）；
- A4 纸/区块/缩放手柄/框选虚线全部使用 Griffel token 样式，暗色下自动适配；
- 主题 `teamsLightTheme` → `webLightTheme`。

### 修复

- Griffel 不支持 CSS shorthand（border/borderStyle/borderColor 拆分为四边写法）；
- 页面 Hook 条件调用警告；未加载设置时切主题不再覆盖已保存的 API Key。

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
