import { Text } from '@fluentui/react-components'

interface StatusBarProps {
  version: string
  hasApiKey: boolean
}

function StatusBar({ version, hasApiKey }: StatusBarProps): JSX.Element {
  const aiStatus = hasApiKey ? 'AI 已配置' : 'AI 未配置'
  return (
    <footer className="status-bar">
      <span>就绪</span>
      <Text size={200}>{aiStatus}</Text>
      <span>v{version}</span>
    </footer>
  )
}

export default StatusBar
