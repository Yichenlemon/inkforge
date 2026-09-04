import React from 'react'
import { Star, Check } from 'lucide-react'
import { useFileStore } from './useFileStore.js'
import type { FileItem } from '../../shared/types.js'
import { KindGlyph, StatusDot, openItem, formatSize, formatDate } from './shared.js'

interface Props {
  items: FileItem[]
  onContextMenu: (item: FileItem, e: React.MouseEvent) => void
  onPreview: (item: FileItem) => void
}

export function FileList({ items, onContextMenu, onPreview }: Props) {
  const selection = useFileStore((s) => s.selection)
  const toggleSelect = useFileStore((s) => s.toggleSelect)

  return (
    <div className="px-2 py-1">
      <div className="grid grid-cols-[24px_1fr_90px_90px_140px_70px] gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-text-3 border-b border-ink-line">
        <span />
        <span>名称</span>
        <span>类型</span>
        <span>大小</span>
        <span>修改时间</span>
        <span>状态</span>
      </div>
      {items.map((it) => {
        const selected = selection.includes(it.id)
        return (
          <div
            key={it.id}
            onClick={(e) => { openItem(it, e); onPreview(it) }}
            onContextMenu={(e) => onContextMenu(it, e)}
            onMouseEnter={() => onPreview(it)}
            className={`group grid grid-cols-[24px_1fr_90px_90px_140px_70px] gap-2 items-center px-2 h-10 rounded-md cursor-pointer ${
              selected ? 'bg-[rgb(var(--ink-accent))]/10' : 'hover:bg-black/[0.03]'
            }`}
          >
            <button
              onClick={(e) => { e.stopPropagation(); toggleSelect(it.id) }}
              className={`w-5 h-5 rounded-[5px] border flex items-center justify-center ${
                selected ? 'bg-[rgb(var(--ink-accent))] border-[rgb(var(--ink-accent))] text-white' : 'border-ink-line-strong'
              }`}
            >
              {selected && <Check size={12} strokeWidth={4} />}
            </button>
            <div className="flex items-center gap-2 min-w-0">
              {it.pinned && <Star size={12} className="text-[#E0A23B] shrink-0" fill="currentColor" />}
              <span className="text-[12.5px] text-ink-text truncate" title={it.name}>{it.name}</span>
            </div>
            <span className="text-[12px] text-ink-text-2">{it.kind}</span>
            <span className="text-[12px] text-ink-text-2">{formatSize(it.size)}</span>
            <span className="text-[11.5px] text-ink-text-3 truncate">{formatDate(it.updatedAt)}</span>
            <span className="flex items-center gap-1.5">
              <StatusDot status={it.status} size={7} />
            </span>
          </div>
        )
      })}
    </div>
  )
}
