import React, { useEffect, useRef, useState } from 'react'
import { Search, ArrowUpDown, SlidersHorizontal, LayoutGrid, List, Plus, X, FileText, Sparkles, FileCode } from 'lucide-react'
import { useFileStore, type SortKey } from './useFileStore.js'
import { emptyDoc } from '../../shared/types.js'
import { docsApi, libraryApi } from '../lib/api.js'
import { toast } from '../lib/ui.js'

interface Props {
  view: 'grid' | 'list'
  onView: (v: 'grid' | 'list') => void
  showFilters: boolean
  onToggleFilters: () => void
  onRefresh: () => void
}

const SORT_OPTS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: '最近打开' },
  { value: 'updatedAt', label: '修改时间' },
  { value: 'name', label: '名称' },
  { value: 'size', label: '大小' },
]

export function Toolbar({ view, onView, showFilters, onToggleFilters, onRefresh }: Props) {
  const query = useFileStore((s) => s.query)
  const setQuery = useFileStore((s) => s.setQuery)
  const sort = useFileStore((s) => s.sort)
  const setSort = useFileStore((s) => s.setSort)
  const closeManager = useFileStore((s) => s.closeManager)

  const [text, setText] = useState(query)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  /* 与 store.query 同步（外部清空时也跟随） */
  useEffect(() => { setText(query) }, [query])
  /* 200ms 防抖写回 store.query */
  useEffect(() => {
    const t = setTimeout(() => { if (text !== query) setQuery(text) }, 200)
    return () => clearTimeout(t)
  }, [text])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const newDoc = async () => {
    setMenuOpen(false)
    try {
      const d = emptyDoc()
      await docsApi.save(d)
      await useFileStore.getState().openFile(d.id)
      toast('已新建文档', 'success')
    } catch (e: any) { toast(e?.message ?? '新建失败', 'error') }
  }
  const newSnippet = async () => {
    setMenuOpen(false)
    const name = window.prompt('片段名称', '新片段')
    if (!name) return
    try { await libraryApi.addSnippet(name, '<p>新片段内容</p>'); toast('已新建片段', 'success'); onRefresh() }
    catch (e: any) { toast(e?.message ?? '新建失败', 'error') }
  }
  const newTemplate = async () => {
    setMenuOpen(false)
    const name = window.prompt('模板名称', '新模板')
    if (!name) return
    try { await libraryApi.addTemplate(name, '未分组', 'clean', []); toast('已新建模板', 'success'); onRefresh() }
    catch (e: any) { toast(e?.message ?? '新建失败', 'error') }
  }

  return (
    <div className="flex items-center gap-2 px-3 h-11 border-b border-ink-line shrink-0 bg-white">
      {/* 搜索 */}
      <div className="relative flex-1 min-w-0 max-w-[420px]">
        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-text-3 pointer-events-none" />
        <input
          className="input pl-7"
          placeholder="搜索名称或标签…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {text && (
          <button onClick={() => setText('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-text-3 hover:text-ink-text">
            <X size={13} />
          </button>
        )}
      </div>

      {/* 排序 */}
      <div className="flex items-center gap-1 text-ink-text-3">
        <ArrowUpDown size={13} />
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {SORT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* 筛选 */}
      <button
        onClick={onToggleFilters}
        className={`btn btn-sm ${showFilters ? 'btn-primary' : 'btn-ghost'}`}
        title="筛选"
      >
        <SlidersHorizontal size={14} /> 筛选
      </button>

      {/* 视图切换 */}
      <div className="inline-flex bg-black/[0.04] rounded-md p-0.5">
        <button
          onClick={() => onView('grid')}
          className={`rounded h-6 px-1.5 flex items-center ${view === 'grid' ? 'bg-white shadow-sm text-ink-text' : 'text-ink-text-3 hover:text-ink-text-2'}`}
          title="网格"
        >
          <LayoutGrid size={14} />
        </button>
        <button
          onClick={() => onView('list')}
          className={`rounded h-6 px-1.5 flex items-center ${view === 'list' ? 'bg-white shadow-sm text-ink-text' : 'text-ink-text-3 hover:text-ink-text-2'}`}
          title="列表"
        >
          <List size={14} />
        </button>
      </div>

      {/* 新建 */}
      <div className="relative" ref={menuRef}>
        <button className="btn btn-sm btn-primary" onClick={() => setMenuOpen((v) => !v)}>
          <Plus size={14} /> 新建
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 z-40 w-40 bg-white rounded-lg shadow-xl border border-ink-line py-1 ink-fade-in">
            <button className="w-full flex items-center gap-2 px-3 h-8 text-[12.5px] text-ink-text-2 hover:bg-black/[0.04]" onClick={newDoc}>
              <FileText size={14} /> 新建文档
            </button>
            <button className="w-full flex items-center gap-2 px-3 h-8 text-[12.5px] text-ink-text-2 hover:bg-black/[0.04]" onClick={newSnippet}>
              <Sparkles size={14} /> 新建片段
            </button>
            <button className="w-full flex items-center gap-2 px-3 h-8 text-[12.5px] text-ink-text-2 hover:bg-black/[0.04]" onClick={newTemplate}>
              <FileCode size={14} /> 新建模板
            </button>
          </div>
        )}
      </div>

      <button className="btn btn-sm btn-ghost" onClick={closeManager} title="关闭文件管理器">
        <X size={15} />
      </button>
    </div>
  )
}
