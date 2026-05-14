import { Stage } from '../store/useAppStore'
import { PixelTownState, Citizen } from './types'

const TILE = 16
const W = 640
const H = 360
const SKY_H = 148
const GND = SKY_H

function FR(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(Math.floor(x), Math.floor(y), w, h)
}

function polygon(ctx: CanvasRenderingContext2D, points: [number, number][], color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
  ctx.closePath()
  ctx.fill()
}

function hash(x: number, y: number): number {
  let h = ((x * 374761393 + y * 668265263 + 1274126177) | 0) >>> 0
  h = ((h ^ (h >> 13)) * 1274126177) >>> 0
  return (h ^ (h >> 16)) & 0xFFFF
}

function darken(color: string, factor: number): string {
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  return `#${d2(Math.floor(r * factor))}${d2(Math.floor(g * factor))}${d2(Math.floor(b * factor))}`
}

function lighten(color: string, factor: number): string {
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  return `#${d2(Math.min(255, Math.floor(r + (255 - r) * factor)))}${d2(Math.min(255, Math.floor(g + (255 - g) * factor)))}${d2(Math.min(255, Math.floor(b + (255 - b) * factor)))}`
}

function d2(n: number): string { return n.toString(16).padStart(2, '0') }

interface RoadDef { x: number; y: number; w: number; h: number; type: 'dirt' | 'stone' | 'cobble' }
interface PlotDef { row: number; col: number; x: number; y: number; w: number; h: number }

interface TownLayout {
  roads: RoadDef[]
  plots: PlotDef[]
}

function buildTownLayout(stageId: number): TownLayout {
  const roads: RoadDef[] = []
  const plots: PlotDef[] = []

  const mainRoadY = GND + 58
  const roadH = 14
  const topRoadY = GND + 6

  roads.push({ x: 0, y: mainRoadY, w: W, h: roadH, type: stageId >= 4 ? 'stone' : 'dirt' })

  if (stageId >= 1) {
    roads.push({ x: 300, y: GND, w: 14, h: 200, type: 'dirt' })
  }
  if (stageId >= 3) {
    roads.push({ x: 0, y: topRoadY, w: W, h: 12, type: 'dirt' })
    roads.push({ x: 120, y: GND, w: 12, h: 200, type: stageId >= 4 ? 'cobble' : 'dirt' })
  }
  if (stageId >= 4) {
    roads.push({ x: 0, y: mainRoadY + 64, w: W, h: 12, type: 'stone' })
    roads.push({ x: 490, y: GND, w: 12, h: 200, type: 'cobble' })
  }

  if (stageId >= 2) {
    plots.push({ row: 0, col: 0, x: 30, y: topRoadY + 16, w: 120, h: 44 })
    plots.push({ row: 0, col: 1, x: 170, y: topRoadY + 16, w: 110, h: 44 })
    plots.push({ row: 0, col: 2, x: 330, y: topRoadY + 16, w: 140, h: 44 })
    plots.push({ row: 1, col: 0, x: 30, y: mainRoadY + roadH + 6, w: 110, h: 44 })
    plots.push({ row: 1, col: 1, x: 160, y: mainRoadY + roadH + 6, w: 110, h: 44 })
    plots.push({ row: 1, col: 2, x: 330, y: mainRoadY + roadH + 6, w: 130, h: 44 })
  } else {
    plots.push({ row: 0, col: 0, x: 50, y: topRoadY + 12, w: 180, h: 50 })
    plots.push({ row: 0, col: 1, x: 340, y: topRoadY + 12, w: 180, h: 50 })
    plots.push({ row: 1, col: 0, x: 50, y: mainRoadY + roadH + 8, w: 160, h: 44 })
    plots.push({ row: 1, col: 1, x: 340, y: mainRoadY + roadH + 8, w: 160, h: 44 })
  }

  if (stageId >= 5) {
    plots.push({ row: 2, col: 0, x: 40, y: mainRoadY + 64 + 16, w: 130, h: 40 })
    plots.push({ row: 2, col: 1, x: 190, y: mainRoadY + 64 + 16, w: 130, h: 40 })
    plots.push({ row: 2, col: 2, x: 340, y: mainRoadY + 64 + 16, w: 120, h: 40 })
  }

  return { roads, plots }
}

function getStageBuildings(stageId: number): { type: string; plotRow: number; plotCol: number }[] {
  const layouts: Record<number, { type: string; plotRow: number; plotCol: number }[]> = {
    0: [
      { type: 'cave', plotRow: 0, plotCol: 0 },
      { type: 'campfire', plotRow: 0, plotCol: 1 },
      { type: 'storage_hut', plotRow: 1, plotCol: 0 },
    ],
    1: [
      { type: 'elder_hut', plotRow: 0, plotCol: 0 },
      { type: 'fence_area', plotRow: 0, plotCol: 1 },
      { type: 'barn', plotRow: 1, plotCol: 0 },
      { type: 'storage_hut', plotRow: 1, plotCol: 1 },
    ],
    2: [
      { type: 'palace', plotRow: 0, plotCol: 0 },
      { type: 'temple', plotRow: 0, plotCol: 1 },
      { type: 'slave_camp', plotRow: 0, plotCol: 2 },
      { type: 'granary', plotRow: 1, plotCol: 1 },
    ],
    3: [
      { type: 'castle', plotRow: 0, plotCol: 0 },
      { type: 'church', plotRow: 0, plotCol: 1 },
      { type: 'manor', plotRow: 0, plotCol: 2 },
      { type: 'village_hut', plotRow: 1, plotCol: 0 },
      { type: 'tavern', plotRow: 1, plotCol: 1 },
      { type: 'mill', plotRow: 1, plotCol: 2 },
    ],
    4: [
      { type: 'factory', plotRow: 0, plotCol: 0 },
      { type: 'market', plotRow: 0, plotCol: 1 },
      { type: 'parliament', plotRow: 0, plotCol: 2 },
      { type: 'slum_row', plotRow: 1, plotCol: 0 },
      { type: 'bank', plotRow: 1, plotCol: 1 },
      { type: 'pub', plotRow: 1, plotCol: 2 },
    ],
    5: [
      { type: 'skyscraper', plotRow: 0, plotCol: 0 },
      { type: 'bank_tower', plotRow: 0, plotCol: 1 },
      { type: 'police_hq', plotRow: 0, plotCol: 2 },
      { type: 'slum_row', plotRow: 1, plotCol: 0 },
      { type: 'barricade', plotRow: 1, plotCol: 1 },
      { type: 'pub', plotRow: 1, plotCol: 2 },
      { type: 'factory_small', plotRow: 2, plotCol: 1 },
    ],
    6: [
      { type: 'collective_farm', plotRow: 0, plotCol: 0 },
      { type: 'culture_palace', plotRow: 0, plotCol: 1 },
      { type: 'hospital', plotRow: 0, plotCol: 2 },
      { type: 'school', plotRow: 1, plotCol: 0 },
      { type: 'library', plotRow: 1, plotCol: 1 },
      { type: 'housing_block', plotRow: 1, plotCol: 2 },
    ],
    7: [
      { type: 'green_energy', plotRow: 0, plotCol: 0 },
      { type: 'auto_factory', plotRow: 0, plotCol: 1 },
      { type: 'leisure_center', plotRow: 0, plotCol: 2 },
      { type: 'tech_tree', plotRow: 1, plotCol: 0 },
      { type: 'library', plotRow: 1, plotCol: 1 },
      { type: 'park', plotRow: 1, plotCol: 2 },
    ],
  }
  return layouts[stageId] || layouts[0]
}

const SKY_COLORS: Record<string, string[]> = {
  night:   ['#0A0A2E', '#0F1040', '#1A1A4A', '#1E2050'],
  dawn:    ['#1E3050', '#3A4A70', '#D08040', '#E8B860'],
  morning: ['#4A80C0', '#5B9BE5', '#8BBBF0', '#C8E0F8'],
  noon:    ['#3A7BD5', '#5B9BE5', '#8BBBF0', '#C8E0F8'],
  evening: ['#4A80C0', '#8B60A0', '#D07050', '#E89060'],
  dusk:    ['#2A2040', '#3A3050', '#C05030', '#D86030'],
}

