# Briefy 槽位化架构（v3 定稿稿）

> 状态：设计定稿，即日动工
> 决策：用户确认"推翻重做、一步到位"。本稿替代 DESIGN-widgets.md 中的 P4 轻量方案（role 字段补丁方案废弃）。

## 1. 新数据模型

```ts
/** 页面 = 槽位声明表（版面骨架） */
interface Page {
  id: string
  slots: Slot[]
}

/** 槽位：版面上一个有职责的区域，内容容器而非矩形 */
interface Slot {
  id: string
  role: SlotRole              // headline | body | stats | briefs | notice | custom
  /** 布局（仍用 mm，但由"版式规则"推导而非用户手绘） */
  region: {
    x: number; y: number; width: number   // 宽度必填，高度由内容决定
  }
  /** 槽位级提示词：这一格"要什么" */
  prompt: string
  /** 槽位允许的工具 */
  tools: ToolId[]
  /** AI 产出：控件协议文本（与现有 widgets 体系完全复用） */
  content?: string
  status: 'empty' | 'generating' | 'done' | 'error'
  /** 附加高度：AI 内容超出预估时的延展量（mm），生成后写回 */
  overflow?: number
}
```

### 与旧 Block 的差异

| 维度 | 旧 Block（废弃） | 新 Slot |
| --- | --- | --- |
| 高度 | 用户手绘固定值 + 显示层补丁延展 | 无固定高度，**预估高度 + 溢出写回**，自适应是一等公民 |
| 语义 | 无（自由矩形） | 有角色，AI 按角色领任务 |
| 用户操作 | 画矩形/拖拽/缩放 | **选槽位类型 → 放置 → 调宽度**；高度不归用户管 |
| 预设 | 固定矩形数组 | 槽位模板（可含 role+prompt+tools 的骨架） |

## 2. 版式规则（Region 推导）

用户不画矩形，选"区域类型"，宽度自动推导：

| region 类型 | 推导规则 |
| --- | --- |
| full | x=15, width=180（A4 减页边距） |
| half-left / half-right | width=87.5，x=15 / 107.5 |
| two-col-first / two-col-second | 同 half，但语义为双栏正文流 |
| sidebar | width=55，x=140（右侧栏），y 追随前序 |
| manual | 高级用户直接改坐标 |

纵向排布规则：**同列槽位自动流式下移**——新槽位的 y = 前一个同列槽位的 y + 实际高度 + 8mm 间距。溢出页面时自动分页（把溢出的槽位搬到下一页）。

## 3. 交互重设计

### 工具栏
- "添加内容"改为 **"添加槽位"**：下拉选角色（头条/正文/数据/快讯/提示框/自定义）→ 自动放置到当前流末尾 → 用户只调宽度（full/half/sidebar 一键切换）
- 框选模式保留为 manual 高级入口

### 画布
- 槽位渲染 = 角色徽标 + 内容 + 自适应高度（v0.6.0 的 BlockBox 测量机制平移复用）
- 槽位间显示流向指示（细箭头），体现阅读顺序

### 属性面板
- 上半：槽位属性（角色切换/宽度切换/提示词/工具）
- 下半：控件实例表单（v0.5.1 平移复用）

## 4. AI 提示词协议

```
你是《{title}》的作者。本页槽位结构：
  1.[headline|全宽] 任务：{prompt} ← 你正在写第 N 槽
  2.[body|双栏左] 任务：{prompt}
  ...
职责规则：
- headline：导语，镇版，克制
- body：与头条承接，小标题分段
- briefs：一句话快讯，**主体**开头
（+ 现有控件协议、工具协议、语篇规则全部保留）
```

角色职责表（ROLE_DEFS）从共享模块注入，单一事实源。

## 5. 迁移与兼容

- `.briefy` 旧格式（version 1, blocks）：加载时逐 Block 映射为 Slot（role=custom，height→estHeight），版本升为 2；写回时仍存 v2
- 用户自定义预设（v1）：同上迁移；预设文件版本随主格式升 2
- 打印/导出：遍历 slots 而非 blocks，逻辑平移

## 6. 实施拆解（本轮一次做完）

| 步骤 | 内容 | 产物 |
| --- | --- | --- |
| S1 | 数据层：Slot/Page v2 + 迁移函数 + 从旧 Block 升级 | shared/layout.ts 重写 |
| S2 | 版式规则：region 推导 + 纵向流式排布 + 自动分页 | shared/slots.ts |
| S3 | 渲染层：PageView 改造（槽位盒/角色徽标/流向指示） | PageView.tsx 重写 |
| S4 | 交互层：添加槽位下拉/宽度切换/属性面板改造 | App.tsx + PropertiesPanel |
| S5 | AI 提示词：槽位结构注入 + ROLE_DEFS 职责 | ai.ts |
| S6 | 预设：内置预设改槽位模板 + 用户预设 v2 迁移 | presets.ts / user-presets.ts |
| S7 | 导出：PDF 打印视图走 slots | export 相关 |

## 7. 风险

- 工作量约为原 P4 方案 2.5 倍，但避免"语义补丁"的二次重构债
- 自动分页规则需要打磨（S2），先做简单版：只按累计高度切页
- 控件协议/工具/语篇/自定义预设四大已上线能力全部保留复用
