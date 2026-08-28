/**
 * IPC 桥一致性校验：确保 preload 调用的每个 channel 主进程都有注册。
 * 用法：node scripts/check-ipc.mjs（构建后运行）
 * 退出码非 0 = 存在断桥。
 */
import { readFileSync } from 'node:fs'

const preload = readFileSync('out/preload/index.mjs', 'utf-8')
const mainFiles = ['src/main/settings.ts', 'src/main/doc.ts', 'src/main/export.ts', 'src/main/user-presets.ts']

const preloadChannels = [...preload.matchAll(/invoke\("([^"]+)"/g)].map((m) => m[1])

// 主进程 handle 可能跨行，先拼接全部源码再匹配
const mainSource = mainFiles.map((f) => readFileSync(f, 'utf-8')).join('\n')
const mainChannels = [...mainSource.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)].map((m) => m[1])

const broken = preloadChannels.filter((c) => !mainChannels.includes(c))
const unused = mainChannels.filter((c) => !preloadChannels.includes(c))

if (broken.length > 0) {
  console.error('❌ 断桥（preload 调用但主进程未注册）:', broken)
  process.exit(1)
}
console.log('✅ preload 全部 channel 已注册')
console.log('未通过桥暴露的 channel（如有）:', unused.length ? unused : '无')
