import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { useAppStore } from '../store/useAppStore'
import {
  getAIModel,
  getStoredApiKey,
  setStoredApiKey,
  speakText,
  stopSpeaking,
  type ChatMessage,
  type AIContext,
} from '../lib/aiModel'

interface Msg {
  id: string
  role: 'user' | 'assistant'
  content: string
}

let uid = 0
const nextId = () => `m${++uid}`

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

  const [apiKey, setApiKey] = useState(getStoredApiKey())
  const model = useMemo(() => getAIModel(), [apiKey])

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
  const [showSettings, setShowSettings] = useState(false)
  const [speakOn, setSpeakOn] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, loading])

  useEffect(() => {
    if (showNpc && textRef.current) textRef.current.focus()
    if (!showNpc) stopSpeaking()
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
      if (speakOn) speakText(reply)
    } catch (e: any) {
      const msg = e?.message || '出错了'
      setMessages(m => [
        ...m,
        { id: nextId(), role: 'assistant', content: `⚠️ ${msg}\n（请检查网络或 API Key 是否正确）` },
      ])
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => {
    setMessages([{ id: nextId(), role: 'assistant', content: model.greeting(ctx) }])
  }

  const saveKey = () => {
    setStoredApiKey(apiKey.trim())
    setShowSettings(false)
  }

  return (
    <div className="modal-overlay" onClick={() => setNpc(false)}>
      <div className="modal-content npc-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🤖 AI 向导 · 小原</h3>
          <div className="npc-header-actions">
            <span className={`npc-mode-badge mode-${model.mode}`}>{model.label}</span>
            <button
              className="npc-gear"
              title="设置（接入阿里通义千问）"
              onClick={() => setShowSettings(v => !v)}
            >
              ⚙
            </button>
            <button className="modal-close" onClick={() => setNpc(false)}>✕</button>
          </div>
        </div>

        {showSettings && (
          <div className="npc-settings">
            <div className="npc-settings-title">接入阿里云通义千问（可选）</div>
            <p className="npc-settings-hint">
              粘贴 DashScope API Key 即切换为「通义千问模式」；留空则用本地引导模式。
              也可在构建时通过环境变量 <code>VITE_DASHSCOPE_API_KEY</code> 注入。
            </p>
            <div className="npc-settings-row">
              <input
                type="password"
                className="npc-key-input"
                placeholder="sk-...（DashScope API Key）"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
              <button className="npc-save-btn" onClick={saveKey}>保存</button>
              <button
                className="npc-clear-btn"
                onClick={() => { setApiKey(''); setStoredApiKey('') }}
              >清除</button>
            </div>
            <p className="npc-security-note">
              ⚠️ 安全提示：前端直连会把 Key 暴露给浏览器，仅建议个人/内网使用；公网请改用服务端代理。
            </p>
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
                    onClick={() => speakText(m.content)}
                  >🔊</button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="npc-msg assistant">
              <div className="npc-avatar">🤖</div>
              <div className="npc-bubble npc-loading">小原正在思考…</div>
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
            placeholder="问问小原：什么是剩余价值？ / 讲讲这个阶段的剥削率…"
            value={input}
            rows={2}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <div className="npc-input-buttons">
            <button className="npc-clear-chat" onClick={clearChat}>清空</button>
            <button className="npc-send-btn" onClick={send} disabled={loading || !input.trim()}>
              {loading ? '…' : '发送'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
