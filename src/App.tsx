import { useState } from 'react'
import { useAppStore } from './store/useAppStore'
import PixelTownCanvas from './components/PixelTownCanvas'
import DataPanel from './components/DataPanel'
import Timeline from './components/Timeline'
import TheoryCards from './components/TheoryCards'
import ComparisonView from './components/ComparisonView'
import KnowledgeNetwork from './components/KnowledgeNetwork'
import TheoryFocusPanel from './components/TheoryFocusPanel'
import GlossaryPopup from './components/GlossaryPopup'
import DialogBubbles from './components/DialogBubbles'
import ConceptOverview from './components/ConceptOverview'
import QuizPanel from './components/QuizPanel'
import ExplanationPanel from './components/ExplanationPanel'
import KnowledgeMap from './components/KnowledgeMap'

export default function App() {
  const isAutoPlaying = useAppStore(s => s.isAutoPlaying)
  const toggleAutoPlay = useAppStore(s => s.toggleAutoPlay)
  const setComparison = useAppStore(s => s.setComparison)
  const setKnowledgeNetwork = useAppStore(s => s.setKnowledgeNetwork)
  const setQuiz = useAppStore(s => s.setQuiz)
  const setExplanation = useAppStore(s => s.setExplanation)
  const tooltipText = useAppStore(s => s.tooltipText)
  const tooltipPos = useAppStore(s => s.tooltipPos)
  const [showConceptOverview, setShowConceptOverview] = useState(false)

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-logo">
          <span className="app-logo-icon">☭</span>
          <span className="app-logo-text">原理社会</span>
          <button
            className="concept-overview-btn"
            onClick={() => setShowConceptOverview(true)}
            title="概念总览"
          >
            📚
          </button>
        </div>
        <div className="header-actions">
          <button
            className={`header-btn ${isAutoPlaying ? 'active' : ''}`}
            onClick={toggleAutoPlay}
          >
            {isAutoPlaying ? '⏸ 暂停' : '▶ 自动播放'}
          </button>
          <button
            className="header-btn"
            onClick={() => setComparison(true)}
          >
            📊 对比
          </button>
          <button
            className="header-btn"
            onClick={() => setKnowledgeNetwork(true)}
          >
            🕸️ 知识网络
          </button>
          <button
            className="header-btn"
            onClick={() => setExplanation(true)}
          >
            📖 内容讲解
          </button>
          <button
            className="header-btn"
            onClick={() => setQuiz(true)}
          >
            📝 考试复习
          </button>
          <button
            className="header-btn"
            onClick={() => setShowConceptOverview(true)}
          >
            🌳 知识体系
          </button>
          <button
            className="header-btn"
            onClick={() => {
              alert(
                '📖 原理社会 · 马克思主义动态模拟器\n\n' +
                '操作说明：\n' +
                '• 点击时间轴图标切换历史阶段\n' +
                '• 点击小镇中的居民查看对话\n' +
                '• 点击对话气泡中的 ℹ️ 查看词条解释\n' +
                '• 使用"对比"按钮并排比较两个阶段\n' +
                '• 使用"知识网络"查看概念关联图\n' +
                '• 底部理论卡片自动轮播，可手动翻页\n\n' +
                '观察小镇从原始社会到共产主义的演变，\n' +
                '直观感受马克思主义基本原理。'
              )
            }}
          >
            ❓ 帮助
          </button>
        </div>
      </header>

      <div className="main-content">
        <PixelTownCanvas />
        <DataPanel />
      </div>

      <div className="timeline-section">
        <Timeline />
      </div>

      <TheoryCards />

      <DialogBubbles />
      <ComparisonView />
      <KnowledgeNetwork />
      <TheoryFocusPanel />
      <GlossaryPopup />
      <QuizPanel />
      <ExplanationPanel />

      <ConceptOverview show={showConceptOverview} onClose={() => setShowConceptOverview(false)} />

      {tooltipText && tooltipPos && (
        <div
          className="tooltip"
          style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 24 }}
        >
          {tooltipText}
        </div>
      )}
    </div>
  )
}
