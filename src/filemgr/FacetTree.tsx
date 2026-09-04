import React, { useState } from 'react'
import {
  Files, Clock, Star, Trash2, ChevronRight, Image as ImageIcon, FileCode,
  Sparkles, Film, FileText,
} from 'lucide-react'
import { useFileStore, type Facet } from './useFileStore.js'
import type { FileKind } from '../../shared/types.js'

interface Props {
  onSelect: (f: Facet) => void
}

const MATERIAL_KINDS: { kind: FileKind; label: string; icon: React.ReactNode }[] = [
  { kind: 'image', label: '图片', icon: <ImageIcon size={14} /> },
  { kind: 'svg', label: 'SVG', icon: <FileCode size={14} /> },
  { kind: 'lottie', label: 'Lottie', icon: <Film size={14} /> },
  { kind: 'snippet', label: '片段', icon: <Sparkles size={14} /> },
  { kind: 'template', label: '模板', icon: <FileText size={14} /> },
]

export function FacetTree({ onSelect }: Props) {
  const facet = useFileStore((s) => s.facet)
  const [matOpen, setMatOpen] = useState(true)

  const Row = ({ f, label, icon, active }: { f: Facet; label: string; icon: React.ReactNode; active?: boolean }) => (
    <button
      onClick={() => onSelect(f)}
      className={`w-full flex items-center gap-2 pl-3 pr-2 h-8 rounded-md text-[12.5px] transition-colors ${
        active ? 'bg-[rgb(var(--ink-accent))]/10 text-[rgb(var(--ink-accent))] font-medium' : 'text-ink-text-2 hover:bg-black/[0.04] hover:text-ink-text'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )

  const isActive = (f: Facet) => facet === f

  return (
    <div className="h-full flex flex-col py-2 overflow-y-auto">
      <div className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-text-3">文件</div>

      <div className="px-1.5 space-y-0.5">
        <Row f="all" label="全部文档" icon={<Files size={14} />} active={isActive('all')} />
        <Row f="recent" label="最近" icon={<Clock size={14} />} active={isActive('recent')} />
        <Row f="all" label="我的文档" icon={<Files size={14} />} active={false} />
        <Row f="pinned" label="收藏" icon={<Star size={14} />} active={isActive('pinned')} />
        <Row f="trash" label="回收站" icon={<Trash2 size={14} />} active={isActive('trash')} />
      </div>

      <div className="mt-2 px-1.5">
        <button
          onClick={() => setMatOpen((v) => !v)}
          className="w-full flex items-center gap-1 px-2 h-7 rounded-md text-[12.5px] text-ink-text-2 hover:bg-black/[0.04]"
        >
          <ChevronRight size={13} className={`transition-transform ${matOpen ? 'rotate-90' : ''}`} />
          <span className="font-medium">我的素材</span>
        </button>
        {matOpen && (
          <div className="ml-2 pl-2 border-l border-ink-line space-y-0.5 mt-0.5">
            {MATERIAL_KINDS.map((m) => (
              <Row key={m.kind} f={m.kind} label={m.label} icon={m.icon} active={isActive(m.kind)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
