import { create } from 'zustand'
import { emptyDoc, seedDoc, makeBlock, createId, migrateDoc, applyBlockDefaults, type Block, type Doc, type BlockStyle } from '../../shared/types.js'
import { docsApi } from '../lib/api.js'
import { useUI } from './useUI.js'

interface HistoryEntry { blocks: Block[]; title: string; label: string; at: number }

interface DocState {
  doc: Doc
  dirty: boolean
  saving: boolean
  lastSavedAt: number | null
  past: HistoryEntry[]
  future: HistoryEntry[]
  transientBase: Block[] | null

  load: (doc: Doc) => void
  newDoc: (themeId?: string, opts?: { title?: string; initBlocks?: Block[] }) => void
  setTitle: (t: string) => void
  setTheme: (id: string) => void
  setArticleWidth: (w: number | undefined) => void
  setToken: (patch: Record<string, any>) => void
  setMeta: (patch: Record<string, any>) => void

  addBlock: (block: Block, index?: number) => void
  updateBlock: (id: string, patch: Partial<Block>) => void
  updateData: (id: string, patch: Record<string, any>) => void
  updateStyle: (id: string, patch: Partial<BlockStyle>) => void
  removeBlock: (id: string) => void
  duplicateBlock: (id: string) => void
  moveBlock: (id: string, toIndex: number) => void
  moveBlockBy: (id: string, delta: number) => void
  replaceBlocks: (blocks: Block[]) => void
  insertBlocks: (blocks: Block[], index?: number) => void

  /** 拖拽等连续操作：开始时快照、过程中静默更新、结束记一步历史 */
  beginTransient: () => void
  updateLive: (id: string, patch: Record<string, any>) => void
  endTransient: (label?: string) => void

  undo: () => void
  redo: () => void
  /** 跳转到历史中的第 index 个步骤（0 = 最旧；past.length = 当前） */
  jumpTo: (index: number) => void
  canUndo: () => boolean
  canRedo: () => boolean

  /** 用当前排版默认值（applyBlockDefaults）非破坏式填充整篇文档的区块样式 */
  applyDefaultsToCurrent: () => void

  save: () => Promise<void>
  saveSnapshot: (label?: string) => Promise<void>
  loadFromServer: (id: string) => Promise<void>
}

const MAX_HISTORY = 60

/** 用当前排版默认值非破坏式填充一组区块（仅补全未显式设置的样式字段） */
const withDefaults = (blocks: Block[]): Block[] => blocks.map((b) => applyBlockDefaults(b, useUI.getState()))

/** 根据变更类型生成可读标签 */
function labelFor(mutatorDesc: string): string {
  return mutatorDesc || '编辑'
}

