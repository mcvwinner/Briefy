# Briefy

用 AI 自动填充内容，像排报纸一样制作个性化读物的桌面应用。

> **核心理念：内容规划与内容生成彻底分离**——用户只负责版面结构和意图（槽位+提示词），AI 负责填充和呈现。

## 功能总览

| 功能 | 说明 |
| --- | --- |
| 📰 槽位化版面 | 添加槽位选角色（头条/正文/数据/快讯/提示框），自动流式排布、自动分页；角色不同边框线型不同（头条双线、数据虚线…），编辑态即有报纸栏目感 |
| ✋ 手动布局 | 一键切换：像 Word 调图片一样拖动槽位位置、拖角缩放；拖出页顶/页底自动跨页，松手有反馈提示 |
| 🤖 AI 内容生成 | OpenAI 兼容接口（DeepSeek/通义/OpenAI 等），按槽位角色理解职责；编辑部三段式（选题→写作→审稿）可开关，审稿意见自动执行 |
| 🧩 预制控件 | 统计卡 / 引用块 / 信息框 / 时间线 / 配图（Tavily 图搜回填真实图片）/ 二维码 / 本期看点 / SVG 图表；AI 选用 + 用户表单化改参 |
| 📐 体积协调 | 槽位定容量：内容偏差小自动增/缩字号适配版面（含控件联动缩放），偏差大才退稿重写；质量报告卡以渲染实测为准 |
| 📂 文件参考源 | 本地 txt/md/csv/json/pdf/docx 挂为信息源，AI 经 readSource 工具按需分块读取（每文件限 3 次） |
| 🔔 订阅 | 把一份设计固化为模板：一键推送新一期 PDF；分层记忆（不重复往期 + 「继续昨天」连载续写）+ 出刊前强化审查 + 归档管理 |
| 💾 本地优先 | 设计文件 `.briefy`（透明 JSON）、用户自定义预设可导入导出分享 |
| 📄 PDF 导出 | 零依赖打印引擎，A4 所见即所得（黑白优先/主题色/页眉页脚） |
| 🌓 亮暗主题 | Fluent UI v9 全 token 化，暗色模式全局（含原生标题栏/滚动条） |

## 快速上手

1. 启动后点 **设置** → 填 API Key / Base URL / 模型名（如 DeepSeek：`https://api.deepseek.com` + `deepseek-chat`）
2. 可选：填 Tavily Key 启用联网搜索与配图（[tavily.com](https://tavily.com) 免费申请）
3. **预设** → 选一套模板 → **生成** → AI 填充全部槽位（可勾选编辑部模式提升连贯性）
4. 不满意某格？**选中槽位** → 右侧属性面板改提示词 → 单槽重生成；版面被撑爆/留白由体积协调自动处理
5. **文件** → 保存（`.briefy`）/ 导出 PDF
6. 想定期出刊？工具栏 **订阅** → 把当前设计存为模板 → 每次点「推送新一期」

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
npm run test        # 全部：控件解析 + 槽位版式 + 订阅记忆逻辑
npm run test:parse  # 控件协议解析器
npm run test:slots  # 流式排布/自动分页/旧格式迁移
npm run test:subscription  # 订阅记忆：组装/滚动/摘要/连载检测

# IPC 桥一致性校验（已内嵌进 build；也可单独跑）
npm run check:ipc
```

### 端到端探针（scripts/）

| 探针 | 覆盖 |
| --- | --- |
| `e2e.mjs` | 全链路：加载文档 → 生成 → 质量断言（空槽/体积/查重/署名）→ 导出 PDF |
| `probe-filesource.mjs` | 文件参考源：AI 经 readSource 读取本地文件并引用事实 |
| `probe-subscription.mjs` | 订阅出刊：两期出刊 / 记忆滚动 / 内容不重复 |
| `probe-manual.mjs` | 手动布局：切换/拖拽/缩放/双向跨页/页面排序 |
| `probe-zoom.mjs` | 控件随字号自适应缩放机制 |

## 项目结构

```
src/
├── main/          # Electron 主进程
│   ├── ai.ts          # 生成流水线：工具循环 + 编辑部三段式 + 归档员（订阅摘要）
│   ├── settings.ts    # 设置持久化 + 生成/选题/审稿/摘要 IPC（Key 只在此进程）
│   ├── tools.ts       # Tavily 搜索 / 网页抓取 / 本地文件读取（pdf/docx/文本）
│   ├── doc.ts         # .briefy 保存/打开（v1 自动迁移 v2）
│   ├── export.ts      # printToPDF 导出
│   ├── subscriptions.ts # 订阅持久化/归档路径 IPC
│   └── user-presets.ts# 用户预设存储/导入导出
├── preload/       # contextBridge 桥（channel 见 scripts/check-ipc.mjs 校验）
├── renderer/      # React UI
│   └── src/
│       ├── components/   # PageView（槽位画布）/ PropertiesPanel / SubscriptionDialog / 设置弹窗…
│       ├── hooks/        # useLayout：槽位增删改/流式排布/自动分页/手动布局
│       └── utils/        # markdown 渲染 / 控件渲染 / 控件编辑回写
└── shared/        # 三端共享：layout（槽位模型+版式规则）/ widgets（控件注册表）/ parse / subscription（订阅模型+记忆）
```

## 架构文档

- [docs/PRD.md](docs/PRD.md) — 产品需求与里程碑
- [docs/DESIGN-slots.md](docs/DESIGN-slots.md) — 槽位化架构定稿
- [docs/DESIGN-widgets.md](docs/DESIGN-widgets.md) — 控件协议与参与方式设计
- [docs/DESIGN-subscription.md](docs/DESIGN-subscription.md) — 订阅功能设计（模板固化/分层记忆/强化审查）
- [CHANGELOG.md](CHANGELOG.md) — 完整版本历史

## 许可证

[MIT](./LICENSE)
