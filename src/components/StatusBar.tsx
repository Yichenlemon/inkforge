import React, { useMemo } from 'react'
import {
  CheckCircle2, AlertTriangle, CircleAlert, MousePointerClick, Save, Type, Image as ImageIcon, Loader2,
} from 'lucide-react'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { BLOCK_TYPE_LABEL } from '../lib/components.js'
import type { Block } from '../../shared/types.js'

/** 底部实时编辑状态栏：左 选区 ｜中 统计 ｜右 诊断+保存（视图切换已合并到顶栏，设计 §13.1） */
export function StatusBar({ diagnostics }: { diagnostics: any[] }) {
  const doc = useDoc((s) => s.doc)
  const dirty = useDoc((s) => s.dirty)
  const saving = useDoc((s) => s.saving)
  const selectedId = useUI((s) => s.selectedId)
  const maxWidth = useUI((s) => s.maxWidth)
  const openModal = useUI((s) => s.openModal)

  const stats = useMemo(() => {
    let chars = 0
    let images = 0
    const plain = (s: string) => (s ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '')
    for (const b of doc.blocks) {
      const d = b.data as any
      if (b.type === 'image' || b.type === 'gallery') images += b.type === 'gallery' ? (d.images?.length ?? 1) : 1
      const texts: string[] = []
      if (typeof d?.html === 'string') texts.push(d.html)
      if (typeof d?.title === 'string') texts.push(d.title)
      if (typeof d?.text === 'string') texts.push(d.text)
      if (Array.isArray(d?.rows)) texts.push(d.rows.flat().join(''))
      if (Array.isArray(d?.items)) texts.push(d.items.map((i: any) => `${i.title ?? ''}${i.html ?? ''}`).join(''))
      chars += texts.map(plain).join('').replace(/\s/g, '').length
    }
    return { chars, images }
  }, [doc.blocks])

  const idx = selectedId ? doc.blocks.findIndex((b) => b.id === selectedId) : -1
  const selBlock: Block | null = idx >= 0 ? doc.blocks[idx] : null
  const errCount = diagnostics.filter((d) => d.level === 'error').length
  const warnCount = diagnostics.filter((d) => d.level === 'warning').length

  return (
    <div className="h-7 shrink-0 bg-[#FAF9F6] border-t border-ink-line flex items-center text-[11px] text-ink-text-3 select-none no-print divide-x divide-ink-line">
      {/* 选区状态 */}
      <div className="flex items-center gap-1.5 px-3 min-w-0">
        <MousePointerClick size={11} className="text-ink-text-3 shrink-0" />
        {selBlock
          ? <span className="truncate">已选中 <b className="text-ink-text-2 font-medium">{BLOCK_TYPE_LABEL[selBlock.type] ?? selBlock.type}</b> · 第 {idx + 1} / {doc.blocks.length} 块</span>
          : <span>未选中 · 共 {doc.blocks.length} 块</span>}
      </div>

      {/* 统计 */}
      <div className="hidden md:flex items-center gap-3 px-3">
        <span className="flex items-center gap-1 tabular-nums">
          <Type size={11} />正文 <b className="text-ink-text-2 font-medium">{stats.chars.toLocaleString()}</b> 字
        </span>
        <span className="flex items-center gap-1 tabular-nums">
          <ImageIcon size={11} /><b className="text-ink-text-2 font-medium">{stats.images}</b> 图
        </span>
        <span className="flex items-center gap-1 tabular-nums">
          画布 <b className="text-ink-text-2 font-medium">{maxWidth}</b>px
        </span>
      </div>

      <div className="flex-1 min-w-0" />

      {/* 诊断 */}
      <button className="flex items-center px-2 h-full hover:bg-black/[0.04]" title="查看诊断详情" onClick={() => openModal('export')}>
        {errCount > 0
          ? <span className="flex items-center gap-1 text-[#D64545]"><CircleAlert size={11} />{errCount} 错误</span>
          : warnCount > 0
            ? <span className="flex items-center gap-1 text-[#B7791F]"><AlertTriangle size={11} />{warnCount} 警告</span>
            : <span className="flex items-center gap-1 text-[#1D9E75]"><CheckCircle2 size={11} />合规</span>}
      </button>

      {/* 保存状态 */}
      <div className="flex items-center gap-1 px-3 min-w-[88px] justify-end" title={dirty ? '有未保存改动（自动保存约 4 秒）' : '已同步到本地库'}>
        {saving
          ? <><Loader2 size={11} className="animate-spin text-ink-text-3" /><span>保存中</span></>
          : dirty
            ? <><span className="w-1.5 h-1.5 rounded-full bg-[#E8A33D]" /><span>未保存</span></>
            : <><Save size={11} /><span>已保存</span></>}
      </div>
    </div>
  )
}
