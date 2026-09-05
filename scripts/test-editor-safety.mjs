import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { isEditingTarget, waitWithTimeout } from '../src/renderer/src/utils/editor-safety.ts'

assert.equal(isEditingTarget({ tagName: 'TEXTAREA' }), true, 'Textarea 内的 Delete 应留给文本编辑')
assert.equal(isEditingTarget({ tagName: 'INPUT' }), true, 'Input 内的 Delete 应留给文本编辑')
assert.equal(isEditingTarget({ tagName: 'DIV', isContentEditable: true }), true, '可编辑区域应留给文本编辑')
assert.equal(isEditingTarget({ tagName: 'DIV', getAttribute: (name) => name === 'role' ? 'textbox' : null }), true)
assert.equal(isEditingTarget({ tagName: 'DIV' }), false, '画布上的 Delete 可以删除槽位')

let timeoutCount = 0
const completed = await waitWithTimeout(Promise.resolve('完成'), 20, '不应超时', () => { timeoutCount++ })
assert.equal(completed, '完成')
await new Promise((resolve) => setTimeout(resolve, 30))
assert.equal(timeoutCount, 0, '任务成功后必须清除看门狗，不能再取消已完成任务')

await assert.rejects(
  waitWithTimeout(new Promise(() => undefined), 10, '预期超时', () => { timeoutCount++ }),
  /预期超时/
)
assert.equal(timeoutCount, 1, '只有真正超时时才执行取消')

const appSource = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf-8')
assert.match(appSource, /slot\.estHeight,\s*overrides,\s*slot\.region\.width\s*\)/, '普通槽位生成必须传实际栏宽')
assert.doesNotMatch(appSource, /StatusBar version="0\.24\.0"/, '状态栏不得继续硬编码旧版本')

console.log('✅ 编辑安全与生成生命周期全部断言通过')
