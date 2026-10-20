// AI 模型抽象层
// ---------------------------------------------------------------------------
// 设计目标（对应需求："加一个对话的 AI 做引导的 NPC，后面配阿里的语音或文字模型"）：
//   1. 默认使用「本地引导模型」——纯前端、规则 + 数据驱动，无需任何密钥，离线可用，
//      方便本地自测与无网络环境。
//   2. 当配置了阿里云 DashScope（通义千问）API Key 后，自动切换为「通义千问模型」，
//      具备真正的对话理解能力。
//   3. 语音（TTS）提供浏览器内置的 speechSynthesis 作为默认朗读方案；
//      阿里 CosyVoice / Sambert 的接入点已在 synthesizeWithAliyun() 处预留（见文件末尾）。
//
// 安全提示：前端直连大模型会把 API Key 暴露给浏览器。当前方案适合个人/内网学习工具；
// 若上公网，请改走「服务端代理」转发 DashScope 请求，不要把 Key 打进前端包。
// ---------------------------------------------------------------------------

import glossaryData from '../data/glossary.json'
import stagesData from '../data/stages.json'
import focusData from '../data/theoryFocus.json'
import type { GlossaryItem, Stage, TheoryFocus } from '../store/useAppStore'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// 当前学习上下文：让 NPC 知道用户正在观察哪个历史阶段，从而"在场"地引导
export interface AIContext {
  stage: Stage | null
  stageIndex: number
  stageCount: number
}

export interface AIModel {
  readonly mode: 'local' | 'dashscope'
  readonly label: string
  greeting(ctx: AIContext): string
  sendMessage(messages: ChatMessage[], ctx: AIContext): Promise<string>
}

const glossary = glossaryData as GlossaryItem[]
const stages = stagesData as Stage[]
const theoryFocuses = focusData as TheoryFocus[]

const NPC_NAME = '小原'
const NPC_TITLE = '马克思主义理论引导员'

/* ===================== 本地引导模型 ===================== */

class LocalGuideModel implements AIModel {
  readonly mode = 'local' as const
  readonly label = '本地引导模式'

  greeting(ctx: AIContext): string {
    const stage = ctx.stage
    let reply = `你好，我是 ${NPC_NAME}，${NPC_TITLE} 👋\n`
    if (stage) {
      reply += `你现在正在观察「${stage.name}」。我可以帮你讲解概念、梳理这个阶段的生产力与生产关系，或者陪你复习。\n`
    }
    reply += `试着问我：\n• 什么是剩余价值？\n• 讲讲这个阶段的剥削率\n• 帮我梳理一下当前知识点`
    return reply
  }

  async sendMessage(messages: ChatMessage[], ctx: AIContext): Promise<string> {
    const last = [...messages].reverse().find(m => m.role === 'user')
    const text = (last?.content || '').trim()
    if (!text) return this.greeting(ctx)

    // 1) 问候
    if (/^(你好|您好|hi|hello|在吗|在么|嗨|嘿)/i.test(text)) {
      return this.greeting(ctx)
    }

    // 2) 解释 / 什么是 某个概念
    const explainMatch = text.match(/(?:讲讲|解释|解释一下|什么是|啥是|了解|说说|介绍|讲下|讲一讲)\s*[:：]?\s*(.+)$/)
    const topic = (explainMatch?.[1] || '').trim()

    // 3) 命中词条（用户原话含词条，或"解释X"里的 X 含词条）
    const hit = glossary.find(g => text.includes(g.term) || (topic && topic.includes(g.term)))
    if (hit) {
      let reply = `📖 **${hit.term}**\n${hit.definition}`
      if (hit.marxQuote) reply += `\n\n> ${hit.marxQuote}`
      if (hit.example) reply += `\n\n💡 例子：${hit.example}`
      reply += `\n\n（分类：${hit.category || '马克思主义'}）`
      return reply
    }

    // 4) 当前阶段相关问题
    if (ctx.stage && /(当前|现在|这个|本|目前|此刻).*(阶段|社会|时期|形态)|这个阶段|现在在|当前阶段/i.test(text)) {
      return this.describeStage(ctx.stage)
    }

    // 5) 理论聚焦
    const focus = ctx.stage ? theoryFocuses.find(f => f.stageId === ctx.stage!.id) : null
    if (focus && /(聚焦|重点|核心|焦点|理论焦点|focus|深入)/i.test(text)) {
      return `🎯 **${focus.title}**\n${focus.content}\n\n${focus.philosophy}\n\n相关概念：${focus.relatedTerms.join('、')}`
    }

    // 6) 功能引导
    if (/(怎么|如何|怎样|咋).*(学|用|操作|复习|考试|刷题)|功能|按钮|怎么玩|help|帮助|引导/i.test(text)) {
      return this.guideFeatures()
    }

    // 7) 关键词兜底：在词条/聚焦里找相关概念
    const related = this.findRelated(text)
    if (related) return related

    // 8) 默认引导
    return this.defaultReply(ctx)
  }