function getSkyPhase(virtualTime: number): { phase: string; t: number } {
  const h = virtualTime % 24
  if (h < 4.5) return { phase: 'night', t: 0 }
  if (h < 5.5) return { phase: 'dawn', t: (h - 4.5) / 1 }
  if (h < 6.5) return { phase: 'morning', t: (h - 5.5) / 1 }
  if (h < 15) return { phase: 'noon', t: 0 }
  if (h < 16.5) return { phase: 'evening', t: (h - 15) / 1.5 }
  if (h < 18) return { phase: 'dusk', t: (h - 16.5) / 1.5 }
  return { phase: 'night', t: 0 }
}

function lerpColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1,3),16), ag = parseInt(a.slice(3,5),16), ab = parseInt(a.slice(5,7),16)
  const br = parseInt(b.slice(1,3),16), bg = parseInt(b.slice(3,5),16), bb = parseInt(b.slice(5,7),16)
  return `#${d2(Math.floor(ar+(br-ar)*t))}${d2(Math.floor(ag+(bg-ag)*t))}${d2(Math.floor(ab+(bb-ab)*t))}`
}

function drawSky(ctx: CanvasRenderingContext2D, virtualTime: number) {
  const { phase, t } = getSkyPhase(virtualTime)
  const colors = SKY_COLORS[phase]
  const grad = ctx.createLinearGradient(0, 0, 0, GND)
  grad.addColorStop(0, colors[0])
  grad.addColorStop(0.4, colors[1])
  grad.addColorStop(0.8, colors[2])
  grad.addColorStop(1, colors[3])
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, GND)

  const h = virtualTime % 24
  const isNight = h < 4.5 || h > 18

  if (isNight) {
    const moonX = 500
    const moonY = 30
    FR(ctx, moonX - 3, moonY - 7, 6, 6, '#FFF8D0')
    FR(ctx, moonX - 1, moonY - 6, 4, 4, '#FFFDE0')
    FR(ctx, moonX + 2, moonY - 4, 2, 2, '#FFF8D0')

    for (let s = 0; s < 14; s++) {
      const sx = 30 + hash(s, 0) % (W - 60)
      const sy = 6 + hash(s, 1) % 60
      if (sx > moonX - 20 && sx < moonX + 20 && sy > moonY - 20 && sy < moonY + 20) continue
      const br = 0.5 + (hash(s, 2) % 50) / 100
      const sz = 1 + (hash(s, 3) % 2)
      FR(ctx, sx, sy, sz, sz, `rgba(255,255,200,${br})`)
    }
  } else {
    const sunProg = Math.max(0, Math.min(1, (h - 5) / 10))
    const sunX = 80 + sunProg * 480
    const sunY = 60 - sunProg * 40 + Math.sin(sunProg * Math.PI) * 30
    FR(ctx, sunX - 8, sunY - 8, 16, 16, '#FFF8D0')
    FR(ctx, sunX - 4, sunY - 4, 8, 8, '#FFF0A0')
    FR(ctx, sunX - 10, sunY - 2, 4, 4, '#FFF8D0')
    FR(ctx, sunX + 6, sunY - 6, 4, 4, '#FFF8D0')
    FR(ctx, sunX - 4, sunY + 6, 4, 4, '#FFF8D0')
    FR(ctx, sunX + 5, sunY + 4, 4, 4, '#FFF8D0')
    FR(ctx, sunX, sunY + 10, 8, 2, 'rgba(255,200,100,0.3)')
  }
}

function drawClouds(ctx: CanvasRenderingContext2D, clouds: PixelTownState['clouds']) {
  for (const cloud of clouds) {
    cloud.x += cloud.speed
    if (cloud.x > W + 80) cloud.x = -80
    const cx = Math.floor(cloud.x)
    const cy = Math.floor(cloud.y)
    const cw = Math.floor(cloud.width)
    FR(ctx, cx + 6, cy + 2, cw - 12, 8, 'rgba(255,255,255,0.75)')
    FR(ctx, cx, cy + 6, cw, 6, 'rgba(255,255,255,0.8)')
    FR(ctx, cx + 4, cy, cw - 8, 8, 'rgba(255,255,255,0.65)')
  }
}

function drawGrass(ctx: CanvasRenderingContext2D, virtualTime: number) {
  const h = virtualTime % 24
  const nightFactor = h < 4.5 || h > 18 ? 0.45 : (h < 5.5 ? 0.6 : (h < 6.5 ? 0.8 : 1))
  const gr = Math.floor(91 * nightFactor)
  const gg = Math.floor(140 * nightFactor)
  const gb = Math.floor(62 * nightFactor)
  FR(ctx, 0, GND, W, H - GND, `rgb(${gr},${gg},${gb})`)
  for (let gx = 0; gx < W; gx += 4) {
    for (let gy = GND; gy < H; gy += 4) {
      const hh = hash(gx, gy)
      if (hh < 7000) FR(ctx, gx, gy, 4, 4, `rgb(${Math.floor(gr*1.2)},${Math.floor(gg*1.2)},${Math.floor(gb*1.15)})`)
      else if (hh < 11000) FR(ctx, gx, gy, 4, 4, `rgb(${Math.floor(gr*0.85)},${Math.floor(gg*0.85)},${Math.floor(gb*0.85)})`)
    }
  }
}

function drawRoad(ctx: CanvasRenderingContext2D, road: RoadDef) {
  const { x, y, w, h, type } = road
  if (type === 'dirt') {
    FR(ctx, x, y, w, h, '#C4A86C')
    for (let px = x; px < x + w; px += 4) {
      for (let py = y; py < y + h; py += 4) {
        const hh = hash(px + 1000, py + 1000)
        if (hh < 5000) FR(ctx, px, py, 4, 4, '#D4B87C')
        else if (hh < 8000) FR(ctx, px, py, 4, 4, '#B4985C')
      }
    }
  } else if (type === 'stone') {
    FR(ctx, x, y, w, h, '#9A9A9A')
    for (let px = x; px < x + w; px += 4) {
      for (let py = y; py < y + h; py += 4) {
        const hh = hash(px + 2000, py + 2000)
        if (hh < 6000) FR(ctx, px, py, 4, 4, '#AAAAAA')
        else if (hh < 9000) FR(ctx, px, py, 4, 4, '#8A8A8A')
      }
    }
  } else {
    FR(ctx, x, y, w, h, '#B0A090')
    for (let px = x; px < x + w; px += 4) {
      for (let py = y; py < y + h; py += 4) {
        const hh = hash(px + 3000, py + 3000)
        if (hh < 5000) FR(ctx, px, py, 4, 4, '#C0B0A0')
        else if (hh < 8000) FR(ctx, px, py, 4, 4, '#A09080')
      }
    }
  }
}

function drawBuildingShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, d: number) {
  polygon(ctx, [[x, y], [x + w, y], [x + w + d, y + 4], [x + d, y + 4]], 'rgba(0,0,0,0.12)')
}

function drawWindow2_5D(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  FR(ctx, x, y, w, h, '#7BA8C8')
  FR(ctx, x + 1, y + 1, w - 2, h - 2, '#B8E0F8')
  FR(ctx, x, Math.floor(y + h / 2) - 1, w, 2, '#5B7B8B')
  FR(ctx, Math.floor(x + w / 2) - 1, y, 2, h, '#5B7B8B')
}

function drawDoor2_5D(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color?: string) {
  const c = color || '#4A2810'
  FR(ctx, x, y, w, h, c)
  FR(ctx, x + 1, y + 1, w - 2, h - 2, lighten(c, 0.25))
}

