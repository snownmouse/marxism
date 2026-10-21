import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { useAppStore } from '../store/useAppStore'
import {
  getAIModel,
  speakText,
  stopSpeaking,
  takePendingSeed,
  NPC_NAME,
  type ChatMessage,
  type AIContext,
} from '../lib/aiModel'
import '../styles/npc.css'
import '../styles/npc-v2.css'

interface Msg {
  id: string
  role: 'user' | 'assistant'
  content: string
}

let uid = 0
const nextId = () => `m${++uid}`

const QUICK_PROMPTS = [
  '这个阶段最关键的是什么？',
  '剥削率是怎么算出来的？',
  '帮我串一下这一节的知识点',
]

// 极简 Markdown 渲染：支持 **加粗**、> 引用、• 列表
function renderInline(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
  )
}

function RichText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="npc-msg-text">
      {lines.map((line, i) => {
        const isQuote = line.startsWith('> ')
        const isBullet = /^[•\-]\s/.test(line)
        const content = isQuote ? line.slice(2) : isBullet ? line.replace(/^[•\-]\s/, '') : line
        const cls = isQuote ? 'npc-quote' : isBullet ? 'npc-bullet' : ''
        return (
          <div key={i} className={cls}>
            {renderInline(content)}
          </div>
        )
      })}
    </div>
  )
}

export default function NpcChat() {
  const showNpc = useAppStore(s => s.showNpc)
  const setNpc = useAppStore(s => s.setNpc)
  const currentStageId = useAppStore(s => s.currentStageId)
  const stages = useAppStore(s => s.stages)

  const model = useMemo(() => getAIModel(), [])

  const ctx: AIContext = useMemo(
    () => ({
      stage: stages[currentStageId] || null,
      stageIndex: currentStageId,
      stageCount: stages.length,
    }),
    [stages, currentStageId]
  )

  const [messages, setMessages] = useState<Msg[]>(() => [
    { id: nextId(), role: 'assistant', content: getAIModel().greeting(ctx) },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [speakOn, setSpeakOn] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, loading])

  // 打开面板：带走「问小原」带来的上下文，或直接聚焦输入框
  useEffect(() => {
    if (!showNpc) {
      stopSpeaking()
      return
    }
    const seed = takePendingSeed()
    if (seed && seed.text) {
      const who = seed.speaker ? `「${seed.speaker}」` : '刚才'
      const snippet = seed.text.length > 48 ? `${seed.text.slice(0, 48)}…` : seed.text
      setInput(`${who}说的“${snippet}”是什么意思？`)
    }
    const timer = window.setTimeout(() => textRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [showNpc])

  if (!showNpc) return null

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    const userMsg: Msg = { id: nextId(), role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const history: ChatMessage[] = next.map(m => ({ role: m.role, content: m.content }))
      const reply = await model.sendMessage(history, ctx)
      setMessages(m => [...m, { id: nextId(), role: 'assistant', content: reply }])
      if (speakOn) void speakText(reply)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '出错了'
      setMessages(m => [
        ...m,
        {
          id: nextId(),
          role: 'assistant',
          content: `⚠️ ${msg}\n\n稍后再试，或打开 /api/health 看服务端是否正常。`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => {
    setMessages([{ id: nextId(), role: 'assistant', content: model.greeting(ctx) }])
  }

  const pickQuick = (q: string) => {
    setInput(q)
    textRef.current?.focus()
  }

  return (
    <div className="modal-overlay" onClick={() => setNpc(false)}>
      <div className="modal-content npc-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🤖 AI 向导 · {NPC_NAME}</h3>
          <div className="npc-header-actions">
            <span
              className={`npc-mode-badge mode-${model.mode}`}
              title={
                model.mode === 'online'
                  ? '正在使用服务端代理的通义千问实时生成'
                  : '在线模型不可用，正在用本地知识库回答'
              }
            >
              {model.label}
            </span>
            <button className="modal-close" onClick={() => setNpc(false)}>✕</button>
          </div>
        </div>

        {messages.length <= 1 && !loading && (
          <div className="npc-quick">
            {QUICK_PROMPTS.map(q => (
              <button key={q} className="npc-quick-btn" onClick={() => pickQuick(q)}>
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="npc-messages" ref={listRef}>
          {messages.map(m => (
            <div key={m.id} className={`npc-msg ${m.role}`}>
              {m.role === 'assistant' && <div className="npc-avatar">🤖</div>}
              <div className="npc-bubble">
                <RichText text={m.content} />
                {m.role === 'assistant' && (
                  <button
                    className="npc-speak-btn"
                    title="朗读"
                    onClick={() => void speakText(m.content)}
                  >🔊</button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="npc-msg assistant">
              <div className="npc-avatar">🤖</div>
              <div className="npc-bubble npc-loading">{NPC_NAME}正在思考…</div>
            </div>
          )}
        </div>

        <div className="npc-input-area">
          <label className="npc-speak-toggle">
            <input
              type="checkbox"
              checked={speakOn}
              onChange={e => {
                setSpeakOn(e.target.checked)
                if (!e.target.checked) stopSpeaking()
              }}
            />
            🔊 自动朗读
          </label>
          <textarea
            ref={textRef}
            className="npc-textarea"
            placeholder={`问问${NPC_NAME}：什么是剩余价值？ / 讲讲这个阶段的剥削率…`}
            value={input}
            rows={2}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
          />
          <div className="npc-input-buttons">
            <button className="npc-clear-chat" onClick={clearChat}>清空</button>
            <button className="npc-send-btn" onClick={() => void send()} disabled={loading || !input.trim()}>
              {loading ? '…' : '发送'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
