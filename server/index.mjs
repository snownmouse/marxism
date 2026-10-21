/**
 * 「小原」AI 向导 · 服务端代理
 * ---------------------------------------------------------------
 * 只做两件事：
 *   POST /api/chat  →  阿里通义千问（DashScope 兼容模式）
 *   POST /api/tts   →  CosyVoice 语音合成（带磁盘缓存）
 *   GET  /api/health→  自检，前端据此判断在线/本地模式
 *
 * 为什么要有这一层：
 *   1. API Key 只放在服务器环境变量，浏览器永远拿不到；
 *   2. 语音合成结果落盘缓存，同一句话只合成一次，省时省钱；
 *   3. 没有 Key 时返回明确的 503，前端自动降级为本地引导，不会白屏。
 *
 * 零依赖：只用 Node 内置模块，不需要 npm install。
 */

import http from 'node:http'
import https from 'node:https'
import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.PORT || 1960)
const HOST = process.env.HOST || '127.0.0.1'
const KEY = (process.env.DASHSCOPE_API_KEY || '').trim()
const CHAT_MODEL = process.env.QWEN_MODEL || 'qwen-plus'
const TTS_MODEL = process.env.COSYVOICE_MODEL || 'qwen3-tts-flash'
const TTS_VOICE = process.env.COSYVOICE_VOICE || 'Cherry'
const CACHE_DIR = process.env.TTS_CACHE_DIR || '/opt/marxism-cache/tts'
const CHAT_TIMEOUT = Number(process.env.CHAT_TIMEOUT_MS || 35000)
const TTS_TIMEOUT = Number(process.env.TTS_TIMEOUT_MS || 45000)
const MAX_BODY = 256 * 1024

const CHAT_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const TTS_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('payload_too_large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve(null)
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('invalid_json'))
      }
    })
    req.on('error', reject)
  })
}

function httpsRequest(url, { method = 'POST', headers = {}, body = null, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const payload = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method,
        headers: {
          ...headers,
          ...(payload ? { 'Content-Length': payload.length } : {}),
        },
        timeout,
      },
      res => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          let json = null
          const ct = String(res.headers['content-type'] || '')
          if (ct.includes('json') || ct.includes('text')) {
            try {
              json = JSON.parse(buf.toString('utf8'))
            } catch {
              json = null
            }
          }
          resolve({ status: res.statusCode || 0, headers: res.headers, buf, json })
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('upstream_timeout')))
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/* ------------------------------------------------------------------ *
 * 系统提示词：把「小原」钉死在教育场景里
 * ------------------------------------------------------------------ */

function systemPrompt(ctx = {}) {
  const stageName = String(ctx.stageName || '').trim()
  const idx = Number(ctx.stageIndex)
  const total = Number(ctx.stageCount)
  const stageLine = stageName
    ? `用户当前所在阶段：${Number.isFinite(idx) && idx >= 0 ? `第 ${idx + 1} 阶段` : '某阶段'}${Number.isFinite(total) ? `（共 ${total} 个阶段）` : ''}「${stageName}」`
    : '用户还没有进入具体的历史阶段'

  const facts = []
  if (ctx.productivity) facts.push(`生产力：${ctx.productivity}`)
  if (ctx.relations) facts.push(`生产关系：${ctx.relations}`)
  if (ctx.exploitationRate) facts.push(`剥削率：${ctx.exploitationRate}`)
  if (ctx.politics) facts.push(`政治上层建筑：${ctx.politics}`)
  if (ctx.ideology) facts.push(`意识形态：${ctx.ideology}`)
  const factBlock = facts.length ? `\n当前阶段的事实数据（可直接引用，不要改写数字）：\n- ${facts.join('\n- ')}` : ''

  return [
    '你是「小原」，一个马克思主义理论学习站点里的 AI 引导员。你的服务对象是正在学习马克思主义基本原理的大学生。',
    '',
    '【你的角色边界】',
    '- 你是引导员和讲解员，不是演员。镇上居民的历史场景对话由别人演，你负责把那些话背后的理论讲清楚。',
    '- 语气：耐心、清楚、不居高临下，也不油腻。用简体中文口语，可以亲切但不要卖萌。',
    '',
    '【回答方式】',
    '- 每次回答控制在 150 字以内，最多 4 句话说清一件事。',
    '- 需要分点时最多 3 条，用「• 」开头。',
    '- 关键术语用 **加粗**。可以引用教材式判断句时，用「> 」单独一行。',
    '- 如果问题很宽，先给结论，再给一个"接下来可以看什么"的具体建议（点谁、看哪个面板、答哪道题）。',
    '',
    '【内容纪律（重要）】',
    '- 只用马克思主义政治经济学和历史唯物主义的标准表述。概念之间不要混用，比如「生产力」与「生产关系」、「价值」与「价格」、「剩余价值」与「利润」都要分清。',
    '- 不要编造数据、引文、原著页码、人名与出处。记不准就说「这一点我记不准，建议看教材对应章节」。',
    '- 遇到超出课程范围的争议话题，回到教材概念层面说明，不做现实政治评价。',
    '- 用户明显是在闲聊时，简短回应一句，然后把话题引回当前阶段的学习内容。',
    '',
    '【上下文】',
    stageLine,
    factBlock,
  ]
    .filter(Boolean)
    .join('\n')
}

