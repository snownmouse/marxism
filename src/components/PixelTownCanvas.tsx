import { useRef, useEffect, useCallback, useState } from 'react'
import { useAppStore, BubbleState, DialogItem, Stage } from '../store/useAppStore'
import { drawPixelTown, CANVAS_W, CANVAS_H, getBuildingClickAreas, BuildingClickArea } from '../pixelTown/renderer'
import { PixelTownState, Cloud, Citizen } from '../pixelTown/types'

type DialogPool = { educational: DialogItem[]; chatter: DialogItem[]; quirky: DialogItem[]; building: DialogItem[] }

function createInitialState(): PixelTownState {
  const clouds: Cloud[] = []
  for (let i = 0; i < 4; i++) {
    clouds.push({
      x: Math.random() * 700,
      y: 10 + Math.random() * 40,
      speed: 0.2 + Math.random() * 0.5,
      width: 50 + Math.random() * 40,
    })
  }
  return { time: 0, virtualTime: 0, clouds: [], citizens: [], particles: [] }
}

function buildDialogPools(dialogs: DialogItem[], stageId: number): DialogPool {
  const stageDialogs = dialogs.filter(d => d.stageId === stageId)
  return {
    educational: stageDialogs.filter(d => (!d.chatType || d.chatType === 'educational') && d.classType !== 'building'),
    chatter: stageDialogs.filter(d => d.chatType === 'chatter'),
    quirky: stageDialogs.filter(d => d.chatType === 'quirky'),
    building: stageDialogs.filter(d => d.classType === 'building'),
  }
}

function pickWeightedDialog(pool: DialogPool): DialogItem | null {
  const all: { item: DialogItem; weight: number }[] = []
  for (const d of pool.educational) all.push({ item: d, weight: 5 })
  for (const d of pool.chatter) all.push({ item: d, weight: 2 })
  for (const d of pool.quirky) all.push({ item: d, weight: 1 })
  if (all.length === 0) return null
  const totalW = all.reduce((s, a) => s + a.weight, 0)
  let r = Math.random() * totalW
  for (const a of all) {
    r -= a.weight
    if (r <= 0) return a.item
  }
  return all[all.length - 1].item
}

function pickBuildingDialog(pool: DialogPool, buildingType: string): DialogItem | null {
  const candidates = pool.building.filter(d => d.id.includes(buildingType))
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)]
  }
  if (pool.building.length > 0) {
    return pool.building[Math.floor(Math.random() * pool.building.length)]
  }
  return null
}

function findNearbyCitizen(citizens: Citizen[], from: Citizen, maxDist: number): Citizen | null {
  let best: Citizen | null = null
  let bestDist = Infinity
  for (const c of citizens) {
    if (c === from) continue
    const dx = c.x - from.x
    const dy = c.y - from.y
    const dist = dx * dx + dy * dy
    if (dist < bestDist && dist < maxDist) {
      bestDist = dist
      best = c
    }
  }
  return best
}

function spawnReplyBubble(
  pool: DialogPool,
  citizen: Citizen,
  canvasToScreen: (cx: number, cy: number) => { x: number; y: number },
  delay: number,
  duration: number,
) {
  const replyDialog = pickWeightedDialog(pool)
  if (!replyDialog) return
  const replyPos = canvasToScreen(citizen.x, citizen.y)
  const replyChatType = replyDialog.chatType || 'educational'
  setTimeout(() => {
    const replyBubble: BubbleState = {
      id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      dialogId: replyDialog.id,
      x: replyPos.x,
      y: replyPos.y - 24,
      classType: citizen.label,
      text: replyDialog.text,
      glossaryId: replyDialog.glossaryId,
      opacity: 1,
      createdAt: Date.now(),
      source: 'citizen',
      chatType: replyChatType,
    }
    useAppStore.getState().addBubble(replyBubble)
    setTimeout(() => {
      useAppStore.getState().removeBubble(replyBubble.id)
    }, duration)
  }, delay)
}

