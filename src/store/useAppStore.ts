import { create } from 'zustand'
import stagesData from '../data/stages.json'
import dialogsData from '../data/dialogs.json'
import glossaryData from '../data/glossary.json'
import cardsData from '../data/knowledgeCards.json'
import focusData from '../data/theoryFocus.json'

export interface StageClass {
  name: string
  populationPct: number
  color: string
}

export interface Stage {
  id: number
  name: string
  icon: string
  productivity: string
  relations: string
  exploitationRate: number
  classes: StageClass[]
  superstructure: {
    politics: string
    law: string
    ideology: string
  }
  citizenDialogs: string[]
  knowledgeCards: string[]
  theoryFocus: string | null
  townTheme: {
    ground: string
    sky: string
    buildings: string[]
    ambient: string[]
    palette: {
      primary: string
      secondary: string
      accent: string
      building: string
      roof: string
    }
  }
}

export interface GlossaryItem {
  id: string
  term: string
  definition: string
  marxQuote: string
  example: string
  category?: '哲学基础' | '政治经济学' | '马克思主义基本原理'
}

export interface DialogItem {
  id: string
  stageId: number
  classType: string
  text: string
  glossaryId: string
  chatType?: 'educational' | 'chatter' | 'quirky'
}

export interface KnowledgeCard {
  id: string
  stageId: number
  title: string
  explanation: string
  instance: string
  category?: '哲学基础' | '政治经济学' | '马克思主义基本原理'
}

export interface TheoryFocus {
  id: string
  stageId: number
  title: string
  content: string
  philosophy: string
  relatedTerms: string[]
}

export interface BubbleState {
  id: string
  dialogId: string
  x: number
  y: number
  classType: string
  text: string
  glossaryId: string
  opacity: number
  createdAt: number
  source?: 'citizen' | 'user'
  chatType?: 'educational' | 'chatter' | 'quirky'
}

interface AppState {
  currentStageId: number
  stages: Stage[]
  glossary: GlossaryItem[]
  dialogs: DialogItem[]
  knowledgeCards: KnowledgeCard[]
  theoryFocuses: TheoryFocus[]
  bubbles: BubbleState[]
  isAutoPlaying: boolean
  autoPlayInterval: number | null
  showComparison: boolean
  comparisonStageIds: [number, number]
  showKnowledgeNetwork: boolean
  showTheoryFocus: boolean
  activeTheoryFocus: TheoryFocus | null
  currentCardIndex: number
  showGlossaryPopup: boolean
  activeGlossaryItem: GlossaryItem | null
  showAllCards: boolean
  highlightedStageIds: number[]
  superstructureExpanded: boolean
  tooltipText: string | null
  tooltipPos: { x: number; y: number } | null
  showQuiz: boolean
  showExplanation: boolean

