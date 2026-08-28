import { useEffect, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input
} from '@fluentui/react-components'

interface InputDialogProps {
  open: boolean
  title: string
  label: string
  initialValue?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

/**
 * 通用文本输入对话框。
 * Electron 不支持 window.prompt()，所有需要用户输入文本的场景必须用此组件。
 */
function InputDialog({ open, title, label, initialValue = '', onConfirm, onCancel }: InputDialogProps): React.JSX.Element {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    if (open) setValue(initialValue)
  }, [open, initialValue])

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) onCancel() }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            <Field label={label}>
              <Input
                value={value}
                autoFocus
                onChange={(_, d) => setValue(d.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && value.trim()) onConfirm(value.trim())
                }}
              />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onCancel}>
              取消
            </Button>
            <Button appearance="primary" disabled={!value.trim()} onClick={() => onConfirm(value.trim())}>
              确定
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export default InputDialog