/* ------------------------------------------------------------------ *
 * /api/chat
 * ------------------------------------------------------------------ */

async function handleChat(req, res) {
  let body
  try {
    body = await readJSON(req)
  } catch (e) {
    return sendJSON(res, 400, { error: 'bad_request', detail: String(e.message || e) })
  }

  const raw = Array.isArray(body?.messages) ? body.messages : []
  const messages = raw
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))

  if (!messages.some(m => m.role === 'user')) {
    return sendJSON(res, 400, { error: 'messages_required' })
  }

  if (!KEY) {
    return sendJSON(res, 503, {
      error: 'chat_not_configured',
      hint: '服务端未设置 DASHSCOPE_API_KEY，前端会降级为本地引导',
    })
  }

  const payload = {
    model: CHAT_MODEL,
    messages: [{ role: 'system', content: systemPrompt(body?.context || {}) }, ...messages],
    temperature: 0.6,
    max_tokens: 700,
    presence_penalty: 0.2,
  }

  let upstream
  try {
    upstream = await httpsRequest(CHAT_ENDPOINT, {
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: payload,
      timeout: CHAT_TIMEOUT,
    })
  } catch (e) {
    return sendJSON(res, 504, { error: 'upstream_unreachable', detail: String(e.message || e) })
  }

  const reply = upstream.json?.choices?.[0]?.message?.content
  if (upstream.status !== 200 || !reply) {
    return sendJSON(res, 502, {
      error: 'upstream_error',
      status: upstream.status,
      detail: String(upstream.json?.message || upstream.json?.code || upstream.buf.toString('utf8').slice(0, 300)),
    })
  }

  return sendJSON(res, 200, {
    reply: String(reply).trim(),
    mode: 'online',
    model: CHAT_MODEL,
  })
}

/* ------------------------------------------------------------------ *
 * /api/tts
 * ------------------------------------------------------------------ */

function audioKey(text, voice) {
  return createHash('sha256').update(`${TTS_MODEL}|${voice}|${text}`).digest('hex').slice(0, 40)
}

