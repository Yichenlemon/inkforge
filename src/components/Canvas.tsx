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
import { BLOCK_TYPE_LABEL } from '../lib/components.js'
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

  return (
    <div className="flex-1 overflow-y-auto bg-ink-bg">
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
