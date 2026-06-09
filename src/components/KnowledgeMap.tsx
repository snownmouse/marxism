import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'

interface KnowledgeNode {
  id: string
  title: string
  category: string
  description: string
  color: string
  icon: string
  children?: KnowledgeNode[]
  relatedCards?: string[]
}

const knowledgeTree: KnowledgeNode[] = [
  {
    id: 'marxism',
    title: '马克思主义',
    category: '核心',
    description: '马克思主义是关于自然、社会和人类思维发展一般规律的科学',
    color: '#FFD700',
    icon: '🏛️',
    children: [
      {
        id: 'philosophy',
        title: '马克思主义哲学',
        category: '哲学',
        description: '辩证唯物主义与历史唯物主义',
        color: '#9C27B0',
        icon: '💭',
        children: [
          {
            id: 'materialism',
            title: '唯物论',
            category: '哲学',
            description: '物质是第一性，意识是第二性',
            color: '#E91E63',
            icon: '🪨',
            relatedCards: ['card_dialectical_materialism']
          },
          {
            id: 'dialectics',
            title: '辩证法',
            category: '哲学',
            description: '矛盾是事物发展的动力',
            color: '#00BCD4',
            icon: '⚖️',
            relatedCards: ['card_dialectics']
          },
          {
            id: 'epistemology',
            title: '认识论',
            category: '哲学',
            description: '实践是认识的来源和目的',
            color: '#009688',
            icon: '👁️',
            relatedCards: ['card_practice_and_cognition']
          },
          {
            id: 'historical_materialism',
            title: '历史唯物主义',
            category: '哲学',
            description: '社会存在决定社会意识',
            color: '#4CAF50',
            icon: '📜',
            relatedCards: ['card_base_and_superstructure']
          }
        ]
      },
      {
        id: 'economics',
        title: '政治经济学',
        category: '经济',
        description: '研究资本主义经济规律',
        color: '#FF5722',
        icon: '💰',
        children: [
          {
            id: 'labor_theory',
            title: '劳动价值论',
            category: '经济',
            description: '商品价值由社会必要劳动时间决定',
            color: '#FF9800',
            icon: '⚒️',
            relatedCards: ['card_labor_duality']
          },
          {
            id: 'surplus_value',
            title: '剩余价值理论',
            category: '经济',
            description: '资本家无偿占有工人创造的剩余价值',
            color: '#F44336',
            icon: '💎',
            relatedCards: ['card_surplus_value']
          },
          {
            id: 'capital_accumulation',
            title: '资本积累',
            category: '经济',
            description: '资本积累导致贫富分化',
            color: '#795548',
            icon: '📈',
            relatedCards: ['card_capital_accumulation']
          },
          {
            id: 'economic_crisis',
            title: '经济危机',
            category: '经济',
            description: '资本主义基本矛盾的必然结果',
            color: '#607D8B',
            icon: '⚠️',
            relatedCards: ['card_cyclical_crisis']
          }
        ]
      },
      {
        id: 'socialism',
        title: '科学社会主义',
        category: '政治',
        description: '关于无产阶级解放的学说',
        color: '#2196F3',
        icon: '🔧',
        children: [
          {
            id: 'class_struggle',
            title: '阶级斗争',
            category: '政治',
            description: '阶级社会发展的直接动力',
            color: '#3F51B5',
            icon: '⚔️',
            relatedCards: ['card_class_struggle']
          },
          {
            id: 'proletarian_revolution',
            title: '无产阶级革命',
            category: '政治',
            description: '推翻资本主义制度的根本途径',
            color: '#E91E63',
            icon: '🚩',
            relatedCards: ['card_revolution']
          },
          {
            id: 'dictatorship',
            title: '无产阶级专政',
            category: '政治',
            description: '过渡时期的国家形式',
            color: '#9C27B0',
            icon: '🛡️',
            relatedCards: ['card_dictatorship_proletariat']
          },
          {
            id: 'communism',
            title: '共产主义',
            category: '政治',
            description: '人类最美好的社会形态',
            color: '#4CAF50',
            icon: '⭐',
            relatedCards: ['card_communism']
          }
        ]
      }
    ]
  }
]

export default function KnowledgeMap() {
  const setQuiz = useAppStore(s => s.setQuiz)
  const setExplanation = useAppStore(s => s.setExplanation)
  
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['marxism']))

  const toggleExpand = (nodeId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
      } else {
        newSet.add(nodeId)
      }
      return newSet
    })
  }

  const handleNodeClick = (node: KnowledgeNode) => {
    setSelectedNode(node)
  }

  const handlePractice = (category: string) => {
    setQuiz(true)
    setSelectedNode(null)
  }

  const handleExplain = () => {
    setExplanation(true)
    setSelectedNode(null)
  }

  const renderNode = (node: KnowledgeNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0
    const isExpanded = expandedCategories.has(node.id)

    return (
      <div key={node.id}>
        <div 
          className="knowledge-node"
          style={{ paddingLeft: `${level * 16}px` }}
          onClick={() => {
            if (hasChildren) {
              toggleExpand(node.id)
            }
            handleNodeClick(node)
          }}
        >
          <div className="node-content" style={{ borderLeftColor: node.color }}>
            <div className="node-header">
              <span className="node-icon">{node.icon}</span>
              <div className="node-info">
                <span className="node-title">{node.title}</span>
                <span className="node-category" style={{ backgroundColor: `${node.color}20`, color: node.color }}>
                  {node.category}
                </span>
              </div>
              {hasChildren && (
                <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>▼</span>
              )}
            </div>
            <p className="node-description">{node.description}</p>
          </div>
        </div>
        
        {hasChildren && isExpanded && (
          <div className="node-children">
            {node.children!.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="knowledge-map-container">
      <div className="map-header">
        <h2>🌳 知识体系导航</h2>
        <p className="map-desc">点击展开查看详细内容，了解马克思主义理论体系</p>
      </div>

      <div className="map-content">
        <div className="map-tree">
          {knowledgeTree.map(root => renderNode(root))}
        </div>

        {selectedNode && (
          <div className="map-detail">
            <div className="detail-header">
              <div className="detail-icon" style={{ backgroundColor: `${selectedNode.color}20`, color: selectedNode.color }}>
                {selectedNode.icon}
              </div>
              <div className="detail-title-area">
                <h3>{selectedNode.title}</h3>
                <span className="detail-category" style={{ backgroundColor: `${selectedNode.color}20`, color: selectedNode.color }}>
                  {selectedNode.category}
                </span>
              </div>
              <button className="detail-close" onClick={() => setSelectedNode(null)}>✕</button>
            </div>
            <p className="detail-description">{selectedNode.description}</p>
            <div className="detail-actions">
              <button className="action-btn" onClick={() => handlePractice(selectedNode.category)}>
                📝 练习相关题目
              </button>
              <button className="action-btn secondary" onClick={handleExplain}>
                📖 查看内容讲解
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="map-legend">
        <div className="legend-title">📚 知识分类</div>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#9C27B0' }}></span>
            <span>哲学基础</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#FF5722' }}></span>
            <span>政治经济学</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#2196F3' }}></span>
            <span>科学社会主义</span>
          </div>
        </div>
      </div>
    </div>
  )
}