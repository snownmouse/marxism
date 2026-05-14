export interface Cloud {
  x: number
  y: number
  speed: number
  width: number
}

export interface Citizen {
  x: number
  y: number
  classType: string
  label: string
  color: string
  direction: number
  speed: number
  frame: number
  pathX: number[]
  pathIndex: number
  accessory?: string
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

export interface PixelTownState {
  time: number
  virtualTime: number
  clouds: Cloud[]
  citizens: Citizen[]
  particles: Particle[]
}
