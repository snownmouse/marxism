import { useAppStore } from '../store/useAppStore'

const STAGE_ICONS: Record<string, string> = {
  axe: '⛏️',
  wheat_chain: '🌾',
  chain: '⛓️',
  castle: '🏰',
  smoke: '🏭',
  moneybag: '💰',
  handshake: '🤝',
  star: '⭐',
}

export default function Timeline() {
  const currentStageId = useAppStore(s => s.currentStageId)
  const stages = useAppStore(s => s.stages)
  const setStage = useAppStore(s => s.setStage)
  const highlightedStageIds = useAppStore(s => s.highlightedStageIds)

  return (
    <div className="timeline">
      {stages.map((stage, index) => {
        const isActive = stage.id === currentStageId
        const isHighlighted = highlightedStageIds.includes(stage.id)
        const isPast = stage.id < currentStageId

        return (
          <button
            key={stage.id}
            className={`timeline-item ${isActive ? 'active' : ''} ${isPast ? 'past' : ''} ${isHighlighted ? 'highlighted' : ''}`}
            onClick={() => setStage(stage.id)}
            title={stage.name}
          >
            <div className="timeline-icon-wrapper">
              <span className="timeline-icon">{STAGE_ICONS[stage.icon] || '📌'}</span>
              {isActive && <div className="timeline-active-indicator" />}
              {isHighlighted && <div className="timeline-highlight-pulse" />}
            </div>
            <span className="timeline-label">{stage.name.length > 4 ? stage.name.substring(0, 4) : stage.name}</span>
            {index < stages.length - 1 && <div className="timeline-connector" />}
          </button>
        )
      })}
    </div>
  )
}
