import React, { useMemo } from 'react'
import { CheckCircle2, AlertTriangle, CircleAlert, MousePointerClick, Save } from 'lucide-react'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { BLOCK_TYPE_LABEL } from '../lib/components.js'
import type { Block } from '../../shared/types.js'

/**
 * 底部实时编辑状态栏：光标/选区、字数、块数、保存状态、诊断、视图模式
 */
export function StatusBar({ diagnostics }: { diagnostics: any[] }) {
  const doc = useDoc((s) => s.doc)
  const dirty = useDoc((s) => s.dirty)
  const saving = useDoc((s) => s.saving)
  const selectedId = useUI((s) => s.selectedId)
  const viewMode = useUI((s) => s.viewMode)
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
    <div className="h-7 shrink-0 bg-white border-t border-ink-line flex items-center gap-3 px-3 text-[11px] text-ink-text-3 select-none no-print">
      {/* 选区状态 */}
      <span className="flex items-center gap-1 shrink-0">
        <MousePointerClick size={11} />
        {selBlock
          ? <>已选中 <b className="text-ink-text-2">{BLOCK_TYPE_LABEL[selBlock.type] ?? selBlock.type}</b>（第 {idx + 1} / {doc.blocks.length} 块）</>
          : <>未选中区块 · 共 {doc.blocks.length} 块</>}
      </span>

      <span className="w-px h-3 bg-ink-line" />

      {/* 统计 */}
      <span className="tabular-nums shrink-0">正文 <b className="text-ink-text-2">{stats.chars.toLocaleString()}</b> 字</span>
      <span className="tabular-nums shrink-0 hidden-md">图片 <b className="text-ink-text-2">{stats.images}</b></span>
      <span className="tabular-nums shrink-0 hidden-md">宽 <b className="text-ink-text-2">{maxWidth}</b>px</span>

      <div className="flex-1 min-w-0" />

      {/* 模式 */}
      <span className="shrink-0 hidden-md">{
        viewMode === 'edit' ? '编辑模式' : viewMode === 'preview' ? '预览模式' : '源码模式'
      }</span>

      {/* 诊断 */}
      <button className="btn btn-ghost btn-xs px-1 shrink-0" title="查看诊断" onClick={() => openModal('export')}>
        {errCount > 0
          ? <span className="chip bg-[#D64545]/12 text-[#D64545] flex items-center gap-0.5"><CircleAlert size={10} /> {errCount}</span>
          : warnCount > 0
            ? <span className="chip bg-[#E8A33D]/15 text-[#B7791F] flex items-center gap-0.5"><AlertTriangle size={10} /> {warnCount}</span>
            : <span className="chip bg-[#1D9E75]/12 text-[#1D9E75] flex items-center gap-0.5"><CheckCircle2 size={10} /> 合规</span>}
      </button>

      {/* 保存状态 */}
      <span className="flex items-center gap-1 shrink-0 tabular-nums" title={dirty ? '有未保存改动（自动保存约 4 秒）' : '已同步到本地库'}>
        <Save size={11} />
        {saving ? '保存中…' : dirty ? '未保存' : '已保存'}
      </span>
    </div>
  )
}
