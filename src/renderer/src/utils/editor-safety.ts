/** 输入控件获得焦点时，画布级快捷键必须让位给文本编辑。 */
export function isEditingTarget(
  target: { tagName?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null } | null
): boolean {
  if (!target) return false
  const tag = target.tagName?.toLowerCase()
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable === true ||
    target.getAttribute?.('role') === 'textbox'
  )
}

/** 等待任务真正结束后再清理计时器；只有超时才触发取消回调。 */
export async function waitWithTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout: () => unknown | Promise<unknown>
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const watchdog = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void onTimeout()
      reject(new Error(message))
    }, timeoutMs)
  })
  try {
    return await Promise.race([task, watchdog])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