function drawBuilding_2_5D(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  bodyW: number, bodyH: number,
  depth: number, roofH: number,
  frontColor: string, roofColor: string,
  details?: () => void,
) {
  const sideColor = darken(frontColor, 0.72)
  const darkRoof = darken(roofColor, 0.78)

  drawBuildingShadow(ctx, x, y + bodyH + depth, bodyW, depth)

  polygon(ctx, [
    [x + bodyW, y],
    [x + bodyW + depth, y + 4],
    [x + bodyW + depth, y + bodyH],
    [x + bodyW, y + bodyH - 4],
  ], sideColor)

  FR(ctx, x, y, bodyW, bodyH, darken(frontColor, 0.9))
  FR(ctx, x + 2, y, bodyW - 2, bodyH - 2, frontColor)
  FR(ctx, x + 2, y + bodyH - 6, bodyW - 2, 4, darken(frontColor, 0.85))

  polygon(ctx, [
    [x + bodyW, y],
    [x + bodyW + depth, y + 4],
    [x + bodyW + depth, y - roofH + 4],
    [x + bodyW, y - roofH],
  ], darkRoof)

  const peakX = x + bodyW / 2
  polygon(ctx, [
    [peakX, y - roofH - 6],
    [x - 2, y],
    [x + bodyW + 2, y],
  ], darkRoof)
  polygon(ctx, [
    [peakX, y - roofH - 4],
    [x + 1, y - 2],
    [x + bodyW - 1, y - 2],
  ], roofColor)
  FR(ctx, peakX - 4, y - roofH - 8, 8, 4, lighten(roofColor, 0.2))

  details?.()
}

function drawCave(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const bw = 52, bh = 36
  FR(ctx, x, y + 4, bw, bh, '#5C4A3A')
  FR(ctx, x + 3, y + 4, bw - 6, bh - 4, '#6B5B4A')
  FR(ctx, x + 10, y + 14, bw - 20, bh - 16, '#1A0A00')
  FR(ctx, x - 4, y, bw + 8, 8, '#3D6A30')
  FR(ctx, x - 6, y + 4, 10, 10, '#3D6A30')
  FR(ctx, x + bw - 4, y + 4, 10, 10, '#3D6A30')
}

function drawCampfire(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  FR(ctx, x + 6, y + 24, 10, 3, '#5C3A1E')
  FR(ctx, x + 2, y + 27, 18, 4, '#7B5230')
  FR(ctx, x + 4, y + 31, 14, 2, '#4A4A4A')
  const f = Math.sin(time * 0.18) * 2
  FR(ctx, x + 7, y + 14 + f, 8, 8, '#FF6600')
  FR(ctx, x + 8, y + 16 + f, 6, 6, '#FF9922')
  FR(ctx, x + 9, y + 18 + f, 4, 4, '#FFCC00')
  FR(ctx, x + 7, y + 12 + f, 3, 3, '#FF4400')
  FR(ctx, x + 12, y + 13 + f, 3, 3, '#FF4400')
}

function drawHut(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 36, 32, 10, 14, '#C89860', '#8B5A30', () => {
    drawWindow2_5D(ctx, x + 6, y + 8, 8, 8)
    drawWindow2_5D(ctx, x + 22, y + 8, 8, 8)
    drawDoor2_5D(ctx, x + 13, y + 20, 10, 12)
  })
}

function drawBarn(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 48, 36, 12, 16, '#C89860', '#7B1A1A', () => {
    drawDoor2_5D(ctx, x + 16, y + 24, 16, 12)
    FR(ctx, x + 15, y + 28, 18, 4, '#3A0A0A')
  })
}

function drawPalace(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 64, 38, 14, 18, '#E0D0B0', '#C89830', () => {
    for (let c = 0; c < 3; c++) {
      const cx = x + 10 + c * 20
      FR(ctx, cx - 2, y + 6, 4, 24, '#E8D8C0')
      FR(ctx, cx - 3, y + 4, 6, 4, '#F0E8D8')
    }
    drawDoor2_5D(ctx, x + 24, y + 24, 16, 14)
  })
}

function drawTemple(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 48, 36, 12, 16, '#D8CCB8', '#C89830', () => {
    for (let c = 0; c < 4; c++) {
      FR(ctx, x + 6 + c * 12, y + 6, 4, 24, '#C8BCA8')
    }
    drawDoor2_5D(ctx, x + 18, y + 24, 12, 12)
  })
}

function drawChurch(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const bw = 44, bh = 38, d = 12
  drawBuildingShadow(ctx, x, y + bh + d, bw, d)

  const sideC = darken('#E0D4C4', 0.72)
  polygon(ctx, [[x + bw, y], [x + bw + d, y + 4], [x + bw + d, y + bh], [x + bw, y + bh - 4]], sideC)

  FR(ctx, x, y, bw, bh, darken('#E0D4C4', 0.9))
  FR(ctx, x + 2, y, bw - 2, bh - 2, '#E0D4C4')

  const steepleX = x + bw / 2
  FR(ctx, steepleX - 5, y - 22, 10, 22, '#E0D4C4')
  FR(ctx, steepleX - 7, y - 24, 14, 4, '#D4C8B8')

  polygon(ctx, [
    [x + bw, y],
    [x + bw + d, y + 4],
    [x + bw + d, y - 12 + 4],
    [x + bw, y - 12],
  ], darken('#C89830', 0.78))

  polygon(ctx, [
    [steepleX, y - 34],
    [x - 2, y],
    [x + bw + 2, y],
  ], darken('#C89830', 0.78))
  polygon(ctx, [
    [steepleX, y - 32],
    [x + 1, y - 2],
    [x + bw - 1, y - 2],
  ], '#C89830')

  FR(ctx, steepleX - 4, y - 38, 8, 6, '#DAB840')
  FR(ctx, steepleX - 2, y - 42, 4, 8, '#E0C050')
  FR(ctx, steepleX - 1, y - 44, 2, 4, '#E8D060')

  drawWindow2_5D(ctx, x + 6, y + 8, 8, 14)
  drawWindow2_5D(ctx, x + bw - 14, y + 8, 8, 14)
  drawDoor2_5D(ctx, x + 16, y + 24, 12, 14)
}

function drawManor(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 56, 38, 14, 16, '#C8A080', '#7B1A1A', () => {
    drawWindow2_5D(ctx, x + 6, y + 8, 8, 8)
    drawWindow2_5D(ctx, x + 42, y + 8, 8, 8)
    drawWindow2_5D(ctx, x + 24, y + 8, 8, 8)
    drawDoor2_5D(ctx, x + 20, y + 24, 16, 14)
  })
}

function drawCastle(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const bw = 60, bh = 40, d = 14
  drawBuildingShadow(ctx, x, y + bh + d, bw, d)

  const sideC = darken('#9B8B7B', 0.72)
  polygon(ctx, [[x + bw, y], [x + bw + d, y + 4], [x + bw + d, y + bh], [x + bw, y + bh - 4]], sideC)

  FR(ctx, x, y, bw, bh, darken('#9B8B7B', 0.9))
  FR(ctx, x + 3, y, bw - 3, bh - 2, '#9B8B7B')

  const towerW = 14, towerH = 18
  FR(ctx, x - 4, y - towerH, towerW, towerH + bh, darken('#8B7B6B', 0.85))
  FR(ctx, x - 2, y - towerH, towerW - 4, towerH + bh - 2, '#8B7B6B')
  FR(ctx, x - 6, y - towerH - 4, towerW + 4, 6, '#7B6B5B')
  FR(ctx, x - 4, y - towerH - 6, towerW, 4, '#9B8B7B')

  FR(ctx, x + bw - towerW + 4, y - towerH, towerW, towerH + bh, darken('#8B7B6B', 0.85))
  FR(ctx, x + bw - towerW + 6, y - towerH, towerW - 4, towerH + bh - 2, '#8B7B6B')
  FR(ctx, x + bw - towerW + 2, y - towerH - 4, towerW + 4, 6, '#7B6B5B')
  FR(ctx, x + bw - towerW + 4, y - towerH - 6, towerW, 4, '#9B8B7B')

  polygon(ctx, [[x + bw, y], [x + bw + d, y + 4], [x + bw + d, y - 14 + 4], [x + bw, y - 14]], darken('#7B6B5B', 0.78))

  const peakX = x + bw / 2
  polygon(ctx, [[peakX, y - 22], [x - 2, y], [x + bw + 2, y]], darken('#7B6B5B', 0.78))
  polygon(ctx, [[peakX, y - 20], [x + 1, y - 2], [x + bw - 1, y - 2]], '#7B6B5B')

  const flagX = x + bw / 2
  FR(ctx, flagX - 1, y - 36, 2, 16, '#5B4B3B')
  FR(ctx, flagX + 1, y - 36, 10, 8, '#CC3333')

  drawWindow2_5D(ctx, x + 10, y + 8, 8, 10)
  drawWindow2_5D(ctx, x + bw - 18, y + 8, 8, 10)
  drawDoor2_5D(ctx, x + 22, y + 24, 16, 16)
}

