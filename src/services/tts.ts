/**
 * TTS 语音引擎
 * 优先调用本地 GPT-SoVITS 推理 API（v2pro api.py，默认 8000 端口），
 * 未配置或调用失败时自动降级为浏览器内置 speechSynthesis。
 */

export type TtsEngine = 'auto' | 'gpt-sovits' | 'browser'

export interface VoiceSettings {
  /** auto：优先 GPT-SoVITS，失败自动降级；gpt-sovits：只用 GPT-SoVITS；browser：只用浏览器语音 */
  engine: TtsEngine
  /** GPT-SoVITS API 地址，如 http://127.0.0.1:8000 */
  apiBase: string
  /** 模型名称（GPT-SoVITS 中已加载的模型） */
  modelName: string
  /** 参考音频文件名（仅用于展示） */
  refAudioName: string
  /** 参考音频 base64（不含 data: 前缀） */
  refAudioB64: string
  /** 参考音频对应的台词文本 */
  promptText: string
  /** 语速 0.5 ~ 2.0 */
  speed: number
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  engine: 'auto',
  apiBase: 'http://127.0.0.1:8000',
  modelName: '',
  refAudioName: '',
  refAudioB64: '',
  promptText: '',
  speed: 1.0,
}

export type TtsStatus = 'idle' | 'loading' | 'playing'

export interface TtsState {
  status: TtsStatus
  /** 正在播放（或加载中）的文本（清洗后），供按钮高亮 */
  activeText: string | null
  engineUsed: 'gpt-sovits' | 'browser' | null
  error: string | null
}

const STORAGE_KEY = 'marxism_voice_settings'
const MAX_TEXT_LEN = 1500
/** 首次推理需要加载模型，放宽超时时间 */
const REQUEST_TIMEOUT = 120000

let settings: VoiceSettings = loadSettings()
let state: TtsState = {
  status: 'idle',
  activeText: null,
  engineUsed: null,
  error: null,
}
const listeners = new Set<() => void>()

let currentAudio: HTMLAudioElement | null = null
let currentObjectUrl: string | null = null
let abortController: AbortController | null = null

/* ---------------- 设置持久化 ---------------- */

function loadSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_VOICE_SETTINGS, ...JSON.parse(raw) }
  } catch { /* 忽略损坏的配置 */ }
  return { ...DEFAULT_VOICE_SETTINGS }
}

export function getSettings(): VoiceSettings {
  return settings
}

export function saveSettings(patch: Partial<VoiceSettings>): VoiceSettings {
  settings = { ...settings, ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch { /* 超出配额时仅内存生效 */ }
  return settings
}

/* ---------------- 状态订阅（供 React useSyncExternalStore） ---------------- */

function setState(patch: Partial<TtsState>): void {
  state = { ...state, ...patch }
  listeners.forEach(l => l())
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getSnapshot(): TtsState {
  return state
}

/* ---------------- 文本清洗 ---------------- */

/** 去掉 emoji / 符号，空括号转为停顿，压缩空白，限制长度 */
export function cleanText(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}]/gu, ' ')
    .replace(/[（(]\s*[)）]/g, '，')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_LEN)
}

/* ---------------- 播放控制 ---------------- */

