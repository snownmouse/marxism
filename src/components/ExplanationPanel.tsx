import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'

type TabType = 'overview' | 'stage' | 'glossary' | 'card'

interface ExplainedTopic {
  id: string
  title: string
  category: string
  content: string
  keyPoints: string[]
  example: string
  relatedTopics: string[]
}

export default function ExplanationPanel() {
  const showExplanation = useAppStore(s => s.showExplanation)
  const setExplanation = useAppStore(s => s.setExplanation)
  const stages = useAppStore(s => s.stages)
  const glossary = useAppStore(s => s.glossary)
  const knowledgeCards = useAppStore(s => s.knowledgeCards)
  const currentStageId = useAppStore(s => s.currentStageId)
  const setGlossaryPopup = useAppStore(s => s.setGlossaryPopup)
  const setStage = useAppStore(s => s.setStage)

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [selectedStage, setSelectedStage] = useState(currentStageId)

  const coreTopics: ExplainedTopic[] = [
    {
      id: 'dialectical_materialism',
      title: '辩证唯物主义',
      category: '哲学基础',
      content: '辩证唯物主义是马克思主义的世界观和方法论，认为世界是物质的，物质是运动的，运动是有规律的。辩证法的核心是对立统一规律，即矛盾是事物发展的根本动力。',
      keyPoints: [
        '世界的本原是物质，物质决定意识',
        '运动是物质的根本属性',
        '对立统一规律是辩证法的核心',
        '量变到质变的发展规律',
        '否定之否定规律'
      ],
      example: '社会从低级到高级的发展，体现了量变到质变的辩证规律。生产力的逐步积累最终导致社会制度的根本变革。',
      relatedTopics: ['矛盾', '量变与质变', '否定之否定']
    },
    {
      id: 'historical_materialism',
      title: '历史唯物主义',
      category: '哲学基础',
      content: '历史唯物主义是马克思主义关于人类社会发展一般规律的科学。它认为社会存在决定社会意识，生产力决定生产关系，经济基础决定上层建筑。',
      keyPoints: [
        '社会存在决定社会意识',
        '生产力是社会发展的最终决定力量',
        '生产关系一定要适合生产力状况',
        '经济基础决定上层建筑',
        '人民群众是历史的创造者'
      ],
      example: '蒸汽机的出现（生产力发展）改变了社会存在，进而改变了人们的思想观念（社会意识），推动了资本主义制度的建立。',
      relatedTopics: ['生产力', '生产关系', '经济基础与上层建筑']
    },
    {
      id: 'labor_value_theory',
      title: '劳动价值论',
      category: '政治经济学',
      content: '劳动价值论是马克思主义政治经济学的基础。它认为商品的价值由生产该商品的社会必要劳动时间决定，具体劳动创造使用价值，抽象劳动形成价值。',
      keyPoints: [
        '商品是使用价值和价值的统一',
        '价值由社会必要劳动时间决定',
        '劳动二重性：具体劳动和抽象劳动',
        '价值规律是商品经济的基本规律',
        '货币是固定充当一般等价物的商品'
      ],
      example: '木匠做椅子——具体劳动（锯、刨、钉）造出能坐的椅子（使用价值），抽象劳动（体力和脑力的支出）赋予椅子价值。',
      relatedTopics: ['劳动二重性', '价值规律', '货币的本质']
    },
    {
      id: 'surplus_value',
      title: '剩余价值理论',
      category: '政治经济学',
      content: '剩余价值理论揭示了资本主义剥削的秘密。工人创造的价值大于其劳动力的价值（工资），差额就是剩余价值，被资本家无偿占有。',
      keyPoints: [
        '劳动力成为商品是剩余价值产生的前提',
        '剩余价值是资本增殖的源泉',
        '剩余价值率反映剥削程度',
        '绝对剩余价值与相对剩余价值',
        '资本积累导致贫富分化'
      ],
      example: '工人一天创造100元价值，工资只有40元，60元剩余价值被资本家拿走。剩余价值率=60/40=150%。',
      relatedTopics: ['劳动力商品', '资本积累', '利润率趋于下降']
    },
    {
      id: 'class_struggle',
      title: '阶级斗争理论',
      category: '马克思主义基本原理',
      content: '阶级斗争是阶级社会发展的直接动力。对立阶级之间基于利益冲突的斗争推动社会变革，从奴隶起义到工人运动，都是阶级斗争的表现。',
      keyPoints: [
        '阶级是与特定生产关系相联系的社会集团',
        '阶级斗争是阶级社会发展的直接动力',
        '无产阶级是资本主义的掘墓人',
        '社会主义革命是无产阶级反对资产阶级的斗争',
        '阶级斗争必然导致无产阶级专政'
      ],
      example: '巴黎公社工人武装起义，第一次尝试建立无产阶级政权，是阶级斗争的光辉范例。',
      relatedTopics: ['无产阶级专政', '革命', '巴黎公社']
    },
    {
      id: 'communist_society',
      title: '共产主义社会',
      category: '马克思主义基本原理',
      content: '共产主义是生产力高度发展、消灭阶级和阶级差别、实现"各尽所能，按需分配"的社会制度。它是人类从必然王国向自由王国的飞跃。',
      keyPoints: [
        '生产力高度发展是前提',
        '消灭阶级和阶级差别',
        '生产资料公有制',
        '各尽所能，按需分配',
        '人的自由全面发展',
        '国家自行消亡'
      ],
      example: '在共产主义社会，居民上午编程、下午画画，不再被固定分工束缚，需要什么就拿什么，劳动成为人的第一需要。',
      relatedTopics: ['人的全面发展', '国家消亡', '自由王国']
    }
  ]

  const currentStage = stages.find(s => s.id === selectedStage)

  if (!showExplanation) return null

  return (
    <div className="modal-overlay" onClick={() => setExplanation(false)}>
      <div className="modal-content explanation-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📖 内容讲解</h3>
          <button className="modal-close" onClick={(e) => { e.stopPropagation(); setExplanation(false); }}>✕</button>
        </div>

        <div className="explanation-tabs">
          <button
            className={`explanation-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            🏛️ 核心理论
          </button>
          <button
            className={`explanation-tab ${activeTab === 'stage' ? 'active' : ''}`}
            onClick={() => setActiveTab('stage')}
          >
            📊 阶段解析
          </button>
          <button
            className={`explanation-tab ${activeTab === 'glossary' ? 'active' : ''}`}
            onClick={() => setActiveTab('glossary')}
          >
            📚 术语辞典
          </button>
          <button
            className={`explanation-tab ${activeTab === 'card' ? 'active' : ''}`}
            onClick={() => setActiveTab('card')}
          >
            🃏 知识卡片
          </button>
        </div>

        <div className="explanation-content">
          {activeTab === 'overview' && (
            <div className="overview-section">
              <div className="overview-header">
                <h4>马克思主义核心理论体系</h4>
                <p className="overview-desc">深入理解马克思主义的六大核心理论</p>
              </div>
              <div className="topics-list">
                {coreTopics.map(topic => (
                  <div key={topic.id} className="topic-card">
                    <div className="topic-header">
                      <div className="topic-title">{topic.title}</div>
                      <span className="topic-category">{topic.category}</span>
                    </div>
                    <div className="topic-content">{topic.content}</div>
                    <div className="topic-key-points">
                      <div className="key-points-header">📌 核心要点</div>
                      <ul className="key-points-list">
                        {topic.keyPoints.map((point, index) => (
                          <li key={index} className="key-point">
                            <span className="point-number">{index + 1}.</span>
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="topic-example">
                      <div className="example-header">💡 实例说明</div>
                      <p>{topic.example}</p>
                    </div>
                    <div className="topic-related">
                      <div className="related-header">🔗 相关概念</div>
                      <div className="related-tags">
                        {topic.relatedTopics.map((tag, index) => {
                          const gloss = glossary.find(g => g.term === tag)
                          return (
                            <button
                              key={index}
                              className="related-tag"
                              onClick={() => gloss && setGlossaryPopup(gloss)}
                            >
                              {tag}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'stage' && (
            <div className="stage-section">
              <div className="stage-selector">
                <select
                  value={selectedStage}
                  onChange={(e) => setSelectedStage(Number(e.target.value))}
                >
                  {stages.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  className="stage-jump-btn"
                  onClick={() => {
                    setStage(selectedStage)
                    setExplanation(false)
                  }}
                >
                  🚀 跳转至该阶段
                </button>
              </div>

              {currentStage && (
                <div className="stage-detail">
                  <div className="stage-title-row">
                    <span className="stage-icon">
                      {currentStage.icon === 'axe' ? '🪓' : currentStage.icon === 'wheat_chain' ? '🌾' : currentStage.icon === 'chain' ? '⛓️' : currentStage.icon === 'castle' ? '🏰' : currentStage.icon === 'smoke' ? '🏭' : currentStage.icon === 'moneybag' ? '💰' : currentStage.icon === 'handshake' ? '🤝' : '⭐'}
                    </span>
                    <h4>{currentStage.name}</h4>
                  </div>

                  <div className="stage-info-grid">
                    <div className="info-card">
                      <div className="info-label">生产力水平</div>
                      <div className="info-value">{currentStage.productivity}</div>
                    </div>
                    <div className="info-card">
                      <div className="info-label">生产关系</div>
                      <div className="info-value">{currentStage.relations}</div>
                    </div>
                    <div className="info-card">
                      <div className="info-label">剥削率</div>
                      <div className="info-value exploitation">{currentStage.exploitationRate}%</div>
                    </div>
                  </div>

                  <div className="stage-classes">
                    <div className="section-header">社会阶级结构</div>
                    <div className="classes-bar">
                      {currentStage.classes.map((cls, index) => (
                        <div
                          key={index}
                          className="class-segment"
                          style={{ width: `${cls.populationPct}%`, backgroundColor: cls.color }}
                          title={`${cls.name}: ${cls.populationPct}%`}
                        />
                      ))}
                    </div>
                    <div className="classes-legend">
                      {currentStage.classes.map((cls, index) => (
                        <div key={index} className="legend-item">
                          <span className="legend-color" style={{ backgroundColor: cls.color }}></span>
                          <span className="legend-text">{cls.name} ({cls.populationPct}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="stage-superstructure">
                    <div className="section-header">上层建筑</div>
                    <div className="superstructure-grid">
                      <div className="super-item">
                        <span className="super-label">🏛️</span>
                        <div className="super-content">
                          <div className="super-title">政治制度</div>
                          <div className="super-desc">{currentStage.superstructure.politics}</div>
                        </div>
                      </div>
                      <div className="super-item">
                        <span className="super-label">⚖️</span>
                        <div className="super-content">
                          <div className="super-title">法律体系</div>
                          <div className="super-desc">{currentStage.superstructure.law}</div>
                        </div>
                      </div>
                      <div className="super-item">
                        <span className="super-label">💭</span>
                        <div className="super-content">
                          <div className="super-title">意识形态</div>
                          <div className="super-desc">{currentStage.superstructure.ideology}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="stage-cards">
                    <div className="section-header">本阶段知识点</div>
                    <div className="cards-list">
                      {knowledgeCards
                        .filter(c => c.stageId === selectedStage)
                        .map(card => (
                          <div key={card.id} className="mini-card">
                            <div className="mini-card-title">{card.title}</div>
                            <div className="mini-card-cat">{card.category}</div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'glossary' && (
            <div className="glossary-section">
              <div className="glossary-header">
                <h4>术语辞典</h4>
                <p>共 {glossary.length} 个术语</p>
              </div>
              <div className="glossary-filter">
                <select className="filter-select">
                  <option value="all">全部类别</option>
                  <option value="哲学基础">哲学基础</option>
                  <option value="政治经济学">政治经济学</option>
                  <option value="马克思主义基本原理">马克思主义基本原理</option>
                </select>
              </div>
              <div className="glossary-list">
                {glossary.map(item => (
                  <div
                    key={item.id}
                    className="glossary-item"
                    onClick={() => setGlossaryPopup(item)}
                  >
                    <div className="glossary-term">{item.term}</div>
                    <div className="glossary-def">{item.definition.slice(0, 60)}...</div>
                    <span className="glossary-cat">{item.category}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'card' && (
            <div className="cards-section">
              <div className="cards-header">
                <h4>知识卡片库</h4>
                <p>共 {knowledgeCards.length} 张卡片</p>
              </div>
              <div className="cards-filter">
                <select className="filter-select">
                  <option value="all">全部阶段</option>
                  {stages.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <select className="filter-select">
                  <option value="all">全部类别</option>
                  <option value="哲学基础">哲学基础</option>
                  <option value="政治经济学">政治经济学</option>
                  <option value="马克思主义基本原理">马克思主义基本原理</option>
                </select>
              </div>
              <div className="cards-grid">
                {knowledgeCards.map(card => (
                  <div key={card.id} className="knowledge-card-item">
                    <div className="card-category">{card.category}</div>
                    <div className="card-title">{card.title}</div>
                    <div className="card-explanation">{card.explanation}</div>
                    <div className="card-instance">💡 {card.instance}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}