function drawFactory(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const bw = 56, bh = 40, d = 12
  drawBuildingShadow(ctx, x, y + bh + d, bw, d)

  const sideC = darken('#808080', 0.72)
  polygon(ctx, [[x + bw, y], [x + bw + d, y + 4], [x + bw + d, y + bh], [x + bw, y + bh - 4]], sideC)

  FR(ctx, x, y, bw, bh, darken('#808080', 0.9))
  FR(ctx, x + 2, y, bw - 2, bh - 2, '#808080')

  for (let c = 0; c < 3; c++) {
    const wx = x + 6 + c * 16
    FR(ctx, wx, y + 8, 10, 12, '#A0C0D8')
    FR(ctx, wx + 1, y + 9, 8, 10, '#C8E8F8')
  }
  drawDoor2_5D(ctx, x + 20, y + 28, 16, 12)

  const chX = x + bw - 10
  FR(ctx, chX, y - 14, 10, 14, '#606060')
  FR(ctx, chX - 1, y - 16, 12, 4, '#707070')

  const sp = (time % 70) / 70
  for (let s = 0; s < 3; s++) {
    const sy = y - 18 - s * 12 - sp * 35
    const sa = Math.max(0, 0.5 - s * 0.15 - sp * 0.3)
    if (sy > 0 && sa > 0) {
      FR(ctx, chX + 2 + s * 2, sy, 8 + s, 6 + s, `rgba(190,190,190,${sa})`)
    }
  }
}

function drawMarket(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const bw = 48, bh = 32, d = 12
  drawBuildingShadow(ctx, x, y + bh + d, bw, d)

  const sideC = darken('#B89860', 0.72)
  polygon(ctx, [[x + bw, y], [x + bw + d, y + 4], [x + bw + d, y + bh], [x + bw, y + bh - 4]], sideC)

  FR(ctx, x, y, bw, bh, darken('#B89860', 0.9))
  FR(ctx, x + 2, y, bw - 2, bh - 2, '#B89860')

  FR(ctx, x + 6, y + 10, 8, 8, '#E8A840')
  FR(ctx, x + 20, y + 10, 8, 8, '#E84848')
  FR(ctx, x + 34, y + 10, 8, 8, '#48A848')

  FR(ctx, x - 2, y + 2, bw + 4, 4, '#D45050')
  FR(ctx, x, y, bw, 3, '#E06060')
}

function drawParliament(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 60, 38, 14, 16, '#D4C4B0', '#B89840', () => {
    for (let c = 0; c < 4; c++) {
      FR(ctx, x + 8 + c * 14, y + 6, 4, 26, '#C4B4A0')
    }
    drawDoor2_5D(ctx, x + 22, y + 24, 16, 14)
  })
}

function drawSlum(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const bw = 30, bh = 26, d = 8
  drawBuildingShadow(ctx, x, y + bh + d, bw, d)
  const sideC = darken('#5A5A5A', 0.72)
  polygon(ctx, [[x + bw, y], [x + bw + d, y + 4], [x + bw + d, y + bh], [x + bw, y + bh - 4]], sideC)
  FR(ctx, x, y, bw, bh, darken('#5A5A5A', 0.9))
  FR(ctx, x + 1, y, bw - 2, bh - 2, '#6A6A6A')
  FR(ctx, x + 8, y + 12, 6, 8, '#3A3A3A')
  FR(ctx, x - 1, y - 2, bw + 2, 4, '#5A5A5A')
}

function drawSkyscraper(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const bw = 32, bh = 60, d = 10
  drawBuildingShadow(ctx, x, y + bh + d, bw + 4, d)
  const sideC = darken('#4A5A6A', 0.72)
  polygon(ctx, [[x + bw, y], [x + bw + d, y + 3], [x + bw + d, y + bh], [x + bw, y + bh - 3]], sideC)
  FR(ctx, x, y, bw, bh, darken('#4A5A6A', 0.9))
  FR(ctx, x + 2, y, bw - 4, bh - 2, '#5A6A7A')
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 2; c++) {
      FR(ctx, x + 4 + c * 12, y + 4 + r * 10, 6, 5, '#A0C8E0')
      FR(ctx, x + 5 + c * 12, y + 5 + r * 10, 4, 3, '#D0E8F8')
    }
  }
  FR(ctx, x + 6, y - 6, 4, 8, '#4A5A6A')
}

function drawBank(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 44, 38, 12, 14, '#D8C8A8', '#8B7B4B', () => {
    for (let c = 0; c < 3; c++) {
      FR(ctx, x + 8 + c * 14, y + 6, 4, 26, '#C8B898')
    }
    drawDoor2_5D(ctx, x + 14, y + 24, 16, 14, '#3A2210')
  })
}

function drawTavern(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 40, 32, 10, 14, '#C8A070', '#7B3018', () => {
    drawWindow2_5D(ctx, x + 6, y + 8, 8, 8)
    drawWindow2_5D(ctx, x + 26, y + 8, 8, 8)
    drawDoor2_5D(ctx, x + 15, y + 20, 10, 12, '#4A2010')
  })
}

function drawMill(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const bw = 36, bh = 28, d = 10
  drawBuildingShadow(ctx, x, y + bh + d, bw, d)
  const sideC = darken('#C4A870', 0.72)
  polygon(ctx, [[x + bw, y], [x + bw + d, y + 3], [x + bw + d, y + bh], [x + bw, y + bh - 3]], sideC)
  FR(ctx, x, y, bw, bh, darken('#C4A870', 0.9))
  FR(ctx, x + 2, y, bw - 2, bh - 2, '#C4A870')
  drawDoor2_5D(ctx, x + 13, y + 16, 10, 12)

  const mx = x + bw / 2, my = y - 6
  const angle = time * 0.05
  for (let b = 0; b < 4; b++) {
    const a = angle + (b * Math.PI) / 2
    const ex = mx + Math.cos(a) * 14
    const ey = my + Math.sin(a) * 14
    ctx.strokeStyle = '#D4C4A0'
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(ex, ey); ctx.stroke()
    FR(ctx, ex - 2, ey - 2, 4, 4, '#E0D0B0')
  }
  FR(ctx, mx - 1, my - 2, 2, 4, '#B0A080')
}

function drawLibrary(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 44, 34, 10, 14, '#D4C0A0', '#3A6B4A', () => {
    drawWindow2_5D(ctx, x + 5, y + 8, 7, 10)
    drawWindow2_5D(ctx, x + 32, y + 8, 7, 10)
    drawDoor2_5D(ctx, x + 15, y + 22, 14, 12, '#3A2210')
  })
}

