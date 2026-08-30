import type * as React from 'react'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  FluentProvider,
  makeStyles,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MenuGroup,
  MenuGroupHeader,
  MenuDivider,
  tokens,
  Toolbar as FluentToolbar,
  ToolbarButton,
  Tooltip,
  webDarkTheme,
  webLightTheme
} from '@fluentui/react-components'
import {
  DocumentAddRegular,
  FolderOpenRegular,
  SaveRegular,
  AddSquareRegular,
  WandRegular,
  SettingsRegular,
  WeatherMoonRegular,
  WeatherSunnyRegular,
  DocumentPdfRegular,
  AppsRegular,
  DeleteRegular,
  ArrowExportLtrRegular,
  ArrowImportRegular,
  ArrowClockwiseRegular,
  EditRegular
} from '@fluentui/react-icons'
import PageView from './components/PageView'
import SubscriptionDialog from './components/SubscriptionDialog'
import PageTabs from './components/PageTabs'
import PropertiesPanel from './components/PropertiesPanel'
import StatusBar from './components/StatusBar'
import SettingsDialog from './components/SettingsDialog'
import InputDialog from './components/InputDialog'
import { useLayout } from './hooks/useLayout'
import type { AiSettings, InfoSource, ThemeMode } from '../../shared/settings'
import { DEFAULT_SETTINGS } from '../../shared/settings'
import type { LayoutDoc, Slot, SlotRole } from '../../shared/layout'
import { ROLE_DEFS, resolveRoleName, reflowManualPage, resolveGeometry } from '../../shared/layout'
import { PRESETS, buildDocFromPreset } from '../../shared/presets'
import { toPresetSlots, fromPresetSlots, type UserPreset } from '../../shared/user-preset'
import { setEagerImages } from './utils/widgets-render'
// enforceLength（v0.20 引入的截断重组）在 v0.21 起不再被调用，函数与测试保留在 shared/parse.ts 备用
import { countContentChars, estimateQuota, quotaRange } from '../../shared/parse'
import {
  buildIssueSummary,
  buildMemoryBlock,
  isSerialPrompt,
  retrieveRelevantPast,
  rollMemory,
  RECENT_MEMORY_LIMIT,
  type Subscription
} from '../../shared/subscription'
declare global {
  interface Window {
    briefy?: {
      getSettings(): Promise<AiSettings>
      saveSettings(settings: AiSettings): Promise<void>
      generateSlot(
        generationId: string,
        prompt: string,
        role: string,
        kind: string,
        tools: string[],
        docContext: unknown,
        slotIndex: number,
        sources: InfoSource[],
        estHeight: number,
        overrides?: Partial<AiSettings>
      ): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }>
      cancelGeneration(generationId: string): Promise<boolean>
      planIssue(
        generationId: string,
        outline: { index: number; role: string; prompt: string }[],
        sources: InfoSource[],
        overrides?: Partial<AiSettings>
      ): Promise<{ assignments: { index: number; angle: string; quota?: number; avoid?: string }[] }>
      reviewIssue(
        generationId: string,
        articles: { index: number; role: string; content: string }[],
        overrides?: Partial<AiSettings>
      ): Promise<{ comments: { index: number; problem: string; instruction: string }[] }>
      summarizeIssue(
        generationId: string,
        articles: { role: string; content: string }[],
        overrides?: Partial<AiSettings>
      ): Promise<{ headline: string; points: string[] }>
      /** 长期总览压缩：AI 整合旧 digest 与新增期摘要（失败由调用方降级拼接） */
      compressDigest(
        generationId: string,
        oldDigest: string,
        overflow: { issuedAt: string; headline: string; points: string[] }[],
        overrides?: Partial<AiSettings>
      ): Promise<string>
      onHeartbeat(cb: (generationId: string, delta: string) => void): () => void
      devExportState(): Promise<unknown>
      /** 选择本地文件作为参考源（返回 null = 用户取消） */
      pickSourceFile(): Promise<{ path: string; name: string } | null>
      /** 订阅（v0.26）：CRUD / 归档路径 / 打开目录 */
      listSubscriptions(): Promise<Subscription[]>
      saveSubscription(sub: Subscription): Promise<boolean>
      deleteSubscription(id: string): Promise<boolean>
      issuePath(id: string, stamp?: string): Promise<string>
      openSubscriptionFolder(id: string): Promise<string>
      saveDoc(doc: LayoutDoc): Promise<string | null>
      openDoc(): Promise<LayoutDoc | null>
      exportPdf(doc: LayoutDoc, savePath?: string, fits?: Record<string, number>): Promise<string | null>
      readDocPath(path: string): Promise<string>
      /** 打印窗口：取待导出文档 / A4 页渲染完成后通知主进程 */
      getExportDoc(): Promise<{ doc: LayoutDoc; fits?: Record<string, number>; settings: AiSettings } | null>
      renderReady(): Promise<boolean>
      listUserPresets(): Promise<UserPreset[]>
      saveUserPreset(preset: UserPreset): Promise<'saved' | 'name-conflict' | 'error'>
      deleteUserPreset(name: string): Promise<boolean>
      renameUserPreset(oldName: string, newName: string): Promise<boolean>
      exportUserPreset(name: string): Promise<string | null>
      importUserPreset(): Promise<UserPreset | null>
    }
  }
}

const useStyles = makeStyles({
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: tokens.colorNeutralBackground2
  },
  workspace: {
    flex: 1,
    display: 'flex',
    minHeight: 0
  },
  canvasScroll: {
    flex: 1,
    overflow: 'auto',
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
    backgroundColor: tokens.colorNeutralBackground3,
    scrollbarColor: `${tokens.colorNeutralStroke1} transparent`,
    '::-webkit-scrollbar': {
      width: '12px',
      height: '12px'
    },
    '::-webkit-scrollbar-thumb': {
      backgroundColor: tokens.colorNeutralStroke1,
      borderRadius: '6px',
      border: `3px solid transparent`,
      backgroundClip: 'content-box'
    },
    '::-webkit-scrollbar-thumb:hover': {
      backgroundColor: tokens.colorNeutralStroke1Hover
    },
    '::-webkit-scrollbar-track': {
      backgroundColor: 'transparent'
    }
  },
  toolbar: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: '4px 8px'
  }
})

/** 打印/导出模式：URL 带 ?print=1 时为 true，只渲染纯净版面 */
const PRINT_MODE = new URLSearchParams(window.location.search).has('print')

/** AI 工作台浮动面板（心跳改进）：右下角实时展示流式输出，可直读内容、可终止 */
const HB_POS_KEY = 'briefy-hb-pos'

function HeartbeatPanel({
  phase,
  text,
  onCancel
}: {
  phase: string | null
  text: string
  onCancel: () => void
}): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  /** 拖拽位置（持久化在 localStorage；null = 默认右下角） */
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem(HB_POS_KEY)
      if (raw) {
        const p = JSON.parse(raw) as { x: number; y: number }
        if (typeof p.x === 'number' && typeof p.y === 'number') return p
      }
    } catch {
      // 忽略脏数据
    }
    return null
  })
  const posRef = useRef(pos)
  posRef.current = pos

  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight
  }, [text])

  /** 头部拖拽：mousemove 更新位置（clamp 视口内），mouseup 持久化 */
  const onHeaderMouseDown = (e: React.MouseEvent): void => {
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect) return
    const dx = e.clientX - rect.left
    const dy = e.clientY - rect.top
    const move = (ev: MouseEvent): void => {
      const x = Math.min(Math.max(ev.clientX - dx, 0), window.innerWidth - rect.width)
      const y = Math.min(Math.max(ev.clientY - dy, 0), window.innerHeight - 48)
      const next = { x, y }
      posRef.current = next
      setPos(next)
    }
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      try {
        localStorage.setItem(HB_POS_KEY, JSON.stringify(posRef.current))
      } catch {
        // 忽略持久化失败
      }
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div
      ref={boxRef}
      style={{
        position: 'fixed',
        ...(pos ? { left: pos.x, top: pos.y } : { right: '308px', bottom: '40px' }),
        width: '380px',
        zIndex: 1000,
        backgroundColor: 'var(--colorNeutralBackground1, #fff)',
        border: '1px solid var(--colorNeutralStroke2, #dde1e6)',
        borderRadius: '8px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        overflow: 'hidden'
      }}
    >
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 10px',
          backgroundColor: 'var(--colorNeutralBackground3, #f5f5f5)',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'move',
          userSelect: 'none'
        }}
      >
        <span>🪶 AI 工作台 · {phase ?? '生成中'}</span>
        <button
          onClick={onCancel}
          style={{
            border: 'none',
            background: 'none',
            color: '#c50f1f',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600
          }}
        >
          终止
        </button>
      </div>
      <pre
        ref={preRef}
        style={{
          margin: 0,
          padding: '8px 10px',
          maxHeight: '200px',
          overflowY: 'auto',
          fontSize: '11px',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          fontFamily: 'Consolas, monospace',
          color: 'var(--colorNeutralForeground1, #333)'
        }}
      >
        {text}
        <span className="hb-cursor">▌</span>
      </pre>
    </div>
  )
}

