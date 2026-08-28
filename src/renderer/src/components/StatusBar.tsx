import type * as React from 'react'
import { makeStyles, Text, tokens } from '@fluentui/react-components'
import {
  CheckmarkCircleRegular,
  ErrorCircleRegular
} from '@fluentui/react-icons'

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    height: '28px',
    padding: '0 12px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0
  },
  item: { display: 'flex', alignItems: 'center', gap: '4px' },
  ready: { color: tokens.colorPaletteGreenForeground1 },
  warn: { color: tokens.colorPaletteRedForeground1 }
})

interface StatusBarProps {
  version: string
  hasApiKey: boolean
  /** 当前编辑部阶段（选题中/写作中/审稿中）；空 = 就绪 */
  phase?: string | null
}

/** Fluent 风格状态栏：浅灰底 + 语义色状态图标（Office 同款布局语言） */
function StatusBar({ version, hasApiKey, phase }: StatusBarProps): React.JSX.Element {
  const styles = useStyles()
  return (
    <footer className={styles.bar}>
      <Text size={200}>{phase ?? '就绪'}</Text>
      <span className={`${styles.item} ${hasApiKey ? styles.ready : styles.warn}`}>
        {hasApiKey ? <CheckmarkCircleRegular /> : <ErrorCircleRegular />}
        <Text size={200}>{hasApiKey ? 'AI 已配置' : 'AI 未配置'}</Text>
      </span>
      <span style={{ marginLeft: 'auto' }}>
        <Text size={200}>v{version}</Text>
      </span>
    </footer>
  )
}

export default StatusBar