function drawHousingBlock(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const bw = 50, bh = 36, d = 10
  drawBuildingShadow(ctx, x, y + bh + d, bw, d)
  const sideC = darken('#E8D8C0', 0.72)
  polygon(ctx, [[x + bw, y], [x + bw + d, y + 3], [x + bw + d, y + bh], [x + bw, y + bh - 3]], sideC)
  FR(ctx, x, y, bw, bh, darken('#E8D8C0', 0.9))
  FR(ctx, x + 2, y, bw - 2, bh - 2, '#E8D8C0')
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      drawWindow2_5D(ctx, x + 6 + c * 20, y + 6 + r * 14, 8, 6)
    }
  }
  FR(ctx, x + bw / 2 - 6, y + bh - 18, 12, bh - 18, '#D4C4A8')
  drawDoor2_5D(ctx, x + bw / 2 - 4, y + bh - 10, 8, 10, '#3A2210')
}

function drawCollectiveFarm(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 52, 34, 12, 14, '#C8A860', '#CC3333', () => {
    drawWindow2_5D(ctx, x + 8, y + 8, 8, 8)
    drawWindow2_5D(ctx, x + 36, y + 8, 8, 8)
    drawDoor2_5D(ctx, x + 18, y + 22, 16, 12)
  })
}

function drawCulturePalace(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 56, 36, 14, 16, '#E4C890', '#CC3333', () => {
    for (let c = 0; c < 4; c++) {
      FR(ctx, x + 10 + c * 12, y + 6, 4, 24, '#D4B880')
    }
    drawDoor2_5D(ctx, x + 20, y + 24, 16, 12)
  })
}

function drawHospital(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 44, 36, 12, 14, '#F0F0F0', '#E84040', () => {
    drawWindow2_5D(ctx, x + 6, y + 8, 8, 8)
    drawWindow2_5D(ctx, x + 30, y + 8, 8, 8)
    drawDoor2_5D(ctx, x + 16, y + 24, 12, 12)
  })
}

function drawSchool(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 44, 34, 10, 14, '#E4C8A6', '#2E8B57', () => {
    drawWindow2_5D(ctx, x + 6, y + 8, 7, 7)
    drawWindow2_5D(ctx, x + 31, y + 8, 7, 7)
    drawDoor2_5D(ctx, x + 17, y + 22, 10, 12)
  })
}

function drawGreenEnergy(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const mx = x, my = y + 14
  FR(ctx, mx + 8, my + 6, 4, 20, '#A0C8A0')
  FR(ctx, mx + 7, my + 4, 6, 4, '#80B880')
  const angle = time * 0.06
  for (let b = 0; b < 3; b++) {
    const a = angle + (b * Math.PI * 2) / 3
    ctx.strokeStyle = '#E8E8E8'
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(mx + 10, my); ctx.lineTo(mx + 10 + Math.cos(a) * 14, my + Math.sin(a) * 14); ctx.stroke()
  }
  FR(ctx, mx + 9, my - 6, 2, 6, '#C0C0C0')
}

function drawAutoFactory(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 50, 32, 12, 12, '#80C8A0', '#40B8A0', () => {
    drawWindow2_5D(ctx, x + 8, y + 8, 8, 6)
    drawWindow2_5D(ctx, x + 34, y + 8, 8, 6)
    drawDoor2_5D(ctx, x + 18, y + 20, 14, 12)
  })
}

function drawLeisureCenter(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 44, 34, 10, 14, '#F4C8D0', '#E870A0', () => {
    drawWindow2_5D(ctx, x + 6, y + 8, 7, 7)
    drawWindow2_5D(ctx, x + 31, y + 8, 7, 7)
    drawDoor2_5D(ctx, x + 17, y + 22, 10, 12)
  })
}

function drawTechTree(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const tx = x + 6, ty = y + 16
  FR(ctx, tx + 8, ty, 4, 18, '#40B8A0')
  FR(ctx, tx + 6, ty - 4, 8, 4, '#50C8B0')
  FR(ctx, tx, ty - 10, 20, 10, '#40C8A0')
  FR(ctx, tx + 2, ty - 12, 16, 4, '#50D8B0')
  if (Math.sin(time * 0.15) > 0.3) {
    FR(ctx, tx + 8, ty - 16, 4, 4, '#F8D840')
  }
}

function drawFenceArea(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const c = '#9B7B5C'
  for (let i = 0; i < 5; i++) {
    FR(ctx, x + i * 10, y + 14, 3, 16, c)
    FR(ctx, x + i * 10 - 1, y + 30, 5, 3, darken(c, 0.7))
  }
  FR(ctx, x - 1, y + 18, 52, 2, c)
  FR(ctx, x - 1, y + 24, 52, 2, c)
}

function drawStorageHut(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 32, 28, 8, 12, '#C4A870', '#8B6B30', () => {
    drawDoor2_5D(ctx, x + 11, y + 16, 10, 12)
  })
}

function drawGranary(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const bw = 36, bh = 40, d = 10
  drawBuildingShadow(ctx, x, y + bh + d, bw, d)
  const sideC = darken('#D4B880', 0.72)
  polygon(ctx, [[x + bw, y], [x + bw + d, y + 3], [x + bw + d, y + bh], [x + bw, y + bh - 3]], sideC)
  FR(ctx, x, y, bw, bh, darken('#D4B880', 0.9))
  FR(ctx, x + 2, y, bw - 2, bh - 2, '#D4B880')
  drawDoor2_5D(ctx, x + 17, y + 12, 8, 8)
  FR(ctx, x - 2, y - 4, bw + 4, 6, '#B8A060')
  FR(ctx, x, y - 6, bw, 4, '#C8B070')
  FR(ctx, x + 4, y - 10, bw - 8, 6, '#D4B880')
}

function drawPub(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 36, 30, 10, 14, '#B88860', '#5B2810', () => {
    drawWindow2_5D(ctx, x + 6, y + 8, 7, 7)
    drawWindow2_5D(ctx, x + 23, y + 8, 7, 7)
    drawDoor2_5D(ctx, x + 13, y + 18, 10, 12, '#3A1810')
  })
}

function drawBarricade2_5D(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const bw = 44, bh = 28
  FR(ctx, x, y + 8, bw, bh, '#6B4B2E')
  FR(ctx, x + 3, y + 8, bw - 6, bh - 4, '#7B5B3E')
  for (let i = 0; i < 4; i++) {
    FR(ctx, x + 4 + i * 10, y + 2, 3, 10, '#5B3B1E')
  }
  FR(ctx, x + 10, y, 8, 8, '#CC3333')
}

function drawPark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  FR(ctx, x - 2, y + 8, 44, 24, '#5B9B4E')
  FR(ctx, x, y + 6, 40, 20, '#6BAB5E')
  FR(ctx, x + 8, y + 10, 4, 14, '#5C3A1E')
  FR(ctx, x + 4, y + 4, 12, 8, '#3A7B2A')
  FR(ctx, x + 6, y + 2, 10, 6, '#4A8B3A')
  FR(ctx, x + 24, y + 10, 4, 14, '#5C3A1E')
  FR(ctx, x + 20, y + 4, 12, 8, '#3A7B2A')
  FR(ctx, x + 22, y + 2, 10, 6, '#4A8B3A')
  const flowers = ['#E8A0A0', '#E8C840', '#A0C8E8']
  for (let f = 0; f < 3; f++) {
    const fx = x + 8 + f * 14, fy = y + 20
    FR(ctx, fx + 2, fy + 4, 2, 4, '#4A8B2A')
    FR(ctx, fx, fy, 6, 6, flowers[f])
  }
}

function drawVillageHut(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 30, 26, 8, 12, '#C89860', '#8B5A30', () => {
    FR(ctx, x + 12, y + 12, 6, 8, '#3A2010')
  })
}

function drawElderHut(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawBuilding_2_5D(ctx, x, y, 34, 30, 10, 12, '#C89860', '#8B5A30', () => {
    drawWindow2_5D(ctx, x + 20, y + 8, 7, 7)
    drawDoor2_5D(ctx, x + 8, y + 18, 10, 12)
  })
}