function App(): React.JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<AiSettings | null>(null)
  // 输入对话框状态（Electron 无 window.prompt，用此替代）
  const [inputDialog, setInputDialog] = useState<{
    title: string
    label: string
    initialValue: string
    onConfirm: (value: string) => void
  } | null>(null)

  const layout = useLayout(settings?.layout)
  /** 最新设置引用：生成链路跨渲染读（订阅出刊时临时覆盖 state 后立即生效） */
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const styles = useStyles()

  useEffect(() => {
    void window.briefy?.getSettings().then(setSettings).catch(() => setSettings(null))
  }, [])

  /** 切换主题并持久化（settings 尚未加载或浏览器环境时仅本地生效） */
  const toggleTheme = async (): Promise<void> => {
    const current: ThemeMode = settings?.theme === 'dark' ? 'dark' : 'light'
    const next: ThemeMode = current === 'dark' ? 'light' : 'dark'
    if (settings) {
      const updated = { ...settings, theme: next }
      setSettings(updated)
      await window.briefy?.saveSettings?.(updated)
    } else {
      // settings 未加载（如纯浏览器预览）：只改本地状态让 UI 生效
      setSettings({ apiKey: '', baseUrl: '', model: '', theme: next, tavilyKey: '', sources: [] })
    }
  }

  // Delete 键删除选中槽位
  const layoutSelection = layout.selection
  const removeSlotFn = layout.removeSlot
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Delete' || !layoutSelection) return
      removeSlotFn(layoutSelection.page.id, layoutSelection.slot.id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [layoutSelection, removeSlotFn])

  const hasApiKey = Boolean(settings?.apiKey)

  /** 并发生成所有槽位（并发上限 3），逐槽回填；附带文档大纲供 AI 语篇决策 */
  const [generating, setGenerating] = useState(false)
  /** 编辑部阶段（ROADMAP Q2）：null = 非编辑部模式或未到阶段 */
  const [phase, setPhase] = useState<
    '选题中…' | '写作中…' | '审稿中…' | '生成接续栏目…' | '生成子栏目…' | '版面适配…' | null
  >(null)
  /** 质量报告卡（ROADMAP 反馈：让改进可见） */
  const [qualityReport, setQualityReport] = useState<{
    rows: { role: string; status: string; len: number; limit: number; ok: boolean | null; hasSource: boolean; rewrites: number; fit?: number }[]
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
    reviewFixed: number
  } | null>(null)
  /** AI 输出心跳（流式增量累积全文尾部，供浮动工作台面板实时展示防"卡住"观感） */
  const [heartbeat, setHeartbeat] = useState<string | null>(null)
  const heartbeatBufRef = useRef('')
  useEffect(() => {
    const off = window.briefy?.onHeartbeat?.((_id, delta) => {
      heartbeatBufRef.current = (heartbeatBufRef.current + delta).slice(-4000)
      setHeartbeat(heartbeatBufRef.current)
    })
    return off
  }, [])
  /** 进行中的生成任务（用户可终止） */
  const inFlightRef = useRef<Set<string>>(new Set())
  /** 用户已请求终止：worker 不再从队列取新任务 */
  const cancelRef = useRef(false)
  /** 最近一次全量生成的任务表（供审稿一键应用按 index 定位槽位） */
  const tasksRef = useRef<{ slot: Slot; index: number }[]>([])

  /** 生成单个槽位：失败自动重试 1 次，仍失败报错上屏；被用户终止则复位为空。
   *  extraPrompt：编辑部模式下的选题/审稿附加指令，拼在槽位提示词后 */
  const runSlotTask = async (
    slot: Slot,
    index: number,
    docContext: { title: string; outline: { position: string; prompt: string }[] },
    extraPrompt = '',
    overrides?: Partial<AiSettings>
  ): Promise<void> => {
    if (cancelRef.current) return // 已请求终止：跳过队列任务
    const generationId = crypto.randomUUID()
    inFlightRef.current.add(generationId)
    /** 单槽看门狗：超时中止该任务并报错，worker 继续下一任务（防个别任务卡死拖住全局队列）。
     *  超时后调用 cancelGeneration 释放主进程任务；若已正常完成则无效无害 */
    const SLOT_TIMEOUT_MS = 180_000
    const callGenerate = (): Promise<{
      content: string
      usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
    }> => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const watchdog = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`生成超时（超过 ${Math.round(SLOT_TIMEOUT_MS / 1000)}s 已中止）`)),
          SLOT_TIMEOUT_MS
        )
      })
      try {
        return Promise.race([
          window.briefy!.generateSlot(
            generationId,
            extraPrompt ? `${slot.prompt}\n\n${extraPrompt}` : slot.prompt,
            resolveRoleName(slot),
            slot.kind,
            slot.tools ?? ['getCurrentTime'],
            docContext,
            index,
            slot.sources ?? [],
            slot.estHeight,
            overrides
          ),
          watchdog
        ])
      } finally {
        clearTimeout(timer)
        void window.briefy?.cancelGeneration(generationId)
      }
    }
    layout.updateSlot(slot.id, { status: 'generating' })
    try {
      let content: string | undefined
      for (let attempt = 0; attempt < 2 && content === undefined; attempt++) {
        try {
          const result = await callGenerate()
          content = result.content
          // token 用量汇总（ROADMAP Q5 度量；重试时累加不丢）
          if (result.usage) {
            const w = window as unknown as { __briefyUsage?: { promptTokens: number; completionTokens: number; totalTokens: number } }
            const prev = w.__briefyUsage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
            w.__briefyUsage = {
              promptTokens: prev.promptTokens + result.usage.promptTokens,
              completionTokens: prev.completionTokens + result.usage.completionTokens,
              totalTokens: prev.totalTokens + result.usage.totalTokens
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          // 用户主动终止：复位槽位，不重试不报错
          if (message.includes('abort')) {
            layout.updateSlot(slot.id, { status: 'empty', content: undefined })
            return
          }
          if (attempt === 0) continue // 第一次失败：自动重试 1 次
          layout.updateSlot(slot.id, { content: message, status: 'error' })
          return
        }
      }
      // ---- 长度协调（v0.22：槽位定字数；偏差小微调，偏差大退稿）----
      // 可接受区间 80%~115%（用户约定）：区间内交给渲染层字号微调（少→增大字号，多→缩小字号/放宽槽位）；
      // 区间外打回重写一次（带方向性字数引导），重写后仍偏差大则不再截断，由渲染层调槽位/字号兜底。
      // 体积统计用 estimateQuota：正文文字 + 控件按占版面积折算等效字数（高度mm×4.5），反映槽位真实体积。
      // 估算密度对不同排版（头条大字/数据小卡）天然不准，只做粗筛：仅极端偏差（超 2 倍/不足 40%）才退稿；
      // 普通偏差交给渲染层字号/槽位自适应（缩放下限 70%/上限 125%，可覆盖约 1.8 倍体积差），实测收敛兜底
      const wordLimit = Math.max(40, Math.round(slot.estHeight * 4.5))
      const quota = content ? estimateQuota(content) : 0
      const ratio = content ? quota / wordLimit : 1
      // 纯控件槽位（正文为 0）与自由创作槽（不限字数格式）是合法形态，不退稿
      const pureWidget =
        (content?.includes(':::') ?? false) && countContentChars(content ?? '') === 0
      let retried = false
      if (content && slot.role !== 'free' && !pureWidget && (ratio > 2 || ratio < 0.4)) {
        retried = true // 只要发起过退稿重写就记录（质量报告展示「重试了」）
        const tooLong = ratio > 1.15
        try {
          layout.updateSlot(slot.id, { status: 'generating' })
          const retryId = crypto.randomUUID()
          inFlightRef.current.add(retryId)
          try {
            const retry = await Promise.race([
              window.briefy!.generateSlot(
                retryId,
                tooLong
                  ? `${slot.prompt}\n\n【退稿重写】你上一稿体积约 ${quota} 字（含图表/配图折算），超出目标 ${wordLimit} 字太多被主编退稿。这次压缩到 ${wordLimit} 字左右：保留最重要的信息，删除次要细节与重复修饰。`
                  : `${slot.prompt}\n\n【退稿重写】你上一稿体积约 ${quota} 字（含图表/配图折算），距目标 ${wordLimit} 字差距太大被主编退稿。这次写到 ${wordLimit} 字左右：补充具体细节、数据与背景，展开论述，不要空洞凑字。`,
                resolveRoleName(slot),
                slot.kind,
                slot.tools ?? ['getCurrentTime'],
                docContext,
                index,
                slot.sources ?? [],
                slot.estHeight,
                overrides
              ),
              new Promise<never>((_, rej) => setTimeout(() => rej(new Error('重写超时（120s）')), 120_000))
            ])
            content = retry.content
          } finally {
            void window.briefy?.cancelGeneration(retryId)
            inFlightRef.current.delete(retryId)
          }
        } catch {
          // 重写失败：保留原稿
        }
        // 重写后仍偏差大：不砍内容不强缩——超限交给渲染层放宽槽位兜底，太短交给渲染层增大字号填充
      }
      layout.updateSlot(slot.id, {
        content: content ?? '（生成失败：空响应）',
        status: 'done',
        ...(retried ? { rewriteCount: (slot.rewriteCount ?? 0) + 1 } : {})
      })
    } finally {
      inFlightRef.current.delete(generationId)
    }
  }

  /** 生成单个槽位（属性面板"生成此槽位"） */
  /** 实测适配状态（SlotBox 收敛后回写）：字号比例/是否溢出/内容实际高度——质量报告与版面适配以实测为准 */
  const [slotFits, setSlotFits] = useState<Record<string, { fit: number; overflow: boolean; actualMm: number }>>({})
  /** 订阅管理弹窗 */
  const [subsOpen, setSubsOpen] = useState(false)
  const handleFit = useCallback((slotId: string, fit: number, overflow: boolean, actualMm: number): void => {
    setSlotFits((prev) => {
      const cur = prev[slotId]
      if (cur && cur.fit === fit && cur.overflow === overflow && cur.actualMm === actualMm) return prev // 无变化不触发重渲染，防测量循环
      return { ...prev, [slotId]: { fit, overflow, actualMm } }
    })
  }, [])
  /** 最新实测引用：订阅版面适配循环跨渲染读取（闭包快照是过期数据，v0.31 教训） */
  const slotFitsRef = useRef(slotFits)
  slotFitsRef.current = slotFits

  /** 收集并显示质量报告卡：生成完成时自动弹出；卡内「刷新」手动重取最新状态（含仍在生成的槽位） */
  const collectReport = (reviewFixedCount: number, overrides?: Partial<AiSettings>): void => {
    try {
      const doc = (window as unknown as { __briefyGetDoc?: () => LayoutDoc }).__briefyGetDoc?.() ?? layout.doc
      const slots = doc.pages.flatMap((p) => p.slots)
      const usage = (window as unknown as { __briefyUsage?: { promptTokens: number; completionTokens: number; totalTokens: number } }).__briefyUsage
      setQualityReport({
        rows: slots.map((s) => {
          const len = estimateQuota(s.content ?? '')
          const limit = Math.max(40, Math.round(s.estHeight * 4.5))
          // 实测适配优先（SlotBox 收敛结果）：溢出才算失败；无实测（未渲染/刷新前）时用估算兑底（quotaRange 口径）
          const fit = slotFits[s.id]
          const range = quotaRange(limit)
          const ok =
            s.status !== 'done'
              ? null
              : fit
                ? !fit.overflow
                : len >= range.min && len <= range.max
          return {
            role: resolveRoleName(s, overrides?.customRoles ?? settingsRef.current?.customRoles),
            status: s.status,
            len,
            limit,
            fit: fit?.fit,
            ok,
            hasSource: (s.sources?.length ?? 0) > 0,
            rewrites: s.rewriteCount ?? 0
          }
        }),
        usage,
        reviewFixed: reviewFixedCount
      })
    } catch {
      // 报告失败不影响成品
    }
  }

  /** 订阅质检：空槽 / 未生成 / 实测溢出 / 与上期同槽内容高度重复（3-gram 粗比） */
  const runIssueQualityCheck = (lastSlots: { role: string; content: string }[]): { slotId: string; role: string; msg: string }[] => {
    const doc = layout.docRef.current
    const lastIssueSlots = lastSlots
    const gram3 = (t: string): Set<string> => {
      const s = t.replace(/\s+/g, '')
      const set = new Set<string>()
      for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3))
      return set
    }
    const problems: { slotId: string; role: string; msg: string }[] = []
    for (const page of doc.pages) {
      for (const s of page.slots) {
        const role = resolveRoleName(s)
        // 自由创作槽：只要有输出就算过（不限字数/格式/控件）
        if (s.role === 'free') {
          if (s.status !== 'done') problems.push({ slotId: s.id, role, msg: '未生成成功' })
          else if (!s.content?.trim()) problems.push({ slotId: s.id, role, msg: '内容为空' })
          continue
        }
        if (s.status !== 'done') {
          problems.push({ slotId: s.id, role, msg: '未生成成功' })
          continue
        }
        if (!s.content?.trim()) {
          problems.push({ slotId: s.id, role, msg: '内容为空' })
          continue
        }
        const fit = slotFits[s.id]
        if (fit?.overflow) problems.push({ slotId: s.id, role, msg: '版面溢出（字号下限仍装不下）' })
        // 与上期同槽查重（出刊不可改，重复是硬伤）
        const prev = lastIssueSlots.find((p) => p.role === role)
        if (prev && prev.content.length > 50 && s.content!.length > 50) {
          const a = gram3(s.content!)
          const b = gram3(prev.content)
          let hit = 0
          for (const g of a) if (b.has(g)) hit++
          const sim = a.size > 0 ? hit / a.size : 0
          if (sim > 0.6) problems.push({ slotId: s.id, role, msg: `与上期内容高度重复（相似度 ${Math.round(sim * 100)}%）` })
        }
      }
    }
    return problems
  }

  /** 订阅出刊流程（v0.26）：模板装载 → 记忆注入（含连载线直通）→ 生成 → 强化审查 2 轮 → PDF 归档 → 记忆写回。
   *  设置覆盖仅内存态（UI 同步切换订阅主题/版式，出刊后恢复；不写 settings.json） */
  const pushSubscriptionIssue = async (sub: Subscription, stamp?: string): Promise<void> => {
    if (!window.briefy || generating) return
    // 模板深拷贝装载：记忆注入改的是副本，模板文件不受污染
    const docClone = structuredClone(sub.template.doc)
    const memBlock = buildMemoryBlock(sub.memory)
    const lastIssue = sub.issues[sub.issues.length - 1]
    for (const page of docClone.pages) {
      for (const slot of page.slots) {
        let prefix = memBlock
        // 相关往期检索（v0.33）：本槽主题在更早期内容中找相似片段，注入差异化指令（排除上期——同槽查重已覆盖，连载线另有全文注入）
        const related = retrieveRelevantPast(slot.prompt, sub.issues, lastIssue?.id)
        if (related.length > 0) {
          prefix +=
            '【相关往期内容（与本栏主题相关，本期必须差异化，不得复述）】\n' +
            related.map((r) => `【${r.issuedAt}·${r.role}】${r.snippet}`).join('\n') +
            '\n\n'
        }
        // 连载线直通：提示词含续写意图 → 注入上一期该栏完整内容
        if (isSerialPrompt(slot.prompt) && lastIssue) {
          const roleName = resolveRoleName(slot, sub.template.customRoles)
          const prev = lastIssue.slots.find((p) => p.role === roleName)
          if (prev?.content.trim()) {
            prefix += `【连载续写】以下是上一期本栏目的完整内容，请在此基础上自然延续（承接故事线与未完话题，不要重复原文）：\n${prev.content}\n\n`
          }
        }
        slot.prompt = prefix + slot.prompt
      }
    }
    const overrides: Partial<AiSettings> = {
      model: sub.template.model,
      baseUrl: sub.template.baseUrl,
      theme: sub.template.theme,
      stylePrompt: sub.template.stylePrompt,
      roleDuties: sub.template.roleDuties,
      customRoles: sub.template.customRoles,
      editorial: sub.template.editorial,
      layout: sub.template.layout
    }
    const prevSettings = settingsRef.current
    const issueSettings = { ...prevSettings, ...overrides } as AiSettings
    const issuedAt = new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    let repaired = 0
    let problems: { slotId: string; role: string; msg: string }[] = []
    try {
      setSettings(issueSettings)
      settingsRef.current = issueSettings
      layout.loadDoc(docClone)
      layout.docRef.current = docClone // 装载后立即同步引用（不等渲染，供本次闭包内读取）
      await generateAll(overrides)
      // 强化审查：不合格槽位自动重生成，最多 2 轮；仍不合格标记瑕疵出刊
      const lastSlots = lastIssue?.slots ?? []
      for (let round = 0; round < 2; round++) {
        problems = runIssueQualityCheck(lastSlots)
        if (problems.length === 0) break
        const doc = layout.docRef.current
        const all = doc.pages.flatMap((p) => p.slots)
        const bad = all.filter((s) => problems.some((p) => p.slotId === s.id))
        for (const s of bad) {
          await generateOne(s, all.findIndex((x) => x.id === s.id), overrides)
          repaired++
        }
      }
      // ---- 版面适配循环（v0.31 实验性，仅手动布局订阅 + 开关开启）：
      // 开关 v0.34.1 迁至全局设置（AiSettings.experimentalLayoutFit）：设置保存时始终写显式布尔，
      // 能覆盖旧订阅上的遗留字段；旧订阅字段仅在该设置从未保存过（undefined）时兜底生效。
      // 页数/槽位集合/列结构/列内相对顺序锁定；允许调 estHeight（高度）与纵向位置（列内流式重排）。
      // 每轮从 slotFitsRef 读最新实测（v0.31 修复：闭包快照是过期数据，是上一版越适越乱的原因）；
      // 单轮 est 变化钉在 ±40% 以内防震荡；溢出槽只做几何吸收+裁剪（不打回——新内容引入新波动是震荡源）。
      const layoutFitEnabled = issueSettings.experimentalLayoutFit ?? sub.experimentalLayoutFit === true
      if (layoutFitEnabled && sub.template.doc.layoutMode === 'manual') {
        setPhase('版面适配…')
        const geo = resolveGeometry(sub.template.layout)
        const bottomLimit = geo.pageHeightMM - geo.marginMM
        for (let round = 0; round < 3; round++) {
          const fits = slotFitsRef.current // 实时读
          const doc = layout.docRef.current
          const all = doc.pages.flatMap((p, pi) => p.slots.map((s) => ({ s, pageIdx: pi })))
          const overflowSlots = all.filter(
            ({ s }) => s.role !== 'free' && s.status === 'done' && fits[s.id]?.overflow
          )
          const sparseSlots = all.filter(({ s }) => {
            if (s.role === 'free' || s.status !== 'done') return false
            const f = fits[s.id]
            if (!f || f.overflow) return false
            const capacity = s.estHeight + (s.overflow ?? 0)
            return f.fit >= 1.24 && f.actualMm < capacity * 0.6 && capacity > 40
          })
          console.log(`[fit] 版面适配第 ${round + 1} 轮：溢出 ${overflowSlots.length} / 留白 ${sparseSlots.length}`)
          if (overflowSlots.length === 0 && sparseSlots.length === 0) break

          const adjustedPages = new Set<number>()
          const pageIdxOf = (id: string): number => all.find((x) => x.s.id === id)?.pageIdx ?? 0
          // 动作 A：溢出槽吸收页内剩余空间（钳制在页底）；吸收不完 → 内容裁剪 + 标记瑕疵（不打回）
          for (const { s } of overflowSlots) {
            const actual = fits[s.id]?.actualMm ?? s.estHeight
            const need = Math.ceil(actual - s.estHeight) + 2
            const maxGrow = Math.max(0, bottomLimit - s.region.y - s.estHeight)
            if (maxGrow > 4) {
              const grow = Math.min(need, maxGrow, Math.ceil(s.estHeight * 0.4))
              layout.updateSlot(s.id, { estHeight: s.estHeight + grow, overflow: 0 })
              adjustedPages.add(pageIdxOf(s.id))
              console.log(`[fit] 溢出槽「${resolveRoleName(s)}」增高 ${grow}mm（页内上限 ${maxGrow}mm）`)
            } else {
              console.log(`[fit] 溢出槽「${resolveRoleName(s)}」页内已无空间，内容裁剪 + 标记瑕疵`)
            }
          }
          // 动作 B：留白槽收缩 est 贴合内容（+8mm 余量，不低于 30mm，单轮 ≤40%）
          for (const { s } of sparseSlots) {
            const actual = fits[s.id]?.actualMm ?? s.estHeight
            const newH = Math.max(30, Math.round(actual * 1.15) + 8)
            if (newH < s.estHeight - 5) {
              const shrunk = Math.max(newH, Math.ceil(s.estHeight * 0.6))
              layout.updateSlot(s.id, { estHeight: shrunk, overflow: 0 })
              adjustedPages.add(pageIdxOf(s.id))
              console.log(`[fit] 留白槽「${resolveRoleName(s)}」收缩 ${s.estHeight} → ${shrunk}mm`)
            }
          }
          // 动作 C：调整过的页做列内流式重排（列起点锚定/列内顺序保持——相对位置不变）
          const curDoc = layout.docRef.current
          const pages = curDoc.pages.map((p, i) =>
            adjustedPages.has(i) ? { ...p, slots: reflowManualPage(p.slots, geo) } : p
          )
          layout.loadDoc({ ...curDoc, pages })
          layout.docRef.current = { ...curDoc, pages }
          // 等渲染实测收敛后进下一轮
          await new Promise<void>((r) => setTimeout(r, 2500))
        }
      }
      // PDF 归档 + 记忆写回（摘要优先 AI 提炼：保留关键事实供下期防重复/连载；失败降级为零成本截断）
      const pdfPath = await window.briefy.issuePath(sub.id, stamp)
      // 所见即所得：把主窗口收敛后的每槽 fitScale 一并传给打印窗口（禁止重新排版）
      const fitsForPrint = Object.fromEntries(
        Object.entries(slotFitsRef.current).map(([id, f]) => [id, f.fit])
      )
      await window.briefy.exportPdf(layout.docRef.current, pdfPath, fitsForPrint)
      const slotsForMemory = layout.docRef.current.pages
        .flatMap((p) => p.slots)
        .filter((s) => s.status === 'done' && s.content?.trim())
        .map((s) => ({ role: resolveRoleName(s, sub.template.customRoles), content: s.content ?? '' }))
      let summary
      try {
        const sumId = crypto.randomUUID()
        inFlightRef.current.add(sumId)
        try {
          const refined = await window.briefy.summarizeIssue(sumId, slotsForMemory, overrides)
          summary = { issuedAt, headline: refined.headline, points: refined.points }
        } finally {
          void window.briefy.cancelGeneration(sumId)
          inFlightRef.current.delete(sumId)
        }
      } catch {
        summary = buildIssueSummary(layout.docRef.current, issuedAt)
      }
      // 记忆滚动（v0.33）：digest 溢出时先 AI 压缩整合（失败降级为 rollMemory 的字符串拼接）
      let memory = rollMemory(sub.memory, summary)
      const recentPlus = [...sub.memory.recent, summary]
      if (recentPlus.length > RECENT_MEMORY_LIMIT) {
        const overflow = recentPlus.slice(0, recentPlus.length - RECENT_MEMORY_LIMIT)
        try {
          const cId = crypto.randomUUID()
          inFlightRef.current.add(cId)
          try {
            const digest = (await window.briefy.compressDigest(cId, sub.memory.digest, overflow, overrides)).trim()
            if (digest) memory = { recent: memory.recent, digest }
          } finally {
            void window.briefy.cancelGeneration(cId)
            inFlightRef.current.delete(cId)
          }
        } catch {
          /* AI 压缩失败：保留 rollMemory 的降级拼接结果 */
        }
      }
      const record = {
        id: crypto.randomUUID(),
        issuedAt,
        pdfPath,
        quality: { passed: problems.length === 0, issues: problems.map((p) => `${p.role}：${p.msg}`), repaired },
        summary,
        slots: slotsForMemory
      }
      // 重新生成指定期：替换旧记录（PDF 同路径覆盖）；否则追加新期
      const issues = stamp
        ? sub.issues.map((r) => (r.pdfPath === pdfPath ? record : r))
        : [...sub.issues, record]
      await window.briefy.saveSubscription({ ...sub, memory, issues })
    } finally {
      settingsRef.current = prevSettings
      setSettings(prevSettings)
    }
  }

  /** 接续槽位组：合并组内提示词为一次 AI 调用（组内总容量定字数），输出按 ═══PART═══ 拆分依序回填各槽。
   *  拆分数不足时多余槽位空置；失败组内全部标 error。不走退稿/审稿（拆分语义与按槽重写冲突）。 */
  const runGroupTask = async (
    group: { pageId: string; slot: Slot; index: number }[],
    docContext: { title: string; outline: { position: string; prompt: string }[] },
    overrides?: Partial<AiSettings>
  ): Promise<void> => {
    if (!window.briefy || group.length === 0) return
    const SEP = '═══PART═══'
    const totalEst = group.reduce((acc, g) => acc + g.slot.estHeight, 0)
    const partsDesc = group.map((g, i) => `第 ${i + 1} 部分（用于「${resolveRoleName(g.slot)}」栏）：${g.slot.prompt}`).join('\n')
    const prompt = [
      `以下需求原本拆分在 ${group.length} 个相邻版面栏位，请作为一篇连贯内容一次写完，再用分隔符切分。`,
      '写作规则：',
      `- 全文用单独一行 ${SEP} 作为分隔标记，恰好分成 ${group.length} 个部分，不多不少；`,
      `- 各部分合计约 ${Math.round(totalEst * 4.5)} 字；各部分之间承接自然，但每部分可独立成段阅读；`,
      '- 内容分配：',
      partsDesc
    ].join('\n')
    for (const g of group) layout.updateSlot(g.slot.id, { status: 'generating' })
    console.log(`[gen] 接续组生成开始（${group.length} 栏，目标约 ${Math.round(totalEst * 4.5)} 字）`)
    const generationId = crypto.randomUUID()
    inFlightRef.current.add(generationId)
    try {
      const result = await Promise.race([
        window.briefy!.generateSlot(
          generationId,
          prompt,
          resolveRoleName(group[0].slot),
          group[0].slot.kind,
          group[0].slot.tools ?? ['getCurrentTime'],
          docContext,
          group[0].index,
          group[0].slot.sources ?? [],
          totalEst,
          overrides
        ),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('接续组生成超时（300s）')), 300_000))
      ])
      const parts = result.content
        .split(new RegExp(`^\\s*${SEP}\\s*$`, 'm'))
        .map((p) => p.trim())
        .filter(Boolean)
      group.forEach((g, i) => {
        const content = parts[i] ?? ''
        if (result.usage) {
          const w = window as unknown as { __briefyUsage?: { promptTokens: number; completionTokens: number; totalTokens: number } }
          const prev = w.__briefyUsage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
          w.__briefyUsage = {
            promptTokens: prev.promptTokens + result.usage.promptTokens,
            completionTokens: prev.completionTokens + result.usage.completionTokens,
            totalTokens: prev.totalTokens + result.usage.totalTokens
          }
        }
        layout.updateSlot(g.slot.id, { content: content || `（第 ${i + 1} 部分缺失：AI 返回段数不足）`, status: content ? 'done' : 'empty' })
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      for (const g of group) layout.updateSlot(g.slot.id, { content: message, status: 'error' })
    } finally {
      void window.briefy?.cancelGeneration(generationId)
      inFlightRef.current.delete(generationId)
    }
  }

  const generateOne = async (slot: Slot, index: number, overrides?: Partial<AiSettings>): Promise<void> => {
    if (!window.briefy || generating) return
    setGenerating(true)
    try {
      const doc = layout.docRef.current
      const docContext = {
        title: doc.title,
        outline: doc.pages.flatMap((page, pi) =>
          page.slots.map((s) => ({ position: `第${pi + 1}页·${resolveRoleName(s)}`, prompt: s.prompt }))
        )
      }
      await runSlotTask(slot, index, docContext, '', overrides)
    } finally {
      setHeartbeat(null)
      setGenerating(false)
    }
  }

  /** 并发生成所有槽位（并发上限 3），逐槽回填；附带文档大纲供 AI 语篇决策。
   *  overrides：订阅出刊时传模板固化配置（仅本次生成生效，不写 settings.json） */
  const generateAll = async (overrides?: Partial<AiSettings>): Promise<void> => {
    if (!window.briefy) return
    // 生成中再次点击 = 终止：标记取消（worker 不再取新任务）+ abort 在途任务
    if (generating) {
      cancelRef.current = true
      for (const id of [...inFlightRef.current]) {
        void window.briefy.cancelGeneration(id)
      }
      return
    }
    cancelRef.current = false
    heartbeatBufRef.current = ''
    setHeartbeat(null)
    setGenerating(true)
    try {
      const docNow = layout.docRef.current
      // 任务规划（v0.29 关联槽位）：接续组 → 一次调用拆分；子槽位 → 父完成后第二波；其余单槽并行
      const continuationGroups = new Map<string, { pageId: string; slot: Slot; index: number }[]>()
      const childTasks: { pageId: string; slot: Slot; index: number }[] = []
      const tasks: { pageId: string; slot: Slot; index: number }[] = []
      let index = 0
      for (const page of docNow.pages) {
        for (const slot of page.slots) {
          if (!slot.prompt.trim()) continue // 无提示词的槽位跳过
          if (slot.relation?.type === 'continuation') {
            const arr = continuationGroups.get(slot.relation.group) ?? []
            arr.push({ pageId: page.id, slot, index })
            continuationGroups.set(slot.relation.group, arr)
          } else if (slot.relation?.type === 'child') {
            childTasks.push({ pageId: page.id, slot, index })
          } else {
            tasks.push({ pageId: page.id, slot, index })
          }
          index++
        }
      }
      tasksRef.current = tasks.map((t) => ({ slot: t.slot, index: t.index }))
      // 语篇上下文：整份报纸的槽位大纲（角色+职责）
      const docContext = {
        title: docNow.title,
        outline: docNow.pages.flatMap((page, pi) =>
          page.slots.map((s) => ({
            position: `第${pi + 1}页·${resolveRoleName(s)}`,
            prompt: s.prompt
          }))
        )
      }

      // ---- 编辑部模式（ROADMAP Q2）：选题 → 写作 → 审稿；任一环节失败自动降级为旧流程 ----
      // 存在关联槽位（接续组/子槽位）时本次不走三段式：选题单与审稿的按槽模型与合并/依赖语义冲突
      const hasRelations = continuationGroups.size > 0 || childTasks.length > 0
      console.log(
        `[gen] 任务规划: 单槽=${tasks.length} 接续组=${continuationGroups.size} 子槽位=${childTasks.length}`
      )
      if (continuationGroups.size > 0) {
        for (const [g, arr] of continuationGroups)
          console.log(`[gen] 接续组「${g}」: ${arr.map((x) => resolveRoleName(x.slot)).join(' + ')}`)
      }
      if (childTasks.length > 0) {
        for (const t of childTasks) {
          const pid = t.slot.relation?.type === 'child' ? t.slot.relation.parentId : '?'
          console.log(`[gen] 子槽位「${resolveRoleName(t.slot)}」→ 父 id=${pid}`)
        }
      }
      const editorial =
        !hasRelations && (overrides?.editorial?.enabled ?? settingsRef.current?.editorial?.enabled === true)
      /** 选题单：index → 附加指令 */
      const assignmentMap = new Map<number, string>()

      if (editorial && tasks.length > 0) {
        // 快照：生成开始前存当前版（审稿应用改写前可还原）
        try {
          localStorage.setItem('briefy-snapshot', JSON.stringify(docNow))
        } catch { /* 超限则忽略 */ }

        setPhase('选题中…')
        try {
          const planId = crypto.randomUUID()
          inFlightRef.current.add(planId)
          const outline = tasks.map((t) => ({ index: t.index, role: resolveRoleName(t.slot), prompt: t.slot.prompt }))
          const flatSources = [...new Map(tasks.flatMap((t) => t.slot.sources ?? []).map((s) => [s.url, s])).values()]
          const plan = await window.briefy.planIssue(planId, outline, flatSources, overrides)
          for (const a of plan.assignments) {
            const parts = [`【本期选题】${a.angle}`]
            if (a.quota) parts.push(`（建议 ${a.quota} 字以内）`)
            if (a.avoid?.trim()) parts.push(`【分工】${a.avoid.trim()}`)
            assignmentMap.set(a.index, parts.join(''))
          }
        } catch (err) {
          console.warn('选题失败，降级为逐槽独立生成：', err)
        } finally {
          inFlightRef.current.delete([...inFlightRef.current][0] ?? '')
        }
      }

      // 写作阶段（编辑部降级或旧流程统一显示，避免阶段展示跳变）
      setPhase('写作中…')

      const CONCURRENCY = 3
      let cursor = 0
      const worker = async (): Promise<void> => {
        while (!cancelRef.current && cursor < tasks.length) {
          const task = tasks[cursor++]
          await runSlotTask(task.slot, task.index, docContext, assignmentMap.get(task.index) ?? '', overrides)
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker))
      console.log(`[gen] 单槽波完成（${tasks.length} 个，剩余接续组 ${continuationGroups.size} / 子槽位 ${childTasks.length}）`)
      if (cancelRef.current) return

      // ---- 接续槽位组：每组一次 AI 调用，输出按分隔符拆分回填（v0.29）----
      if (continuationGroups.size > 0) {
        setPhase('生成接续栏目…')
        for (const [gname, group] of continuationGroups) {
          if (cancelRef.current) break
          console.log(`[gen] 接续组「${gname}」开始（${group.length} 槽）`)
          await runGroupTask(group, docContext, overrides)
          console.log(`[gen] 接续组「${gname}」结束`)
        }
      }

      // ---- 子槽位第二波：父槽已完成，注入父槽产出全文与之衔接（v0.29）----
      if (childTasks.length > 0 && !cancelRef.current) {
        setPhase('生成子栏目…')
        console.log(`[gen] 子槽位波开始（${childTasks.length} 个）`)
        const docAfter = layout.docRef.current
        const all = docAfter.pages.flatMap((p) => p.slots)
        for (const t of childTasks) {
          if (cancelRef.current) break
          const parentId = t.slot.relation?.type === 'child' ? t.slot.relation.parentId : null
          const parent = parentId ? all.find((s) => s.id === parentId) : null
          console.log(
            `[gen] 子槽位「${resolveRoleName(t.slot)}」父槽: ${parent ? `${resolveRoleName(parent)}(${parent.status})` : '未找到（检查父槽位是否设置/父栏 prompt 是否为空）'}`
          )
          const parentContent = parent?.status === 'done' ? parent.content ?? '' : ''
          const extra = parentContent
            ? `【父栏目「${resolveRoleName(parent!)}」已生成内容】\n${parentContent}\n\n请作为其子栏目与之衔接：承接话题、展开细节或提供补充视角，不要重复父栏目已述内容。`
            : ''
          await runSlotTask(t.slot, t.index, docContext, extra, overrides)
        }
      }
      if (cancelRef.current) return

      // ---- 审稿：一次自检调用；意见**自动执行重写**（ROADMAP 反馈：审稿要有牙齿），失败静默忽略 ----
      let reviewFixed = 0
      if (editorial && tasks.length > 0) {
        setPhase('审稿中…')
        try {
          const reviewId = crypto.randomUUID()
          inFlightRef.current.add(reviewId)
          const articles = tasks.map((t) => ({
            index: t.index,
            role: resolveRoleName(t.slot),
            content: docNow.pages.flatMap((p) => p.slots).find((s) => s.id === t.slot.id)?.content ?? ''
          }))
          const valid = articles.filter((a) => a.content.trim())
          if (valid.length > 0) {
            const review = await window.briefy.reviewIssue(reviewId, valid, overrides)
            // 自动执行：按意见逐条重写（顺序，避免并发写冲突）
            for (const c of review.comments) {
              if (cancelRef.current) break
              const task = tasks.find((t) => t.index === c.index)
              if (!task) continue
              await runSlotTask(
                task.slot,
                c.index,
                docContext,
                `【主编审稿指令】审稿发现问题：${c.problem}。${c.instruction}`,
                overrides
              )
              reviewFixed++
            }
          }
        } catch (err) {
          console.warn('审稿失败（忽略，不影响成品）：', err)
        }
      }

      // ---- 质量报告卡（ROADMAP 反馈：让改进可见）----
      collectReport(reviewFixed, overrides)
    } finally {
      cancelRef.current = false
      setPhase(null)
      setHeartbeat(null)
      setGenerating(false)
    }
  }

  /** 还原上次生成前快照（编辑部模式自动保存） */
  const restoreSnapshot = (): void => {
    try {
      const raw = localStorage.getItem('briefy-snapshot')
      if (!raw) {
        window.alert('没有可用的快照')
        return
      }
      layout.loadDoc(JSON.parse(raw) as LayoutDoc)
      window.alert('已还原到上次生成前的版本')
    } catch (err) {
      window.alert('还原失败：' + String(err))
    }
  }

  // dev 自动化：URL 带 ?autodoc=<路径> 时自动加载该 .briefy（配合 CDP 端到端验证）
  const autoDoc = new URLSearchParams(window.location.search).get('autodoc')
  useEffect(() => {
    if (!autoDoc) return
    void window.briefy
      ?.readDocPath(autoDoc)
      .then((raw) => layout.loadDoc(raw))
      .catch((err) => console.error('autodoc 加载失败', err))
    // 仅挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // dev 自动化探针：供 CDP 驱动脚本读取当前文档（始终暴露只读函数，无写入口）
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__briefyGetDoc = () => layout.doc
  })

  const isDark = settings?.theme === 'dark'

  /** 保存设计为 .briefy 文件 */
  const saveDoc = async (): Promise<void> => {
    await window.briefy?.saveDoc(layout.doc)
  }

  /** 打开 .briefy 设计文件 */
  const openDoc = async (): Promise<void> => {
    const doc = await window.briefy?.openDoc()
    if (doc) layout.loadDoc(doc, settings?.sources ?? [])
  }

  /** 导出当前文档为 PDF（把文档 + 主窗口收敛后的每槽 fitScale 传给打印窗口，所见即所得） */
  const exportPdf = async (): Promise<void> => {
    const fits = Object.fromEntries(Object.entries(slotFitsRef.current).map(([id, f]) => [id, f.fit]))
    await window.briefy?.exportPdf(layout.doc, undefined, fits)
  }

  /** 套用排版预设 */
  const applyPreset = (presetId: string): void => {
    const preset = PRESETS.find((p) => p.id === presetId)
    if (preset) layout.loadDoc(buildDocFromPreset(preset))
  }

  // ---- 用户自定义预设 ----
  const [userPresets, setUserPresets] = useState<UserPreset[]>([])

  const refreshUserPresets = useCallback(async (): Promise<void> => {
    const list = await window.briefy?.listUserPresets()
    setUserPresets(list ?? [])
  }, [])

  useEffect(() => {
    void refreshUserPresets()
  }, [refreshUserPresets])

  /** 把当前版面另存为预设（含提示词与工具配置，剥离生成内容） */
  const saveAsPreset = async (name: string): Promise<void> => {
    if (!window.briefy || !name.trim()) return
    const preset: UserPreset = {
      version: 2,
      name: name.trim(),
      savedAt: new Date().toISOString(),
      pages: layout.doc.pages.map((p) => ({ slots: toPresetSlots(p.slots) }))
    }
    const result = await window.briefy.saveUserPreset(preset)
    void refreshUserPresets()
    if (result === 'name-conflict') window.alert('同名预设已存在，已覆盖保存')
  }

  /** 套用用户预设 */
  const applyUserPreset = (preset: UserPreset): void => {
    layout.loadDoc({
      version: 2,
      title: preset.name,
      pages: preset.pages.map((p) => ({
        id: crypto.randomUUID(),
        slots: fromPresetSlots(p.slots, settings?.sources ?? [])
      }))
    })
  }

  const deleteUserPreset = async (name: string): Promise<void> => {
    if (!window.confirm(`删除预设「${name}」？`)) return
    await window.briefy?.deleteUserPreset(name)
    void refreshUserPresets()
  }

  const renameUserPreset = async (oldName: string, newName: string): Promise<void> => {
    if (!newName.trim() || newName === oldName) return
    await window.briefy?.renameUserPreset(oldName, newName.trim())
    void refreshUserPresets()
  }

  const exportUserPreset = async (name: string): Promise<void> => {
    await window.briefy?.exportUserPreset(name)
  }

  const importUserPreset = async (): Promise<void> => {
    const preset = await window.briefy?.importUserPreset()
    if (preset) void refreshUserPresets()
    else if (preset === null) void refreshUserPresets() // 取消或失败都刷新一下
  }

  // 打印模式：从主进程取待导出文档 + 主窗口每槽 fitScale 终值 + 设置快照（同步装载，避免版式/主题竞态），
  // 渲染完成后通知主进程执行 printToPDF
  const [printDoc, setPrintDoc] = useState<LayoutDoc | null>(null)
  const [printFits, setPrintFits] = useState<Record<string, number> | null>(null)
  const [printSettings, setPrintSettings] = useState<AiSettings | null>(null)
  useEffect(() => {
    if (!PRINT_MODE) return
    // 隐藏窗口不滚动：lazy 图片（配图/二维码）永不触发加载 → PDF 空白；打印窗口全部立即加载
    setEagerImages(true)
    // body UA 默认 8px margin 会把 210mm 纸面挤出打印页宽（触发 Chrome 整体缩放 + 底部截断）——
    // @media print 的 CSS reset 是主通道，这里 JS 再设一次双保险（屏幕预览态也直接归零，所见即所得）
    document.body.style.margin = '0'
    void window.briefy?.getExportDoc?.().then((data) => {
      if (!data) return
      setPrintDoc(data.doc)
      setPrintFits(data.fits ?? null)
      setPrintSettings(data.settings)
      // 等待内容与图片都就绪后再通知：固定 100ms 是竞态赌注（图片未加载完 → 高度突变/空白截取）。
      // 图片加载完成（或全部失败）+ 双 rAF（确保绘制帧提交）后通知；5s 硬超时兑底防卡死
      const settle = (): void => {
        requestAnimationFrame(() => requestAnimationFrame(() => void window.briefy?.renderReady?.()))
      }
      const CONVERGE_MS = 350 // 字号收敛每轮一帧（×1.1/×0.9 步进，最多约 4 帧），350ms 足够跑稳
      const waitForImages = (): void => {
        const imgs = [...document.querySelectorAll('img')]
        const pending = imgs.filter((i) => !i.complete)
        if (pending.length === 0) {
          setTimeout(settle, CONVERGE_MS)
          return
        }
        let left = pending.length
        const done = (): void => {
          if (--left === 0) setTimeout(settle, CONVERGE_MS)
        }
        for (const img of pending) {
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
        }
        // 网络图片卡住兑底：4s 后不等了（与主进程 5s 总兑底留余量）
        setTimeout(settle, 4000)
      }
      // 首帧渲染完成后再查图片（此时 img 才真正插入 DOM）
      requestAnimationFrame(() => requestAnimationFrame(waitForImages))
    })
  }, [])
  // 打印模式：仅渲染所有页面的干净版式，供 printToPDF 截取。
  // 主题/版式/主题色全部用导出快照（与主窗口一致）；无快照前不渲染（防用默认版式截取）
  if (PRINT_MODE) {
    if (!printDoc || !printSettings) {
      return <FluentProvider theme={webLightTheme}>
        <div className="print-view" />
      </FluentProvider>
    }
    const accent = printSettings.layout?.accentColor
    const accentVars = accent
      ? ({
          '--colorBrandForeground1': accent,
          '--colorBrandForeground2': accent,
          '--colorBrandStroke1': accent
        } as React.CSSProperties)
      : undefined
    return (
      <FluentProvider theme={printSettings.theme === 'dark' ? webDarkTheme : webLightTheme} style={accentVars}>
        <div className="print-view">
          {printDoc.pages.map((page, pi) => (
            <div key={page.id} className="print-page">
              <PageView
                page={page}
                selectedSlotId={null}
                onSelectSlot={() => undefined}
                manual={printDoc.layoutMode === 'manual'}
                printFits={printFits ?? undefined}
                prefs={printSettings.layout}
                customRoles={printSettings.customRoles}
                docTitle={printDoc.title}
                pageNo={pi + 1}
                totalPages={printDoc.pages.length}
              />
            </div>
          ))}
        </div>
      </FluentProvider>
    )
  }

  // 主题色偏好：覆盖 Fluent 品牌色 CSS 变量（前景/描边），缺省 = Fluent 品牌蓝
  const accent = settings?.layout?.accentColor
  const accentVars = accent
    ? ({
        '--colorBrandForeground1': accent,
        '--colorBrandForeground2': accent,
        '--colorBrandStroke1': accent
      } as React.CSSProperties)
    : undefined

  return (
    <FluentProvider
      theme={isDark ? webDarkTheme : webLightTheme}
      style={{ height: '100vh', ...accentVars }}
    >
      <div className={`${styles.app} ${isDark ? 'theme-dark' : 'theme-light'}`}>
        <FluentToolbar aria-label="主工具栏" className={styles.toolbar}>
          {/* ---- 文件二级菜单：新建/打开/保存/导出 ---- */}
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Tooltip content="新建/打开/保存设计文件，导出 PDF" relationship="description">
                <ToolbarButton icon={<FolderOpenRegular />}>文件</ToolbarButton>
              </Tooltip>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem icon={<DocumentAddRegular />} onClick={layout.newDoc}>
                  新建
                </MenuItem>
                <MenuItem icon={<FolderOpenRegular />} onClick={() => void openDoc()}>
                  打开…
                </MenuItem>
                <MenuItem icon={<SaveRegular />} onClick={() => void saveDoc()}>
                  保存…
                </MenuItem>
                <MenuItem icon={<DocumentPdfRegular />} onClick={() => void exportPdf()}>
                  导出 PDF…
                </MenuItem>
                <MenuItem icon={<ArrowImportRegular />} onClick={restoreSnapshot}>
                  还原上次生成前快照
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Tooltip content="向页面添加一个内容槽位：选角色（头条/正文/数据/快讯/提示框）即可，AI 按角色分工写作，高度随内容自适应" relationship="description">
                <ToolbarButton icon={<AddSquareRegular />}>添加槽位</ToolbarButton>
              </Tooltip>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {(Object.keys(ROLE_DEFS) as SlotRole[])
                  .filter((r) => r !== 'custom')
                  .map((role) => (
                    <MenuItem
                      key={role}
                      onClick={() => layout.addSlot(layout.currentPageId, role, 'full')}
                    >
                      {ROLE_DEFS[role].name}
                    </MenuItem>
                  ))}
                <MenuDivider />
                {(settings?.customRoles?.length ?? 0) > 0 &&
                  (settings?.customRoles ?? []).map((c) => (
                    <MenuItem
                      key={c.name}
                      onClick={() => layout.addSlot(layout.currentPageId, 'custom', 'full', '', c.name)}
                    >
                      {c.name}
                    </MenuItem>
                  ))}
              </MenuList>
            </MenuPopover>
          </Menu>
          <Tooltip
            content="订阅：把当前设计固化为模板，点击即按模板出一期 PDF（带往期记忆，可连载）"
            relationship="description"
          >
            <ToolbarButton
              icon={<AppsRegular />}
              onClick={() => setSubsOpen(true)}
            >
              订阅
            </ToolbarButton>
          </Tooltip>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Tooltip content="一键套用整套版面（槽位+提示词+工具）；也可把当前版面存为自己的预设" relationship="description">
                <ToolbarButton icon={<AppsRegular />}>预设</ToolbarButton>
              </Tooltip>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuGroup>
                  <MenuGroupHeader>内置预设</MenuGroupHeader>
                  {PRESETS.map((preset) => (
                    <MenuItem key={preset.id} onClick={() => applyPreset(preset.id)}>
                      <div>
                        <div>{preset.name}</div>
                        <div style={{ fontSize: 11, color: tokens.colorNeutralForeground3 }}>
                          {preset.description}
                        </div>
                      </div>
                    </MenuItem>
                  ))}
                </MenuGroup>
                <MenuDivider />
                <MenuGroup>
                  <MenuGroupHeader>我的预设</MenuGroupHeader>
                  <MenuItem
                    icon={<SaveRegular />}
                    onClick={() =>
                      setInputDialog({
                        title: '保存为预设',
                        label: '预设名称',
                        initialValue: layout.doc.title,
                        onConfirm: (name) => void saveAsPreset(name)
                      })
                    }
                  >
                    把当前版面存为预设…
                  </MenuItem>
                  <MenuItem icon={<ArrowImportRegular />} onClick={() => void importUserPreset()}>
                    导入预设…
                  </MenuItem>
                  {userPresets.length > 0 && <MenuDivider />}
                  {userPresets.map((preset) => (
                    <MenuItem key={preset.name} onClick={() => applyUserPreset(preset)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200 }}>
                        <span style={{ flex: 1 }}>{preset.name}</span>
                        <span
                          role="button"
                          aria-label={`重命名 ${preset.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setInputDialog({
                              title: '重命名预设',
                              label: '新名称',
                              initialValue: preset.name,
                              onConfirm: (newName) => void renameUserPreset(preset.name, newName)
                            })
                          }}
                        >
                          <EditRegular fontSize={14} />
                        </span>
                        <span
                          role="button"
                          aria-label={`导出 ${preset.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            void exportUserPreset(preset.name)
                          }}
                        >
                          <ArrowExportLtrRegular fontSize={14} />
                        </span>
                        <span
                          role="button"
                          aria-label={`删除 ${preset.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            void deleteUserPreset(preset.name)
                          }}
                        >
                          <DeleteRegular fontSize={14} style={{ color: '#c50f1f' }} />
                        </span>
                      </div>
                    </MenuItem>
                  ))}
                </MenuGroup>
              </MenuList>
            </MenuPopover>
          </Menu>
          <Tooltip
            content={
              layout.doc.layoutMode === 'manual'
                ? '当前：手动布局——拖拽移动槽位、拖右下角缩放；点此回到自动排布'
                : '切换到手动布局：像 Word 调图片一样自由拖动槽位位置、拖角缩放大小（当前自动排布位置会固化）'
            }
            relationship="description"
          >
            <ToolbarButton
              icon={<EditRegular />}
              style={{ marginRight: 14 }}
              appearance={layout.doc.layoutMode === 'manual' ? 'primary' : undefined}
              onClick={() => layout.setMode(layout.doc.layoutMode === 'manual' ? 'auto' : 'manual')}
            >
              {layout.doc.layoutMode === 'manual' ? '手动布局' : '自动排布'}
            </ToolbarButton>
          </Tooltip>
          <Tooltip content={generating ? `${phase ?? '生成中'}·点击终止全部任务` : '让 AI 填充全部槽位：按各槽位的角色与提示词并行写作；可在设置中配置模型与信息源'} relationship="description">
            <ToolbarButton
              icon={<WandRegular />}
              disabled={!hasApiKey}
              appearance={generating ? undefined : hasApiKey ? 'primary' : undefined}
              onClick={() => void generateAll()}
            >
              {generating ? '终止' : '生成'}
            </ToolbarButton>
          </Tooltip>
          <Tooltip content={isDark ? '切换到亮色模式' : '切换到暗色模式（主题偏好会保存）'} relationship="description">
            <ToolbarButton
              icon={isDark ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
              onClick={() => void toggleTheme()}
            >
              {isDark ? '亮色' : '暗色'}
            </ToolbarButton>
          </Tooltip>
          <Tooltip content="配置 AI 服务（API Key/模型）、信息源、搜索 Key" relationship="description">
            <ToolbarButton
              icon={<SettingsRegular />}
              onClick={() => setSettingsOpen(true)}
              {...(hasApiKey ? {} : { appearance: 'primary' as const })}
            >
              设置{hasApiKey ? '' : '（未配置）'}
            </ToolbarButton>
          </Tooltip>
        </FluentToolbar>

        <div className={styles.workspace}>
          <div className={styles.canvasScroll}>
            {layout.doc.pages
              .filter((page) => page.id === layout.currentPageId)
              .map((page) => (
                <PageView
                  key={page.id}
                  page={page}
                  selectedSlotId={layout.selectedSlotId}
                  onSelectSlot={layout.selectSlot}
                  onOverflow={layout.growSlotOverflow}
                  manual={layout.doc.layoutMode === 'manual'}
                  onMoveSlot={layout.moveSlot}
                  onResizeSlot={layout.resizeSlot}
                  onFit={handleFit}
                  prefs={settings?.layout}
                  customRoles={settings?.customRoles}
                  docTitle={layout.doc.title}
                  pageNo={layout.doc.pages.findIndex((p) => p.id === page.id) + 1}
                  totalPages={layout.doc.pages.length}
                />
              ))}
          </div>
          <PropertiesPanel
            slot={layout.selection?.slot ?? null}
            commonSources={settings?.sources ?? []}
            customRoles={settings?.customRoles ?? []}
            parentOptions={layout.doc.pages.flatMap((p, pi) =>
              p.slots
                .filter((s) => s.id !== layout.selectedSlotId && !(s.relation?.type === 'child'))
                .map((s) => ({ id: s.id, label: `第${pi + 1}页 · ${resolveRoleName(s, settings?.customRoles)}${s.prompt ? `（${s.prompt.slice(0, 16)}…）` : ''}` }))
            )}
            onAddCommonSources={(srcs) => {
              if (!settings) return
              // 去重合并进常用源库并持久化（按 name+url 判重）
              const existing = new Set(settings.sources.map((s) => `${s.name}|${s.url}`))
              const merged = [...settings.sources, ...srcs.filter((s) => !existing.has(`${s.name}|${s.url}`))]
              const updated = { ...settings, sources: merged }
              setSettings(updated)
              void window.briefy?.saveSettings?.(updated)
            }}
            onGenerateSlot={(slot) => {
              if (layout.selection) {
                const index = layout.doc.pages
                  .flatMap((p) => p.slots)
                  .findIndex((s) => s.id === slot.id)
                void generateOne(slot, Math.max(0, index))
              }
            }}
            onChange={(patch) => {
              if (layout.selection) {
                layout.updateSlot(layout.selection.slot.id, patch)
              }
            }}
            onSetWidth={(widthMode) => {
              if (layout.selection) {
                layout.setSlotWidth(layout.selection.page.id, layout.selection.slot.id, widthMode)
              }
            }}
            onRemove={() => {
              if (layout.selection) {
                layout.removeSlot(layout.selection.page.id, layout.selection.slot.id)
              }
            }}
          />
        </div>

        <PageTabs
          pages={layout.doc.pages}
          currentPageId={layout.currentPageId}
          onSelect={layout.setCurrentPageId}
          onAdd={layout.addPage}
          onRemove={layout.removePage}
          onMove={layout.movePage}
        />

        <StatusBar version="0.24.0" hasApiKey={hasApiKey} phase={phase} />

        {/* AI 工作台浮动面板：实时展示流式输出（心跳改进：可直读内容） */}
        {generating && heartbeat !== null && (
          <HeartbeatPanel phase={phase} text={heartbeat} onCancel={() => void generateAll()} />
        )}

        <SettingsDialog
          open={settingsOpen}
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(updated) => setSettings(updated)}
        />

        <InputDialog
          open={inputDialog !== null}
          title={inputDialog?.title ?? ''}
          label={inputDialog?.label ?? ''}
          initialValue={inputDialog?.initialValue ?? ''}
          onConfirm={(value) => {
            inputDialog?.onConfirm(value)
            setInputDialog(null)
          }}
          onCancel={() => setInputDialog(null)}
        />

      {/* 订阅管理（v0.26）：模板固化出刊 */}
      <SubscriptionDialog
        open={subsOpen}
        onClose={() => setSubsOpen(false)}
        currentDoc={layout.doc}
        currentSettings={settings ?? DEFAULT_SETTINGS}
        onPushIssue={(sub, stamp) => pushSubscriptionIssue(sub, stamp)}
        generating={generating}
        phase={phase}
      />

      {/* 质量报告卡（ROADMAP 反馈：让改进可见） */}
        <Dialog open={qualityReport !== null} onOpenChange={(_, d) => { if (!d.open) setQualityReport(null) }}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>本期质量报告</DialogTitle>
              <DialogContent>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: tokens.fontSizeBase200 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` }}>
                      <th style={{ padding: '4px 6px' }}>槽位</th>
                      <th style={{ padding: '4px 6px' }}>状态</th>
                      <th style={{ padding: '4px 6px' }}>体积/上限</th>
                      <th style={{ padding: '4px 6px' }}>重写</th>
                      <th style={{ padding: '4px 6px' }}>来源</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qualityReport?.rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${tokens.colorNeutralStroke2}` }}>
                        <td style={{ padding: '4px 6px' }}>{r.role}</td>
                        <td style={{ padding: '4px 6px', color: r.status === 'done' ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteRedForeground1 }}>
                          {r.status === 'done' ? '✓ 完成' : r.status === 'error' ? '✗ 失败' : r.status}
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          {r.status === 'done' ? (
                            <span style={{ color: r.ok ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteRedForeground1 }}>
                              {r.len}/{r.limit} {r.ok ? '✓' : '偏差大'}
                              {r.fit !== undefined && Math.abs(r.fit - 1) > 0.03 ? ` · 字号 ${Math.round(r.fit * 100)}%` : ''}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={{ padding: '4px 6px' }}>{r.rewrites ? `×${r.rewrites}` : '—'}</td>
                        <td style={{ padding: '4px 6px' }}>{r.hasSource ? '✓' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 }}>
                  {qualityReport?.reviewFixed ? <span>🪄 审稿自动修复：{qualityReport.reviewFixed} 处</span> : null}
                  {qualityReport?.usage ? (
                    <span>
                      Token 用量：输入 {qualityReport.usage.promptTokens} + 输出 {qualityReport.usage.completionTokens} = {qualityReport.usage.totalTokens}
                    </span>
                  ) : null}
                  <span>生成前的版本已存为快照（文件 → 还原上次生成前快照）。适配状态以渲染实测为准（偏差时自动调字号），点「刷新」获取最新。</span>
                </div>
              </DialogContent>
              <DialogActions>
                <Button icon={<ArrowClockwiseRegular />} onClick={() => collectReport(qualityReport?.reviewFixed ?? 0)}>
                  刷新
                </Button>
                <DialogTrigger disableButtonEnhancement>
                  <Button appearance="primary">好的</Button>
                </DialogTrigger>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      </div>
    </FluentProvider>
  )
}

export default App
