import type * as React from 'react'
import { useEffect, useState } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  makeStyles,
  ProgressBar,
  Text,
  tokens,
  Tooltip
} from '@fluentui/react-components'
import { ArrowClockwiseRegular, DeleteRegular, FolderOpenRegular, SendRegular, AddRegular } from '@fluentui/react-icons'
import type { AiSettings } from '../../../shared/settings'
import type { LayoutDoc } from '../../../shared/layout'
import type { Subscription } from '../../../shared/subscription'

const useStyles = makeStyles({
  subItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '10px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`
  },
  subHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  subName: {
    fontWeight: tokens.fontWeightSemibold,
    flex: 1
  },
  subMeta: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2
  },
  issueList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    paddingLeft: '12px',
    fontSize: tokens.fontSizeBase200
  },
  issueRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  actions: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap'
  },
  hint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2
  }
})

interface SubscriptionDialogProps {
  open: boolean
  onClose: () => void
  /** 当前文档与设置（新建订阅时存为模板） */
  currentDoc: LayoutDoc
  currentSettings: AiSettings
  /** 推送新一期 / 重新出刊指定期（出刊流程由 App 执行） */
  onPushIssue: (sub: Subscription, stamp?: string) => Promise<void>
  /** 出刊进行中（禁用推送按钮，展示阶段进度） */
  generating: boolean
  phase: string | null
}

/** 订阅管理（v0.26）：模板固化出刊——推送新一期 PDF / 删除 / 重新出刊指定期 / 打开归档目录 */
function SubscriptionDialog({ open, onClose, currentDoc, currentSettings, onPushIssue, generating, phase }: SubscriptionDialogProps): React.JSX.Element {
  const styles = useStyles()
  const [subs, setSubs] = useState<Subscription[]>([])
  const [newName, setNewName] = useState('')
  const [newExpFit, setNewExpFit] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = async (): Promise<void> => {
    setSubs((await window.briefy?.listSubscriptions?.()) ?? [])
  }
  useEffect(() => {
    if (open) void refresh()
  }, [open])

  /** 把当前文档 + 当前设置存为订阅模板 */
  const createFromCurrent = async (): Promise<void> => {
    if (!newName.trim() || !window.briefy?.saveSubscription) return
    const sub: Subscription = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      createdAt: new Date().toLocaleString('zh-CN'),
      experimentalLayoutFit: newExpFit || undefined,
      template: {
        doc: structuredClone(currentDoc),
        layout: currentSettings.layout,
        baseUrl: currentSettings.baseUrl,
        model: currentSettings.model,
        theme: currentSettings.theme,
        stylePrompt: currentSettings.stylePrompt,
        roleDuties: currentSettings.roleDuties,
        customRoles: currentSettings.customRoles,
        editorial: currentSettings.editorial
      },
      memory: { recent: [], digest: '' },
      issues: []
    }
    await window.briefy.saveSubscription(sub)
    setNewName('')
    await refresh()
  }

  const push = async (sub: Subscription, stamp?: string): Promise<void> => {
    setBusy(true)
    try {
      await onPushIssue(sub, stamp)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const inFlight = generating || busy

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open && !inFlight) onClose() }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>订阅管理</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Text size={200} className={styles.hint}>
                订阅 = 把当前设计固化为模板：布局/模型/主题/角色全部锁定，每次推送即按模板出一期 PDF（带往期记忆，不重复、可连载）。API Key 不存入模板，出刊时用当前配置。
              </Text>

              {/* 新建订阅：当前文档另存为模板 */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <Field label="新建订阅（以当前文档与设置为模板）">
                  <Input
                    size="small"
                    placeholder="订阅名称，如：每日科技报"
                    value={newName}
                    onChange={(_, d) => setNewName(d.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void createFromCurrent()}
                  />
                </Field>
                <Button icon={<AddRegular />} appearance="primary" disabled={!newName.trim()} onClick={() => void createFromCurrent()}>
                  创建
                </Button>
              </div>
              <Checkbox
                label="实验性：出刊时自动适配版面（自动调整槽位高度/位置与字号以贴合内容；手动布局订阅可用；默认关闭 = 严格保持模板几何）"
                checked={newExpFit}
                onChange={(_, d) => setNewExpFit(d.checked === true)}
              />
              {/* 订阅列表 */}
              {subs.length === 0 && <Text size={200}>还没有订阅。先排版一份报纸，再在这里把它创建为订阅。</Text>}
              {subs.map((sub) => {
                const last = sub.issues[sub.issues.length - 1]
                return (
                  <div key={sub.id} className={styles.subItem}>
                    <div className={styles.subHead}>
                      <span className={styles.subName}>{sub.name}</span>
                      <span className={styles.subMeta}>
                        已出刊 {sub.issues.length} 期{last ? ` · 最近 ${last.issuedAt}` : ''}
                        {last && !last.quality.passed ? ` · ⚠ ${last.quality.issues.length} 处瑕疵` : ''}
                      </span>
                    </div>
                    <div className={styles.actions}>
                      <Tooltip content={inFlight ? '出刊进行中…' : '按模板生成新一期并归档 PDF'} relationship="description">
                        <Button
                          icon={<SendRegular />}
                          appearance="primary"
                          size="small"
                          disabled={inFlight}
                          onClick={() => void push(sub)}
                        >
                          推送新一期
                        </Button>
                      </Tooltip>
                      <Button icon={<FolderOpenRegular />} size="small" appearance="subtle" onClick={() => void window.briefy?.openSubscriptionFolder?.(sub.id)}>
                        打开归档
                      </Button>
                      {sub.issues.length > 0 && (
                        <Button size="small" appearance="subtle" onClick={() => setExpanded(expanded === sub.id ? null : sub.id)}>
                          {expanded === sub.id ? '收起期记录' : `期记录（${sub.issues.length}）`}
                        </Button>
                      )}
                      <Button
                        icon={<DeleteRegular />}
                        size="small"
                        appearance="subtle"
                        onClick={() => {
                          if (window.confirm(`删除订阅「${sub.name}」？归档的 PDF 将一并删除。`)) {
                            void window.briefy?.deleteSubscription?.(sub.id).then(refresh)
                          }
                        }}
                      >
                        删除
                      </Button>
                    </div>

                    {/* 期记录：可重新出刊指定期（覆盖该期 PDF 与记录） */}
                    {expanded === sub.id && (
                      <div className={styles.issueList}>
                        {[...sub.issues].reverse().map((r) => (
                          <div key={r.id} className={styles.issueRow}>
                            <span style={{ flex: 1 }}>
                              {r.issuedAt}
                              {r.quality.passed ? ' ✓' : ` ⚠ ${r.quality.issues.length} 处瑕疵`}
                              {r.quality.repaired > 0 ? `（自动重生成 ${r.quality.repaired} 槽）` : ''}
                            </span>
                            <Tooltip content="按模板重新生成该期（覆盖该期 PDF）" relationship="description">
                              <Button
                                icon={<ArrowClockwiseRegular />}
                                size="small"
                                appearance="subtle"
                                disabled={inFlight}
                                aria-label={`重新出刊 ${r.issuedAt}`}
                                onClick={() => {
                                  const stamp = r.pdfPath.slice(r.pdfPath.lastIndexOf('\\') + 1, -4)
                                  void push(sub, stamp)
                                }}
                              />
                            </Tooltip>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {inFlight && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <ProgressBar />
                  <Text size={200}>{phase ?? '出刊中…'}</Text>
                </div>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={inFlight}>
              关闭
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export default SubscriptionDialog
