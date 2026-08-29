# 订阅功能设计（v0.26 规划）

> 状态：规划已与用户对齐，待实施。
> 目标：把一份 .briefy 设计固化为可反复出刊的「订阅」——点击即推送新一期 PDF，期与期之间有记忆，出刊前有强化审查。

## 0. 已确认决策（用户拍板）

| 决策点 | 结论 |
|---|---|
| API Key | **不入模板**（敏感）；baseUrl / 模型名 / 主题 / 版式 / 自定义角色等全部固化进模板，出刊时 Key 用当前配置 |
| 审查 | 生成后自动质检（空槽/体积/查重/署名），不合格槽位自动重生成，**最多 2 轮**，仍不合格也出刊但记录标记瑕疵 |
| PDF 归档 | 应用数据目录，按订阅分文件夹、文件名含日期时间；出刊后可一键打开所在文件夹 |
| 记忆 | 单独维护一套；首版「分层记忆 + 连载线直通」（零外部依赖），预留 langchain 升级路径 |

## 1. 核心概念

- **订阅（Subscription）**：一份模板 + 一套记忆 + 出刊记录列表。
- **模板（template）**：完整 LayoutDoc（槽位/提示词/信息源/布局模式）+ 生成设置快照（model/baseUrl/theme/版式 prefs/stylePrompt/roleDuties/customRoles/editorial）。出刊时严格按模板执行。
- **期（issue）**：一次出刊产物 = PDF 文件 + 质检记录 + 记忆摘要。
- **记忆（memory）**：分层结构，让新一期不重复往期、支持「继续昨天的」。

## 2. 数据模型（shared/subscription.ts）

```ts
interface Subscription {
  id: string
  name: string
  createdAt: string
  template: {
    doc: LayoutDoc            // 槽位/提示词/信息源/布局模式（含手动布局坐标）
    layout?: LayoutPrefs      // 版式（字号/黑白/主题色/页眉页脚/分栏）
    baseUrl: string           // 模型接入点
    model: string             // 模型名
    theme: ThemeMode
    stylePrompt?: string
    roleDuties?: Partial<Record<string, string>>
    customRoles?: CustomRole[]
    editorial?: EditorialPrefs
  }
  memory: {
    recent: IssueSummary[]    // 最近 3 期详细摘要
    digest: string            // 更早期的滚动总览（一段文字）
  }
  issues: IssueRecord[]
}

interface IssueSummary {
  issuedAt: string
  headline: string           // 头条首行（标题性内容）
  points: string[]           // 各槽要点：角色名 + 内容首 ~80 字（出刊后零成本截断生成）
}

interface IssueRecord {
  id: string
  issuedAt: string
  pdfPath: string
  quality: { passed: boolean; issues: string[]; repaired: number }  // 出刊质检结果
  summary: IssueSummary
}
```

持久化：`userData/subscriptions/<id>.json`（每订阅一个文件，含模板+记忆+全部期记录）。PDF 归档：`userData/subscriptions/<id>/issues/<yyyyMMdd-HHmm>.pdf`。

## 3. 记忆机制（调研结论 + 适配）

业界四种模式：滚动摘要 / 分层记忆（Claude compaction、ChatGPT memory 同族）/ 检索式 RAG / 结构化状态跟踪。首版采用 **分层记忆 + 连载线直通**，理由：零新增依赖、token 恒定可控、覆盖「不重复」与「继续昨天」两大诉求。

- **短期层**：`recent` 最近 3 期详细摘要（IssueSummary）。
- **长期层**：`digest` 滚动总览——recent 溢出时最旧一期并入 digest（首版字符串合并；预留升级：AI 合并 / langchain embedding 检索）。
- **连载线直通**：槽位提示词匹配 `/继续|连载|昨天|上次|上一期/` 时，该槽生成前注入上一期该槽的**完整内容**（"继续昨天的"直接续写）。
- **去重指令**：记忆注入统一附带「以下为往期内容提要，本期不得重复其报道角度与事实」。
- 注入位置：每槽 prompt 的记忆前缀块（组装在渲染层出刊流程，不污染模板）。
- 摘要生成：出刊后零成本截断（头条首行 + 各槽首 80 字）；`IssueSummary` 结构稳定，后续可无痛升级 AI 提炼。

