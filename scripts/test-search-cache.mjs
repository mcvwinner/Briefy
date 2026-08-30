/**
 * 搜索缓存单测（v0.33.2，零网络依赖）：验证 tavilySearch 的当日缓存 + in-flight 合并。
 * 用法：node --experimental-strip-types scripts/test-search-cache.mjs（或 npm run test:search-cache）
 * 原理：拦截全局 fetch 计数请求数（Tavily 走 https），请求体里带查询词——
 * 「同词并发只发 1 次」「隔段时间同词命中缓存 0 次」「不同词各发 1 次」均可精确断言。
 */
import assert from 'node:assert'

// tools.ts 顶部 import { net } from 'electron'——单测环境无 electron 运行时，
// 用 ESM loader 桩把 electron 解析到 data URL 模块（node_modules 里的同名包不含 net）
const stubUrl = 'data:text/javascript,' + encodeURIComponent('export const net = {}; export default {}')
const { register } = await import('node:module')
register(
  'data:text/javascript,' +
    encodeURIComponent(
      'export async function resolve(specifier, context, next) { if (specifier === "electron") return { url: ' +
        JSON.stringify(stubUrl) +
        ', shortCircuit: true }; return next(specifier, context) }'
    ),
  import.meta.url
)

/** 拦截全局 fetch：计数 + 恒返 401（不依赖网络） */
let fetchCalls = 0
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  fetchCalls++
  return new Response('{"error":"stub"}', { status: 401 })
}

const { tavilySearch } = await import('../src/main/tools.ts')
const BAD_KEY = 'stub-key'
/** 归零请求计数（每次断言前调用） */
function reset() {
  fetchCalls = 0
}

// ---- 1. 首次调用：真实发起请求（计数 1） ----
await assert.rejects(tavilySearch(BAD_KEY, '美联储加息'), /Tavily 搜索失败 \(401\)/)
assert.strictEqual(fetchCalls, 1, `首次调用应发 1 次请求（实际 ${fetchCalls}）`)
console.log('✅ 首次未命中缓存：发起 1 次请求')

// ---- 2. 失败不入缓存：同词再调，再次发请求 ----
reset()
await assert.rejects(tavilySearch(BAD_KEY, '美联储加息'), /Tavily 搜索失败/)
assert.strictEqual(fetchCalls, 1, '失败结果不应入缓存，应重发请求')
console.log('✅ 失败结果不入缓存')

// ---- 3. in-flight 合并：同 key 并发 → 只发 1 次 ----
// 归一化规则 = trim + 小写 + 连续空白压缩为单个空格（不删除空格：分词语义保留）。
// 无空格词与带空格词是两个 key——所以 4 个变体并发 = 2 个 key = 2 次请求（同 key 内合并）
reset()
const variants = ['美联储加息', ' 美联储加息 ', '美联储  加息', '美联储\t加息\n']
const settled = await Promise.allSettled(variants.map((q) => tavilySearch(BAD_KEY, q)))
assert.strictEqual(settled.filter((r) => r.status === 'rejected').length, 4, '全部请求共享各自 key 的失败 Promise')
assert.strictEqual(fetchCalls, 2, `4 个变体（2 个 key）并发应只发 2 次请求（实际 ${fetchCalls} 次）`)
console.log('✅ in-flight 合并：4 个并发变体（2 个 key）只发 2 次请求（同 key 内合并）')

// ---- 4. 不同查询词：各发各的 ----
reset()
await Promise.allSettled([tavilySearch(BAD_KEY, '话题A'), tavilySearch(BAD_KEY, '话题B')])
assert.strictEqual(fetchCalls, 2, `不同查询词应各发 1 次（实际 ${fetchCalls}）`)
console.log('✅ 不同查询词不误命中')

// ---- 5. 成功结果入缓存：同词第二次调用 0 请求 ----
reset()
globalThis.fetch = async () => new Response('{"results":[{"title":"t","url":"https://x","content":"c"}]}', { status: 200 })
const ok = await tavilySearch(BAD_KEY, '成功查询')
assert.strictEqual(ok.length, 1, '成功请求应返回结果')
reset()
const cached = await tavilySearch(BAD_KEY, '成功查询')
assert.strictEqual(fetchCalls, 0, `命中缓存不应发请求（实际 ${fetchCalls}）`)
assert.deepStrictEqual(cached, ok, '缓存返回应与首次一致')
console.log('✅ 成功结果入当日缓存：同词二次调用 0 请求')

// ---- 6. 带空格与不带空格是不同 key（分词语义不同），各自缓存 ----
// fetch 桩升级：按请求体查询词回显（title = query），两个 key 的缓存内容才可区分
globalThis.fetch = async (_url, init) => {
  fetchCalls++
  const q = JSON.parse(init.body).query
  return new Response(JSON.stringify({ results: [{ title: q, url: 'https://x', content: 'c' }] }), { status: 200 })
}
reset()
const r6a = await tavilySearch(BAD_KEY, '词条A')
const r6b = await tavilySearch(BAD_KEY, '词条 A')
assert.strictEqual(fetchCalls, 2, `不同 key（空格分词差异）应各发 1 次（实际 ${fetchCalls}）`)
assert.notStrictEqual(r6a[0].title, r6b[0].title, '两个 key 的缓存内容应各自独立')
console.log('✅ 空格分词差异视为不同查询词（各自缓存）')

globalThis.fetch = realFetch
console.log('\n✅ 搜索缓存全部断言通过')
