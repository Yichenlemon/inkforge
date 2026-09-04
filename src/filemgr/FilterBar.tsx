import React from 'react'
import { X, Check } from 'lucide-react'
import { useFileStore } from './useFileStore.js'
import { collectTags, type FMFilters } from './filtering.js'
import type { FileKind } from '../../shared/types.js'

interface Props {
  onClose: () => void
}

const KIND_OPTS: { value: FileKind; label: string }[] = [
  { value: 'doc', label: '文档' },
  { value: 'image', label: '图片' },
  { value: 'svg', label: 'SVG' },
  { value: 'lottie', label: 'Lottie' },
  { value: 'snippet', label: '片段' },
  { value: 'template', label: '模板' },
]
const SIZE_OPTS = [
  { value: 'a', label: '<50KB' },
  { value: 'b', label: '50–500KB' },
  { value: 'c', label: '0.5–2MB' },
  { value: 'd', label: '2–10MB' },
  { value: 'e', label: '>10MB' },
]
const DIM_OPTS = [
  { value: '480', label: '≤480p' },
  { value: '720', label: '720p' },
  { value: '1080', label: '1080p' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
]
const UPLOAD_OPTS = [
  { value: 'today', label: '今天' },
  { value: '7', label: '7天' },
  { value: '30', label: '30天' },
  { value: '90', label: '90天' },
  { value: 'year', label: '今年' },
  { value: 'all', label: '全部' },
]
const USAGE_OPTS = [
  { value: 'none', label: '未使用' },
  { value: '1', label: '1处' },
  { value: '2-5', label: '2–5处' },
  { value: '5+', label: '>5处' },
]
const STATUS_OPTS = [
  { value: 'animated', label: '有动画' },
  { value: 'pinned', label: '已置顶' },
  { value: 'deleted', label: '已软删' },
]

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11.5px] border transition-colors ${
        active ? 'bg-[rgb(var(--ink-accent))]/10 border-[rgb(var(--ink-accent))] text-[rgb(var(--ink-accent))]' : 'border-ink-line text-ink-text-2 hover:border-ink-line-strong'
      }`}
    >
      {active && <Check size={11} strokeWidth={3} />}
      {label}
    </button>
  )
}

export function FilterBar({ onClose }: Props) {
  const filters = (useFileStore((s) => s.filters) as FMFilters) ?? ({} as FMFilters)
  const setFilters = useFileStore((s) => s.setFilters)
  const facet = useFileStore((s) => s.facet)
  const items = useFileStore((s) => s.itemsByFacet[s.facet] ?? [])

  const patch = (p: Partial<FMFilters>) => setFilters({ ...filters, ...p })

  const toggleArr = <K extends keyof FMFilters>(key: K, value: string) => {
    const cur = (filters[key] as string[] | undefined) ?? []
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
    patch({ [key]: next } as Partial<FMFilters>)
  }

  const allTags = collectTags(items)
  const activeCount =
    (filters.kinds?.length ?? 0) + (filters.size?.length ?? 0) + (filters.dims?.length ?? 0) +
    (filters.tags?.length ?? 0) + (filters.status?.length ?? 0) +
    (filters.uploaded && filters.uploaded !== 'all' ? 1 : 0) +
    (filters.usage && filters.usage !== 'all' ? 1 : 0)

  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="border-b border-ink-line px-3 py-2.5">
      <div className="text-[11px] font-semibold text-ink-text-3 uppercase tracking-wide mb-1.5">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )

  return (
    <div className="bg-[rgb(var(--ink-bg))] border-b border-ink-line shrink-0 max-h-[45%] overflow-y-auto">
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="text-[12px] font-medium text-ink-text">
          筛选{activeCount > 0 && <span className="ml-1 text-[rgb(var(--ink-accent))]">· {activeCount}</span>}
        </span>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button className="text-[11.5px] text-ink-text-3 hover:text-ink-text" onClick={() => setFilters({})}>清空</button>
          )}
          <button className="text-ink-text-3 hover:text-ink-text" onClick={onClose}><X size={14} /></button>
        </div>
      </div>

      <Group title="类型（多选）">
        {KIND_OPTS.map((o) => (
          <Chip key={o.value} label={o.label} active={filters.kinds?.includes(o.value) ?? false} onClick={() => toggleArr('kinds', o.value)} />
        ))}
      </Group>

      <Group title="大小">
        {SIZE_OPTS.map((o) => (
          <Chip key={o.value} label={o.label} active={filters.size?.includes(o.value) ?? false} onClick={() => toggleArr('size', o.value)} />
        ))}
      </Group>

      <Group title="尺寸">
        {DIM_OPTS.map((o) => (
          <Chip key={o.value} label={o.label} active={filters.dims?.includes(o.value) ?? false} onClick={() => toggleArr('dims', o.value)} />
        ))}
      </Group>

      <Group title="上传时间">
        {UPLOAD_OPTS.map((o) => (
          <Chip key={o.value} label={o.label} active={filters.uploaded === o.value} onClick={() => patch({ uploaded: o.value })} />
        ))}
      </Group>

      <Group title="用量">
        {USAGE_OPTS.map((o) => (
          <Chip key={o.value} label={o.label} active={filters.usage === o.value} onClick={() => patch({ usage: o.value })} />
        ))}
      </Group>

      <Group title="标签（多选）">
        {allTags.length === 0 && <span className="text-[11.5px] text-ink-text-3">暂无标签</span>}
        {allTags.map((t) => (
          <Chip key={t} label={t} active={filters.tags?.includes(t) ?? false} onClick={() => toggleArr('tags', t)} />
        ))}
      </Group>

      <Group title="状态">
        {STATUS_OPTS.map((o) => (
          <Chip key={o.value} label={o.label} active={filters.status?.includes(o.value) ?? false} onClick={() => toggleArr('status', o.value)} />
        ))}
      </Group>
    </div>
  )
}
