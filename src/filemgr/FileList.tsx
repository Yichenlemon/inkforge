import React, { useLayoutEffect, useRef, useState } from 'react'
import { Star, Check } from 'lucide-react'
import { useFileStore } from './useFileStore.js'
import type { FileItem } from '../../shared/types.js'
import { KindGlyph, StatusDot, openItem, formatSize, formatDate } from './shared.js'

interface Props {
  items: FileItem[]
  onContextMenu: (item: FileItem, e: React.MouseEvent) => void
  onPreview: (item: FileItem) => void
}

/* 固定行高（设计 §18.2） */
const ROW_H = 44
const OVERSCAN = 3

interface RowProps {
  item: FileItem
  selected: boolean
  onOpen: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onPreview: () => void
  onToggleSelect: () => void
  style: React.CSSProperties
}

/* 记忆化行，避免滚动时整列重渲染 */
const ListRow = React.memo(function ListRow({
  item, selected, onOpen, onContextMenu, onPreview, onToggleSelect, style,
}: RowProps) {
  return (
    <div
      style={style}
      onClick={(e) => { onOpen(e); onPreview() }}
      onContextMenu={(e) => onContextMenu(e)}
      onMouseEnter={onPreview}
      className={`group grid grid-cols-[24px_1fr_90px_90px_140px_70px] gap-2 items-center px-2 rounded-md cursor-pointer ${
        selected ? 'bg-[rgb(var(--ink-accent))]/10' : 'hover:bg-black/[0.03]'
      }`}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
        className={`w-5 h-5 rounded-[5px] border flex items-center justify-center ${
          selected ? 'bg-[rgb(var(--ink-accent))] border-[rgb(var(--ink-accent))] text-white' : 'border-ink-line-strong'
        }`}
      >
        {selected && <Check size={12} strokeWidth={4} />}
      </button>
      <div className="flex items-center gap-2 min-w-0">
        {item.pinned && <Star size={12} className="text-[#E0A23B] shrink-0" fill="currentColor" />}
        <span className="text-[12.5px] text-ink-text truncate" title={item.name}>{item.name}</span>
      </div>
      <span className="text-[12px] text-ink-text-2">{item.kind}</span>
      <span className="text-[12px] text-ink-text-2">{formatSize(item.size)}</span>
      <span className="text-[11.5px] text-ink-text-3 truncate">{formatDate(item.updatedAt)}</span>
      <span className="flex items-center gap-1.5">
        <StatusDot status={item.status} size={7} />
      </span>
    </div>
  )
})

export function FileList({ items, onContextMenu, onPreview }: Props) {
  const selection = useFileStore((s) => s.selection)
  const toggleSelect = useFileStore((s) => s.toggleSelect)

  /* 自定义窗口化（无第三方库，设计 §18.2） */
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(0)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setHeight(el.clientHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const total = items.length
  const totalHeight = total * ROW_H
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const end = Math.min(total, Math.ceil((scrollTop + height) / ROW_H) + OVERSCAN)
  const visible = items.slice(start, end)

  return (
    <div className="px-2 py-1 flex flex-col h-full">
      <div className="grid grid-cols-[24px_1fr_90px_90px_140px_70px] gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-text-3 border-b border-ink-line shrink-0">
        <span />
        <span>名称</span>
        <span>类型</span>
        <span>大小</span>
        <span>修改时间</span>
        <span>状态</span>
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative' }}
      >
        {total === 0 ? (
          <div className="flex items-center justify-center h-full text-ink-text-3 text-[12.5px]">暂无文件</div>
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            {visible.map((it, i) => {
              const idx = start + i
              return (
                <ListRow
                  key={it.id}
                  item={it}
                  selected={selection.includes(it.id)}
                  onOpen={(e) => openItem(it, e)}
                  onContextMenu={(e) => onContextMenu(it, e)}
                  onPreview={() => onPreview(it)}
                  onToggleSelect={() => toggleSelect(it.id)}
                  style={{ position: 'absolute', left: 0, right: 0, top: idx * ROW_H, height: ROW_H }}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
