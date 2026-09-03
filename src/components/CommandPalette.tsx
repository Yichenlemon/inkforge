import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Search, CornerDownLeft, Type, Heading1, Quote, List, Image as ImageIcon, Code,
  Table, Minus, CreditCard, Lightbulb, Clock, ListOrdered, ChevronDown, MousePointerClick,
  Sparkles, FileText, QrCode, Columns, LayoutTemplate, Wand2, Film, Music, Video, FileCode,
} from 'lucide-react'
import { COMPONENTS, searchComponents, findComponent } from '../lib/components.js'
import { getTheme } from '../../shared/themes.js'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { toast } from '../lib/ui.js'

interface Cmd {
  id: string
  title: string
  group: string
  hint?: string
  icon?: React.ReactNode
  run: () => void
}

const ICONS: Record<string, React.ReactNode> = {
  paragraph: <Type size={13} />, heading: <Heading1 size={13} />, quote: <Quote size={13} />,
  list: <List size={13} />, image: <ImageIcon size={13} />, code: <Code size={13} />,
  table: <Table size={13} />, divider: <Minus size={13} />, card: <CreditCard size={13} />,
  callout: <Lightbulb size={13} />, timeline: <Clock size={13} />, steps: <ListOrdered size={13} />,
  accordion: <ChevronDown size={13} />, interactive: <MousePointerClick size={13} />,
  qrcode: <QrCode size={13} />, columns: <Columns size={13} />, svg: <Sparkles size={13} />,
  lottie: <Film size={13} />, audio: <Music size={13} />, video: <Video size={13} />, html: <FileCode size={13} />,
}

export function CommandPalette() {
  const open = useUI((s) => s.modals.command)
  const closeModal = useUI((s) => s.closeModal)
  const doc = useDoc((s) => s.doc)
  const selectedId = useUI((s) => s.selectedId)
  const insertBlocks = useDoc((s) => s.insertBlocks)
  const openModal = useUI((s) => s.openModal)
  const setViewMode = useUI((s) => s.setViewMode)
  const [q, setQ] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const tokens = useMemo(() => getTheme(doc.themeId).tokens, [doc.themeId])

  const commands = useMemo<Cmd[]>(() => {
    const insert = (id: string) => {
      const def = findComponent(id)
      if (!def) return
      const blocks = def.create(tokens).map((b: any) => ({
        ...JSON.parse(JSON.stringify(b)),
        id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
      }))
      const idx = doc.blocks.findIndex((b) => b.id === selectedId)
      insertBlocks(blocks, idx >= 0 ? idx + 1 : undefined)
      toast(`已插入「${def.name}」`)
    }

    const comps: Cmd[] = COMPONENTS.map((c) => ({
      id: `c:${c.id}`, title: c.name, group: `组件 · ${c.category}`,
      icon: ICONS[c.id.split('-')[0]] ?? <LayoutTemplate size={13} />,
      run: () => insert(c.id),
    }))

    const actions: Cmd[] = [
      { id: 'a:preview', title: '预览文章', group: '操作', icon: <Sparkles size={13} />, run: () => setViewMode('preview') },
      { id: 'a:export', title: '导出 / 复制到公众号', group: '操作', icon: <FileText size={13} />, run: () => openModal('export') },
      { id: 'a:publish', title: '发布到公众号草稿箱', group: '操作', icon: <FileText size={13} />, run: () => openModal('publish') },
      { id: 'a:import', title: '导入 Markdown / HTML / Word / SVG', group: '操作', icon: <FileText size={13} />, run: () => openModal('import') },
      { id: 'a:markdown', title: 'Markdown 模式（导入 / 导出）', group: '操作', icon: <FileText size={13} />, run: () => openModal('markdown') },
      { id: 'a:tools', title: '中文排版与内容质检', group: '操作', icon: <FileText size={13} />, run: () => openModal('tools') },
      { id: 'a:lottie', title: '导入 Lottie 动画', group: '操作', icon: <Film size={13} />, run: () => openModal('lottie') },
      { id: 'a:anim', title: 'SVG 动效编辑器', group: '操作', icon: <Wand2 size={13} />, run: () => openModal('anim') },
      { id: 'a:cover', title: '制作封面', group: '操作', icon: <ImageIcon size={13} />, run: () => openModal('cover') },
      { id: 'a:save', title: '保存文章', group: '操作', icon: <FileText size={13} />, run: () => { useDoc.getState().save().then(() => toast('已保存', 'success')).catch((e: any) => toast(e?.message ?? '保存失败', 'error')) } },
      { id: 'a:undo', title: '撤销', group: '操作', hint: '⌘Z', run: () => useDoc.getState().undo() },
      { id: 'a:redo', title: '重做', group: '操作', hint: '⌘⇧Z', run: () => useDoc.getState().redo() },
    ]

    return [...actions, ...comps]
  }, [doc.blocks, selectedId, tokens, insertBlocks, openModal, setViewMode])

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k) return commands.slice(0, 40)
    return commands.filter((c) => c.title.toLowerCase().includes(k) || c.group.toLowerCase().includes(k)).slice(0, 40)
  }, [q, commands])

  useEffect(() => { setIndex(0) }, [q])
  useEffect(() => { if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 50) } }, [open])

  if (!open) return null

  const commit = (c?: Cmd) => {
    const target = c ?? filtered[index]
    if (!target) return
    closeModal('command')
    setTimeout(() => target.run(), 30)
  }

  return createPortal(
    <div className="fixed inset-0 z-[9500] flex items-start justify-center pt-[12vh] no-print">
      <div className="absolute inset-0 bg-black/30" onClick={() => closeModal('command')} />
      <div className="relative w-[560px] max-w-[92vw] bg-white rounded-xl shadow-2xl overflow-hidden ink-fade-in">
        <div className="flex items-center gap-2 px-3.5 h-12 border-b border-ink-line">
          <Search size={15} className="text-ink-text-3 shrink-0" />
          <input ref={inputRef} className="flex-1 bg-transparent outline-none text-[14px]"
            placeholder="输入命令或组件名…"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(filtered.length - 1, i + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)) }
              if (e.key === 'Enter') { e.preventDefault(); commit() }
              if (e.key === 'Escape') closeModal('command')
            }} />
          <span className="chip bg-black/[0.05] text-ink-text-3">ESC</span>
        </div>
        <div className="max-h-[52vh] overflow-y-auto py-1">
          {!filtered.length && <div className="py-8 text-center text-[13px] text-ink-text-3">没有匹配项</div>}
          {filtered.map((c, i) => (
            <button key={c.id}
              onMouseEnter={() => setIndex(i)}
              onClick={() => commit(c)}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left ${
                i === index ? 'bg-[#2C6BED]/10' : 'hover:bg-black/[0.03]'}`}>
              <span className="text-ink-text-3 shrink-0">{c.icon}</span>
              <span className="text-[13px] flex-1 truncate">{c.title}</span>
              <span className="text-[10.5px] text-ink-text-3">{c.group}</span>
              {i === index && <CornerDownLeft size={12} className="text-ink-text-3 shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
