import React, { useEffect, useRef } from 'react'
import { useFileStore } from './useFileStore.js'
import { REGISTRY, runAction } from './registry.js'
import { iconFor } from './icons.js'
import type { FileItem, FileActionId } from '../../shared/types.js'

export interface CtxAnchor {
  item: FileItem
  x: number
  y: number
}

interface Props {
  anchor: CtxAnchor
  onClose: () => void
}

const BATCH_IDS: FileActionId[] = ['batch-export', 'batch-delete', 'batch-tag']

export function ContextMenu({ anchor, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const selection = useFileStore((s) => s.selection)
  const items = useFileStore((s) => s.itemsByFacet[s.facet] ?? [])
  const { item, x, y } = anchor

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  const multi = selection.length > 1
  const rep = items.find((i) => selection.includes(i.id)) ?? item

  /* 单条目动作：按 item.kind 过滤，排除批量动作 */
  const singleActions = Object.entries(REGISTRY).filter(([id, a]) => {
    if (!a) return false
    if (id.startsWith('batch-')) return false
    return a.appliesTo.includes(item.kind)
  })

  const run = async (id: FileActionId, target: FileItem) => {
    onClose()
    await runAction(id, target)
  }

  const left = Math.min(x, window.innerWidth - 220)
  const top = Math.min(y, window.innerHeight - 360)

  const Row = ({ id, label, iconName, target }: { id: FileActionId; label: string; iconName?: string; target: FileItem }) => {
    const Icon = iconFor(iconName)
    return (
      <button
        onClick={() => run(id, target)}
        className="w-full flex items-center gap-2 px-3 h-8 text-[12.5px] text-ink-text-2 hover:bg-black/[0.05] rounded"
      >
        {Icon ? <Icon size={14} /> : <span className="w-3.5" />}
        <span className="truncate">{label}</span>
      </button>
    )
  }

  return (
    <div
      ref={ref}
      className="fixed z-[9500] w-[210px] max-h-[60vh] overflow-y-auto bg-white rounded-lg shadow-2xl border border-ink-line py-1 ink-fade-in"
      style={{ left, top }}
    >
      {multi && (
        <>
          <div className="px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-text-3">
            批量（{selection.length} 项）
          </div>
          {BATCH_IDS.map((id) => {
            const a = REGISTRY[id]
            if (!a) return null
            return <Row key={id} id={id} label={a.label} iconName={a.icon} target={rep} />
          })}
          <div className="my-1 border-t border-ink-line" />
        </>
      )}

      <div className="px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-text-3">操作</div>
      {singleActions.length === 0 && (
        <div className="px-3 py-1.5 text-[12px] text-ink-text-3">无可执行动作</div>
      )}
      {singleActions.map(([id, a]) => (
        <Row key={id} id={id as FileActionId} label={a!.label} iconName={a!.icon} target={item} />
      ))}
    </div>
  )
}
