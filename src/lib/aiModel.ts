/**
 * 「小原」AI 向导 · 模型与语音层
 *
 * 链路（前端零密钥）：
 *   浏览器 ──POST /api/chat──▶ server/index.mjs ──▶ 阿里通义千问（qwen-plus）
 *   浏览器 ──POST /api/tts ──▶ server/index.mjs ──▶ qwen3-tts-flash（磁盘缓存）
 *
 * 降级顺序：
 *   1. 服务端已配 Key        → 在线模型实时生成
 *   2. 服务端没配/不可达      → 本地规则引导（离线可用，不报错）
 *   3. 语音合成不可用         → 浏览器 speechSynthesis
 *
 * 注意：本文件只服务「小原」。小镇居民的台词与预制音频由 services/tts.ts 负责，
 *      两条链路互不影响。
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AIContext {
  /** 当前阶段对象（store 里的 Stage），这里只按需读取少数字段 */
  stage: unknown
  stageIndex: number
  stageCount: number
}

export interface AIModel {
  readonly mode: 'online' | 'local'
  readonly label: string
  greeting(ctx: AIContext): string
  sendMessage(messages: ChatMessage[], ctx: AIContext): Promise<string>
}

export const NPC_NAME = '小原'
export const NPC_TITLE = '原理社会 · 理论引导员'

/* ------------------------------------------------------------------ *
 * 通用小工具
 * ------------------------------------------------------------------ */

function readField(obj: unknown, key: string): string {
  if (!obj || typeof obj !== 'object') return ''
  const v = (obj as Record<string, unknown>)[key]
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  return ''
}

function readNested(obj: unknown, outer: string, inner: string): string {
  if (!obj || typeof obj !== 'object') return ''
  return readField((obj as Record<string, unknown>)[outer], inner)
}

function stageNameOf(ctx: AIContext): string {
  return readField(ctx.stage, 'name') || '当前阶段'
}

function contextBrief(ctx: AIContext): Record<string, string | number> {
  return {
    stageName: readField(ctx.stage, 'name'),
    productivity: readField(ctx.stage, 'productivity'),
    relations: readField(ctx.stage, 'relations'),
    exploitationRate: readField(ctx.stage, 'exploitationRate'),
    politics: readNested(ctx.stage, 'superstructure', 'politics'),
    law: readNested(ctx.stage, 'superstructure', 'law'),
    ideology: readNested(ctx.stage, 'superstructure', 'ideology'),
    stageIndex: ctx.stageIndex,
    stageCount: ctx.stageCount,
  }
}

function describeError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') return '请求超时'
  if (err instanceof Error && err.message) return err.message
  return '未知错误'
}

