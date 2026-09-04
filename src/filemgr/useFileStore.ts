import { create } from 'zustand'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { api, docsApi } from '../lib/api.js'
import type { Block, Doc, FileItem, FileKind } from '../../shared/types.js'

export type SortKey = 'recent' | 'size' | 'name' | 'updatedAt'

/** openDocs 单槽历史快照（与 useDoc 内部 HistoryEntry 同构） */
type HistoryEntryLike = { blocks: Block[]; title: string; label: string; at: number }

export interface OpenDoc {
  id: string
  doc: Doc
  dirty: boolean
  saving: boolean
  past: HistoryEntryLike[]
  future: HistoryEntryLike[]
  transientBase: Block[] | null
  locked: boolean
}

export type Facet = FileKind | 'all' | 'recent' | 'trash' | 'pinned'

export interface FileState {
  openDocs: OpenDoc[]
  activeId: string | null
  facet: Facet
  query: string
  sort: SortKey
  filters: Record<string, any>
  selection: string[]
  itemsByFacet: Partial<Record<string, FileItem[]>>
  loading: boolean
  managerOpen: boolean
  managerInsertMode: boolean
  /** 预览 / 引用反查 / 去重等动作要操作的文件 id（设计 §8.1 / §8.4） */
  inspectId: string | null

  openFile: (id: string, opts?: { newTab?: boolean }) => Promise<void>
  closeFile: (id: string) => void
  setActive: (id: string | null) => void
  setFacet: (f: Facet) => void
  setQuery: (q: string) => void
  setSort: (s: SortKey) => void
  setFilters: (f: Record<string, any>) => void
  toggleSelect: (id: string) => void
  refreshFacet: (facet: Facet) => Promise<void>
  openManager: (facet?: Facet) => void
  closeManager: () => void
  setInsertMode: (v: boolean) => void
  setLocked: (id: string, locked: boolean) => Promise<void>
  setInspectId: (id: string | null) => void
}

export const useFileStore = create<FileState>((set, get) => ({
  openDocs: [],
  activeId: null,
  facet: 'all',
  query: '',
  sort: 'recent',
  filters: {},
  selection: [],
  itemsByFacet: {},
  loading: false,
  managerOpen: false,
  managerInsertMode: false,
  inspectId: null,

  openFile: async (id, opts) => {
    await useDoc.getState().loadFromServer(id)
    useUI.getState().setCurrentDocId(id)
    useUI.getState().setPage('editor')
    const doc = useDoc.getState().doc
    set((s) => {
      const exists = s.openDocs.find((o) => o.id === id)
      const entry: OpenDoc = exists ?? {
        id, doc, dirty: false, saving: false, past: [], future: [], transientBase: null, locked: false,
      }
      // newTab 仅保证存在一个独立槽位；已存在则复用并更新文档引用
      const openDocs = exists
        ? s.openDocs.map((o) => (o.id === id ? { ...o, doc } : o))
        : [...s.openDocs, entry]
      return { openDocs, activeId: id }
    })
  },

  closeFile: (id) => set((s) => {
    const openDocs = s.openDocs.filter((o) => o.id !== id)
    const activeId = s.activeId === id ? (openDocs[openDocs.length - 1]?.id ?? null) : s.activeId
    return { openDocs, activeId }
  }),

  setActive: (id) => set({ activeId: id }),
  setFacet: (f) => set({ facet: f }),
  setQuery: (q) => set({ query: q }),
  setSort: (s) => set({ sort: s }),
  setFilters: (f) => set({ filters: f }),
  toggleSelect: (id) => set((s) => ({
    selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id],
  })),

  refreshFacet: async (facet) => {
    set({ loading: true })
    try {
      // 后端 queryFiles 读 trash/kind/sort/pinned 参数（非 facet），这里做翻译
      const params = new URLSearchParams()
      params.set('limit', '500')
      if (facet === 'trash') params.set('trash', '1')
      else if (facet === 'recent') params.set('sort', 'recent')
      else if (facet === 'pinned') params.set('pinned', '1')
      else if (facet !== 'all') params.set('kind', facet)
      const res = await api.get<{ items?: any[] }>(`/files?${params.toString()}`)
      const rows: FileItem[] = (res.items ?? []).map((r: any) => ({
        kind: r.kind,
        id: r.id,
        name: r.name,
        thumbnail: r.thumbnail,
        mime: r.mime,
        size: r.size,
        tags: r.tags,
        category: r.category,
        author: r.author,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        lastOpenedAt: r.lastOpenedAt,
        status: r.status ?? 'saved',
        deletedAt: r.deletedAt,
        pinned: r.pinned ?? false,
        refs: r.refs,
        meta: r.meta,
      }))
      set((s) => ({ itemsByFacet: { ...s.itemsByFacet, [facet]: rows }, loading: false }))
    } catch {
      // 后端 Stage A 路由尚未就绪时容错：保持空列表，不阻塞前端
      set((s) => ({ itemsByFacet: { ...s.itemsByFacet, [facet]: [] }, loading: false }))
    }
  },

  openManager: (facet) => set((s) => ({ managerOpen: true, facet: facet ?? s.facet })),
  closeManager: () => set({ managerOpen: false }),
  setInsertMode: (v) => set({ managerInsertMode: v }),
  setLocked: async (id, locked) => {
    // 前端立即生效；后端持久化（设计 §13.2.2：锁住关 app 回来仍是锁）
    set((s) => ({ openDocs: s.openDocs.map((o) => (o.id === id ? { ...o, locked } : o)) }))
    try { await docsApi.lock(id, { locked, lockedBy: 'local' }) } catch { /* 离线容错：前端状态已更新 */ }
  },
  setInspectId: (id) => set({ inspectId: id }),
}))

/** 非 hook 方式访问 store（注册表 / 命令面板等场景使用） */
export const fileStore = useFileStore
