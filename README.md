# Briefy

用 AI 自动填充内容，像排报纸一样制作个性化读物的桌面应用。

> **核心理念：内容规划与内容生成彻底分离**——用户只负责版面结构和意图（槽位+提示词），AI 负责填充和呈现。

## 功能总览

| 功能 | 说明 |
| --- | --- |
| 📰 槽位化版面 | 添加槽位选角色（头条/正文/数据/快讯/提示框），自动流式排布、自动分页，无需手绘矩形 |
| 🤖 AI 内容生成 | OpenAI 兼容接口（DeepSeek/通义/OpenAI 等），按槽位角色理解职责，语篇级分工 |
| 🧩 预制控件 | 统计卡 / 引用块 / 信息框 / 时间线，AI 选用 + 用户表单化改参，双向参与 |
| 🔧 工具调用 | 当前时间 / 联网搜索（Tavily）/ 网页抓取，按槽位勾选启用 |
| 💾 本地优先 | 设计文件 `.briefy`（透明 JSON）、用户自定义预设可导入导出分享 |
| 📄 PDF 导出 | 零依赖打印引擎，A4 所见即所得 |
| 🌓 亮暗主题 | Fluent UI v9 全 token 化，暗色模式全局（含原生标题栏/滚动条） |

## 技术栈

- **Electron 44** + **React 19** + **TypeScript**
- **Fluent UI v9**（Office/Win11 同款设计语言）
- **Vercel AI SDK**（生成主链路）+ **LangChain**（文本检索切分）
- 构建：electron-vite（Vite 7）

## 开发

```bash
# 安装（国内网络已配置 npmmirror 友好；Electron 二进制需镜像，见下）
npm install --registry=https://registry.npmmirror.com --legacy-peer-deps

# Electron 二进制下载（如 install 后缺 dist 目录）
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
node node_modules/electron/install.js

# 开发（Electron 窗口 + Vite HMR）
npm run dev

# 构建 + IPC 桥校验
npm run build

# 测试
npm run test        # 全部：控件解析 + 槽位版式规则
npm run test:parse  # 控件协议解析器
npm run test:slots  # 流式排布/自动分页/旧格式迁移

# IPC 桥一致性校验（已内嵌进 build；也可单独跑）
npm run check:ipc
```

### 首次使用

1. 启动后点 **设置** → 填 API Key / Base URL / 模型名（如 DeepSeek：`https://api.deepseek.com` + `deepseek-chat`）
2. 可选：填 Tavily Key 启用联网搜索工具（[tavily.com](https://tavily.com) 免费申请）
3. **预设** → 选一套模板 → **生成** → AI 填充全部槽位
4. **文件** → 保存（`.briefy`）/ 导出 PDF

## 项目结构

```
src/
├── main/          # Electron 主进程
│   ├── ai.ts          # 生成流水线：手动工具循环 + 槽位职责提示词
│   ├── settings.ts    # 设置持久化 + 生成 IPC（Key 只在此进程）
│   ├── tools.ts       # Tavily 搜索 / 网页抓取（LangChain 切分）
│   ├── doc.ts         # .briefy 保存/打开（v1 自动迁移 v2）
│   ├── export.ts      # printToPDF 导出
│   └── user-presets.ts# 用户预设存储/导入导出
├── preload/       # contextBridge 桥（channel 见 scripts/check-ipc.mjs 校验）
├── renderer/      # React UI
│   └── src/
│       ├── components/   # PageView（槽位画布）/ PropertiesPanel / 设置弹窗…
│       ├── hooks/        # useLayout：槽位增删改/流式排布/自动分页
│       └── utils/        # markdown 渲染 / 控件渲染 / 控件编辑回写
└── shared/        # 三端共享：layout（槽位模型+版式规则）/ widgets（控件注册表）/ parse
```

## 架构文档

- [docs/PRD.md](docs/PRD.md) — 产品需求与里程碑
- [docs/DESIGN-slots.md](docs/DESIGN-slots.md) — 槽位化架构定稿
- [docs/DESIGN-widgets.md](docs/DESIGN-widgets.md) — 控件协议与参与方式设计
- [CHANGELOG.md](CHANGELOG.md) — 完整版本历史

## 测试

| 套件 | 覆盖 |
| --- | --- |
| `test:parse` | 控件标记解析（混合内容/未知控件回落/注册表完整性） |
| `test:slots` | 流式排布/自动分页/`.briefy` v1→v2 迁移/非法版本拒绝 |
| `check:ipc` | preload 每个调用的 channel 主进程必注册（防断桥） |

诊断工具：`scripts/diag-ai.mjs`（直连 AI 端点复现生成请求，排查 API 问题）。

## 许可证

[MIT](./LICENSE)
