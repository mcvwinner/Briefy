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

const useStyles = makeStyles({
  apiKeyInput: { width: '100%' },
  hint: { marginTop: '4px', fontSize: '12px' }
})

interface SettingsDialogProps {
  open: boolean
  settings: AiSettings | null
  onClose: () => void
  /** 保存成功后回传最新配置 */
  onSaved?: (settings: AiSettings) => void
}

/** AI 服务设置弹窗：API Key / Base URL / 模型名 */
function SettingsDialog({ open, settings, onClose, onSaved }: SettingsDialogProps): JSX.Element | null {
  const styles = useStyles()
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [tavilyKey, setTavilyKey] = useState('')

  // 每次打开时同步当前已保存的配置
  useEffect(() => {
    if (open && settings) {
      setApiKey(settings.apiKey)
      setBaseUrl(settings.baseUrl)
      setModel(settings.model)
      setTavilyKey(settings.tavilyKey ?? '')
    }
  }, [open, settings])

  if (!open) return null

  const save = async (): Promise<void> => {
    const updated: AiSettings = {
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      theme: settings?.theme ?? 'light',
      tavilyKey: tavilyKey.trim()
    }
    try {
      if (window.briefy) {
        await window.briefy.saveSettings(updated)
        onSaved?.(updated)
      }
      onClose()
    } catch (err) {
      // IPC 失败也要保证弹窗可关闭，并暴露错误信息
      console.error('保存设置失败', err)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose() }}>
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
            <Field label="Tavily 搜索 Key（可选）">
              <Input
                className={styles.apiKeyInput}
                type="password"
                placeholder="用于联网搜索工具，tavily.com 免费申请"
                value={tavilyKey}
                onChange={(_, data) => setTavilyKey(data.value)}
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