  private describeStage(stage: Stage): string {
    const cls = stage.classes.map(c => `${c.name} ${Math.round(c.populationPct * 100)}%`).join('，')
    return (
      `🏛️ **${stage.name}**\n` +
      `• 生产力：${stage.productivity}\n` +
      `• 生产关系：${stage.relations}\n` +
      `• 剥削率：${stage.exploitationRate}%\n` +
      `• 阶级构成：${cls}\n` +
      `• 上层建筑：政治「${stage.superstructure.politics}」/ 法律「${stage.superstructure.law}」/ 意识形态「${stage.superstructure.ideology}」\n\n` +
      `建议点开小镇里居民的对话气泡（带 ℹ 的可看词条），再配合左侧「📖 内容讲解」一起看，会更直观。`
    )
  }

  private guideFeatures(): string {
    return (
      `🧭 这个模拟器里，我可以陪你用这些功能一起学：\n` +
      `• 「📖 内容讲解」——按阶段精讲基本原理\n` +
      `• 「📝 考试复习」——刷题、错题本、模拟考试\n` +
      `• 「🕸️ 知识网络」——看概念之间的关联\n` +
      `• 「🌳 知识体系」——总览全部词条与对话\n` +
      `• 点顶部时间轴切换历史阶段，观察社会形态演变\n\n` +
      `你想先从哪一块开始？我可以针对它出几道思考题。`
    )
  }

  private findRelated(text: string): string | null {
    const t = text.toLowerCase()
    const g = glossary.find(x => t.includes(x.term.toLowerCase()) || x.term.toLowerCase().includes(t))
    if (g) {
      let reply = `📖 **${g.term}**\n${g.definition}`
      if (g.marxQuote) reply += `\n\n> ${g.marxQuote}`
      if (g.example) reply += `\n\n💡 例子：${g.example}`
      return reply
    }
    return null
  }

  private defaultReply(ctx: AIContext): string {
    const stage = ctx.stage
    const someTerms = glossary.slice(0, 5).map(g => g.term).join('、')
    let reply =
      `这个问题有点超出我当前的数据范围啦 🤔\n` +
      `不过我可以帮你巩固眼前的知识。试试这样问：\n` +
      `• 「讲讲 ${stage ? stage.name : '当前阶段'} 的剥削率」\n` +
      `• 「什么是 ${someTerms.split('、')[0]}？」\n` +
      `• 「帮我出几道题练练」\n\n` +
      `（提示：可用词条包括 ${someTerms} 等）`
    return reply
  }
}

/* ===================== 阿里通义千问模型 ===================== */

class DashScopeModel implements AIModel {
  readonly mode = 'dashscope' as const
  readonly label = '通义千问模式'
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  greeting(_ctx: AIContext): string {
    return `你好，我是 ${NPC_NAME}，${NPC_TITLE} 👋 通义千问已接入，我们可以深入学习马克思主义理论了。你想先聊点什么？`
  }

  async sendMessage(messages: ChatMessage[], ctx: AIContext): Promise<string> {
    const stage = ctx.stage
    const system =
      `你是"${NPC_NAME}"，${NPC_TITLE}，一位亲切、循循善诱的马克思主义理论引导员。` +
      `当前学习阶段：${stage ? stage.name + '（生产力：' + stage.productivity + '；生产关系：' + stage.relations + '；剥削率：' + stage.exploitationRate + '%）' : '未选定'}。` +
      `请用简洁、通俗、鼓励的中文回答；可适当引用马克思原话；并在合适时引导用户使用"内容讲解/考试复习/知识网络"等功能。` +
      `回答中可用 **加粗** 标记重点。`

    const payload = {
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: system },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.8,
      max_tokens: 800,
    }

    const resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`通义千问请求失败(${resp.status})：${errText.slice(0, 200)}`)
    }
    const data = await resp.json()
    return (
      data?.choices?.[0]?.message?.content?.trim() ||
      '（模型没有返回内容，请稍后再试）'
    )
  }
}

/* ===================== 模型工厂 & 密钥管理 ===================== */

const KEY_STORAGE = 'npc_aliyun_key'

export function getStoredApiKey(): string {
  try {
    const envKey = (import.meta.env.VITE_DASHSCOPE_API_KEY as string | undefined) || ''
    if (envKey) return envKey
    return localStorage.getItem(KEY_STORAGE) || ''
  } catch {
    return (import.meta.env.VITE_DASHSCOPE_API_KEY as string | undefined) || ''
  }
}

export function setStoredApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* 忽略隐私模式等异常 */
  }
}

export function getAIModel(): AIModel {
  const key = getStoredApiKey()
  if (key) return new DashScopeModel(key)
  return new LocalGuideModel()
}

/* ===================== 语音（TTS） ===================== */

// 默认朗读：浏览器内置 speechSynthesis（中文可用，无需密钥）
export function speakText(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.replace(/[*`#>]/g, ''))
    u.lang = 'zh-CN'
    u.rate = 1
    const voices = window.speechSynthesis.getVoices()
    const zh = voices.find(v => /zh|chinese|中文|普通话/i.test(v.lang + v.name))
    if (zh) u.voice = zh
    window.speechSynthesis.speak(u)
  } catch {
    /* 忽略 */
  }
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

// 后续接入阿里语音合成（CosyVoice / Sambert）的扩展点：
// 通过 DashScope 接口（WebSocket 或 HTTP）用 apiKey 调用，将返回的音频流播放给用户。
// 当前留作占位，正式接入时替换 speakText 的调用即可。
export async function synthesizeWithAliyun(_text: string, _apiKey: string): Promise<ArrayBuffer> {
  throw new Error('阿里语音合成尚未接入，请改用浏览器内置朗读，或后续对接 CosyVoice。')
}
