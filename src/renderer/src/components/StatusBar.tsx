interface StatusBarProps {
  version: string
}

function StatusBar({ version }: StatusBarProps): JSX.Element {
  return (
    <footer className="status-bar">
      <span>就绪</span>
      <span>v{version}</span>
    </footer>
  )
}

export default StatusBar
