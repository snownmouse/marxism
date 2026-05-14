import { useAppStore } from '../store/useAppStore'

export default function DataPanel() {
  const currentStageId = useAppStore(s => s.currentStageId)
  const stages = useAppStore(s => s.stages)
  const superstructureExpanded = useAppStore(s => s.superstructureExpanded)
  const toggleSuperstructure = useAppStore(s => s.toggleSuperstructure)

  const stage = stages[currentStageId]

  const exploitationDisplay = stage.exploitationRate > 0
    ? `${(stage.exploitationRate * 100).toFixed(0)}%`
    : '0%'

  const exploitationColor = stage.exploitationRate >= 2
    ? '#E74C3C'
    : stage.exploitationRate >= 1
    ? '#FF6347'
    : stage.exploitationRate > 0
    ? '#FF9800'
    : '#4CAF50'

  return (
    <div className="data-panel">
      <div className="data-card stage-name-card">
        <div className="stage-badge">阶段 {stage.id + 1}/8</div>
        <h2 className="stage-name">{stage.name}</h2>
      </div>

      <div className="data-card">
        <div className="data-label">生产力</div>
        <div className="data-value">{stage.productivity}</div>
      </div>

      <div className="data-card">
        <div className="data-label">生产关系</div>
        <div className="data-value">{stage.relations}</div>
      </div>

      <div className="data-card exploitation-card">
        <div className="data-label">剥削率</div>
        <div className="exploitation-value" style={{ color: exploitationColor }}>
          {exploitationDisplay}
          {stage.exploitationRate > 0 && (
            <span className="exploitation-arrow">▲</span>
          )}
        </div>
      </div>

      <div className="data-card superstructure-card">
        <button className="superstructure-toggle" onClick={toggleSuperstructure}>
          <span>上层建筑</span>
          <span className="toggle-icon">{superstructureExpanded ? '▼' : '▶'}</span>
        </button>
        {superstructureExpanded && (
          <div className="superstructure-content">
            <div className="super-item">
              <span className="super-label">政治</span>
              <span className="super-text">{stage.superstructure.politics}</span>
            </div>
            <div className="super-item">
              <span className="super-label">法律</span>
              <span className="super-text">{stage.superstructure.law}</span>
            </div>
            <div className="super-item">
              <span className="super-label">意识</span>
              <span className="super-text">{stage.superstructure.ideology}</span>
            </div>
          </div>
        )}
      </div>

      <div className="data-card">
        <div className="data-label">阶级结构</div>
        <div className="class-bar-container">
          <div className="class-bar">
            {stage.classes.map((cls, i) => (
              <div
                key={i}
                className="class-bar-segment"
                style={{
                  width: `${cls.populationPct}%`,
                  backgroundColor: cls.color,
                }}
              />
            ))}
          </div>
          <div className="class-legend">
            {stage.classes.map((cls, i) => (
              <div key={i} className="class-legend-item">
                <span className="legend-dot" style={{ backgroundColor: cls.color }} />
                <span className="legend-text">{cls.name} {cls.populationPct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
