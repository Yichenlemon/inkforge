import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFileStore, type Facet } from './useFileStore.js'
import { FacetTree } from './FacetTree.js'
import { Toolbar } from './Toolbar.js'
import { FilterBar } from './FilterBar.js'
import { BatchBar } from './BatchBar.js'
import { FileGrid } from './FileGrid.js'
import { FileList } from './FileList.js'
import { PreviewPanel } from './PreviewPanel.js'
import { ContextMenu, type CtxAnchor } from './ContextMenu.js'
import { applyFilters, sortItems } from './filtering.js'
import { Spinner } from '../lib/ui.js'
import type { FileItem } from '../../shared/types.js'

const PREVIEW_KEY = 'inkforge.fm.previewW'

function readPreviewW(): number {
  try { const v = Number(localStorage.getItem(PREVIEW_KEY)); return v >= 280 && v <= 600 ? v : 320 }
  catch { return 320 }
}

export function FileManager() {
  const managerOpen = useFileStore((s) => s.managerOpen)
  const facet = useFileStore((s) => s.facet)
  const loading = useFileStore((s) => s.loading)
  const query = useFileStore((s) => s.query)
  const sort = useFileStore((s) => s.sort)
  const filters = useFileStore((s) => s.filters)
  const items = useFileStore((s) => s.itemsByFacet[s.facet] ?? [])
  const refreshFacet = useFileStore((s) => s.refreshFacet)
  const inspectId = useFileStore((s) => s.inspectId)

  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [showFilters, setShowFilters] = useState(false)
  const [previewItem, setPreviewItem] = useState<FileItem | null>(null)
  const [ctx, setCtx] = useState<CtxAnchor | null>(null)
  const [previewW, setPreviewW] = useState(readPreviewW)
  const [narrow, setNarrow] = useState(typeof window !== 'undefined' && window.innerWidth < 900)

  const inflight = useRef<Set<Facet>>(new Set())

  /* 拉取当前 facet 数据：挂载 + facet 变化时触发，guard 重复在途请求 */
  const loadFacet = useCallback((f: Facet) => {
    if (inflight.current.has(f)) return
    inflight.current.add(f)
    refreshFacet(f).finally(() => { inflight.current.delete(f) })
  }, [refreshFacet])

  useEffect(() => { loadFacet(facet) }, [facet, loadFacet])

  /* 「预览 / 引用反查」等动作把 inspectId 带进来时，自动选中并预览该文件（设计 §8.1） */
  useEffect(() => {
    if (!managerOpen || !inspectId) return
    const it = items.find((i) => i.id === inspectId)
    if (it) setPreviewItem(it)
  }, [managerOpen, inspectId, items])

  /* 持久化预览宽度 */
  useEffect(() => {
    try { localStorage.setItem(PREVIEW_KEY, String(Math.round(previewW))) } catch { /* ignore */ }
  }, [previewW])

  /* 响应式 */
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 900)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /* 卸载时回收 objectURL 缩略图 */
  useEffect(() => {
    return () => {
      for (const it of items) {
        if (it.thumbnail && it.thumbnail.startsWith('blob:')) {
          try { URL.revokeObjectURL(it.thumbnail) } catch { /* ignore */ }
        }
      }
    }
  }, [items])

  const filtered = useMemo(
    () => sortItems(applyFilters(items, query, filters as any), sort),
    [items, query, filters, sort],
  )

  if (!managerOpen) return null

  const onContextMenu = (item: FileItem, e: React.MouseEvent) => {
    e.preventDefault()
    setCtx({ item, x: e.clientX, y: e.clientY })
  }

  return (
    <div className="fixed inset-0 z-[8000] flex bg-[rgb(var(--ink-bg))] ink-fade-in">
      {/* 左：分面树 */}
      {!narrow && (
        <div className="w-[220px] shrink-0 border-r border-ink-line bg-white">
          <FacetTree onSelect={loadFacet} />
        </div>
      )}

      {/* 中：主区域 */}
      <div className="flex-1 min-w-0 flex flex-col">
        <Toolbar
          view={view}
          onView={setView}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((v) => !v)}
          onRefresh={() => loadFacet(facet)}
        />
        {showFilters && <FilterBar onClose={() => setShowFilters(false)} />}

        <div className="flex-1 min-h-0 overflow-y-auto relative">
          {loading && (
            <div className="absolute top-2 right-3 z-10 flex items-center gap-1.5 text-[11.5px] text-ink-text-3">
              <Spinner size={12} /> 加载中…
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-ink-text-3 gap-2">
              <div className="text-[14px]">{loading ? '加载中…' : '暂无文件'}</div>
              <div className="text-[12px]">{loading ? '' : '试试切换分面，或点击右上角「新建」。'}</div>
            </div>
          ) : view === 'grid' ? (
            <FileGrid items={filtered} onContextMenu={onContextMenu} onPreview={setPreviewItem} />
          ) : (
            <FileList items={filtered} onContextMenu={onContextMenu} onPreview={setPreviewItem} />
          )}
        </div>

        <BatchBar />
      </div>

      {/* 右：预览面板 */}
      <div className="shrink-0 border-l border-ink-line">
        <PreviewPanel item={previewItem} width={previewW} onResize={setPreviewW} />
      </div>

      {ctx && <ContextMenu anchor={ctx} onClose={() => setCtx(null)} />}
    </div>
  )
}

export default FileManager
