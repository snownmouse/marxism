import { useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import networkData from '../data/knowledgeNetwork.json'

interface NodePosition {
  id: string
  x: number
  y: number
  term: string
  category: string
  shape: string
}

export default function KnowledgeNetwork() {
  const showKnowledgeNetwork = useAppStore(s => s.showKnowledgeNetwork)
  const setKnowledgeNetwork = useAppStore(s => s.setKnowledgeNetwork)
  const setHighlightedStages = useAppStore(s => s.setHighlightedStages)
  const glossary = useAppStore(s => s.glossary)
  const setGlossaryPopup = useAppStore(s => s.setGlossaryPopup)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const positionsRef = useRef<NodePosition[]>([])

  const categoryColors: Record<string, string> = {
    philosophy: '#9C27B0',
    economy: '#2196F3',
    society: '#FF9800',
  }

  const categoryLabels: Record<string, string> = {
    philosophy: '哲学',
    economy: '经济',
    society: '社会',
  }

  const initPositions = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const w = canvas.width
    const h = canvas.height
    const categories = ['philosophy', 'economy', 'society']
    const catNodes = categories.map(cat =>
      networkData.nodes.filter(n => n.category === cat)
    )

    const positions: NodePosition[] = []
    catNodes.forEach((nodes, catIdx) => {
      const centerX = w * (0.2 + catIdx * 0.3)
      const radius = 120
      nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2
        positions.push({
          id: node.id,
          x: centerX + Math.cos(angle) * radius,
          y: h / 2 + Math.sin(angle) * radius * 0.7,
          term: node.term,
          category: node.category,
          shape: node.shape,
        })
      })
    })
    positionsRef.current = positions
  }, [])

  useEffect(() => {
    if (!showKnowledgeNetwork) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = 900
    canvas.height = 600
    initPositions()

    const draw = () => {
      const positions = positionsRef.current
      ctx.clearRect(0, 0, 900, 600)

      ctx.fillStyle = '#14141f'
      ctx.fillRect(0, 0, 900, 600)

      for (const edge of networkData.edges) {
        const source = positions.find(p => p.id === edge.source)
        const target = positions.find(p => p.id === edge.target)
        if (!source || !target) continue

        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'
        ctx.lineWidth = 1
        ctx.stroke()

        const midX = (source.x + target.x) / 2
        const midY = (source.y + target.y) / 2
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.font = '9px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(edge.label, midX, midY - 4)
      }

      for (const pos of positions) {
        const color = categoryColors[pos.category] || '#FFF'
        ctx.fillStyle = color
        ctx.globalAlpha = 0.85

        if (pos.shape === 'circle') {
          ctx.beginPath()
          ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = 'rgba(255,255,255,0.15)'
          ctx.lineWidth = 1.5
          ctx.stroke()
          ctx.shadowColor = color
          ctx.shadowBlur = 10
          ctx.fill()
          ctx.shadowBlur = 0
        } else if (pos.shape === 'square') {
          ctx.fillRect(pos.x - 14, pos.y - 14, 28, 28)
          ctx.strokeStyle = 'rgba(255,255,255,0.15)'
          ctx.lineWidth = 1.5
          ctx.strokeRect(pos.x - 14, pos.y - 14, 28, 28)
          ctx.shadowColor = color
          ctx.shadowBlur = 10
          ctx.fill()
          ctx.shadowBlur = 0
        } else if (pos.shape === 'diamond') {
          ctx.beginPath()
          ctx.moveTo(pos.x, pos.y - 16)
          ctx.lineTo(pos.x + 16, pos.y)
          ctx.lineTo(pos.x, pos.y + 16)
          ctx.lineTo(pos.x - 16, pos.y)
          ctx.closePath()
          ctx.fill()
          ctx.strokeStyle = 'rgba(255,255,255,0.15)'
          ctx.lineWidth = 1.5
          ctx.stroke()
          ctx.shadowColor = color
          ctx.shadowBlur = 10
          ctx.fill()
          ctx.shadowBlur = 0
        }

        ctx.globalAlpha = 1
        ctx.fillStyle = '#FFF'
        ctx.font = 'bold 10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(pos.term, pos.x, pos.y)
      }

      const legendY = 30
      let legendX = 30
      for (const [cat, label] of Object.entries(categoryLabels)) {
        ctx.fillStyle = categoryColors[cat]
        ctx.globalAlpha = 0.85
        if (cat === 'philosophy') {
          ctx.beginPath()
          ctx.arc(legendX, legendY, 8, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowColor = categoryColors[cat]
          ctx.shadowBlur = 8
          ctx.fill()
          ctx.shadowBlur = 0
        } else if (cat === 'economy') {
          ctx.fillRect(legendX - 8, legendY - 8, 16, 16)
          ctx.shadowColor = categoryColors[cat]
          ctx.shadowBlur = 8
          ctx.fill()
          ctx.shadowBlur = 0
        } else {
          ctx.beginPath()
          ctx.moveTo(legendX, legendY - 8)
          ctx.lineTo(legendX + 8, legendY)
          ctx.lineTo(legendX, legendY + 8)
          ctx.lineTo(legendX - 8, legendY)
          ctx.closePath()
          ctx.fill()
          ctx.shadowColor = categoryColors[cat]
          ctx.shadowBlur = 8
          ctx.fill()
          ctx.shadowBlur = 0
        }
        ctx.globalAlpha = 1
        ctx.fillStyle = 'rgba(255,255,255,0.7)'
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(label, legendX + 14, legendY + 4)
        legendX += 80
      }
    }

    draw()

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left) * (canvas.width / rect.width)
      const y = (e.clientY - rect.top) * (canvas.height / rect.height)

      for (const pos of positionsRef.current) {
        const dx = x - pos.x
        const dy = y - pos.y
        if (Math.sqrt(dx * dx + dy * dy) < 18) {
          const stageIds: number[] = []
          for (const [stageIdStr, terms] of Object.entries(networkData.stageHighlights)) {
            if (terms.includes(pos.id)) {
              stageIds.push(Number(stageIdStr))
            }
          }
          setHighlightedStages(stageIds)

          const glossaryItem = glossary.find(g => g.id === pos.id)
          if (glossaryItem) {
            setGlossaryPopup(glossaryItem)
          }

          setTimeout(() => setHighlightedStages([]), 3000)
          break
        }
      }
    }

    canvas.addEventListener('click', handleClick)
    return () => canvas.removeEventListener('click', handleClick)
  }, [showKnowledgeNetwork, initPositions, setHighlightedStages, glossary, setGlossaryPopup])

  if (!showKnowledgeNetwork) return null

  return (
    <div className="modal-overlay" onClick={() => setKnowledgeNetwork(false)}>
      <div className="modal-content network-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🕸️ 知识网络地图</h3>
          <button className="modal-close" onClick={() => setKnowledgeNetwork(false)}>✕</button>
        </div>
        <p className="network-hint">点击概念节点查看词条并高亮相关阶段</p>
        <canvas ref={canvasRef} className="network-canvas" />
      </div>
    </div>
  )
}