const BUILDING_DRAWERS: Record<string, (ctx: CanvasRenderingContext2D, x: number, y: number, time: number) => void> = {
  cave: drawCave,
  campfire: drawCampfire,
  hut: drawHut,
  elder_hut: drawElderHut,
  fence_area: drawFenceArea,
  barn: drawBarn,
  storage_hut: drawStorageHut,
  granary: drawGranary,
  palace: drawPalace,
  temple: drawTemple,
  slave_camp: (ctx, x, y) => drawSlum(ctx, x, y),
  castle: drawCastle,
  church: drawChurch,
  manor: drawManor,
  village_hut: drawVillageHut,
  tavern: drawTavern,
  mill: drawMill,
  factory: drawFactory,
  factory_small: (ctx, x, y, t) => {
    const bw = 40, bh = 30, d = 10
    const sideC = darken('#808080', 0.72)
    polygon(ctx, [[x + bw, y], [x + bw + d, y + 3], [x + bw + d, y + bh], [x + bw, y + bh - 3]], sideC)
    FR(ctx, x, y, bw, bh, darken('#808080', 0.9))
    FR(ctx, x + 2, y, bw - 2, bh - 2, '#808080')
    for (let c = 0; c < 2; c++) {
      FR(ctx, x + 6 + c * 14, y + 8, 8, 8, '#A0C0D8')
      FR(ctx, x + 7 + c * 14, y + 9, 6, 6, '#C8E8F8')
    }
    drawDoor2_5D(ctx, x + 14, y + 18, 12, 12)
    const chX = x + bw - 8
    FR(ctx, chX, y - 10, 8, 10, '#606060')
  },
  market: drawMarket,
  parliament: drawParliament,
  slum: drawSlum,
  slum_row: (ctx, x, y) => { drawSlum(ctx, x, y); drawSlum(ctx, x + 34, y + 4) },
  skyscraper: drawSkyscraper,
  bank: drawBank,
  bank_tower: (ctx, x, y) => {
    const bw = 30, bh = 54, d = 8
    drawBuildingShadow(ctx, x, y + bh + d, bw + 4, d)
    const sideC = darken('#C8B898', 0.72)
    polygon(ctx, [[x + bw, y], [x + bw + d, y + 3], [x + bw + d, y + bh], [x + bw, y + bh - 3]], sideC)
    FR(ctx, x, y, bw, bh, darken('#D8C8A8', 0.9))
    FR(ctx, x + 2, y, bw - 4, bh - 2, '#D8C8A8')
    for (let r = 0; r < 7; r++) {
      FR(ctx, x + 4, y + 4 + r * 7, bw - 8, 3, '#C8B898')
    }
    drawDoor2_5D(ctx, x + 8, y + bh - 14, 14, 14, '#3A2210')
  },
  police_hq: drawParliament,
  pub: drawPub,
  barricade: drawBarricade2_5D,
  collective_farm: drawCollectiveFarm,
  culture_palace: drawCulturePalace,
  hospital: drawHospital,
  school: drawSchool,
  library: drawLibrary,
  housing_block: drawHousingBlock,
  green_energy: drawGreenEnergy,
  auto_factory: drawAutoFactory,
  leisure_center: drawLeisureCenter,
  tech_tree: drawTechTree,
  park: drawPark,
  village: drawVillageHut,
  fence: drawFenceArea,
  storage: drawStorageHut,
  chimney: (ctx, x, y, t) => {
    FR(ctx, x, y - 10, 10, 30, '#606060')
    const sp = (t % 50) / 50
    for (let s = 0; s < 2; s++) {
      const sy = y - 12 - s * 8 - sp * 25
      const sa = Math.max(0, 0.5 - sp * 0.3)
      if (sa > 0) FR(ctx, x + 2, sy, 6, 5, `rgba(190,190,190,${sa})`)
    }
  },
  farm: (ctx, x, y) => {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const fx = x + c * 20, fy = y + r * 14
        FR(ctx, fx, fy, 16, 10, '#8B6B3E')
        FR(ctx, fx + 2, fy - 3, 12, 5, '#4A8B2A')
        FR(ctx, fx + 4, fy - 5, 8, 4, '#5A9B3A')
      }
    }
  },
}

interface ClassZone { className: string; color: string; xStart: number; xEnd: number; yBase: number }

function getClassZones(stageId: number): ClassZone[] {
  switch (stageId) {
    case 0:
      return [{ className: '全体成员', color: '#8BC34A', xStart: 40, xEnd: 600, yBase: GND + 26 }]
    case 1:
      return [
        { className: '氏族贵族', color: '#9C27B0', xStart: 40, xEnd: 160, yBase: GND + 14 },
        { className: '自由民', color: '#8BC34A', xStart: 180, xEnd: 500, yBase: GND + 34 },
        { className: '战俘', color: '#9E9E9E', xStart: 500, xEnd: 620, yBase: GND + 70 },
      ]
    case 2:
      return [
        { className: '奴隶主', color: '#9C27B0', xStart: 30, xEnd: 130, yBase: GND + 12 },
        { className: '自由民', color: '#FF9800', xStart: 350, xEnd: 480, yBase: GND + 24 },
        { className: '奴隶', color: '#9E9E9E', xStart: 140, xEnd: 620, yBase: GND + 70 },
      ]
    case 3:
      return [
        { className: '领主', color: '#9C27B0', xStart: 20, xEnd: 120, yBase: GND + 12 },
        { className: '农奴', color: '#8BC34A', xStart: 180, xEnd: 450, yBase: GND + 40 },
        { className: '手工业者', color: '#FF9800', xStart: 450, xEnd: 620, yBase: GND + 30 },
      ]
    case 4:
      return [
        { className: '资本家', color: '#F1C40F', xStart: 20, xEnd: 140, yBase: GND + 12 },
        { className: '工人', color: '#E67E22', xStart: 160, xEnd: 460, yBase: GND + 48 },
        { className: '小资产阶级', color: '#95A5A6', xStart: 470, xEnd: 620, yBase: GND + 30 },
      ]
    case 5:
      return [
        { className: '垄断资本', color: '#F1C40F', xStart: 20, xEnd: 100, yBase: GND + 8 },
        { className: '工人', color: '#E67E22', xStart: 120, xEnd: 340, yBase: GND + 34 },
        { className: '失业者', color: '#E74C3C', xStart: 350, xEnd: 620, yBase: GND + 60 },
      ]
    case 6:
      return [
        { className: '工人阶级', color: '#2196F3', xStart: 40, xEnd: 240, yBase: GND + 22 },
        { className: '农民', color: '#4CAF50', xStart: 250, xEnd: 460, yBase: GND + 36 },
        { className: '知识分子', color: '#9C27B0', xStart: 470, xEnd: 620, yBase: GND + 18 },
      ]
    case 7:
      return [
        { className: '自由人联合体', color: '#E91E63', xStart: 40, xEnd: 600, yBase: GND + 26 },
      ]
    default:
      return [{ className: '全体成员', color: '#8BC34A', xStart: 40, xEnd: 600, yBase: GND + 26 }]
  }
}

function initCitizensFromStage(stage: Stage): Citizen[] {
  const stageId = stage.id
  const types = CHARACTER_TYPES[stageId] || CHARACTER_TYPES[0]
  const zones = getClassZones(stageId)
  const count = 12 + stageId * 3
  const citizens: Citizen[] = []

  for (let i = 0; i < count; i++) {
    const t = types[i % types.length]
    const cfg = CHAR_CONFIG[t] || { label: t, color: '#888888' }

    const zoneIndex = i % zones.length
    const zone = zones[zoneIndex]
    const bx = zone.xStart + (hash(i, stageId * 100) % (zone.xEnd - zone.xStart))
    const by = zone.yBase + (hash(i + 200, stageId * 100) % 30)

    citizens.push({
      classType: t,
      label: cfg.label,
      color: cfg.color,
      x: bx,
      y: by,
      pathX: [bx - 25, bx + 25],
      pathIndex: 0,
      frame: Math.floor(Math.random() * 40),
      speed: 0.22 + Math.random() * 0.35,
      direction: 1,
      accessory: cfg.accessory,
    })
  }
  return citizens
}

