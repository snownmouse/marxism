import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import stages from '../data/stages.json'

const CAT_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  '哲学基础': { bg: '#3A1B5C', color: '#CE93D8', label: '哲' },
  '政治经济学': { bg: '#1B3A5C', color: '#64B5F6', label: '经' },
  '马克思主义基本原理': { bg: '#5C1B1B', color: '#EF5350', label: '原' },
}

export default function TheoryCards() {
  const currentStageId = useAppStore(s => s.currentStageId)
  const knowledgeCards = useAppStore(s => s.knowledgeCards)
  const currentCardIndex = useAppStore(s => s.currentCardIndex)
  const nextCard = useAppStore(s => s.nextCard)
  const prevCard = useAppStore(s => s.prevCard)
  const showAllCards = useAppStore(s => s.showAllCards)
  const setShowAllCards = useAppStore(s => s.setShowAllCards)

  const stageCards = knowledgeCards.filter(c => c.stageId === currentStageId)
  const currentCard = stageCards[currentCardIndex]
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      nextCard()
    }, 8000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [currentStageId, nextCard])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = window.setInterval(() => {
      nextCard()
    }, 8000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [currentCardIndex, nextCard])

  if (stageCards.length === 0) return null

  return (
    <div className="theory-cards-section">
      <div className="theory-cards-header">
        <span className="theory-cards-icon">📖</span>
        <span className="theory-cards-title">理论卡片</span>
        <button className="view-all-btn" onClick={() => setShowAllCards(true)}>
          查看全部
        </button>
      </div>

      {currentCard && (
        <div className="theory-card">
          <div className="theory-card-title">
            {currentCard.title}
            {currentCard.category && (() => {
              const cs = CAT_STYLES[currentCard.category]
              if (!cs) return null
              return (
                <span style={{ background: cs.bg, color: cs.color, marginLeft: 8, fontSize: '0.65em', padding: '1px 5px', borderRadius: 3, verticalAlign: 'middle' }}>
                  {cs.label} · {currentCard.category}
                </span>
              )
            })()}
          </div>
          <div className="theory-card-explanation">{currentCard.explanation}</div>
          <div className="theory-card-instance">💡 {currentCard.instance}</div>
        </div>
      )}

      <div className="theory-card-controls">
        <button className="card-nav-btn" onClick={prevCard}>◀</button>
        <span className="card-counter">{currentCardIndex + 1} / {stageCards.length}</span>
        <button className="card-nav-btn" onClick={nextCard}>▶</button>
      </div>

      {showAllCards && (
        <div className="modal-overlay" onClick={() => setShowAllCards(false)}>
          <div className="modal-content all-cards-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📖 {stages.find(s => s.id === currentStageId)?.name} - 全部理论卡片</h3>
              <button className="modal-close" onClick={() => setShowAllCards(false)}>✕</button>
            </div>
            <div className="all-cards-list">
              {stageCards.map(card => {
                const cs = card.category ? CAT_STYLES[card.category] : null
                return (
                  <div key={card.id} className="theory-card-full">
                    <div className="theory-card-title">
                      {card.title}
                      {cs && (
                        <span style={{ background: cs.bg, color: cs.color, marginLeft: 8, fontSize: '0.65em', padding: '1px 5px', borderRadius: 3, verticalAlign: 'middle' }}>
                          {cs.label} · {card.category}
                        </span>
                      )}
                    </div>
                    <div className="theory-card-explanation">{card.explanation}</div>
                    <div className="theory-card-instance">💡 {card.instance}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}