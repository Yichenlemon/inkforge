import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, Trash2, Copy, ArrowUp, ArrowDown, GripVertical, Lock, Unlock, Eye, EyeOff,
  MoreHorizontal, FileText,
} from 'lucide-react'
import type { Block, ThemeTokens } from '../../shared/types.js'
import { getTheme } from '../../shared/themes.js'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { BlockView } from './BlockViews.jsx'
import { BLOCK_TYPE_LABEL, COMPONENTS as COMPONENT_DEFS } from '../lib/components.js'
import { toast } from '../lib/ui.js'

export function Canvas() {
  const doc = useDoc((s) => s.doc)
  const moveBlock = useDoc((s) => s.moveBlock)
  const addBlock = useDoc((s) => s.addBlock)
  const selectedId = useUI((s) => s.selectedId)
  const select = useUI((s) => s.select)
  const maxWidth = useUI((s) => s.maxWidth)
  const setRightTab = useUI((s) => s.setRightTab)

  const tokens: ThemeTokens = useMemo(
    () => ({ ...getTheme(doc.themeId).tokens, ...(doc.tokenOverride ?? {}) }),
    [doc.themeId, doc.tokenOverride],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = doc.blocks.findIndex((b) => b.id === active.id)
    const to = doc.blocks.findIndex((b) => b.id === over.id)
    if (from < 0 || to < 0) return
    moveBlock(String(active.id), to)
  }

  // —— 接受从左栏拖进来的组件/素材（HTML5 DnD）——
  // 用 state 记录落点高亮条（top | bottom | inside）。overIdx=-1 表示末尾
  const [dropMark, setDropMark] = useState<{ index: number; mode: 'before' | 'inside' } | null>(null)
  const dropMarkRef = useRef<HTMLDivElement>(null)
  const blocksRef = useRef<HTMLDivElement>(null)

  const onDropFromPanel = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDropMark(null)
    // 0) 跨区块移动：把 frame 内的子块拖到其它 frame 或画布顶层
    const moveRaw = e.dataTransfer.getData('application/x-ink-blockmove')
    if (moveRaw) {
      try {
        const { blockId } = JSON.parse(moveRaw) as { blockId: string }
        const docBlocks = useDoc.getState().doc.blocks
        let extracted: Block | null = null
        const strip = (bs: Block[]): Block[] => bs.flatMap((b) => {
          if (b.id === blockId) { extracted = b; return [] }
          if (b.type === 'frame' && Array.isArray((b.data as any)?.children)) {
            return [{ ...b, data: { ...(b.data as any), children: strip((b.data as any).children) } }]
          }
          return [b]
        })
        const stripped = strip(docBlocks)
        if (!extracted) return
        const inside = dropMark?.mode === 'inside'
        if (inside) {
          const target = stripped[dropMark!.index]
          if (target?.type === 'frame') {
            useDoc.getState().replaceBlocks(
              stripped.map((b) => b.id === target.id
                ? { ...b, data: { ...(b.data as any), children: [...((b.data as any).children ?? []), extracted!] } }
                : b),
            )
            toast('已移入元素框')
            return
          }
        }
        const idx = Math.max(0, Math.min(stripped.length, dropMark?.index ?? stripped.length))
        const next = [...stripped]
        next.splice(idx, 0, extracted)
        useDoc.getState().replaceBlocks(next)
        toast('已移动区块')
      } catch {}
      return
    }
    // 1) 组件
    const compId = e.dataTransfer.getData('application/x-ink-component')
    if (compId) {
      const def = COMPONENT_DEFS.find((d) => d.id === compId)
      if (!def) return
      const blocks = def.create({ ...getTheme(doc.themeId).tokens, ...(doc.tokenOverride ?? {}) } as any)
      const idx = dropMark?.index ?? doc.blocks.length
      if (dropMark?.mode === 'inside') {
        // 把目标 frame 的 children 追加（限制只能往 frame 里塞）
        const target = doc.blocks[idx]
        if (target?.type === 'frame') {
          const cur = Array.isArray(target.data?.children) ? target.data.children : []
          useDoc.getState().updateData(target.id, { children: [...cur, ...blocks] })
          toast(`已加入「${def.name}」到 frame`)
          return
        }
      }
      // 默认在 idx 之前插入
      useDoc.getState().insertBlocks(blocks, idx)
      toast(`已插入「${def.name}」`)
      return
    }
    // 2) 素材
    const illustration = e.dataTransfer.getData('application/x-ink-illustration')
    if (illustration) {
      try {
        const parsed = JSON.parse(illustration) as { svg: string }
        const wrapped = `<section style="text-align:center;margin:6px 0;line-height:0"><span style="display:inline-block;width:64px;height:64px;line-height:0">${parsed.svg.replace(/<svg /, '<svg width="64" height="64" ')}</span></section>`
        const block: Block = { id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4), type: 'html', data: { html: wrapped }, style: { marginTop: 6, marginBottom: 6 } }
        const idx = dropMark?.index ?? doc.blocks.length
        useDoc.getState().insertBlocks([block], idx)
        toast('已插入素材')
      } catch {}
      return
    }
    const asset = e.dataTransfer.getData('application/x-ink-asset')
    if (asset) {
      try {
        const a = JSON.parse(asset) as { url: string; name: string; width?: number; height?: number }
        const block: Block = { id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4), type: 'image', data: { src: a.url, alt: a.name, naturalWidth: a.width ?? undefined, display: 'block' }, style: { marginTop: 6, marginBottom: 12 } }
        const idx = dropMark?.index ?? doc.blocks.length
        useDoc.getState().insertBlocks([block], idx)
        toast('已插入图片')
      } catch {}
      return
    }
  }

  const onDragOverFromPanel = (e: React.DragEvent<HTMLDivElement>) => {
    // 仅在拖入了组件/素材类型时才显示高亮
    const types = Array.from(e.dataTransfer.types)
    const relevant = types.includes('application/x-ink-component') || types.includes('application/x-ink-illustration') || types.includes('application/x-ink-asset') || types.includes('application/x-ink-blockmove')
    if (!relevant) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    // 计算 drop 在哪个 index：mouseY 与 blocksRef 内每个块的中间对比
    const y = e.clientY
    const containerRect = blocksRef.current?.getBoundingClientRect()
    if (!containerRect) return
    // 找最接近的落点
    const blockEls = Array.from(blocksRef.current?.querySelectorAll<HTMLElement>('[data-canvas-block]') || [])
    let bestIdx = -1
    let bestMode: 'before' | 'inside' = 'before'
    let bestDist = Infinity
    blockEls.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      const within = y >= r.top - 24 && y <= r.bottom + 24
      if (!within) return
      const mid = r.top + r.height / 2
      const dist = Math.abs(y - mid)
      const isFrame = el.getAttribute('data-frame') === '1'
      const mode: 'before' | 'inside' = (isFrame && y > r.top + 18 && y < r.bottom - 18) ? 'inside' : 'before'
      const insertIdx = mode === 'inside' ? i : (y < mid ? i : i + 1)
      if (dist < bestDist) { bestDist = dist; bestIdx = insertIdx; bestMode = mode }
    })
    if (bestIdx >= 0) {
      setDropMark({ index: bestIdx, mode: bestMode })
    } else {
      setDropMark({ index: doc.blocks.length, mode: 'before' })
    }
  }

  const onDragLeaveFromPanel = (e: React.DragEvent<HTMLDivElement>) => {
    // 仅在离开最外层容器时清空
    if (e.currentTarget === e.target) setDropMark(null)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-ink-bg"
      onDragOver={onDragOverFromPanel}
      onDragLeave={onDragLeaveFromPanel}
      onDrop={onDropFromPanel}
    >
      <div
        className="mx-auto py-8 px-5"
        style={{ width: '100%', maxWidth: maxWidth + 80 }}
        onClick={(e) => { if (e.target === e.currentTarget) select(null) }}
      >
        {/* 标题区 */}
        <div className="mb-5">
          <input
            className="w-full bg-transparent outline-none text-[26px] font-bold leading-tight"
            style={{ color: tokens.headingColor }}
            value={doc.title}
            placeholder="文章标题"
            onChange={(e) => useDoc.getState().setTitle(e.target.value)}
          />
          <div className="flex items-center gap-2 mt-1.5 text-[11.5px] text-ink-text-3">
            <span>{doc.title.length} / 64 字</span>
            {doc.title.length > 64 && <span className="text-[#D64545]">超过公众号标题上限</span>}
            <span className="flex-1" />
            <button className="btn btn-ghost btn-xs" onClick={() => setRightTab('doc')}>
              <FileText size={11} /> 文章信息
            </button>
          </div>
        </div>

        {/* 区块列表 */}
        <div ref={blocksRef}>
        {doc.blocks.length === 0 && (
          <div
            className="my-12 py-16 border-2 border-dashed border-[#2C6BED]/40 rounded-2xl text-center bg-[#2C6BED]/[0.04]"
          >
            <div className="text-[18px] font-semibold text-[#2C6BED] mb-1">从左侧拖入组件开始排版</div>
            <div className="text-[12.5px] text-ink-text-3">支持组件、素材、元素框；落点会用蓝色横条标记</div>
          </div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
          modifiers={[restrictToVerticalAxis]}>
          <SortableContext items={doc.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5">
              {doc.blocks.map((block, index) => (
                <SortableBlock
                  key={block.id}
                  block={block}
                  index={index}
                  tokens={tokens}
                  selected={selectedId === block.id}
                  onSelect={() => select(block.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* 落点高亮条（蓝线 + 闪烁圆点） */}
        {dropMark && doc.blocks.length > 0 && (
          <div
            ref={dropMarkRef}
            className="pointer-events-none relative"
            style={{ height: 0 }}
          >
            <div className="absolute -top-[2px] left-0 right-0 h-[3px] bg-[#2C6BED] rounded-full shadow-[0_0_8px_rgba(44,107,237,0.6)]">
              <div className="absolute -left-[5px] -top-[3px] w-[10px] h-[10px] rounded-full bg-[#2C6BED] animate-pulse" />
              <div className="absolute -right-[5px] -top-[3px] w-[10px] h-[10px] rounded-full bg-[#2C6BED] animate-pulse" />
              <div className="absolute left-12 -top-[8px] bg-[#2C6BED] text-white text-[10.5px] px-2 py-0.5 rounded shadow whitespace-nowrap">
                {dropMark.mode === 'inside' ? '放入元素框内' : `插入到第 ${dropMark.index + 1} 个区块位置`}
              </div>
            </div>
          </div>
        )}
        </div>

        {/* 末尾添加 */}
        <div className="mt-4 flex justify-center">
          <button className="btn btn-soft btn-sm"
            onClick={() => {
              const id = doc.blocks.length ? doc.blocks[doc.blocks.length - 1].id : null
              addBlock({
                id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
                type: 'paragraph', data: { html: '' }, style: { marginTop: 0, marginBottom: 16 },
              })
              toast('已添加段落，可在左侧组件库选择更多类型')
            }}>
            <Plus size={13} /> 添加区块
          </button>
        </div>

        <div className="h-24" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function SortableBlock({ block, index, tokens, selected, onSelect }: {
  block: Block; index: number; tokens: ThemeTokens; selected: boolean; onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const updateBlock = useDoc((s) => s.updateBlock)
  const moveBlockBy = useDoc((s) => s.moveBlockBy)
  const duplicateBlock = useDoc((s) => s.duplicateBlock)
  const removeBlock = useDoc((s) => s.removeBlock)
  const addBlock = useDoc((s) => s.addBlock)
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    marginTop: block.style.marginTop,
    marginBottom: block.style.marginBottom,
    padding: block.style.paddingTop || block.style.paddingBottom || block.style.paddingLeft || block.style.paddingRight
      ? `${block.style.paddingTop ?? 0}px ${block.style.paddingRight ?? 0}px ${block.style.paddingBottom ?? 0}px ${block.style.paddingLeft ?? 0}px`
      : undefined,
    background: block.style.background,
    borderRadius: block.style.borderRadius,
    border: block.style.borderWidth ? `${block.style.borderWidth}px ${block.style.borderStyle ?? 'solid'} ${block.style.borderColor ?? '#eee'}` : undefined,
    textAlign: block.style.textAlign,
    opacity: block.style.opacity ?? (block.style.hidden ? 0.4 : 1),
    /* 文字级样式（悬浮工具栏「段落」组实时生效） */
    fontSize: block.style.fontSize ? `${block.style.fontSize}px` : undefined,
    lineHeight: block.style.lineHeight,
    letterSpacing: block.style.letterSpacing != null ? `${block.style.letterSpacing}px` : undefined,
    color: block.style.color,
    fontWeight: block.style.fontWeight as any,
  }

  /* customCss 逃生舱：编辑态与导出一致（简单 prop:value; 解析） */
  if (block.style.customCss) {
    for (const decl of block.style.customCss.split(';')) {
      const i = decl.indexOf(':')
      if (i > 0) {
        const prop = decl.slice(0, i).trim()
        const val = decl.slice(i + 1).trim()
        if (prop && val) (style as any)[prop.replace(/-([a-z])/g, (_m, c) => c.toUpperCase())] = val
      }
    }
  }

  // 浮动图片：让画布内的后续区块正文环绕它（与导出一致）
  const isFloatImg = block.type === 'image' && (block.data?.display === 'float-left' || block.data?.display === 'float-right')
  if (isFloatImg) {
    const disp = block.data.display as 'float-left' | 'float-right'
    style.float = disp === 'float-right' ? 'right' : 'left'
    style.width = block.data.width || '45%'
    style.marginTop = 0
    style.marginBottom = 8
    style.clear = 'none'
    style.padding = 0
    style.background = 'transparent'
    style.border = 'none'
    style.borderRadius = 0
    if (disp === 'float-right') style.marginLeft = 8; else style.marginRight = 8
    const fm = block.data.floatMargin
    if (fm && fm > 0) {
      if (disp === 'float-right') style.marginRight = fm; else style.marginLeft = fm
    }
  }

  return (
    <div
      ref={(node) => { setNodeRef(node); (ref as any).current = node }}
      className={`canvas-block relative group ${selected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
      style={style}
      onClick={onSelect}
      data-canvas-block={block.id}
      data-frame={block.type === 'frame' ? '1' : '0'}
    >
      {/* 左侧手柄 */}
      <div className="block-handle no-print">
        <button className="btn btn-ghost btn-xs px-0.5 cursor-grab" {...attributes} {...listeners} title="拖动排序">
          <GripVertical size={13} />
        </button>
        <button className="btn btn-ghost btn-xs px-0.5" title="上移" onClick={() => moveBlockBy(block.id, -1)}>
          <ArrowUp size={11} />
        </button>
        <button className="btn btn-ghost btn-xs px-0.5" title="下移" onClick={() => moveBlockBy(block.id, 1)}>
          <ArrowDown size={11} />
        </button>
      </div>

      {/* 类型标签 */}
      <div className="absolute -top-[9px] left-0 text-[10px] px-1 rounded bg-black/[0.05] text-ink-text-3 opacity-0 group-hover:opacity-100 transition-opacity no-print">
        {BLOCK_TYPE_LABEL[block.type]}
      </div>

      {/* 内容 */}
      <div className="px-1">
        <BlockView block={block} tokens={tokens} />
      </div>

      {/* 右侧操作 */}
      <div className="absolute -right-8 top-0 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity no-print" ref={ref}>
        <button className="btn btn-ghost btn-xs px-1" title="复制" onClick={() => { duplicateBlock(block.id); toast('已复制') }}>
          <Copy size={12} />
        </button>
        <button className="btn btn-ghost btn-xs px-1" title={block.style.hidden ? '显示' : '隐藏（不导出）'}
          onClick={() => updateBlock(block.id, { style: { ...block.style, hidden: !block.style.hidden } })}>
          {block.style.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
        <button className="btn btn-ghost btn-xs px-1" title={block.locked ? '解锁' : '锁定'}
          onClick={() => updateBlock(block.id, { locked: !block.locked })}>
          {block.locked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
        <button className="btn btn-ghost btn-xs px-1" title="删除" onClick={() => { removeBlock(block.id); toast('已删除') }}>
          <Trash2 size={12} />
        </button>
      </div>

      {/* 下方插入 */}
      <div className="block-add no-print">
        <button className="btn btn-soft btn-xs rounded-full px-1.5 shadow-sm"
          title="在此处插入区块"
          onClick={(e) => {
            e.stopPropagation()
            addBlock({
              id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
              type: 'paragraph', data: { html: '' }, style: { marginTop: 0, marginBottom: 16 },
            }, index + 1)
          }}>
          <Plus size={11} />
        </button>
      </div>
    </div>
  )
}