const CHARACTER_TYPES: Record<number, string[]> = {
  0: ['gatherer', 'hunter', 'elder', 'shaman'],
  1: ['farmer', 'herder', 'elder', 'shaman', 'craftsman'],
  2: ['slave_master', 'slave', 'priest', 'scribe', 'merchant'],
  3: ['lord', 'serf', 'priest', 'knight', 'artisan', 'merchant'],
  4: ['capitalist', 'worker', 'philosopher', 'scientist', 'journalist', 'merchant'],
  5: ['banker', 'worker', 'unemployed', 'revolutionary', 'journalist', 'philosopher'],
  6: ['worker', 'farmer', 'intellectual', 'doctor', 'engineer', 'teacher'],
  7: ['artist', 'scientist', 'gardener', 'musician', 'child', 'elder'],
}

const CHAR_CONFIG: Record<string, { label: string; color: string; accessory?: string }> = {
  gatherer: { label: '采集者', color: '#8BC34A', accessory: 'basket' },
  hunter: { label: '猎人', color: '#795548', accessory: 'spear' },
  elder: { label: '长老', color: '#FFB74D' },
  shaman: { label: '萨满', color: '#CE93D8', accessory: 'staff' },
  farmer: { label: '农民', color: '#8BC34A', accessory: 'hoe' },
  herder: { label: '牧人', color: '#A5D6A7', accessory: 'staff' },
  craftsman: { label: '工匠', color: '#FFCC80', accessory: 'hammer' },
  slave_master: { label: '奴隶主', color: '#9C27B0' },
  slave: { label: '奴隶', color: '#9E9E9E' },
  priest: { label: '祭司', color: '#FFF176', accessory: 'staff' },
  scribe: { label: '书吏', color: '#90CAF9', accessory: 'scroll' },
  merchant: { label: '商人', color: '#FFAB91' },
  lord: { label: '领主', color: '#9C27B0' },
  serf: { label: '农奴', color: '#8BC34A', accessory: 'hoe' },
  knight: { label: '骑士', color: '#78909C', accessory: 'sword' },
  artisan: { label: '手工业者', color: '#FFCC80', accessory: 'hammer' },
  capitalist: { label: '资本家', color: '#F1C40F' },
  worker: { label: '工人', color: '#E67E22', accessory: 'wrench' },
  philosopher: { label: '哲学家', color: '#B39DDB', accessory: 'book' },
  scientist: { label: '科学家', color: '#64B5F6', accessory: 'flask' },
  journalist: { label: '记者', color: '#4DB6AC', accessory: 'paper' },
  banker: { label: '银行家', color: '#F1C40F' },
  unemployed: { label: '失业者', color: '#E74C3C' },
  revolutionary: { label: '革命者', color: '#EF5350', accessory: 'flag' },
  intellectual: { label: '知识分子', color: '#9C27B0', accessory: 'book' },
  doctor: { label: '医生', color: '#E8E8E8', accessory: 'bag' },
  engineer: { label: '工程师', color: '#4FC3F7', accessory: 'wrench' },
  teacher: { label: '教师', color: '#AED581', accessory: 'book' },
  artist: { label: '艺术家', color: '#F48FB1', accessory: 'brush' },
  gardener: { label: '园丁', color: '#81C784', accessory: 'hoe' },
  musician: { label: '音乐家', color: '#FFD54F', accessory: 'lute' },
  child: { label: '小孩', color: '#FFCC80' },
}

function updateCitizens(citizens: Citizen[]) {
  for (const c of citizens) {
    c.frame++
    const tx = c.pathX[c.pathIndex]
    if (Math.abs(c.x - tx) < 2) {
      c.pathIndex = (c.pathIndex + 1) % c.pathX.length
    } else {
      c.x += c.x < tx ? c.speed : -c.speed
      c.direction = c.x < tx ? 1 : -1
    }
  }
}

function drawCitizen(ctx: CanvasRenderingContext2D, c: Citizen, time: number) {
  const { x, y, color } = c
  const bob = Math.sin(time * 0.07 + x * 0.5) * 1
  const bx = Math.floor(x), by = Math.floor(y + bob)

  FR(ctx, bx + 3, by + 9, 4, 3, '#3A2810')

  FR(ctx, bx + 1, by + 3, 8, 6, '#FFDAB9')
  FR(ctx, bx + 3, by - 1, 4, 4, '#FFDAB9')
  FR(ctx, bx + 2, by - 3, 6, 3, '#5B3A1E')

  FR(ctx, bx + 1, by + 3, 8, 5, color)

  if (c.frame % 30 < 15) {
    FR(ctx, bx, by + 5, 3, 4, color)
    FR(ctx, bx + 7, by + 5, 3, 4, color)
  } else {
    FR(ctx, bx - 1, by + 5, 3, 4, color)
    FR(ctx, bx + 8, by + 5, 3, 4, color)
  }

  if (c.accessory) {
    const ax = c.direction > 0 ? bx + 8 : bx - 2
    const ay = by + 2
    switch (c.accessory) {
      case 'staff': FR(ctx, ax, ay - 8, 2, 12, '#6B5B3E'); break
      case 'spear': FR(ctx, ax, ay - 10, 2, 14, '#5B4B3E'); FR(ctx, ax - 1, ay - 10, 4, 3, '#888888'); break
      case 'book': FR(ctx, ax, ay + 2, 6, 3, '#8B4513'); break
      case 'scroll': FR(ctx, ax, ay + 2, 4, 6, '#E8D8B0'); break
      case 'hoe': FR(ctx, ax, ay - 6, 2, 12, '#7B6B4E'); FR(ctx, ax - 2, ay - 6, 6, 3, '#888888'); break
      case 'hammer': FR(ctx, ax, ay, 3, 6, '#5B3B1E'); FR(ctx, ax - 1, ay - 3, 5, 4, '#888888'); break
      case 'sword': FR(ctx, ax, ay - 4, 2, 8, '#888888'); FR(ctx, ax - 1, ay - 6, 4, 3, '#BBA060'); break
      case 'wrench': FR(ctx, ax, ay, 3, 8, '#888888'); break
      case 'flask': FR(ctx, ax, ay + 2, 5, 5, '#64B5F6'); FR(ctx, ax + 1, ay + 2, 3, 1, '#90CAF9'); break
      case 'paper': FR(ctx, ax, ay + 2, 5, 4, '#FAFAFA'); break
      case 'flag': FR(ctx, ax, ay - 10, 2, 14, '#5B3B1E'); FR(ctx, ax + 1, ay - 10, 8, 6, '#CC3333'); break
      case 'bag': FR(ctx, ax - 2, ay, 6, 6, '#8B4513'); break
      case 'brush': FR(ctx, ax, ay, 2, 8, '#5B3B1E'); break
      case 'lute': FR(ctx, ax - 2, ay + 1, 6, 5, '#8B6B3E'); break
      case 'basket': FR(ctx, ax - 2, ay + 2, 8, 6, '#C4A060'); break
    }
  }
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  FR(ctx, x + 6, y + 6, 4, 12, '#5C3A1E')
  FR(ctx, x + 5, y + 2, 6, 6, '#6B4A2E')
  FR(ctx, x, y - 6, 16, 10, '#3A6B2A')
  FR(ctx, x + 2, y - 8, 12, 8, '#4A8B3A')
  FR(ctx, x + 3, y - 12, 10, 7, '#5A9B4A')
  FR(ctx, x + 4, y - 14, 8, 5, '#6AAB5A')
}

function drawBush(ctx: CanvasRenderingContext2D, x: number, y: number) {
  FR(ctx, x, y + 4, 10, 6, '#3A6B2A')
  FR(ctx, x + 1, y + 2, 8, 5, '#4A8B3A')
  FR(ctx, x + 2, y, 6, 4, '#5A9B4A')
}

