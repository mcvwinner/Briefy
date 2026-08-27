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
    body: JSON.stringify({ api_key: apiKey, query, max_results: 5 })
  })
  if (!res.ok) throw new Error(`Tavily 搜索失败 (${res.status})`)
  const data = (await res.json()) as { results?: SearchResult[] }
  return data.results ?? []
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

/**
 * 抓取网页正文（Electron net.fetch 走系统网络栈，代理友好）。
 * 长文用 LangChain 切分器压缩为前几块，避免撑爆上下文。
 */
export async function fetchPageText(url: string, maxChars = 4000): Promise<string> {
  const res = await net.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Briefy/0.2' } })
  if (!res.ok) throw new Error(`网页抓取失败 ${res.status}`)
  const html = await res.text()
  const text = extractText(html)
  // LangChain 切分器按语义边界切块，取第一块作为正文摘要
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: maxChars, chunkOverlap: 100 })
  const docs: Document[] = await splitter.createDocuments([text])
  return docs[0]?.pageContent ?? text.slice(0, maxChars)
}
