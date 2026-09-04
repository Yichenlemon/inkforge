import React, { useLayoutEffect, useRef, useState } from 'react'
import { Star, Check } from 'lucide-react'
import { useFileStore } from './useFileStore.js'
import type { FileItem } from '../../shared/types.js'
import { KindGlyph, StatusDot, openItem, formatSize } from './shared.js'

interface Props {
  items: FileItem[]
  onContextMenu: (item: FileItem, e: React.MouseEvent) => void
  onPreview: (item: FileItem) => void
}

/* 固定布局常量（设计 §18.2） */
const ROW_H = 150 // 卡片高度
const GAP = 12 // 卡片间距
const PAD = 12 // 容器内边距（原 p-3）
const MIN_CARD = 180 // 最小卡片宽度，用于响应式列数计算
const OVERSCAN = 3

interface CardProps {
  item: FileItem
  selected: boolean
  onOpen: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onPreview: () => void
  onToggleSelect: () => void
  style: React.CSSProperties
}

/* 记忆化卡片，避免滚动时整列重渲染 */
const GridCard = React.memo(function GridCard({
  item, selected, onOpen, onContextMenu, onPreview, onToggleSelect, style,
}: CardProps) {
  return (
    <div
      style={style}
      onClick={(e) => { onOpen(e); onPreview() }}
      onContextMenu={(e) => onContextMenu(e)}
      onMouseEnter={onPreview}
      className={`group relative rounded-lg border bg-white overflow-hidden cursor-pointer transition-shadow hover:shadow-md ${
        selected ? 'border-[rgb(var(--ink-accent))] ring-1 ring-[rgb(var(--ink-accent))]/40' : 'border-ink-line'
      }`}
    >
      {/* 选择框 */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
        className={`absolute left-1.5 top-1.5 z-10 w-5 h-5 rounded-[5px] border flex items-center justify-center ${
          selected ? 'bg-[rgb(var(--ink-accent))] border-[rgb(var(--ink-accent))] text-white' : 'bg-white/80 border-ink-line-strong opacity-0 group-hover:opacity-100'
        }`}
      >
        {selected && <Check size={12} strokeWidth={4} />}
      </button>

      {/* 置顶星 */}
      {item.pinned && (
        <span className="absolute right-1.5 top-1.5 z-10 text-[#E0A23B]">
          <Star size={14} fill="currentColor" />
        </span>
      )}

      {/* 缩略图 */}
      <div className="h-[100px] flex items-center justify-center bg-black/[0.02] overflow-hidden">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt={item.name} className="max-w-full max-h-full object-contain" loading="lazy" />
        ) : (
          <KindGlyph kind={item.kind} size={30} />
        )}
      </div>

      {/* 信息 */}
      <div className="px-2 py-1.5 border-t border-ink-line">
        <div className="flex items-center gap-1.5">
          <StatusDot status={item.status} size={7} />
          <div className="text-[12.5px] text-ink-text truncate" title={item.name}>{item.name}</div>
        </div>
        <div className="text-[10.5px] text-ink-text-3 mt-0.5">
          {formatSize(item.size)} · {item.kind}
        </div>
      </div>
    </div>
  )
})

export function FileGrid({ items, onContextMenu, onPreview }: Props) {
  const selection = useFileStore((s) => s.selection)
  const toggleSelect = useFileStore((s) => s.toggleSelect)

  /* 自定义窗口化（无第三方库，设计 §18.2） */
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const columns = Math.max(1, Math.floor((size.w - 2 * PAD) / MIN_CARD))
  const colWidth = (size.w - 2 * PAD - (columns - 1) * GAP) / columns
  const stride = ROW_H + GAP
  const rows = Math.ceil(items.length / columns)
  const totalHeight = rows * stride + 2 * PAD - GAP

  const startRow = Math.max(0, Math.floor(scrollTop / stride) - OVERSCAN)
  const endRow = Math.min(rows, Math.ceil((scrollTop + size.h) / stride) + OVERSCAN)
  const start = startRow * columns
  const end = Math.min(items.length, endRow * columns)
  const visible = items.slice(start, end)

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      style={{ height: '100%', overflowY: 'auto', position: 'relative' }}
    >
      {items.length === 0 ? (
        <div className="flex items-center justify-center h-full text-ink-text-3 text-[12.5px]">暂无文件</div>
      ) : (
        <div style={{ height: totalHeight, position: 'relative' }}>
          {visible.map((it, i) => {
            const idx = start + i
            const r = Math.floor(idx / columns)
            const c = idx % columns
            const top = PAD + r * stride
            const left = PAD + c * (colWidth + GAP)
            return (
              <GridCard
                key={it.id}
                item={it}
                selected={selection.includes(it.id)}
                onOpen={(e) => openItem(it, e)}
                onContextMenu={(e) => onContextMenu(it, e)}
                onPreview={() => onPreview(it)}
                onToggleSelect={() => toggleSelect(it.id)}
                style={{ position: 'absolute', top, left, width: colWidth, height: ROW_H }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