function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const colors = ['#E8A0A0', '#E8C840', '#A0C8E8', '#E8A0C8', '#F0D080']
  const col = colors[hash(x, y) % colors.length]
  FR(ctx, x + 3, y + 8, 2, 5, '#4A8B2A')
  FR(ctx, x, y + 2, 6, 6, col)
  FR(ctx, x + 2, y + 4, 2, 2, '#F8D840')
}

function drawWater(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, time: number) {
  FR(ctx, x, y, w, h, '#3A7BD5')
  for (let wy = y; wy < y + h; wy += 5) {
    const off = Math.sin(time * 0.06 + wy * 0.12) * 3
    for (let wx = x; wx < x + w; wx += 4) {
      if (Math.sin(time * 0.07 + wx * 0.06 + wy * 0.06) > 0.1) {
        FR(ctx, wx + off, wy, 2, 2, '#6AB8F0')
      }
    }
  }
}

function drawWell(ctx: CanvasRenderingContext2D, x: number, y: number) {
  FR(ctx, x, y + 4, 14, 10, '#A09080')
  FR(ctx, x + 2, y + 6, 10, 8, '#B0A090')
  FR(ctx, x + 2, y, 4, 6, '#8B7B6B')
  FR(ctx, x + 8, y, 4, 6, '#8B7B6B')
  FR(ctx, x + 2, y - 2, 10, 3, '#8B7B6B')
  FR(ctx, x + 5, y - 4, 4, 4, '#7B6B5B')
}

function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  FR(ctx, x + 6, y + 4, 2, 14, '#5A5A5A')
  FR(ctx, x + 3, y, 8, 6, '#E8C860')
  if (Math.sin(time * 0.1) > 0) {
    FR(ctx, x + 4, y + 1, 6, 4, '#F8E080')
  }
}

export interface BuildingClickArea {
  type: string
  x: number
  y: number
  w: number
  h: number
  label: string
}

export function getBuildingClickAreas(stage: Stage): BuildingClickArea[] {
  const stageId = stage.id
  const layout = buildTownLayout(stageId)
  const buildingDefs = getStageBuildings(stageId)
  const areas: BuildingClickArea[] = []

  const BUILDING_LABELS: Record<string, string> = {
    cave: '山洞',
    campfire: '篝火',
    hut: '小屋',
    elder_hut: '长老屋',
    fence_area: '围栏',
    barn: '谷仓',
    storage_hut: '储物棚',
    granary: '粮仓',
    palace: '宫殿',
    temple: '神庙',
    slave_camp: '奴隶营',
    castle: '城堡',
    church: '教堂',
    manor: '庄园',
    village_hut: '村舍',
    tavern: '酒馆',
    mill: '磨坊',
    factory: '工厂',
    factory_small: '小工厂',
    market: '市场',
    parliament: '议会',
    slum: '贫民窟',
    slum_row: '贫民区',
    skyscraper: '摩天大楼',
    bank: '银行',
    bank_tower: '银行大厦',
    police_hq: '警察局',
    pub: '酒馆',
    barricade: '街垒',
    collective_farm: '集体农场',
    culture_palace: '文化宫',
    hospital: '医院',
    school: '学校',
    library: '图书馆',
    housing_block: '住宅楼',
    green_energy: '绿色能源站',
    auto_factory: '自动化工厂',
    leisure_center: '休闲中心',
    tech_tree: '科技树',
    park: '公园',
  }

  for (const bd of buildingDefs) {
    const plot = layout.plots.find(p => p.row === bd.plotRow && p.col === bd.plotCol)
    if (!plot) continue
    const bx = plot.x + (plot.w - 48) / 2
    const by = plot.y + (plot.h - 36) / 2
    areas.push({
      type: bd.type,
      x: bx,
      y: by,
      w: plot.w,
      h: plot.h,
      label: BUILDING_LABELS[bd.type] || bd.type,
    })
  }

  return areas
}

export const CANVAS_W = W
export const CANVAS_H = H

export function drawPixelTown(ctx: CanvasRenderingContext2D, stage: Stage, state: PixelTownState) {
  const { time, clouds, virtualTime } = state
  const stageId = stage.id
  const h = virtualTime % 24
  const isNight = h < 4.5 || h > 18

  if (state.citizens.length === 0) {
    state.citizens = initCitizensFromStage(stage)
  }

  ctx.clearRect(0, 0, W, H)

  drawSky(ctx, virtualTime)
  drawClouds(ctx, clouds)
  drawGrass(ctx, virtualTime)

  const layout = buildTownLayout(stageId)
  for (const road of layout.roads) {
    drawRoad(ctx, road)
  }

  if (stageId === 2 || stageId === 3) {
    drawWater(ctx, 260, GND + 170, 120, 20, time)
  }

  const treeXs = [10, 80, 160, 240, 560, 620]
  for (const tx of treeXs) {
    drawTree(ctx, tx, GND + 4 + (hash(tx, 0) % 12))
  }
  for (const bx of [40, 140, 380, 460, 580]) {
    if (hash(bx, 1) < 35000) drawBush(ctx, bx, GND + 18 + (hash(bx, 2) % 12))
  }
  for (const fx of [50, 120, 400, 520, 600]) {
    if (hash(fx, 3) < 25000) drawFlower(ctx, fx, GND + 22 + (hash(fx, 4) % 14))
  }

  if (stageId >= 4) drawLamp(ctx, 60, GND + 50, time)
  if (stageId >= 3) drawWell(ctx, 580, GND + 30)

  const buildingDefs = getStageBuildings(stageId)
  for (const bd of buildingDefs) {
    const plot = layout.plots.find(p => p.row === bd.plotRow && p.col === bd.plotCol)
    if (!plot) continue
    const bx = plot.x + (plot.w - 48) / 2
    const by = plot.y + (plot.h - 36) / 2
    const drawer = BUILDING_DRAWERS[bd.type]
    if (drawer) {
      drawer(ctx, bx, by, time)
    }
  }

  if (stageId >= 3) {
    const fd = BUILDING_DRAWERS['farm']
    if (fd) fd(ctx, 30, GND + 150, time)
  }

  if (isNight) {
    for (const bd of buildingDefs) {
      const plot = layout.plots.find(p => p.row === bd.plotRow && p.col === bd.plotCol)
      if (!plot) continue
      const bx = plot.x + (plot.w - 48) / 2 + 8
      const by = plot.y + (plot.h - 36) / 2 + 8
      for (let w = 0; w < 3; w++) {
        const wx = bx + w * 16 + (hash(bx + w, by) % 4)
        const wy = by + (hash(bx, by + w) % 8)
        const flicker = 0.6 + (Math.sin(time * 0.5 + w * 3 + bx * 0.1) * 0.3)
        FR(ctx, wx, wy, 4, 4, `rgba(255, 220, 100, ${0.4 + flicker * 0.35})`)
      }
    }
  }

  updateCitizens(state.citizens)
  for (const c of state.citizens) {
    drawCitizen(ctx, c, time)
  }

  const virtualDay = Math.floor(virtualTime / 24) + 1
  const vHour = Math.floor(virtualTime % 24)
  const vMin = Math.floor(((virtualTime % 24) - vHour) * 60)
  const timeStr = `第${virtualDay}日 ${vHour.toString().padStart(2,'0')}:${vMin.toString().padStart(2,'0')}`
  const phaseIcon = isNight ? '🌙' : (h > 16 ? '🌅' : (h < 6 ? '🌄' : '☀️'))
  FR(ctx, W - 110, 5, 104, 16, 'rgba(0,0,0,0.4)')
  ctx.fillStyle = isNight ? '#C0C8E0' : '#FFF'
  ctx.font = '9px monospace'
  ctx.fillText(`${phaseIcon} ${timeStr}`, W - 106, 17)

  if (state.particles.length > 0) {
    state.particles = state.particles
      .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 1 }))
      .filter(p => p.life > 0)
    for (const p of state.particles) {
      ctx.fillStyle = p.color.replace('1)', `${p.life / p.maxLife})`)
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size)
    }
  }

  ctx.imageSmoothingEnabled = false
}