import React from 'react'
import { Star, Check } from 'lucide-react'
import { useFileStore } from './useFileStore.js'
import type { FileItem } from '../../shared/types.js'
import { KindGlyph, StatusDot, openItem, formatSize } from './shared.js'

interface Props {
  items: FileItem[]
  onContextMenu: (item: FileItem, e: React.MouseEvent) => void
  onPreview: (item: FileItem) => void
}

export function FileGrid({ items, onContextMenu, onPreview }: Props) {
  const selection = useFileStore((s) => s.selection)
  const toggleSelect = useFileStore((s) => s.toggleSelect)

  return (
    <div className="grid gap-3 p-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
      {items.map((it) => {
        const selected = selection.includes(it.id)
        return (
          <div
            key={it.id}
            onClick={(e) => { openItem(it, e); onPreview(it) }}
            onContextMenu={(e) => onContextMenu(it, e)}
            onMouseEnter={() => onPreview(it)}
            className={`group relative rounded-lg border bg-white overflow-hidden cursor-pointer transition-shadow hover:shadow-md ${
              selected ? 'border-[rgb(var(--ink-accent))] ring-1 ring-[rgb(var(--ink-accent))]/40' : 'border-ink-line'
            }`}
          >
            {/* 选择框 */}
            <button
              onClick={(e) => { e.stopPropagation(); toggleSelect(it.id) }}
              className={`absolute left-1.5 top-1.5 z-10 w-5 h-5 rounded-[5px] border flex items-center justify-center ${
                selected ? 'bg-[rgb(var(--ink-accent))] border-[rgb(var(--ink-accent))] text-white' : 'bg-white/80 border-ink-line-strong opacity-0 group-hover:opacity-100'
              }`}
            >
              {selected && <Check size={12} strokeWidth={4} />}
            </button>

            {/* 置顶星 */}
            {it.pinned && (
              <span className="absolute right-1.5 top-1.5 z-10 text-[#E0A23B]">
                <Star size={14} fill="currentColor" />
              </span>
            )}

            {/* 缩略图 */}
            <div className="h-[100px] flex items-center justify-center bg-black/[0.02] overflow-hidden">
              {it.thumbnail ? (
                <img src={it.thumbnail} alt={it.name} className="max-w-full max-h-full object-contain" loading="lazy" />
              ) : (
                <KindGlyph kind={it.kind} size={30} />
              )}
            </div>

            {/* 信息 */}
            <div className="px-2 py-1.5 border-t border-ink-line">
              <div className="flex items-center gap-1.5">
                <StatusDot status={it.status} size={7} />
                <div className="text-[12.5px] text-ink-text truncate" title={it.name}>{it.name}</div>
              </div>
              <div className="text-[10.5px] text-ink-text-3 mt-0.5">
                {formatSize(it.size)} · {it.kind}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
