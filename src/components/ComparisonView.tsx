import { useAppStore } from '../store/useAppStore'

export default function ComparisonView() {
  const showComparison = useAppStore(s => s.showComparison)
  const setComparison = useAppStore(s => s.setComparison)
  const comparisonStageIds = useAppStore(s => s.comparisonStageIds)
  const stages = useAppStore(s => s.stages)

  if (!showComparison) return null

  const stageA = stages[comparisonStageIds[0]]
  const stageB = stages[comparisonStageIds[1]]

  return (
    <div className="modal-overlay" onClick={() => setComparison(false)}>
      <div className="modal-content comparison-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📊 阶段对比</h3>
          <button className="modal-close" onClick={() => setComparison(false)}>✕</button>
        </div>

        <div className="comparison-stage-selectors">
          <div className="selector-group">
            <label>阶段 A</label>
            <select
              value={comparisonStageIds[0]}
              onChange={e => setComparison(true, [Number(e.target.value), comparisonStageIds[1]])}
            >
              {stages.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="selector-group">
            <label>阶段 B</label>
            <select
              value={comparisonStageIds[1]}
              onChange={e => setComparison(true, [comparisonStageIds[0], Number(e.target.value)])}
            >
              {stages.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="comparison-content">
          <div className="comparison-side">
            <h4 style={{ color: stageA.townTheme.palette.accent }}>{stageA.name}</h4>
            <div className="comparison-item">
              <span className="comp-label">生产力</span>
              <span className="comp-value">{stageA.productivity}</span>
            </div>
            <div className="comparison-item">
              <span className="comp-label">生产关系</span>
              <span className="comp-value">{stageA.relations}</span>
            </div>
            <div className="comparison-item">
              <span className="comp-label">剥削率</span>
              <span className="comp-value" style={{ color: stageA.exploitationRate > 0 ? '#E74C3C' : '#4CAF50' }}>
                {stageA.exploitationRate > 0 ? `${(stageA.exploitationRate * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>
            <div className="comparison-item">
              <span className="comp-label">政治</span>
              <span className="comp-value">{stageA.superstructure.politics}</span>
            </div>
            <div className="comparison-item">
              <span className="comp-label">法律</span>
              <span className="comp-value">{stageA.superstructure.law}</span>
            </div>
            <div className="comparison-item">
              <span className="comp-label">意识形态</span>
              <span className="comp-value">{stageA.superstructure.ideology}</span>
            </div>
            <div className="comparison-item">
              <span className="comp-label">阶级</span>
              <span className="comp-value">{stageA.classes.map(c => c.name).join('、')}</span>
            </div>
          </div>

          <div className="comparison-divider">
            <span>VS</span>
          </div>

          <div className="comparison-side">
            <h4 style={{ color: stageB.townTheme.palette.accent }}>{stageB.name}</h4>
            <div className="comparison-item">
              <span className="comp-label">生产力</span>
              <span className="comp-value">{stageB.productivity}</span>
            </div>
            <div className="comparison-item">
              <span className="comp-label">生产关系</span>
              <span className="comp-value">{stageB.relations}</span>
            </div>
            <div className="comparison-item">
              <span className="comp-label">剥削率</span>
              <span className="comp-value" style={{ color: stageB.exploitationRate > 0 ? '#E74C3C' : '#4CAF50' }}>
                {stageB.exploitationRate > 0 ? `${(stageB.exploitationRate * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>
            <div className="comparison-item">
              <span className="comp-label">政治</span>
              <span className="comp-value">{stageB.superstructure.politics}</span>
            </div>
            <div className="comparison-item">
              <span className="comp-label">法律</span>
              <span className="comp-value">{stageB.superstructure.law}</span>
            </div>
            <div className="comparison-item">
              <span className="comp-label">意识形态</span>
              <span className="comp-value">{stageB.superstructure.ideology}</span>
            </div>
            <div className="comparison-item">
              <span className="comp-label">阶级</span>
              <span className="comp-value">{stageB.classes.map(c => c.name).join('、')}</span>
            </div>
          </div>
        </div>

        <div className="comparison-summary">
          <p>
            从<strong>{stageA.name}</strong>到<strong>{stageB.name}</strong>，
            生产力从「{stageA.productivity}」发展为「{stageB.productivity}」，
            生产关系从「{stageA.relations}」变为「{stageB.relations}」，
            剥削率从 {(stageA.exploitationRate * 100).toFixed(0)}% 变为 {(stageB.exploitationRate * 100).toFixed(0)}%。
            这体现了生产力决定生产关系、经济基础决定上层建筑的历史唯物主义基本原理。
          </p>
        </div>
      </div>
    </div>
  )
}