function cleanupAudio(): void {
  if (currentAudio) {
    currentAudio.onended = null
    currentAudio.onerror = null
    try { currentAudio.pause() } catch { /* 忽略 */ }
    currentAudio = null
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
}

/** 停止当前播放并回到空闲状态 */
export function stop(): void {
  abortController?.abort()
  abortController = null
  cleanupAudio()
  if ('speechSynthesis' in window) speechSynthesis.cancel()
  setState({ status: 'idle', activeText: null, error: null })
}

/** 朗读一段文本；重复调用会打断当前播放 */
export async function speak(text: string): Promise<void> {
  const cleaned = cleanText(text)
  if (!cleaned) return

  stop()
  setState({ status: 'loading', activeText: cleaned, error: null })

  const wantGsv = settings.engine !== 'browser'
  const gsvReady = wantGsv
    && !!settings.modelName.trim()
    && !!settings.refAudioB64
    && !!settings.promptText.trim()

  if (gsvReady) {
    try {
      await speakWithGptSovits(cleaned)
      return
    } catch (err) {
      if (settings.engine === 'gpt-sovits') {
        setState({ status: 'idle', activeText: null, error: errText(err) })
        return
      }
      setState({ error: `GPT-SoVITS 调用失败（${errText(err)}），已切换浏览器语音` })
    }
  } else if (wantGsv && settings.engine === 'gpt-sovits') {
    setState({
      status: 'idle',
      activeText: null,
      error: '请先在语音设置中配置模型名称与参考音频',
    })
    return
  } else if (wantGsv) {
    setState({ error: '未配置 GPT-SoVITS 参考音频，暂时使用浏览器语音' })
  }

  await speakWithBrowser(cleaned)
}

/* ---------------- GPT-SoVITS 推理 ---------------- */

async function speakWithGptSovits(text: string): Promise<void> {
  abortController = new AbortController()
  const signal = abortController.signal
  const timer = window.setTimeout(() => abortController?.abort(), REQUEST_TIMEOUT)
  try {
    const base = settings.apiBase.replace(/\/+$/, '')
    const resp = await fetch(`${base}/infer_ref`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_name: settings.modelName,
        ref_audio_b64: settings.refAudioB64,
        text,
        text_lang: 'zh',
        prompt_text: settings.promptText,
        prompt_text_lang: 'zh',
        speed_facter: settings.speed,
        text_split_method: '按标点符号切',
        media_type: 'wav',
      }),
      signal,
    })
    if (signal.aborted) return
    if (!resp.ok) throw new Error(`接口返回 HTTP ${resp.status}`)

    const data = await resp.json() as { msg?: string; audio_url?: string }
    if (!data.audio_url) throw new Error(data.msg || '接口未返回音频地址')

    const audioResp = await fetch(data.audio_url, { signal })
    if (signal.aborted) return
    if (!audioResp.ok) throw new Error('音频下载失败')

    const blob = await audioResp.blob()
    if (signal.aborted) return

    await playBlob(blob)
    if (signal.aborted) return
    setState({ status: 'playing', engineUsed: 'gpt-sovits' })
  } finally {
    window.clearTimeout(timer)
    if (abortController?.signal === signal) abortController = null
  }
}

function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    currentAudio = audio
    currentObjectUrl = url
    audio.onended = () => {
      cleanupAudio()
      setState({ status: 'idle', activeText: null })
      resolve()
    }
    audio.onerror = () => {
      cleanupAudio()
      reject(new Error('音频播放失败'))
    }
    audio.play().catch(err => reject(err instanceof Error ? err : new Error('音频播放失败')))
  })
}

/* ---------------- 浏览器语音合成 ---------------- */

function pickChineseVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null
  const voices = speechSynthesis.getVoices()
  return voices.find(v => /zh|chinese|中文|普通话/i.test(`${v.lang} ${v.name}`)) || null
}

function speakWithBrowser(text: string): Promise<void> {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window)) {
      setState({ status: 'idle', activeText: null, error: '当前浏览器不支持语音合成' })
      resolve()
      return
    }
    speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'zh-CN'
    utter.rate = Math.min(2, Math.max(0.5, settings.speed))
    const voice = pickChineseVoice()
    if (voice) utter.voice = voice

    utter.onend = () => {
      setState({ status: 'idle', activeText: null })
      resolve()
    }
    utter.onerror = () => {
      setState({ status: 'idle', activeText: null, error: '浏览器语音播放失败' })
      resolve()
    }
    setState({ status: 'playing', engineUsed: 'browser' })
    speechSynthesis.speak(utter)
  })
}

/* ---------------- 辅助能力 ---------------- */

function errText(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return '请求超时，请确认 GPT-SoVITS API 已启动'
    return err.message
  }
  return String(err)
}

/** 获取 GPT-SoVITS 已加载的模型列表 */
export async function fetchModelList(apiBase: string): Promise<string[]> {
  const base = apiBase.replace(/\/+$/, '')
  const resp = await fetch(`${base}/models`)
  if (!resp.ok) throw new Error(`接口返回 HTTP ${resp.status}`)
  const data = await resp.json() as unknown
  if (Array.isArray(data)) return data.map(String)
  if (data && typeof data === 'object' && Array.isArray((data as { models?: unknown[] }).models)) {
    return (data as { models: unknown[] }).models.map(String)
  }
  return []
}

/** 读取本地音频文件，转 base64 并探测时长 */
export function readAudioFile(file: File): Promise<{ b64: string; durationSec: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.onload = () => {
      const result = String(reader.result || '')
      const b64 = result.includes(',') ? result.slice(result.indexOf(',') + 1) : result
      const probe = new Audio()
      probe.onloadedmetadata = () => {
        const d = probe.duration
        resolve({ b64, durationSec: Number.isFinite(d) && d > 0 ? d : 0 })
      }
      probe.onerror = () => resolve({ b64, durationSec: 0 })
      probe.src = URL.createObjectURL(file)
    }
    reader.readAsDataURL(file)
  })
}