export const useDoc = create<DocState>((set, get) => {
  /** 提交一次可撤销的变更 */
  const commit = (mutator: (doc: Doc) => Doc, label = '编辑') => {
    set((state) => {
      const before: HistoryEntry = { blocks: state.doc.blocks, title: state.doc.title, label: label || '编辑', at: Date.now() }
      const next = mutator({ ...state.doc, blocks: state.doc.blocks.map((b) => ({ ...b })) })
      const entry: HistoryEntry = { blocks: next.blocks, title: next.title, label: label || '编辑', at: Date.now() }
      return {
        doc: { ...next, updatedAt: Date.now() },
        dirty: true,
        past: [...state.past, before].slice(-MAX_HISTORY),
        future: [],
      }
    })
  }

  return {
    doc: seedDoc(),
    dirty: false,
    saving: false,
    lastSavedAt: null,
    past: [],
    future: [],
    transientBase: null,

    load: (doc) => {
      const d = migrateDoc(doc)
      set({ doc: { ...d, blocks: withDefaults(d.blocks) }, dirty: false, past: [], future: [] })
    },
    newDoc: (themeId = 'clean', opts) => {
      const base = emptyDoc(themeId)
      const ui = useUI.getState()
      const blocks = withDefaults(opts?.initBlocks ?? base.blocks)
      const doc: Doc = {
        ...base,
        title: opts?.title ?? base.title,
        meta: { ...(base.meta ?? {}), author: ui.defaultAuthor || undefined },
        blocks,
      }
      set({ doc, dirty: false, past: [], future: [] })
    },

    setTitle: (t) => commit((d) => ({ ...d, title: t }), '修改标题'),
    setTheme: (id) => commit((d) => ({ ...d, themeId: id, blocks: withDefaults(d.blocks) }), '切换主题'),
    setArticleWidth: (w) => commit((d) => ({ ...d, articleWidth: w }), '调整版心宽度'),
    setToken: (patch) => commit((d) => ({ ...d, tokenOverride: { ...(d.tokenOverride ?? {}), ...patch } }), '修改主题样式'),
    setMeta: (patch) => commit((d) => ({ ...d, meta: { ...(d.meta ?? {}), ...patch } }), '修改文章信息'),

    addBlock: (block, index) => commit((d) => {
      const blocks = [...d.blocks]
      blocks.splice(index ?? blocks.length, 0, block)
      return { ...d, blocks: withDefaults(blocks) }
    }, `插入${block.type}`),

    updateBlock: (id, patch) => commit((d) => ({
      ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }), '修改区块'),

    updateData: (id, patch) => commit((d) => ({
      ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, data: { ...b.data, ...patch } } : b)),
    }), '修改内容'),

    updateStyle: (id, patch) => commit((d) => ({
      ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, style: { ...b.style, ...patch } } : b)),
    }), '修改样式'),

    removeBlock: (id) => commit((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }), '删除区块'),

    duplicateBlock: (id) => commit((d) => {
      const idx = d.blocks.findIndex((b) => b.id === id)
      if (idx < 0) return d
      const src = d.blocks[idx]
      const copy: Block = { ...src, id: createId(), data: JSON.parse(JSON.stringify(src.data)), style: { ...src.style } }
      const blocks = [...d.blocks]
      blocks.splice(idx + 1, 0, copy)
      return { ...d, blocks }
    }, '复制区块'),

    moveBlock: (id, toIndex) => commit((d) => {
      const from = d.blocks.findIndex((b) => b.id === id)
      if (from < 0) return d
      const blocks = [...d.blocks]
      const [item] = blocks.splice(from, 1)
      blocks.splice(Math.max(0, Math.min(blocks.length, toIndex)), 0, item)
      return { ...d, blocks }
    }, '移动区块'),

    moveBlockBy: (id, delta) => commit((d) => {
      const from = d.blocks.findIndex((b) => b.id === id)
      const to = from + delta
      if (from < 0 || to < 0 || to >= d.blocks.length) return d
      const blocks = [...d.blocks]
      const [item] = blocks.splice(from, 1)
      blocks.splice(to, 0, item)
      return { ...d, blocks }
    }, '移动区块'),

    replaceBlocks: (blocks) => commit((d) => ({ ...d, blocks: withDefaults(blocks) }), '替换内容'),

    insertBlocks: (newBlocks, index) => commit((d) => {
      const blocks = [...d.blocks]
      blocks.splice(index ?? blocks.length, 0, ...newBlocks)
      return { ...d, blocks: withDefaults(blocks) }
    }, `插入${newBlocks.length}个区块`),

    beginTransient: () => set((s) => ({ transientBase: s.doc.blocks.map((b) => ({ ...b })) })),

    updateLive: (id, patch) => set((s) => ({
      doc: {
        ...s.doc,
        blocks: s.doc.blocks.map((b) => (b.id === id ? { ...b, data: { ...b.data, ...patch } } : b)),
      },
      dirty: true,
    })),

    endTransient: (label = '编辑') => set((s) => {
      if (!s.transientBase) return s
      const entry: HistoryEntry = { blocks: s.transientBase, title: s.doc.title, label, at: Date.now() }
      return {
        past: [...s.past, entry].slice(-MAX_HISTORY),
        future: [],
        transientBase: null,
        dirty: true,
      }
    }),

    undo: () => set((state) => {
      if (!state.past.length) return state
      const prev = state.past[state.past.length - 1]
      const current: HistoryEntry = { blocks: state.doc.blocks, title: state.doc.title, label: '当前', at: Date.now() }
      return {
        doc: { ...state.doc, blocks: prev.blocks, title: prev.title, updatedAt: Date.now() },
        dirty: true,
        past: state.past.slice(0, -1),
        future: [current, ...state.future].slice(0, MAX_HISTORY),
      }
    }),

    redo: () => set((state) => {
      if (!state.future.length) return state
      const next = state.future[0]
      const current: HistoryEntry = { blocks: state.doc.blocks, title: state.doc.title, label: '当前', at: Date.now() }
      return {
        doc: { ...state.doc, blocks: next.blocks, title: next.title, updatedAt: Date.now() },
        dirty: true,
        past: [...state.past, current].slice(-MAX_HISTORY),
        future: state.future.slice(1),
      }
    }),

    /** 跳转到历史中的第 index 个 past 步骤（index 可到 past.length 表示当前） */
    jumpTo: (index: number) => set((state) => {
      const total = state.past.length
      if (index < 0 || index > total) return state
      const current: HistoryEntry = { blocks: state.doc.blocks, title: state.doc.title, label: '当前', at: Date.now() }
      const past = state.past.slice(0, index)
      const future = [...state.past.slice(index), current, ...state.future].slice(0, MAX_HISTORY)
      const target = index === 0 ? state.past[0] : state.past[index - 1]
      // index===0 表示初始态（past[0] 之前），这里取 past[0] 作为最早快照
      const docState = index === 0 ? state.past[0] : target
      return {
        doc: { ...state.doc, blocks: docState.blocks, title: docState.title, updatedAt: Date.now() },
        dirty: true,
        past,
        future,
      }
    }),

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    applyDefaultsToCurrent: () => {
      const { doc } = get()
      // 先自动快照，便于撤销
      void docsApi.snapshot(doc, '应用默认排版前快照').catch(() => {})
      set((state) => ({
        doc: { ...state.doc, blocks: withDefaults(state.doc.blocks) },
        dirty: true,
      }))
      const ui = useUI.getState()
      if (ui.autosave) void get().save()
    },

    save: async () => {
      const { doc } = get()
      set({ saving: true })
      try {
        await docsApi.save(doc)
        useUI.getState().setCurrentDocId(doc.id)
        set({ dirty: false, saving: false, lastSavedAt: Date.now() })
      } catch (e) {
        set({ saving: false })
        throw e
      }
    },

    saveSnapshot: async (label) => {
      const { doc } = get()
      await docsApi.snapshot(doc, label)
      useUI.getState().setCurrentDocId(doc.id)
      set({ dirty: false, lastSavedAt: Date.now() })
    },

    loadFromServer: async (id) => {
      const res = await docsApi.get(id)
      const doc = migrateDoc(res.doc)
      useUI.getState().setCurrentDocId(id)
      set({ doc: { ...doc, blocks: withDefaults(doc.blocks) }, dirty: false, past: [], future: [] })
    },
  }
})

/** 快捷：新建一个指定类型的 block */
export function blockOf(type: Block['type'], data: any = {}, style: BlockStyle = {}): Block {
  return makeBlock(type, data, style)
}
