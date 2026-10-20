import { useAppStore } from '../store/useAppStore'
import SpeakButton from './SpeakButton'

const CAT_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  '哲学基础': { bg: '#3A1B5C', color: '#CE93D8', label: '哲' },
  '政治经济学': { bg: '#1B3A5C', color: '#64B5F6', label: '经' },
  '马克思主义基本原理': { bg: '#5C1B1B', color: '#EF5350', label: '原' },
}

export default function GlossaryPopup() {
  const showGlossaryPopup = useAppStore(s => s.showGlossaryPopup)
  const activeGlossaryItem = useAppStore(s => s.activeGlossaryItem)
  const setGlossaryPopup = useAppStore(s => s.setGlossaryPopup)

  if (!showGlossaryPopup || !activeGlossaryItem) return null

  const cat = activeGlossaryItem.category || '马克思主义基本原理'
  const cs = CAT_STYLES[cat] || CAT_STYLES['马克思主义基本原理']

  // 拼接词条的朗读文本
  const buildSpeech = (): string => {
    const item = activeGlossaryItem
    const parts = [`${item.term}。定义：${item.definition}`]
    if (item.marxQuote) parts.push(`经典原文：「${item.marxQuote}」`)
    parts.push(`场景说明：${item.example}`)
    return parts.join('。')
  }

  return (
    <div className="modal-overlay" onClick={() => setGlossaryPopup(null)}>
      <div className="modal-content glossary-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            📚 {activeGlossaryItem.term}
            <span className="glossary-category-badge" style={{ background: cs.bg, color: cs.color, marginLeft: 8, fontSize: '0.65em', padding: '2px 6px', borderRadius: 4, verticalAlign: 'middle' }}>
              {cs.label} · {cat}
            </span>
          </h3>
          <div className="glossary-header-actions">
            <SpeakButton text={buildSpeech()} title="朗读词条" className="speak-btn-modal" />
            <button className="modal-close" onClick={() => setGlossaryPopup(null)}>✕</button>
          </div>
        </div>
        <div className="glossary-content">
          <div className="glossary-section">
            <div className="glossary-section-label">定义</div>
            <p>{activeGlossaryItem.definition}</p>
          </div>
          {activeGlossaryItem.marxQuote && (
            <div className="glossary-section">
              <div className="glossary-section-label">经典原文</div>
              <p className="marx-quote">「{activeGlossaryItem.marxQuote}」</p>
            </div>
          )}
          <div className="glossary-section">
            <div className="glossary-section-label">场景说明</div>
            <p>{activeGlossaryItem.example}</p>
          </div>
        </div>
      </div>
    </div>
  )
}