import { useAppStore } from '../store/useAppStore'

export default function TheoryFocusPanel() {
  const showTheoryFocus = useAppStore(s => s.showTheoryFocus)
  const activeTheoryFocus = useAppStore(s => s.activeTheoryFocus)
  const setTheoryFocus = useAppStore(s => s.setTheoryFocus)
  const setGlossaryPopup = useAppStore(s => s.setGlossaryPopup)
  const glossary = useAppStore(s => s.glossary)

  if (!showTheoryFocus || !activeTheoryFocus) return null

  return (
    <div className="theory-focus-overlay">
      <div className="theory-focus-panel">
        <div className="theory-focus-title">{activeTheoryFocus.title}</div>
        <div className="theory-focus-content">{activeTheoryFocus.content}</div>
        <div className="theory-focus-philosophy">
          <span className="philosophy-label">🔍 哲学提炼</span>
          <p>{activeTheoryFocus.philosophy}</p>
        </div>
        <div className="theory-focus-terms">
          <span className="terms-label">相关词条：</span>
          {activeTheoryFocus.relatedTerms.map(termId => {
            const item = glossary.find(g => g.id === termId)
            if (!item) return null
            return (
              <button
                key={termId}
                className="term-chip"
                onClick={() => setGlossaryPopup(item)}
              >
                {item.term}
              </button>
            )
          })}
        </div>
        <button className="theory-focus-close" onClick={() => setTheoryFocus(null)}>
          我知道了
        </button>
      </div>
    </div>
  )
}
