/** 工具栏按钮定义 */
interface ToolButton {
  id: string
  label: string
  /** 暂未实现的功能置灰 */
  disabled?: boolean
}

const LEFT_BUTTONS: ToolButton[] = [
  { id: 'new', label: '新建' },
  { id: 'open', label: '打开', disabled: true },
  { id: 'save', label: '保存', disabled: true },
  { id: 'add-block', label: '添加内容', disabled: true },
  { id: 'generate', label: '生成', disabled: true }
]

const RIGHT_BUTTONS: ToolButton[] = [{ id: 'settings', label: '设置', disabled: true }]

function Toolbar(): JSX.Element {
  const renderGroup = (buttons: ToolButton[]): JSX.Element[] =>
    buttons.map((btn) => (
      <button key={btn.id} className="tool-btn" disabled={btn.disabled} type="button">
        {btn.label}
      </button>
    ))

  return (
    <header className="toolbar">
      <div className="toolbar-group">{renderGroup(LEFT_BUTTONS)}</div>
      <div className="toolbar-group">{renderGroup(RIGHT_BUTTONS)}</div>
    </header>
  )
}

export default Toolbar
