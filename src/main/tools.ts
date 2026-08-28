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
 */
export async function tavilySearch(apiKey: string, query: string): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
    signal: AbortSignal.timeout(20_000)
  })
  if (!res.ok) throw new Error(`Tavily 搜索失败 (${res.status})`)
  const data = (await res.json()) as { results?: SearchResult[] }
  return data.results ?? []
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
