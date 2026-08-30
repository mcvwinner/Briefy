import { net } from 'electron'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import type { Document } from '@langchain/core/documents'

/** Tavily 搜索结果条目 */
export interface SearchResult {
  title: string
  url: string
  content: string
}

/**
 * Tavily 搜索（专为 LLM 设计的搜索 API，返回干净摘要）。
 * 文档：https://docs.tavily.com
 * 带当日缓存（v0.33.2）：同一查询词跨槽位共享结果——相邻槽位常搜相似主题，
 * 缓存命中即省一次 API 往返，也省掉后续轮次重复携带相同搜索结果的 token。
 */
export async function tavilySearch(apiKey: string, query: string): Promise<SearchResult[]> {
  const key = normalizeQuery(query)
  const cached = getCachedSearchResults(key)
  if (cached) return cached
  // in-flight 合并（v0.33.2）：槽位生成是 3 路并发，相邻槽位同词搜索会同时未命中缓存
  // （惊群）。相同查询词的并发调用共用同一个请求 Promise，只发一次 API。
  const inflight = inflightSearches.get(key)
  if (inflight) return inflight
  const task = doSearch(apiKey, query, key).finally(() => inflightSearches.delete(key))
  inflightSearches.set(key, task)
  return task
}

async function doSearch(apiKey: string, query: string, key: string): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
    signal: AbortSignal.timeout(20_000)
  })
  if (!res.ok) throw new Error(`Tavily 搜索失败 (${res.status})`)
  const data = (await res.json()) as { results?: SearchResult[] }
  const results = data.results ?? []
  putCachedSearchResults(key, results)
  return results
}

/** 查询词归一化：trim + 小写 + 压缩空白（同一主题不同写法命中同一缓存） */
function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** 搜索结果当日缓存 + 进行中请求表：key = 归一化查询词，日期变更即失效 */
const searchCache = new Map<string, { date: string; results: SearchResult[] }>()
const inflightSearches = new Map<string, Promise<SearchResult[]>>()

function getCachedSearchResults(key: string): SearchResult[] | undefined {
  const hit = searchCache.get(key)
  if (!hit) return undefined
  if (hit.date !== new Date().toDateString()) {
    searchCache.delete(key) // 隔日失效：时效内容不跨天复用
    return undefined
  }
  return hit.results
}

function putCachedSearchResults(key: string, results: SearchResult[]): void {
  // 防膨胀：超过 100 条时清最旧的（实际出刊一次约 10-30 个不同查询词，远达不到上限）
  if (searchCache.size >= 100) {
    const oldest = searchCache.keys().next().value
    if (oldest !== undefined) searchCache.delete(oldest)
  }
  searchCache.set(key, { date: new Date().toDateString(), results })
}

/** Tavily 图片搜索（ROADMAP Q3 配图闭环）：返回图片 URL 列表 */
export async function tavilyImageSearch(apiKey: string, query: string): Promise<string[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: 3, include_images: true }),
    signal: AbortSignal.timeout(20_000)
  })
  if (!res.ok) throw new Error(`Tavily 图片搜索失败 (${res.status})`)
  const data = (await res.json()) as { images?: string[] }
  return data.images ?? []
}

/** 剥除 HTML 标签与脚本样式，取近似正文 */
function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 源抓取当日缓存（ROADMAP Q1）：key = URL，跨槽位共享，日期变更即失效 */
const pageTextCache = new Map<string, { date: string; text: string }>()

/** 取 URL 的当日抓取缓存；未命中返回 undefined */
export function getCachedPageText(url: string): string | undefined {
  const hit = pageTextCache.get(url)
  if (!hit) return undefined
  if (hit.date !== new Date().toDateString()) {
    pageTextCache.delete(url) // 隔日失效：时效内容不跨天复用
    return undefined
  }
  return hit.text
}

function putCachedPageText(url: string, text: string): void {
  pageTextCache.set(url, { date: new Date().toDateString(), text })
}

/**
 * 抓取网页正文（带当日缓存）：同源多槽只抓一次。
 * 长文用 LangChain 切分器压缩为前几块，避免撑爆上下文。
 */
export async function fetchPageText(url: string, maxChars = 4000): Promise<string> {
  const cached = getCachedPageText(url)
  if (cached !== undefined) return cached
  // 20s 超时：挂住的源不阻塞生成（调用方 catch 后跳过该源并如实标注）
  const res = await net.fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 Briefy/0.2' },
    signal: AbortSignal.timeout(20_000)
  })
  if (!res.ok) throw new Error(`网页抓取失败 ${res.status}`)
  const html = await res.text()
  const text = extractText(html)
  // LangChain 切分器按语义边界切块，取第一块作为正文摘要
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: maxChars, chunkOverlap: 100 })
  const docs: Document[] = await splitter.createDocuments([text])
  const result = docs[0]?.pageContent ?? text.slice(0, maxChars)
  putCachedPageText(url, result)
  return result
}

/** 本地文件源读取：按扩展名分发（txt/md/csv/json 直读；pdf 用 pdf-parse；docx 用 mammoth）。
 *  返回全文不截断——文件源经 AI 的 readSource 工具按需分块读取，而非预先注入。 */
export async function readLocalSourceText(path: string): Promise<string> {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
  if (ext === '.pdf') {
    // pdf-parse 的入口文件有调试副作用，直接引内部模块规避；该子路径无类型声明
    // @ts-ignore
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as (b: Buffer) => Promise<{ text: string }>
    const buf = await import('node:fs/promises').then((fs) => fs.readFile(path))
    const out = await pdfParse(buf)
    return out.text.replace(/\r/g, '').trim()
  }
  if (ext === '.docx') {
    const mammoth = await import('mammoth')
    const out = await mammoth.extractRawText({ path })
    return out.value.replace(/\r/g, '').trim()
  }
  if (['.txt', '.md', '.csv', '.json', '.log'].includes(ext)) {
    const fs = await import('node:fs/promises')
    return (await fs.readFile(path, 'utf-8')).trim()
  }
  throw new Error(`暂不支持该文件格式（${ext}），支持 txt/md/csv/json/pdf/docx`)
}