async function handleTts(req, res) {
  let body
  try {
    body = await readJSON(req)
  } catch (e) {
    return sendJSON(res, 400, { error: 'bad_request', detail: String(e.message || e) })
  }

  const text = String(body?.text || '').replace(/\s+/g, ' ').trim().slice(0, 500)
  const voice = String(body?.voice || TTS_VOICE).slice(0, 64)

  if (!text) return sendJSON(res, 400, { error: 'text_required' })

  if (!KEY) {
    return sendJSON(res, 503, {
      error: 'tts_not_configured',
      hint: '服务端未设置 DASHSCOPE_API_KEY，前端会降级为浏览器语音',
    })
  }

  const key = audioKey(text, voice)
  const file = path.join(CACHE_DIR, `${key}.mp3`)

  // 1) 命中缓存
  try {
    const cached = await fsp.readFile(file)
    if (cached.length > 0) {
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': cached.length,
        'Cache-Control': 'public, max-age=604800',
        'X-TTS-Cache': 'hit',
      })
      return res.end(cached)
    }
  } catch {
    /* 未命中，继续合成 */
  }

  // 2) 调 CosyVoice
  let upstream
  try {
    upstream = await httpsRequest(TTS_ENDPOINT, {
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: {
        model: TTS_MODEL,
        input: { text },
        parameters: { voice, format: 'mp3', sample_rate: 24000 },
      },
      timeout: TTS_TIMEOUT,
    })
  } catch (e) {
    return sendJSON(res, 504, { error: 'tts_unreachable', detail: String(e.message || e) })
  }

  const audioUrl = upstream.json?.output?.audio?.url
  if (upstream.status !== 200 || !audioUrl) {
    return sendJSON(res, 502, {
      error: 'tts_upstream_error',
      status: upstream.status,
      detail: String(upstream.json?.message || upstream.json?.code || upstream.buf.toString('utf8').slice(0, 300)),
    })
  }

  // 3) 下载音频字节并缓存
  let audio
  try {
    audio = await httpsRequest(audioUrl, { method: 'GET', timeout: TTS_TIMEOUT })
  } catch (e) {
    return sendJSON(res, 502, { error: 'tts_download_failed', detail: String(e.message || e) })
  }

  if (audio.status !== 200 || audio.buf.length === 0) {
    return sendJSON(res, 502, { error: 'tts_download_failed', status: audio.status })
  }

  fsp
    .mkdir(CACHE_DIR, { recursive: true })
    .then(() => fsp.writeFile(file, audio.buf))
    .catch(() => {})

  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': audio.buf.length,
    'Cache-Control': 'public, max-age=604800',
    'X-TTS-Cache': 'miss',
  })
  return res.end(audio.buf)
}

/* ------------------------------------------------------------------ *
 * 路由
 * ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const started = Date.now()
  let pathname = '/'
  try {
    pathname = new URL(req.url || '/', 'http://localhost').pathname
  } catch {
    return sendJSON(res, 400, { error: 'bad_url' })
  }

  // 同时兼容 /api/chat 与 /chat（nginx 是否剥离前缀都能用）
  const route = pathname.replace(/^\/api/, '') || '/'

  try {
    if (route === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
      return sendJSON(res, 200, {
        ok: true,
        chat: Boolean(KEY),
        tts: Boolean(KEY),
        chatModel: CHAT_MODEL,
        ttsModel: TTS_MODEL,
        ttsVoice: TTS_VOICE,
        cacheDir: CACHE_DIR,
        uptimeSec: Math.round(process.uptime()),
      })
    }
    if (route === '/chat' && req.method === 'POST') return await handleChat(req, res)
    if (route === '/tts' && req.method === 'POST') return await handleTts(req, res)
    if (route === '/health') return sendJSON(res, 405, { error: 'method_not_allowed' })
    return sendJSON(res, 404, { error: 'not_found', path: pathname })
  } catch (e) {
    console.error('[api] unhandled', req.method, pathname, e)
    return sendJSON(res, 500, { error: 'internal_error', detail: String(e?.message || e) })
  } finally {
    if (Date.now() - started > 5000) {
      console.log(`[api] slow ${req.method} ${pathname} ${Date.now() - started}ms`)
    }
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[marxism-api] listening on http://${HOST}:${PORT}`)
  console.log(`[marxism-api] chat=${KEY ? 'configured' : 'MISSING KEY (degrade to local)'} tts=${KEY ? 'configured' : 'off'}`)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[marxism-api] ${sig} received, closing`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000)
  })
}
