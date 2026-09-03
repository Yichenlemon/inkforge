import { create } from 'zustand'

export type LeftTab = 'components' | 'assets' | 'outline' | 'library'
export type RightTab = 'block' | 'style' | 'theme' | 'doc'
export type ViewMode = 'edit' | 'preview' | 'code'
export type Page = 'home' | 'editor'
export type UiTheme = 'light' | 'paper' | 'dark'

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

/** 编辑器级全局设置（localStorage 持久化，跨文档/跨会话生效） */
export interface EditorSettings {
  stripAnimation: boolean
  maxWidth: number
  autosave: boolean
  uiTheme: UiTheme
  accent: string
  defaultAuthor: string
  defaultFont: string
  defaultFontSize: number
  defaultLineHeight: number
  showStatusBar: boolean
  compressImages: boolean
  imageQuality: number
}

interface UIState extends EditorSettings {
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
  setAutosave: (v: boolean) => void
  setUiTheme: (v: UiTheme) => void
  setAccent: (v: string) => void
  setDefaultAuthor: (v: string) => void
  setDefaultFont: (v: string) => void
  setDefaultFontSize: (v: number) => void
  setDefaultLineHeight: (v: number) => void
  setShowStatusBar: (v: boolean) => void
  setCompressImages: (v: boolean) => void
  setImageQuality: (v: number) => void
  /** 批量应用（设置面板里一次性保存） */
  applySettings: (patch: Partial<EditorSettings>) => void

  openModal: (k: keyof ModalState) => void
  closeModal: (k: keyof ModalState) => void
}

const DEFAULTS: EditorSettings = {
  stripAnimation: false,
  maxWidth: 677,
  autosave: true,
  uiTheme: 'light',
  accent: '#2C6BED',
  defaultAuthor: '',
  defaultFont: 'system',
  defaultFontSize: 15,
  defaultLineHeight: 1.75,
  showStatusBar: true,
  compressImages: true,
  imageQuality: 82,
}

const STORE_KEY = 'inkforge-settings'

/** 全局设置持久化：读 localStorage 合并初始值 */
function loadPersisted(): Partial<EditorSettings> {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') } catch { return {} }
}

function persist(s: EditorSettings) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

const persisted = loadPersisted()
const settings: EditorSettings = { ...DEFAULTS, ...persisted }

export const useUI = create<UIState>((set, get) => ({
  ...settings,

  leftTab: 'components',
  rightTab: 'block',
  viewMode: 'edit',
  page: 'home',
  currentDocId: null,
  selectedId: null,
  leftOpen: true,
  rightOpen: true,
  isNarrow: false,
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

  setStripAnimation: (v) => { set({ stripAnimation: v }); persist({ ...get(), stripAnimation: v }) },
  setMaxWidth: (v) => { set({ maxWidth: v }); persist({ ...get(), maxWidth: v }) },
  setAutosave: (v) => { set({ autosave: v }); persist({ ...get(), autosave: v }) },
  setUiTheme: (v) => { set({ uiTheme: v }); persist({ ...get(), uiTheme: v }) },
  setAccent: (v) => { set({ accent: v }); persist({ ...get(), accent: v }) },
  setDefaultAuthor: (v) => { set({ defaultAuthor: v }); persist({ ...get(), defaultAuthor: v }) },
  setDefaultFont: (v) => { set({ defaultFont: v }); persist({ ...get(), defaultFont: v }) },
  setDefaultFontSize: (v) => { set({ defaultFontSize: v }); persist({ ...get(), defaultFontSize: v }) },
  setDefaultLineHeight: (v) => { set({ defaultLineHeight: v }); persist({ ...get(), defaultLineHeight: v }) },
  setShowStatusBar: (v) => { set({ showStatusBar: v }); persist({ ...get(), showStatusBar: v }) },
  setCompressImages: (v) => { set({ compressImages: v }); persist({ ...get(), compressImages: v }) },
  setImageQuality: (v) => { set({ imageQuality: v }); persist({ ...get(), imageQuality: v }) },
  applySettings: (patch) => { set(patch); persist({ ...get(), ...patch }) },

  openModal: (k) => set((s) => ({ modals: { ...s.modals, [k]: true } })),
  closeModal: (k) => set((s) => ({ modals: { ...s.modals, [k]: false } })),
}))
