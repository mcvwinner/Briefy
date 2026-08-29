import { ipcMain, shell } from 'electron'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { Subscription } from '../shared/subscription'

/** 订阅持久化（v0.26）：userData/subscriptions/<id>.json（模板+记忆+期记录），
 *  PDF 归档在 userData/subscriptions/<id>/issues/<时间戳>.pdf */

const subsDir = (): string => join(app.getPath('userData'), 'subscriptions')
const subFile = (id: string): string => join(subsDir(), `${id}.json`)
const issuesDir = (id: string): string => join(subsDir(), id, 'issues')

export function registerSubscriptionsIpc(): void {
  ipcMain.handle('subscriptions:list', async (): Promise<Subscription[]> => {
    try {
      const files = (await readdir(subsDir())).filter((f) => f.endsWith('.json'))
      const subs = await Promise.all(
        files.map(async (f) => {
          try {
            return JSON.parse(await readFile(join(subsDir(), f), 'utf-8')) as Subscription
          } catch {
            return null
          }
        })
      )
      return subs.filter((s): s is Subscription => s !== null)
    } catch {
      return [] // 目录不存在 = 尚无订阅
    }
  })

  ipcMain.handle('subscriptions:save', async (_event, sub: Subscription) => {
    await mkdir(subsDir(), { recursive: true })
    await writeFile(subFile(sub.id), JSON.stringify(sub, null, 2), 'utf-8')
    return true
  })

  ipcMain.handle('subscriptions:delete', async (_event, id: string) => {
    await rm(subFile(id), { force: true })
    await rm(join(subsDir(), id), { recursive: true, force: true }) // 归档目录一并删除
    return true
  })

  /** 取某期 PDF 归档路径（出刊前调用；传 stamp 重新生成指定期时覆盖原路径） */
  ipcMain.handle('subscriptions:issue-path', async (_event, id: string, stamp?: string) => {
    await mkdir(issuesDir(id), { recursive: true })
    const ts =
      stamp ??
      new Date()
        .toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        .replace(/[\s:]/g, '-')
    return join(issuesDir(id), `${ts}.pdf`)
  })

  ipcMain.handle('subscriptions:open-folder', async (_event, id: string) => {
    await mkdir(issuesDir(id), { recursive: true })
    return shell.openPath(issuesDir(id))
  })
}
