import React from 'react'
import { Download, Trash2, Tag, X } from 'lucide-react'
import { useFileStore } from './useFileStore.js'
import { runAction } from './registry.js'
import { toast } from '../lib/ui.js'

export function BatchBar() {
  const selection = useFileStore((s) => s.selection)
  const items = useFileStore((s) => s.itemsByFacet[s.facet] ?? [])
  if (selection.length === 0) return null

  const selectedItems = items.filter((i) => selection.includes(i.id))
  const rep = selectedItems[0]

  const clear = () => useFileStore.setState({ selection: [] })

  const run = async (id: 'batch-export' | 'batch-delete' | 'batch-tag') => {
    if (!rep) return
    await runAction(id, rep)
    if (id === 'batch-delete') clear()
  }

  return (
    <div className="flex items-center gap-2 px-3 h-11 border-t border-ink-line bg-[rgb(var(--ink-accent))]/[0.06] shrink-0">
      <span className="text-[12.5px] font-medium text-ink-text">
        已选 {selection.length} 项
      </span>
      <div className="flex-1" />
      <button className="btn btn-sm btn-ghost" onClick={() => run('batch-export')}>
        <Download size={14} /> 批量导出
      </button>
      <button className="btn btn-sm btn-ghost" onClick={() => run('batch-tag')}>
        <Tag size={14} /> 批量打标签
      </button>
      <button className="btn btn-sm btn-danger" onClick={() => run('batch-delete')}>
        <Trash2 size={14} /> 批量删除
      </button>
      <button className="btn btn-sm btn-ghost" onClick={clear} title="取消选择">
        <X size={14} /> 取消
      </button>
    </div>
  )
}
