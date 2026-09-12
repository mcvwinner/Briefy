import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { createEmptyDoc, parseLayoutDoc } from '../src/shared/layout.ts'
import { PRESETS, buildDocFromPreset } from '../src/shared/presets.ts'
import {
  contentKey,
  enforceFixedGeometry,
  geometryEquals,
  resolveLayoutPolicy,
  snapshotGeometry
} from '../src/shared/layout-policy.ts'

assert.equal(resolveLayoutPolicy(createEmptyDoc()), 'fixed', '新文档默认固定版式')
for (const preset of PRESETS) {
  assert.equal(resolveLayoutPolicy(buildDocFromPreset(preset)), 'fixed', `内置模板 ${preset.id} 默认固定版式`)
}

const legacyAuto = parseLayoutDoc(JSON.stringify({ version: 2, title: '旧文档', pages: [] }))
assert.equal(resolveLayoutPolicy(legacyAuto), 'flow', '未声明模式的旧 v2 文档保持原有流式语义')
const legacyManual = parseLayoutDoc(JSON.stringify({ version: 2, title: '旧固定文档', layoutMode: 'manual', pages: [] }))
assert.equal(resolveLayoutPolicy(legacyManual), 'fixed', '旧 manual 文档保持固定语义')

const before = buildDocFromPreset(PRESETS[0])
const first = before.pages[0].slots[0]
const drifted = structuredClone(before)
drifted.pages[0].slots[0] = {
  ...drifted.pages[0].slots[0],
  region: { ...drifted.pages[0].slots[0].region, y: 99 },
  estHeight: first.estHeight + 40,
  overflow: 12,
  content: '生成后的新内容',
  status: 'done'
}
assert.equal(geometryEquals(snapshotGeometry(before), snapshotGeometry(drifted)), false, '测试样例必须能发现几何漂移')
const restored = enforceFixedGeometry(before, drifted)
assert.equal(geometryEquals(snapshotGeometry(before), snapshotGeometry(restored)), true, '固定版式保险丝恢复原始几何')
assert.equal(restored.pages[0].slots[0].content, '生成后的新内容', '恢复几何时保留最新生成内容')
assert.equal(restored.pages[0].slots[0].status, 'done', '恢复几何时保留最新生成状态')

assert.equal(contentKey('同一内容'), contentKey('同一内容'), '相同内容指纹稳定')
assert.notEqual(contentKey('第一稿'), contentKey('第二稿'), '不同稿件不能复用旧测量')

const appSource = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf-8')
assert.match(appSource, /layout\.doc\.layoutMode === 'auto' \? layout\.growSlotOverflow : undefined/, '固定版式不得接收扩高回调')
assert.match(appSource, /layout\.docRef\.current\.pages\.flatMap/, '审稿与质检必须读取最新文档引用')
assert.doesNotMatch(appSource, /layoutFitEnabled/, '订阅专属实验适配分叉必须移除')
assert.doesNotMatch(appSource, /\.filter\(\(page\) => page\.id === layout\.currentPageId\)/, '所有页面都必须挂载以完成实测')

console.log('✅ 固定/流式版式策略全部断言通过')