## 4. 出刊流程（渲染层主导，复用现有生成管线）

1. 订阅管理点「推送新一期」。
2. 模板装载：`loadDoc(template.doc)` + 设置覆盖（theme/layout 用模板值；model/baseUrl 走生成 IPC 的 overrides 参数）。
   - ⚠ 设置覆盖必须是**仅内存态**（不写 settings.json），避免污染用户日常配置。
3. 记忆注入：模板槽位 prompt 组装记忆前缀（副本操作）。
4. 跑现有 generateAll 管线（编辑部三段式/退稿重写/审稿自动执行/字号自适应——全部复用）。
5. **强化审查**：生成完成后自动质检（空槽 / 体积实测偏差 / 槽间相似度查重——与最近往期摘要关键词粗比 / 来源署名）→ 不合格槽位自动重生成，最多 2 轮 → 仍不合格标记瑕疵并出刊。
6. 导出：`exportPdf(doc, 归档路径)`。
7. 写记忆：构建 IssueSummary → recent/digest 滚动 → `subscriptions:save`。
8. UI 反馈：出刊结果（PDF 路径 + 质检摘要 + 打开文件夹按钮）。

## 5. 主进程 IPC（main/subscriptions.ts）

- `subscriptions:list` → Subscription[]
- `subscriptions:save(sub)` → 创建/更新（写 `<id>.json`）
- `subscriptions:delete(id)` → 删文件 + 删归档目录
- `subscriptions:issue-path(id)` → 约定式归档路径（出刊前取，导出用）
- `subscriptions:open-folder(id)` → shell.openPath 归档目录
- 配套：`ai:generate-slot` 增加 `overrides?: { model?: string; baseUrl?: string }` 尾参（主进程用它覆盖 settings 的模型，Key 仍用当前配置）。

## 6. UI（SubscriptionDialog + 工具栏入口）

- 工具栏新增「订阅」按钮 → Dialog。
- 列表页：名称 / 已出刊期数 / 最近出刊时间 / 最近质检标记（✓ / ⚠ N 处瑕疵）。
- 订阅操作：**推送新一期**（主按钮，出刊进度复用心跳浮窗）/ 打开归档目录 / 删除（二次确认）。
- 新建订阅：把**当前文档 + 当前设置**存为模板（输入订阅名）；模板内容可在保存前预览确认。
- 期记录展开：出刊时间 / 质量详情（issues 列表 + 修复数）/ **重新生成该期**（重跑出刊流程覆盖该期 PDF 与记忆摘要）。

## 7. 实施分期

| 阶段 | 内容 | 产出 |
|---|---|---|
| M1 | 数据层与 IPC：shared/subscription.ts、main/subscriptions.ts、preload 暴露、overrides 参数 | 类型与持久化就绪 |
| M2 | 出刊管线：模板装载/设置覆盖/记忆注入/质检 2 轮/PDF 归档/记忆写回 | 探针可跑通两期出刊 |
| M3 | UI：SubscriptionDialog + 工具栏入口 + 期记录 | 用户可操作闭环 |
| M4 | 验证与发布：探针（创建订阅→出刊第 1 期→出刊第 2 期→断言第 2 期注入了第 1 期记忆且内容不重复）+ e2e 回归 → v0.26.0 | 发布 |

## 8. 风险与开放问题

- **设置覆盖的内存态实现**：优先做法是 App 层加 `settingsOverride` state（生成 IPC 调用时拼进参数，UI 展示用），不动 settings.json。
- **查重粒度**：首版与往期摘要做关键词重叠粗检；若误报/漏报明显，再升级（往期全文比对或 embedding）。
- **重新生成某一期的记忆一致性**：覆盖该期 PDF 时同步重算该期 summary，后续期 digest 不回溯重算（可接受的历史不可变性）。
- **订阅模板与手动布局**：手动模式坐标已存于 LayoutDoc，天然固化 ✓；自动模式每次出刊按流式重排（预期行为）。
