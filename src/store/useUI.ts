import { create } from 'zustand'

export type LeftTab = 'components' | 'yiban' | 'assets' | 'outline' | 'library'
export type RightTab = 'block' | 'style' | 'theme' | 'doc'
export type ViewMode = 'edit' | 'preview' | 'code'
export type Page = 'home' | 'editor'

export interface ModalState {
  export: boolean
  publish: boolean
  diagnostics: boolean
  tools: boolean
  imageEditor: boolean
  lottie: boolean
  anim: boolean
  docs: boolean
  command: boolean
  import: boolean
  settings: boolean
  cover: boolean
  history: boolean
  markdown: boolean
  findReplace: boolean
}

interface UIState {
  leftTab: LeftTab
  rightTab: RightTab
  viewMode: ViewMode
  page: Page
  /** 当前打开的文档 id，用于在首页/编辑器之间往返 */
  currentDocId: string | null
  selectedId: string | null
  leftOpen: boolean
  rightOpen: boolean
  /** 窄屏下用抽屉 */
  isNarrow: boolean
  stripAnimation: boolean
  maxWidth: number
  modals: ModalState

  setLeftTab: (t: LeftTab) => void
  setRightTab: (t: RightTab) => void
  setViewMode: (m: ViewMode) => void
  setPage: (p: Page) => void
  setCurrentDocId: (id: string | null) => void
  select: (id: string | null) => void
  toggleLeft: () => void
  toggleRight: () => void
  setNarrow: (v: boolean) => void
  setStripAnimation: (v: boolean) => void
  setMaxWidth: (v: number) => void
  openModal: (k: keyof ModalState) => void
  closeModal: (k: keyof ModalState) => void
}

export const useUI = create<UIState>((set) => ({
  leftTab: 'components',
  rightTab: 'block',
  viewMode: 'edit',
  page: 'home',
  currentDocId: null,
  selectedId: null,
  leftOpen: true,
  rightOpen: true,
  isNarrow: false,
  stripAnimation: false,
  maxWidth: 677,
  modals: {
    export: false, publish: false, diagnostics: false, tools: false, imageEditor: false,
    lottie: false, anim: false, docs: false, command: false, import: false, settings: false, cover: false,
    history: false, markdown: false, findReplace: false,
  },

  setLeftTab: (t) => set((s) => ({ leftTab: t, leftOpen: true })),
  setRightTab: (t) => set((s) => ({ rightTab: t, rightOpen: true })),
  setViewMode: (m) => set({ viewMode: m }),
  setPage: (p) => set({ page: p }),
  setCurrentDocId: (id) => set({ currentDocId: id }),
  select: (id) => set((s) => ({ selectedId: id, rightTab: id ? 'block' : s.rightTab, rightOpen: id ? true : s.rightOpen })),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  setNarrow: (v) => set((s) => ({ isNarrow: v, leftOpen: v ? false : s.leftOpen, rightOpen: v ? false : s.rightOpen })),
  setStripAnimation: (v) => set({ stripAnimation: v }),
  setMaxWidth: (v) => set({ maxWidth: v }),
  openModal: (k) => set((s) => ({ modals: { ...s.modals, [k]: true } })),
  closeModal: (k) => set((s) => ({ modals: { ...s.modals, [k]: false } })),
}))
