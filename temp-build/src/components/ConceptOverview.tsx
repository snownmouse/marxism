import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'

type TabKey = 'glossary' | 'dialogs' | 'cards' | 'summary'

export default function ConceptOverview({ show, onClose }: { show: boolean; onClose: () => void }) {
  const stages = useAppStore(s => s.stages)
  const glossary = useAppStore(s => s.glossary)
  const dialogs = useAppStore(s => s.dialogs)
  const knowledgeCards = useAppStore(s => s.knowledgeCards)
  const setGlossaryPopup = useAppStore(s => s.setGlossaryPopup)
  const setStage = useAppStore(s => s.setStage)
  const [tab, setTab] = useState<TabKey>('summary')

  if (!show) return null

  const cats = { '哲学基础': glossary.filter(g => g.category === '哲学基础'), '政治经济学': glossary.filter(g => g.category === '政治经济学'), '马克思主义基本原理': glossary.filter(g => g.category === '马克思主义基本原理') }
  const categoryColors: Record<string, string> = { '哲学基础': '#9C27B0', '政治经济学': '#2196F3', '马克思主义基本原理': '#E74C3C' }

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'summary', label: '📊 总览', count: 0 },
    { key: 'glossary', label: '📖 术语', count: glossary.length },
    { key: 'dialogs', label: '💬 对话', count: dialogs.length },
    { key: 'cards', label: '🃏 卡片', count: knowledgeCards.length },
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content concept-overview-modal" onClick={e => e.stopPropagation()} style={{ width: '720px' }}>
        <div className="modal-header">
          <h3>📚 概念总览</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="concept-tabs">
          {tabs.map(t => (
            <button
              key={t.key}
              className={`concept-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}{t.count > 0 && <span className="tab-count">{t.count}</span>}
            </button>
          ))}
        </div>

        <div className="concept-body">
          {tab === 'summary' && (
            <div className="concept-summary">
              <div className="summary-grid">
                <div className="summary-card">
                  <div className="summary-num">{stages.length}</div>
                  <div className="summary-label">历史阶段</div>
                  <div className="summary-detail">{stages.map(s => s.name).join(' → ')}</div>
                </div>
                <div className="summary-card">
                  <div className="summary-num">{glossary.length}</div>
                  <div className="summary-label">马克思主义术语</div>
                  <div className="summary-detail">
                    {Object.entries(cats).map(([k, v]) => (
                      <span key={k} className="cat-badge" style={{ color: categoryColors[k] }}>{k} {v.length}</span>
                    ))}
                  </div>
                </div>
                <div className="summary-card">
                  <div className="summary-num">{dialogs.length}</div>
                  <div className="summary-label">角色对话</div>
                  <div className="summary-detail">覆盖全部 {stages.length} 个历史阶段</div>
                </div>
                <div className="summary-card">
                  <div className="summary-num">{knowledgeCards.length}</div>
                  <div className="summary-label">知识卡片</div>
                  <div className="summary-detail">覆盖全部 {stages.length} 个历史阶段</div>
                </div>
              </div>

              <div className="coverage-section">
                <h4>📖 各阶段术语覆盖</h4>
                <div className="coverage-list">
                  {stages.map(s => {
                    const stageDialogs = dialogs.filter(d => d.stageId === s.id)
                    const stageCards = knowledgeCards.filter(c => c.stageId === s.id)
                    const glossaryIds = new Set(stageDialogs.map(d => d.glossaryId))
                    const terms = glossary.filter(g => glossaryIds.has(g.id))
                    return (
                      <div key={s.id} className="coverage-row" onClick={() => { setStage(s.id); onClose() }}>
                        <span className="coverage-icon">{s.icon === 'axe' ? '🪓' : s.icon === 'wheat_chain' ? '🌾' : s.icon === 'chain' ? '⛓️' : s.icon === 'castle' ? '🏰' : s.icon === 'smoke' ? '🏭' : s.icon === 'moneybag' ? '💰' : s.icon === 'handshake' ? '🤝' : '⭐'}</span>
                        <span className="coverage-name">{s.name}</span>
                        <span className="coverage-stat">术语 {terms.length}</span>
                        <span className="coverage-stat">对话 {stageDialogs.length}</span>
                        <span className="coverage-stat">卡片 {stageCards.length}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'glossary' && (
            <div className="concept-list">
              {Object.entries(cats).map(([catName, items]) => (
                <div key={catName} className="concept-category">
                  <h4 style={{ color: categoryColors[catName] }}>{catName}（{items.length}）</h4>
                  <div className="glossary-grid">
                    {items.map(g => (
                      <button
                        key={g.id}
                        className="glossary-chip"
                        onClick={() => setGlossaryPopup(g)}
                      >
                        {g.term}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'dialogs' && (
            <div className="concept-list">
              {stages.map(s => {
                const stageDialogs = dialogs.filter(d => d.stageId === s.id)
                if (stageDialogs.length === 0) return null
                return (
                  <div key={s.id} className="concept-category">
                    <h4>{s.name}（{stageDialogs.length}条对话）</h4>
                    <div className="dialog-list">
                      {stageDialogs.map(d => {
                        const g = glossary.find(gl => gl.id === d.glossaryId)
                        return (
                          <div key={d.id} className="dialog-row">
                            <span className="dialog-class-type">{d.classType}</span>
                            <span className="dialog-text">"{d.text}"</span>
                            {g && (
                              <button className="dialog-glossary-link" onClick={() => setGlossaryPopup(g)}>
                                📖 {g.term}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'cards' && (
            <div className="concept-list">
              {stages.map(s => {
                const stageCards = knowledgeCards.filter(c => c.stageId === s.id)
                if (stageCards.length === 0) return null
                return (
                  <div key={s.id} className="concept-category">
                    <h4>{s.name}（{stageCards.length}张卡片）</h4>
                    <div className="card-chips">
                      {stageCards.map(c => (
                        <span key={c.id} className="card-chip" title={c.explanation}>
                          <span className="card-chip-title">{c.title}</span>
                          {c.category && <span className="card-chip-cat">{c.category.slice(0, 2)}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}