async function postJSON<T = any>(url: string, body: unknown, timeoutMs = 40000): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await resp.text()
    let data: any = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    if (!resp.ok) {
      const detail = data?.hint || data?.error || data?.detail || `HTTP ${resp.status}`
      throw new Error(String(detail))
    }
    return data as T
  } finally {
    window.clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ *
 * 本地规则引导（无网络也能用）
 * ------------------------------------------------------------------ */

interface FaqEntry {
  keys: string[]
  answer: string
}

const FAQ: FaqEntry[] = [
  {
    keys: ['剩余价值', '剥削', '劳动价值'],
    answer:
      '**剩余价值**是工人在剩余劳动时间里创造、却被生产资料所有者无偿占有的那部分价值。\n\n• 劳动力成了商品，它的价值由维持工人生活所需决定\n• 工人一天创造的价值高于工资，差额就是剩余价值\n• 提高剥削程度有两条路：延长工作日（绝对剩余价值）／压低必要劳动时间（相对剩余价值）\n\n> 关键不在"老板人好不好"，而在生产资料归谁所有。\n\n想更直观，去面板上看看当前的**剥削率**数字。',
  },
  {
    keys: ['生产力', '生产关系'],
    answer:
      '**生产力**是人改造自然的能力（工具、技术、劳动者素质）；**生产关系**是生产中人与人结成的关系（谁占有生产资料、谁支配劳动、产品怎么分配）。\n\n• 生产力决定生产关系\n• 生产关系反过来又促进或阻碍生产力\n• 两者矛盾累积到一定程度，就要求变革生产关系\n\n去「阶段」面板左右切一下，能看到每个阶段这两项的具体对照。',
  },
  {
    keys: ['阶级', '阶级斗争'],
    answer:
      '**阶级**是指在特定生产关系中处于不同地位的社会集团——差别根子在**对生产资料的占有关系**，不是收入高低或职业差别。\n\n• 有占有、有支配，就有利益对立\n• 利益对立公开化，就是阶级斗争\n• 阶级斗争推动社会形态更替\n\n镇上不同身份的人说话立场不一样，正是这个结构在起作用。',
  },
  {
    keys: ['上层建筑', '意识形态', '国家', '法律'],
    answer:
      '**上层建筑**是建立在经济基础之上的政治法律制度与设施，以及与之相适应的**意识形态**。\n\n• 经济基础决定上层建筑\n• 上层建筑反作用于经济基础：维护它，或阻碍它变革\n• 国家是阶级矛盾不可调和的产物，本质是阶级统治的工具\n\n每个阶段的「社会结构」面板里，政治、法律、意识形态三项就是它的具体形态。',
  },
  {
    keys: ['商品', '货币', '资本'],
    answer:
      '**商品**是用来交换的劳动产品，具有使用价值和价值二重性；**货币**是价值形式发展的产物，固定充当一般等价物；**资本**是能带来剩余价值的价值。\n\n• 商品交换 → 货币产生 → 劳动力成为商品 → 货币转化为资本\n• 公式对比：W—G—W 是"为买而卖"，G—W—G′ 是"为卖而买"\n\n> 货币变成资本的关键，是买到一种能创造更多价值的商品——劳动力。',
  },
  {
    keys: ['私有制', '分工', '所有制'],
    answer:
      '**分工**提高效率，也带来交换的必要；**私有制**则让生产资料归属固定下来，是阶级产生的根源。\n\n• 第一次大分工（畜牧业）→ 剩余产品与交换出现\n• 第二次（手工业）→ 私有制逐步确立\n• 第三次（商业）→ 出现专门从事交换的阶层\n\n沿着阶段往后走，你会看到同一套逻辑反复重演。',
  },
]

function localAnswer(question: string, ctx: AIContext): string {
  const q = question.trim()
  const name = stageNameOf(ctx)

  if (!q) {
    return `你可以直接问我一个概念，或者问「${name}这个阶段最关键的是什么」。`
  }

  if (/^(你好|您好|hi|hello|嗨|在吗|哈喽)/i.test(q)) {
    return `你好，我是**${NPC_NAME}**。\n\n现在我们在「${name}」。你可以问我三件事：\n• 镇上某句话背后的**理论**是什么\n• 某个概念的标准定义\n• 这个阶段和你的考点怎么对上\n\n随便问一句试试。`
  }

  for (const item of FAQ) {
    if (item.keys.some(k => q.includes(k))) return item.answer
  }

  if (/玩法|怎么玩|怎么用|做什么|下一步|不会|干嘛|干吗/.test(q)) {
    return `这个站点的玩法是三层：\n\n• **看**：在城镇里点居民，听他们在当前阶段说什么\n• **问**：指着某句话点 💬，我来讲它背后的理论\n• **验**：进「答题」，做错了再回来问\n\n你现在在「${name}」，建议先把镇上的对话点开两三个。`
  }

  if (/这个阶段|现在|当前|这里|这一关|这关|时代/.test(q)) {
    const parts: string[] = [`当前是「${name}」。`]
    const productivity = readField(ctx.stage, 'productivity')
    const relations = readField(ctx.stage, 'relations')
    const rate = readField(ctx.stage, 'exploitationRate')
    if (productivity) parts.push(`生产力：${productivity}`)
    if (relations) parts.push(`生产关系：${relations}`)
    if (rate) parts.push(`剥削率：${rate}`)
    parts.push('把这几项放在一起看，就是这一阶段的骨架。想深入哪一项，直接问我就行。')
    return parts.join('\n')
  }

  if (/考点|考试|复习|知识点|怎么记/.test(q)) {
    return `按考点记，一个阶段抓四条线：\n\n• **生产力**：工具与技术水平\n• **生产关系**：谁占有、谁劳动、怎么分配\n• **上层建筑**：政治、法律、意识形态\n• **矛盾**：这一阶段最主要的对立是什么\n\n用这四条线过一遍「${name}」，比背零散结论稳。`
  }

  return `这个问题我按教材口径给你搭个框架：\n\n• 先找**生产关系**的变化——谁占有生产资料，是一切分歧的起点\n• 再看**生产力**是否被这套关系卡住\n• 最后看**上层建筑**在为谁服务\n\n把它落到「${name}」上，你再问我具体是哪一环，我给你说明白。`
}

class LocalGuideModel implements AIModel {
  readonly mode = 'local' as const
  readonly label = '本地引导'

  greeting(ctx: AIContext): string {
    return `我是**${NPC_NAME}**，${NPC_TITLE}。\n\n现在我们在「${stageNameOf(ctx)}」。\n\n问概念、问镇上那句话什么意思、问这阶段的关键矛盾，我都能接住。\n\n（当前是本地引导模式；服务端配好模型 Key 后会自动切到在线模型，回答更灵活。）`
  }

  async sendMessage(messages: ChatMessage[], ctx: AIContext): Promise<string> {
    const last = [...messages].reverse().find(m => m.role === 'user')
    return localAnswer(last?.content ?? '', ctx)
  }
}

/* ------------------------------------------------------------------ *
 * 在线模型（走服务端代理）
 * ------------------------------------------------------------------ */

class RemoteGuideModel implements AIModel {
  mode: 'online' | 'local' = 'online'
  private readonly local = new LocalGuideModel()

  /** 由 probeHealth 调用，纠正徽章显示 */
  setMode(next: 'online' | 'local'): void {
    this.mode = next
  }

  get label(): string {
    return this.mode === 'online' ? '通义千问' : '本地引导'
  }

  greeting(ctx: AIContext): string {
    if (this.mode === 'local') return this.local.greeting(ctx)
    return `我是**${NPC_NAME}**，${NPC_TITLE}。\n\n现在我们在「${stageNameOf(ctx)}」。\n\n你可以：\n• 指着镇上某句话点 💬，我讲它背后的理论\n• 直接问任何概念，比如"什么是剩余价值"\n• 让我把这个阶段和你的考点串起来\n\n先问一句试试。`
  }

  async sendMessage(messages: ChatMessage[], ctx: AIContext): Promise<string> {
    try {
      const data = await postJSON<{ reply?: string }>('/api/chat', {
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        context: contextBrief(ctx),
      })
      const reply = typeof data?.reply === 'string' ? data.reply.trim() : ''
      if (!reply) throw new Error('服务端返回为空')
      this.mode = 'online'
      return reply
    } catch (err) {
      this.mode = 'local'
      const fallback = await this.local.sendMessage(messages, ctx)
      return `${fallback}\n\n> 在线模型暂不可用（${describeError(err)}），已切到本地引导。`
    }
  }
}

let singleton: AIModel | null = null
let remoteInstance: RemoteGuideModel | null = null

export function getAIModel(): AIModel {
  if (!singleton) {
    remoteInstance = new RemoteGuideModel()
    singleton = remoteInstance
  }
  return singleton
}

/**
 * 探测服务端是否已配置模型 Key（打开面板时调用一次）。
 * 只影响徽章显示与首次请求策略，失败不抛错。
 */
export async function probeHealth(timeoutMs = 6000): Promise<'online' | 'local'> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch('/api/health', { cache: 'no-store', signal: controller.signal })
    const data = await resp.json()
    const online = Boolean(data?.chat)
    remoteInstance?.setMode(online ? 'online' : 'local')
    return online ? 'online' : 'local'
  } catch {
    remoteInstance?.setMode('local')
    return 'local'
  } finally {
    window.clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ *
 * 「问小原」上下文传递：镇上气泡 → 小原输入框
 * ------------------------------------------------------------------ */

let pendingSeed: { speaker: string; text: string } | null = null

/** 由 DialogBubbles 调用：记下「谁说了什么」，等小原面板打开时取用 */
export function askAbout(speaker: string, text: string): void {
  pendingSeed = { speaker: (speaker || '').trim(), text: (text || '').trim() }
}

/** 取出并清空，避免重复注入 */
export function takePendingSeed(): { speaker: string; text: string } | null {
  const seed = pendingSeed
  pendingSeed = null
  return seed
}

/* ------------------------------------------------------------------ *
 * 语音：先服务端 CosyVoice，失败降级浏览器 TTS
 * ------------------------------------------------------------------ */

let currentAudio: HTMLAudioElement | null = null
let currentObjectUrl: string | null = null

function stripForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_#>`]/g, ' ')
    .replace(/[•\-]\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400)
}

function releaseAudio(): void {
  if (currentAudio) {
    try {
      currentAudio.pause()
    } catch {
      /* 忽略 */
    }
    currentAudio = null
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
}

function speakWithBrowser(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = 1
  utterance.pitch = 1
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

/** 朗读一段文本。优先 CosyVoice，不可用时降级浏览器语音 */
export async function speakText(text: string): Promise<void> {
  const clean = stripForSpeech(text)
  if (!clean) return

  stopSpeaking()

  try {
    const resp = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean }),
    })
    const contentType = resp.headers.get('content-type') || ''
    if (resp.ok && contentType.startsWith('audio')) {
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      currentObjectUrl = url
      const audio = new Audio(url)
      currentAudio = audio
      audio.onended = () => releaseAudio()
      await audio.play()
      return
    }
  } catch {
    /* 落回浏览器语音 */
  }

  speakWithBrowser(clean)
}

export function stopSpeaking(): void {
  releaseAudio()
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}
