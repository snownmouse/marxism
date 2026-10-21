/**
 * tts.ts — 预制音频播放器（v2 · 静态版）
 * ============================================================
 * 播放项目自带的预制音频：public/audio/dialog/*.mp3（由本地 GPT-SoVITS
 * 合成，音色来源为开源语音数据集，许可证见 manifest.voices[].license）。
 *
 * 与旧版（运行时调用推理 API）的区别：
 *   - 不再需要任何后端/推理服务，纯静态托管即可工作
 *   - 音频清单 manifest.json 在首次播放时按需加载
 *   - 音频缺失或加载失败时，降级为浏览器 speechSynthesis 朗读（不哑巴）
 *
 * 用法：
 *   import { play, stop, subscribe, getSnapshot } from '../services/tts'
 *   play('prim_hunter_1', '今天的浆果真多')   // 第二个参数为降级文本
 *   stop()
 */

// ---------------------------------------------------------------- 类型

export interface AudioPart {
  file: string          // 相对于 public/ 的路径，如 audio/dialog/xxx.mp3
  duration: number      // 秒
}

export interface DialogAudio {
  voice: string         // 音色 ID
  parts: AudioPart[]    // 长句切块按序播放
}

export interface VoiceLicense {
  dataset: string       // 数据集名称
  speaker: string       // 说话人编号
  license: string       // 许可证
}

export interface VoiceMeta {
  family: string        // 家族：市井百姓/原始公社/.../拟人建筑
  gender: string        // F / M / N
  persona: string       // 人设描述
  source: VoiceLicense  // 版权来源
}

export interface AudioManifest {
  generatedAt: string
  model: string         // 合成所用底模
  dialogs: Record<string, DialogAudio>
  voices: Record<string, VoiceMeta>
}

export type TtsStatus = 'idle' | 'loading' | 'playing'

export interface TtsState {
  status: TtsStatus
  currentId: string | null    // 正在播放的 dialogId
  partIndex: number           // 当前是第几块（长句切分）
  totalParts: number
  enabled: boolean            // 总开关：是否显示朗读按钮
  rate: number                // 倍速 0.5~2
  error: string | null
}

// ---------------------------------------------------------------- 常量

const LS_ENABLED = 'marxism.voice.enabled'
const LS_RATE = 'marxism.voice.rate'
const MANIFEST_URL = 'audio/manifest.json'

// ---------------------------------------------------------------- 状态

let manifest: AudioManifest | null = null
let manifestLoading: Promise<AudioManifest | null> | null = null

const listeners = new Set<() => void>()

function loadBool(key: string, fallback: boolean): boolean {
  if (typeof localStorage === 'undefined') return fallback
  const v = localStorage.getItem(key)
  return v === null ? fallback : v === '1'
}

function loadRate(): number {
  if (typeof localStorage === 'undefined') return 1
  const v = parseFloat(localStorage.getItem(LS_RATE) || '')
  return isNaN(v) ? 1 : Math.min(2, Math.max(0.5, v))
}

let state: TtsState = {
  status: 'idle',
  currentId: null,
  partIndex: 0,
  totalParts: 0,
  enabled: loadBool(LS_ENABLED, true),
  rate: loadRate(),
  error: null,
}

function setState(patch: Partial<TtsState>) {
  state = { ...state, ...patch }
  listeners.forEach(fn => fn())
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getSnapshot(): TtsState {
  return state
}

// ---------------------------------------------------------------- 播放引擎

let currentAudio: HTMLAudioElement | null = null
let playToken = 0   // 每次 play/stop 自增，用于取消过期的播放链

async function loadManifest(): Promise<AudioManifest | null> {
  if (manifest) return manifest
  if (manifestLoading) return manifestLoading
  manifestLoading = fetch(MANIFEST_URL)
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)
  manifest = await manifestLoading
  return manifest
}

/** 供「音色图鉴」等组件使用：确保 manifest 已加载 */
export async function getManifest(): Promise<AudioManifest | null> {
  return loadManifest()
}

function speakFallback(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'zh-CN'
  u.rate = state.rate
  const voices = window.speechSynthesis.getVoices()
  const zh = voices.find(v => /zh|中文|Chinese/i.test(v.lang + v.name))
  if (zh) u.voice = zh
  u.onend = () => { if (state.status !== 'idle') setState({ status: 'idle', currentId: null, partIndex: 0, totalParts: 0 }) }
  u.onerror = () => { setState({ status: 'idle', currentId: null, error: '朗读失败' }) }
  window.speechSynthesis.speak(u)
}

/**
 * 播放一段预制对话音频。
 * @param dialogId dialogs.json 中的对话 id（如 'prim_hunter_1'）
 * @param fallbackText 音频缺失时用浏览器语音朗读的文本
 */
export async function play(dialogId: string, fallbackText?: string): Promise<void> {
  const token = ++playToken
  stopAudio()

  setState({ status: 'loading', currentId: dialogId, partIndex: 0, totalParts: 0, error: null })

  const mf = await loadManifest()
  if (token !== playToken) return   // 已被新的 play/stop 取消

  const entry = mf?.dialogs?.[dialogId]
  if (!entry || !entry.parts?.length) {
    // 音频缺失 → 降级浏览器语音
    if (fallbackText) {
      setState({ status: 'playing', currentId: dialogId, totalParts: 1 })
      speakFallback(fallbackText)
    } else {
      setState({ status: 'idle', currentId: null, error: '暂无音频' })
    }
    return
  }

  setState({ totalParts: entry.parts.length })

  for (let i = 0; i < entry.parts.length; i++) {
    if (token !== playToken) return
    const ok = await playPart(entry.parts[i], token)
    if (!ok) {
      // 加载/播放失败 → 降级
      if (fallbackText) {
        setState({ status: 'playing', partIndex: i })
        speakFallback(fallbackText)
      } else {
        setState({ status: 'idle', currentId: null, error: '音频加载失败' })
      }
      return
    }
    if (token !== playToken) return
    setState({ partIndex: i + 1 })
  }

  if (token === playToken) {
    setState({ status: 'idle', currentId: null, partIndex: 0 })
  }
}

function playPart(part: AudioPart, token: number): Promise<boolean> {
  return new Promise(resolve => {
    const audio = new Audio(part.file)
    audio.playbackRate = state.rate
    currentAudio = audio
    audio.onended = () => {
      if (token === playToken) currentAudio = null
      resolve(true)
    }
    audio.onerror = () => {
      if (token === playToken) currentAudio = null
      resolve(false)
    }
    audio.play().catch(() => {
      if (token === playToken) currentAudio = null
      resolve(false)
    })
  })
}

/** 停止当前播放（不改变 enabled 开关） */
export function stop(): void {
  playToken++
  stopAudio()
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
  setState({ status: 'idle', currentId: null, partIndex: 0, totalParts: 0 })
}

function stopAudio() {
  if (currentAudio) {
    currentAudio.onended = null
    currentAudio.onerror = null
    currentAudio.pause()
    currentAudio = null
  }
}

/** 正在播放/加载中？ */
export function isActive(): boolean {
  return state.status === 'playing' || state.status === 'loading'
}

// ---------------------------------------------------------------- 设置

export function setEnabled(enabled: boolean): void {
  if (!enabled) stop()
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LS_ENABLED, enabled ? '1' : '0')
  }
  setState({ enabled })
}

export function toggleEnabled(): void {
  setEnabled(!state.enabled)
}

export function setRate(rate: number): void {
  const r = Math.min(2, Math.max(0.5, rate))
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LS_RATE, String(r))
  }
  setState({ rate: r })
  if (currentAudio) currentAudio.playbackRate = r
}