  setStage: (id: number) => void
  nextStage: () => void
  prevStage: () => void
  toggleAutoPlay: () => void
  addBubble: (bubble: BubbleState) => void
  removeBubble: (id: string) => void
  clearBubbles: () => void
  setComparison: (show: boolean, ids?: [number, number]) => void
  setKnowledgeNetwork: (show: boolean) => void
  setTheoryFocus: (focus: TheoryFocus | null) => void
  setCardIndex: (index: number) => void
  nextCard: () => void
  prevCard: () => void
  setGlossaryPopup: (item: GlossaryItem | null) => void
  setShowAllCards: (show: boolean) => void
  setHighlightedStages: (ids: number[]) => void
  toggleSuperstructure: () => void
  setTooltip: (text: string | null, pos?: { x: number; y: number }) => void
  setQuiz: (show: boolean) => void
  setExplanation: (show: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  currentStageId: 0,
  stages: stagesData as Stage[],
  glossary: glossaryData as GlossaryItem[],
  dialogs: dialogsData as DialogItem[],
  knowledgeCards: cardsData as KnowledgeCard[],
  theoryFocuses: focusData as TheoryFocus[],
  bubbles: [],
  isAutoPlaying: false,
  autoPlayInterval: null,
  showComparison: false,
  comparisonStageIds: [0, 4],
  showKnowledgeNetwork: false,
  showTheoryFocus: false,
  activeTheoryFocus: null,
  currentCardIndex: 0,
  showGlossaryPopup: false,
  activeGlossaryItem: null,
  showAllCards: false,
  highlightedStageIds: [],
  superstructureExpanded: false,
  tooltipText: null,
  tooltipPos: null,
  showQuiz: false,
  showExplanation: false,

  setStage: (id: number) => {
    const state = get()
    const focus = state.theoryFocuses.find(f => f.stageId === id)
    set({
      currentStageId: id,
      currentCardIndex: 0,
      bubbles: [],
      showTheoryFocus: !!focus,
      activeTheoryFocus: focus || null,
    })
  },

  nextStage: () => {
    const state = get()
    const nextId = Math.min(state.currentStageId + 1, state.stages.length - 1)
    state.setStage(nextId)
  },

  prevStage: () => {
    const state = get()
    const prevId = Math.max(state.currentStageId - 1, 0)
    state.setStage(prevId)
  },

  toggleAutoPlay: () => {
    const state = get()
    if (state.isAutoPlaying) {
      if (state.autoPlayInterval) clearInterval(state.autoPlayInterval)
      set({ isAutoPlaying: false, autoPlayInterval: null })
    } else {
      const interval = window.setInterval(() => {
        const s = get()
        if (s.currentStageId < s.stages.length - 1) {
          s.nextStage()
        } else {
          s.toggleAutoPlay()
        }
      }, 180000)
      set({ isAutoPlaying: true, autoPlayInterval: interval })
    }
  },

  addBubble: (bubble: BubbleState) => set(state => ({
    bubbles: [...state.bubbles, bubble]
  })),

  removeBubble: (id: string) => set(state => ({
    bubbles: state.bubbles.filter(b => b.id !== id)
  })),

  clearBubbles: () => set({ bubbles: [] }),

  setComparison: (show: boolean, ids?: [number, number]) => set({
    showComparison: show,
    comparisonStageIds: ids || get().comparisonStageIds
  }),

  setKnowledgeNetwork: (show: boolean) => set({ showKnowledgeNetwork: show }),

  setTheoryFocus: (focus: TheoryFocus | null) => set({
    showTheoryFocus: !!focus,
    activeTheoryFocus: focus
  }),

  setCardIndex: (index: number) => set({ currentCardIndex: index }),

  nextCard: () => {
    const state = get()
    const stageCards = state.knowledgeCards.filter(c => c.stageId === state.currentStageId)
    if (stageCards.length === 0) return
    set({ currentCardIndex: (state.currentCardIndex + 1) % stageCards.length })
  },

  prevCard: () => {
    const state = get()
    const stageCards = state.knowledgeCards.filter(c => c.stageId === state.currentStageId)
    if (stageCards.length === 0) return
    set({ currentCardIndex: (state.currentCardIndex - 1 + stageCards.length) % stageCards.length })
  },

  setGlossaryPopup: (item: GlossaryItem | null) => set({
    showGlossaryPopup: !!item,
    activeGlossaryItem: item
  }),

  setShowAllCards: (show: boolean) => set({ showAllCards: show }),

  setHighlightedStages: (ids: number[]) => set({ highlightedStageIds: ids }),

  toggleSuperstructure: () => set(state => ({ superstructureExpanded: !state.superstructureExpanded })),

  setTooltip: (text: string | null, pos?: { x: number; y: number }) => set({
    tooltipText: text,
    tooltipPos: pos || null
  }),

  setQuiz: (show: boolean) => set({ showQuiz: show }),

  setExplanation: (show: boolean) => set({ showExplanation: show }),
}))