export default function PixelTownCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<PixelTownState>(createInitialState())
  const stageRef = useRef<Stage>(useAppStore.getState().stages[useAppStore.getState().currentStageId])
  const buildingAreasRef = useRef<BuildingClickArea[]>([])
  const rafRef = useRef<number>(0)
  const autoDialogueRef = useRef<number>(0)
  const bgDialogueRef = useRef<number>(0)
  const [canvasSize, setCanvasSize] = useState({ width: CANVAS_W, height: CANVAS_H })

  const currentStageId = useAppStore(s => s.currentStageId)
  const stages = useAppStore(s => s.stages)
  const isAutoPlaying = useAppStore(s => s.isAutoPlaying)

  stageRef.current = stages[currentStageId]

  const canvasToScreen = useCallback((cx: number, cy: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = rect.width / CANVAS_W
    const scaleY = rect.height / CANVAS_H
    return {
      x: rect.left + cx * scaleX,
      y: rect.top + cy * scaleY,
    }
  }, [])

  const triggerCitizenConversation = useCallback(() => {
    const citizens = stateRef.current.citizens
    if (citizens.length < 1) return
    const store = useAppStore.getState()
    const pool = buildDialogPools(store.dialogs, store.currentStageId)

    const combined = [...pool.educational, ...pool.chatter, ...pool.quirky]
    if (combined.length === 0) return

    const speaker = citizens[Math.floor(Math.random() * citizens.length)]
    const dialog = pickWeightedDialog(pool)
    if (!dialog) return

    const pos = canvasToScreen(speaker.x, speaker.y)
    const chatType = dialog.chatType || 'educational'

    const bubble: BubbleState = {
      id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      dialogId: dialog.id,
      x: pos.x,
      y: pos.y - 24,
      classType: speaker.label,
      text: dialog.text,
      glossaryId: dialog.glossaryId,
      opacity: 1,
      createdAt: Date.now(),
      source: 'citizen',
      chatType,
    }
    store.addBubble(bubble)

    setTimeout(() => {
      store.removeBubble(bubble.id)
    }, chatType === 'quirky' ? 7000 : (chatType === 'chatter' ? 5000 : 6500))

    const nearby = findNearbyCitizen(citizens, speaker, 2500)
    if (nearby && Math.random() < 0.4) {
      spawnReplyBubble(pool, nearby, canvasToScreen, 1200 + Math.random() * 1500,
        chatType === 'quirky' ? 7000 : (chatType === 'chatter' ? 5000 : 6000))
    }
  }, [canvasToScreen])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = CANVAS_W / rect.width
    const scaleY = CANVAS_H / rect.height
    const cx = (e.clientX - rect.left) * scaleX
    const cy = (e.clientY - rect.top) * scaleY

    const store = useAppStore.getState()
    const pool = buildDialogPools(store.dialogs, store.currentStageId)

    const buildingAreas = buildingAreasRef.current
    let clickedBuilding: BuildingClickArea | null = null
    let minBldgDist = Infinity
    for (const ba of buildingAreas) {
      const bCx = ba.x + 24
      const bCy = ba.y + 18
      const dx = cx - bCx
      const dy = cy - bCy
      const dist = dx * dx + dy * dy
      if (dist < 1600 && dist < minBldgDist) {
        minBldgDist = dist
        clickedBuilding = ba
      }
    }

    if (clickedBuilding) {
      const dialog = pickBuildingDialog(pool, clickedBuilding.type)
      if (dialog) {
        const bCx = clickedBuilding.x + 24
        const bCy = clickedBuilding.y + 18
        const pos = canvasToScreen(bCx, bCy)
        const bubble: BubbleState = {
          id: `bldg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          dialogId: dialog.id,
          x: pos.x,
          y: pos.y - 24,
          classType: `🏛 ${clickedBuilding.label}`,
          text: dialog.text,
          glossaryId: dialog.glossaryId,
          opacity: 1,
          createdAt: Date.now(),
          source: 'citizen',
          chatType: 'educational',
        }
        store.addBubble(bubble)
        setTimeout(() => {
          store.removeBubble(bubble.id)
        }, 9000)
        return
      }
    }

    const citizens = stateRef.current.citizens
    if (citizens.length === 0) return

    let nearest = citizens[0]
    let minDist = Infinity
    for (const c of citizens) {
      const dx = cx - c.x - 5
      const dy = cy - c.y
      const dist = dx * dx + dy * dy
      if (dist < minDist) {
        minDist = dist
        nearest = c
      }
    }
    if (minDist > 400) return

    const dialog = pickWeightedDialog(pool)
    if (!dialog) return

    const pos = canvasToScreen(nearest.x, nearest.y)
    const chatType = dialog.chatType || 'educational'

    const bubble: BubbleState = {
      id: `click-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      dialogId: dialog.id,
      x: pos.x,
      y: pos.y - 24,
      classType: nearest.label,
      text: dialog.text,
      glossaryId: dialog.glossaryId,
      opacity: 1,
      createdAt: Date.now(),
      source: 'citizen',
      chatType,
    }
    store.addBubble(bubble)

    setTimeout(() => {
      useAppStore.getState().removeBubble(bubble.id)
    }, chatType === 'quirky' ? 8000 : (chatType === 'chatter' ? 6000 : 7500))

    const nearby = findNearbyCitizen(citizens, nearest, 2000)
    if (nearby && Math.random() < 0.3) {
      spawnReplyBubble(pool, nearby, canvasToScreen, 1000 + Math.random() * 1200,
        chatType === 'quirky' ? 7000 : (chatType === 'chatter' ? 5000 : 6000))
    }
  }, [canvasToScreen])

  const updateCanvasSize = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const cw = container.clientWidth
    const ch = container.clientHeight
    const aspect = CANVAS_W / CANVAS_H

    let displayW: number, displayH: number
    if (cw / ch > aspect) {
      displayH = ch
      displayW = ch * aspect
    } else {
      displayW = cw
      displayH = cw / aspect
    }

    displayW = Math.max(displayW, 320)
    displayH = Math.max(displayH, 180)

    setCanvasSize({ width: Math.floor(displayW), height: Math.floor(displayH) })
  }, [])

  useEffect(() => {
    updateCanvasSize()
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => updateCanvasSize())
    ro.observe(container)
    return () => ro.disconnect()
  }, [updateCanvasSize])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = CANVAS_W
    canvas.height = CANVAS_H

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let lastTime = 0
    const animate = (timestamp: number) => {
      if (lastTime === 0) lastTime = timestamp
      const dt = timestamp - lastTime
      lastTime = timestamp

      if (dt < 16 || dt > 100) {
        stateRef.current.time += 1
        stateRef.current.virtualTime += 1 / 60 * (72 / 180)
      } else {
        stateRef.current.time += dt / 16
        stateRef.current.virtualTime += (dt / 1000) * (72 / 180)
      }

      drawPixelTown(ctx, stageRef.current, stateRef.current)
      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  useEffect(() => {
    const newState = createInitialState()
    newState.citizens = []
    stateRef.current = newState
    buildingAreasRef.current = getBuildingClickAreas(stageRef.current)

    setTimeout(() => { triggerCitizenConversation() }, 600)
    setTimeout(() => { triggerCitizenConversation() }, 1800)
    setTimeout(() => { triggerCitizenConversation() }, 3500)
  }, [currentStageId, triggerCitizenConversation])

  useEffect(() => {
    clearInterval(bgDialogueRef.current)
    bgDialogueRef.current = window.setInterval(() => {
      triggerCitizenConversation()
    }, 10000 + Math.random() * 6000)

    return () => {
      clearInterval(bgDialogueRef.current)
    }
  }, [currentStageId, triggerCitizenConversation])

  useEffect(() => {
    if (isAutoPlaying) {
      autoDialogueRef.current = window.setInterval(() => {
        triggerCitizenConversation()
      }, 4500 + Math.random() * 3000)
      return () => {
        clearInterval(autoDialogueRef.current)
      }
    } else {
      clearInterval(autoDialogueRef.current)
    }
  }, [isAutoPlaying, currentStageId, triggerCitizenConversation])

  return (
    <div ref={containerRef} className="pixel-town-container" onClick={handleClick}>
      <canvas
        ref={canvasRef}
        className="pixel-town-canvas"
        style={{
          width: `${canvasSize.width}px`,
          height: `${canvasSize.height}px`,
        }}
      />
    </div>
  )
}