import { useEffect, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  makeStyles
} from '@fluentui/react-components'
import type { AiSettings } from '../../shared/settings'

declare global {
  interface Window {
    briefy?: {
      getSettings(): Promise<AiSettings>
      saveSettings(settings: AiSettings): Promise<void>
    }
  }
}

const useStyles = makeStyles({
  apiKeyInput: { width: '100%' },
  hint: { marginTop: '4px', fontSize: '12px' }
})

interface SettingsDialogProps {
  open: boolean
  settings: AiSettings | null
  onClose: () => void
}

/** AI 服务设置弹窗：API Key / Base URL / 模型名 */
function SettingsDialog({ open, settings, onClose }: SettingsDialogProps): JSX.Element | null {
  const styles = useStyles()
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')

  // 每次打开时同步当前已保存的配置
  useEffect(() => {
    if (open && settings) {
      setApiKey(settings.apiKey)
      setBaseUrl(settings.baseUrl)
      setModel(settings.model)
    }
  }, [open, settings])

  if (!open) return null

  const save = async (): Promise<void> => {
    if (!window.briefy) {
      // 非 Electron 环境（如浏览器直开 dev server）无法持久化
      onClose()
      return
    }
    await window.briefy.saveSettings({ apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim() })
    onClose()
  }

  return (
    <Dialog modalType="alert" open={open}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>AI 服务设置</DialogTitle>
          <DialogContent>
            <Field label="API Key" required>
              <Input
                className={styles.apiKeyInput}
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(_, data) => setApiKey(data.value)}
              />
            </Field>
            <Field label="Base URL">
              <Input
                className={styles.apiKeyInput}
                placeholder="https://api.openai.com/v1（或任意 OpenAI 兼容地址）"
                value={baseUrl}
                onChange={(_, data) => setBaseUrl(data.value)}
              />
            </Field>
            <Field label="模型名">
              <Input
                className={styles.apiKeyInput}
                placeholder="gpt-4o-mini、deepseek-chat 等"
                value={model}
                onChange={(_, data) => setModel(data.value)}
              />
            </Field>
            <p className={styles.hint}>
              支持任意 OpenAI 兼容接口。Key 仅保存在本机，不会上传。
            </p>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">取消</Button>
            </DialogTrigger>
            <Button appearance="primary" disabled={!apiKey.trim()} onClick={() => void save()}>
              保存
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export default SettingsDialog