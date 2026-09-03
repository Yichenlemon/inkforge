import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useDoc, blockOf } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { toast, downloadText } from '../lib/ui.js'
import { compileApi } from '../lib/api.js'

interface Item {
  /** 分隔线项只需要 sep，因此 label 可选 */
  label?: string
  hint?: string
  run?: () => void
  sep?: boolean
}

/** 顶部应用菜单栏：文件 / 编辑 / 插入 / 视图 / 帮助 */
export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  /* 点击外部或 Esc 关闭 */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const ui = () => useUI.getState()
  const ds = () => useDoc.getState()

  const save = async () => {
    try { await ds().save(); toast('已保存', 'success') }
    catch (e: any) { toast(e?.message ?? '保存失败', 'error') }
  }

  const exportMd = async () => {
    try {
      const doc = ds().doc
      const r = await compileApi.exportMd(doc)
      const name = (doc.title || 'inkforge').replace(/[\\/:*?"<>|]/g, '_')
      downloadText(r.markdown, `${name}.md`, 'text/markdown;charset=utf-8')
      toast('已导出 Markdown', 'success')
    } catch (e: any) { toast(e?.message ?? '导出失败', 'error') }
  }

  /** 在当前选中区块之后插入；未选中则插到文末 */
  const insert = (type: any, data: any = {}) => () => {
    const sel = ui().selectedId
    const idx = ds().doc.blocks.findIndex((b) => b.id === sel)
    ds().insertBlocks([blockOf(type, data)], idx >= 0 ? idx + 1 : undefined)
    setOpen(null)
  }

  const withSelected = (fn: (id: string) => void) => () => {
    const id = ui().selectedId
    if (!id) { toast('请先选中一个区块', 'info'); return }
    fn(id)
    setOpen(null)
  }

  const menus: { key: string; label: string; items: Item[] }[] = [
    {
      key: 'file', label: '文件', items: [
        { label: '新建文档', run: () => { ds().newDoc(); ui().setPage('editor'); setOpen(null) } },
        { label: '打开文档首页', run: () => { ui().setPage('home'); setOpen(null) } },
        { sep: true },
        { label: '保存', hint: '⌘S', run: () => { void save(); setOpen(null) } },
        {
          label: '保存为版本快照', run: () => {
            ds().saveSnapshot('手动快照')
              .then(() => toast('已保存版本快照', 'success'))
              .catch((e: any) => toast(e?.message ?? '保存失败', 'error'))
            setOpen(null)
          },
        },
        { sep: true },
        { label: '导入 Markdown / Word / HTML…', run: () => { ui().openModal('import'); setOpen(null) } },
        { label: '导出 / 复制到公众号', hint: '⌘E', run: () => { ui().openModal('export'); setOpen(null) } },
        { label: '导出 Markdown', run: () => { void exportMd(); setOpen(null) } },
        { sep: true },
        { label: '发布到公众号草稿箱', run: () => { ui().openModal('publish'); setOpen(null) } },
        { label: '全局设置…', run: () => { ui().openModal('settings'); setOpen(null) } },
      ],
    },
    {
      key: 'edit', label: '编辑', items: [
        { label: '撤销', hint: '⌘Z', run: () => { ds().undo(); setOpen(null) } },
        { label: '重做', hint: '⌘⇧Z', run: () => { ds().redo(); setOpen(null) } },
        { label: '查找与替换…', hint: '⌘F', run: () => { ui().openModal('findReplace'); setOpen(null) } },
        { label: '历史记录（跳转到任意步骤）', run: () => { ui().openModal('history'); setOpen(null) } },
        { sep: true },
        { label: '复制选中区块', run: withSelected((id) => ds().duplicateBlock(id)) },
        { label: '上移', run: withSelected((id) => ds().moveBlockBy(id, -1)) },
        { label: '下移', run: withSelected((id) => ds().moveBlockBy(id, 1)) },
        { label: '删除选中区块', run: withSelected((id) => { ds().removeBlock(id); ui().select(null) }) },
      ],
    },
    {
      key: 'insert', label: '插入', items: [
        { label: '小标题', run: insert('heading', { html: '小标题', level: 2, headingStyle: 'plain' }) },
        { label: '正文段落', run: insert('paragraph', { html: '正文内容' }) },
        { label: '引用', run: insert('quote', { html: '<p>引用内容</p>', quoteStyle: 'bar' }) },
        { label: '无序列表', run: insert('list', { html: '<li>列表项</li>', ordered: false }) },
        { label: '有序列表', run: insert('list', { html: '<li>列表项</li>', ordered: true }) },
        { label: '分割线', run: insert('divider', { variant: 'solid', width: '100%' }) },
        { label: '代码块', run: insert('code', { code: '', lang: 'plaintext' }) },
        { label: '图片', run: insert('image', { src: '', alt: '' }) },
        { label: '表格', run: insert('table', { header: true, rows: [['列 1', '列 2'], ['', '']], zebra: false, borderMode: 'all' }) },
        { label: '卡片', run: insert('card', { title: '卡片标题', html: '卡片内容', variant: 'plain' }) },
        { label: '提示框', run: insert('callout', { html: '提示内容' }) },
        { sep: true },
        { label: '打开组件库面板…', run: () => { ui().setLeftTab('components'); ui().setPage('editor'); setOpen(null) } },
      ],
    },
    {
      key: 'view', label: '视图', items: [
        { label: '编辑', run: () => { ui().setViewMode('edit'); setOpen(null) } },
        { label: '预览', hint: '⌘P', run: () => { ui().setViewMode('preview'); setOpen(null) } },
        { label: '源码（编译后 HTML）', run: () => { ui().setViewMode('code'); setOpen(null) } },
        { sep: true },
        { label: 'Markdown 模式（导入 / 导出）', run: () => { ui().openModal('markdown'); setOpen(null) } },
        { sep: true },
        { label: '切换左侧面板', run: () => { ui().toggleLeft(); setOpen(null) } },
        { label: '切换右侧面板', run: () => { ui().toggleRight(); setOpen(null) } },
      ],
    },
    {
      key: 'help', label: '帮助', items: [
        { label: '命令面板', hint: '⌘K', run: () => { ui().openModal('command'); setOpen(null) } },
        { label: '中文排版与内容质检', run: () => { ui().openModal('tools'); setOpen(null) } },
        { label: '导入 Lottie 动画', run: () => { ui().openModal('lottie'); setOpen(null) } },
        { label: 'SVG 动效编辑器', run: () => { ui().openModal('anim'); setOpen(null) } },
        { sep: true },
        { label: '查看诊断', run: () => { ui().openModal('export'); setOpen(null) } },
      ],
    },
  ]

  return (
    <div className="flex items-center gap-0.5" ref={ref}>
      {menus.map((m) => {
        const isOpen = open === m.key
        return (
          <div key={m.key} className="relative">
            <button
              onClick={() => setOpen(isOpen ? null : m.key)}
              onMouseEnter={() => { if (open && open !== m.key) setOpen(m.key) }}
              className={`h-7 px-2 rounded flex items-center gap-0.5 text-[12.5px] transition-colors ${
                isOpen ? 'bg-black/[0.07] text-ink-text font-medium' : 'text-ink-text-2 hover:bg-black/[0.045]'}`}
            >
              {m.label}
              <ChevronDown size={11} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="absolute top-8 left-0 z-[60] min-w-[215px] bg-white rounded-lg shadow-xl border border-ink-line py-1 ink-fade-in">
                {m.items.map((it, i) =>
                  it.sep
                    ? <div key={`sep${i}`} className="h-px bg-ink-line my-1" />
                    : (
                      <button
                        key={it.label}
                        onClick={it.run}
                        className="w-full flex items-center gap-3 px-3 py-[5px] text-left text-[12.5px] text-ink-text-2 hover:bg-[#2C6BED]/10 hover:text-[#2C6BED] transition-colors"
                      >
                        <span className="flex-1 whitespace-nowrap">{it.label}</span>
                        {it.hint && <span className="text-[10.5px] text-ink-text-3 shrink-0">{it.hint}</span>}
                      </button>
                    ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
