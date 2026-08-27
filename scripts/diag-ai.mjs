import { readFileSync } from 'node:fs'

const s = JSON.parse(readFileSync(process.env.APPDATA + '/briefy/settings.json', 'utf-8'))
const base = (s.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
const url = base + '/chat/completions'
console.log('请求端点:', url)
console.log('模型:', s.model)

const body = {
  model: s.model,
  messages: [
    {
      role: 'user',
      content:
        '你是一份个性化报纸的内容作者。\n要求：内容紧凑、信息密度高。\n内容形式：输出纯文本段落，不要使用 Markdown 标记。\n区块主题要求：今日最重要的科技新闻头条，200 字'
    }
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'getCurrentTime',
        description: '获取当前的日期和时间（用户本地时区）。',
        parameters: { type: 'object', properties: {} }
      }
    }
  ]
}

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.apiKey },
  body: JSON.stringify(body)
})
console.log('HTTP 状态:', res.status)
const data = await res.json()
if (data.error) {
  console.log('API 错误:', JSON.stringify(data.error))
} else {
  const msg = data.choices?.[0]?.message
  console.log('finish_reason:', data.choices?.[0]?.finish_reason)
  console.log('content 类型:', typeof msg?.content, Array.isArray(msg?.content) ? '(数组!)' : '')
  const text =
    typeof msg?.content === 'string'
      ? msg.content
      : JSON.stringify(msg?.content)?.slice(0, 500) ?? String(msg?.content)
  console.log('content 前300字:', text.slice(0, 300))
  if (msg?.tool_calls) console.log('tool_calls:', JSON.stringify(msg.tool_calls).slice(0, 300))
}
