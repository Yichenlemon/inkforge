import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, FolderOpen, Clock, Search, FileText, FileImage, FileCode, Lock } from 'lucide-react'
import { useDoc, blockOf } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { openFileManager } from '../filemgr/index.js'
import { useFileStore } from '../filemgr/useFileStore.js'
import type { FileItem } from '../../shared/types.js'
import { toast, downloadText } from '../lib/ui.js'
import { compileApi } from '../lib/api.js'

interface Item {
  /** 分隔线项只需要 sep，因此 label 可选 */
  label?: string
  hint?: string
  run?: () => void
  sep?: boolean
  /** 标记该项触发「打开最近文档」飞出面板（悬停） */
  flyout?: 'recent'
}

/** 状态色：saved=灰绿 / dirty=琥珀 / saving=蓝 / error=红（与 MultiDocTabs 一致） */
const STATUS_COLOR: Record<string, string> = {
  saved: '#1D9E75',
  dirty: '#E8A33D',
  saving: '#2C6BED',
  error: '#D64545',
}

const STATUS_LABEL: Record<string, string> = {
  saved: '已保存',
  dirty: '未保存',
  saving: '保存中',
  error: '错误',
}

/** 相对时间：刚刚 / x 分钟前 / x 小时前 / x 天前 / 月/日 */
function formatRelative(ts?: number): string {
  if (!ts) return '从未'
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  const dt = new Date(ts)
  return `${dt.getMonth() + 1}/${dt.getDate()}`
}

/** 取文档实际锁状态：优先 openDocs 实时态，其次 meta 透传 */
function isItemLocked(it: FileItem): boolean {
  const od = useFileStore.getState().openDocs.find((o) => o.id === it.id)
  if (od?.locked) return true
  const meta = it.meta as Record<string, any> | undefined
  return !!meta?.locked
}

/** 取字数（后端未随列表返回时优雅降级为 '—'） */
function itemWordCount(it: FileItem): number | null {
  const meta = it.meta as Record<string, any> | undefined
  const w = meta?.wordCount
  return typeof w === 'number' ? w : null
}

function itemIcon(kind: string) {
  switch (kind) {
    case 'doc': return <FileText size={14} className="text-[#2C6BED] shrink-0" />
    case 'image': return <FileImage size={14} className="text-[#1D9E75] shrink-0" />
    case 'svg': return <FileCode size={14} className="text-[#E8A33D] shrink-0" />
    case 'lottie': return <FileCode size={14} className="text-[#9B59B6] shrink-0" />
    default: return <FileText size={14} className="text-ink-text-3 shrink-0" />
  }
}

/** 顶部应用菜单栏：文件 / 编辑 / 插入 / 视图 / 帮助 */
export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  /* 「打开最近文档…」悬停飞出面板 */
  const [flyout, setFlyout] = useState(false)
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('') // 防抖后的搜索词（200ms）
  const [sort, setSort] = useState<'recent' | 'name' | 'size'>('recent')
  const [typeF, setTypeF] = useState<'all' | 'doc'>('all')
  const [lockF, setLockF] = useState<'all' | 'locked' | 'unlocked'>('all')
  const flyoutTimer = useRef<number | undefined>(undefined)
  const recent = useFileStore((s) => s.itemsByFacet['recent'] ?? [])

  /* 搜索防抖 200ms */
  useEffect(() => {
    const t = window.setTimeout(() => setDq(q), 200)
    return () => window.clearTimeout(t)
  }, [q])

  /* 点击外部或 Esc 关闭（同时关闭飞出面板） */
  useEffect(() => {
    if (!open && !flyout) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(null); setFlyout(false) }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(null); setFlyout(false) } }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, flyout])

  /* 悬停进入：打开飞出面板，并确保 recent 列表已加载 */
  const openFlyout = () => {
    window.clearTimeout(flyoutTimer.current)
    const st = useFileStore.getState()
    if (!st.itemsByFacet['recent'] || st.itemsByFacet['recent']!.length === 0) void st.refreshFacet('recent')
    setFlyout(true)
  }
  /* 悬停离开：延迟关闭，留出移动到飞出面板的时间 */
  const closeFlyout = (delay = true) => {
    if (delay) flyoutTimer.current = window.setTimeout(() => setFlyout(false), 140)
    else setFlyout(false)
  }

  const openRecent = (id: string) => {
    void useFileStore.getState().openFile(id)
    setFlyout(false)
    setOpen(null)
  }

  /* 过滤 + 排序后的最近文档列表 */
  const list = useMemo(() => {
    const kw = dq.trim().toLowerCase()
    const arr = (recent as FileItem[]).filter((it) => {
      if (typeF === 'doc' && it.kind !== 'doc') return false
      if (lockF === 'locked' && !isItemLocked(it)) return false
      if (lockF === 'unlocked' && isItemLocked(it)) return false
      if (kw && !it.name.toLowerCase().includes(kw) && !(it.tags ?? []).some((t) => t.toLowerCase().includes(kw))) return false
      return true
    })
    arr.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh')
      if (sort === 'size') return (b.size ?? 0) - (a.size ?? 0)
      return (b.lastOpenedAt ?? b.updatedAt ?? 0) - (a.lastOpenedAt ?? a.updatedAt ?? 0)
    })
    return arr
  }, [recent, dq, sort, typeF, lockF])

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
        { label: '文件管理器…', hint: '⌘⇧O', run: () => { openFileManager('all'); setOpen(null) } },
        { label: '打开最近文档…', flyout: 'recent', run: () => { openFileManager('recent'); setOpen(null) } },
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
        { label: '元素框 · 横排', run: insert('frame', { layout: 'horizontal', children: [], inline: [] }) },
        { label: '元素框 · 纵排', run: insert('frame', { layout: 'vertical', children: [], inline: [] }) },
        { label: '元素框 · 自由画板', run: insert('frame', { layout: 'absolute', children: [], inline: [] }) },
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
                    : it.flyout === 'recent'
                      ? (
                        <div
                          key={it.label}
                          className="relative"
                          onMouseEnter={openFlyout}
                          onMouseLeave={() => closeFlyout(true)}
                        >
                          <button
                            onClick={it.run}
                            onMouseEnter={openFlyout}
                            className="w-full flex items-center gap-3 px-3 py-[5px] text-left text-[12.5px] text-ink-text-2 hover:bg-[#2C6BED]/10 hover:text-[#2C6BED] transition-colors"
                          >
                            <span className="flex-1 whitespace-nowrap">{it.label}</span>
                            {it.hint && <span className="text-[10.5px] text-ink-text-3 shrink-0">{it.hint}</span>}
                            <ChevronDown size={11} className="rotate-[-90deg] text-ink-text-3 shrink-0" />
                          </button>

                          {flyout && (
                            <div
                              onMouseEnter={() => window.clearTimeout(flyoutTimer.current)}
                              onMouseLeave={() => closeFlyout(true)}
                              className="absolute left-full top-0 ml-1 z-[70] w-[340px] max-h-[72vh] flex flex-col bg-white rounded-lg shadow-xl border border-ink-line ink-fade-in"
                            >
                              {/* 搜索框 */}
                              <div className="p-2 border-b border-ink-line">
                                <div className="flex items-center gap-2 px-2 h-8 rounded-md bg-black/[0.04] focus-within:bg-black/[0.06] transition-colors">
                                  <Search size={13} className="text-ink-text-3 shrink-0" />
                                  <input
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="搜索最近文档…"
                                    className="flex-1 bg-transparent outline-none text-[12.5px] text-ink-text placeholder:text-ink-text-3"
                                  />
                                </div>
                              </div>

                              {/* 排序 + 过滤 */}
                              <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-ink-line text-[11px] text-ink-text-3">
                                <div className="flex items-center gap-1">
                                  {([['recent', '最近打开'], ['name', '标题'], ['size', '大小']] as const).map(([k, label]) => (
                                    <button
                                      key={k}
                                      onClick={() => setSort(k)}
                                      className={`px-1.5 py-0.5 rounded transition-colors ${sort === k ? 'bg-[#2C6BED]/10 text-[#2C6BED] font-medium' : 'hover:bg-black/[0.05] text-ink-text-3'}`}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                                <div className="flex items-center gap-1">
                                  <select
                                    value={typeF}
                                    onChange={(e) => setTypeF(e.target.value as 'all' | 'doc')}
                                    className="bg-transparent outline-none rounded px-1 py-0.5 hover:bg-black/[0.05] text-ink-text-3"
                                  >
                                    <option value="all">全部</option>
                                    <option value="doc">文档</option>
                                  </select>
                                  <select
                                    value={lockF}
                                    onChange={(e) => setLockF(e.target.value as 'all' | 'locked' | 'unlocked')}
                                    className="bg-transparent outline-none rounded px-1 py-0.5 hover:bg-black/[0.05] text-ink-text-3"
                                  >
                                    <option value="all">已锁/未锁</option>
                                    <option value="locked">已锁</option>
                                    <option value="unlocked">未锁</option>
                                  </select>
                                </div>
                              </div>

                              {/* 列表 */}
                              <div className="flex-1 overflow-y-auto py-1">
                                {list.length === 0 ? (
                                  <div className="px-3 py-6 text-center text-[12px] text-ink-text-3">没有匹配的文档</div>
                                ) : (
                                  list.map((it) => {
                                    const status = it.status ?? 'saved'
                                    const wc = itemWordCount(it)
                                    const locked = isItemLocked(it)
                                    return (
                                      <button
                                        key={it.id}
                                        onClick={() => openRecent(it.id)}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#2C6BED]/10 transition-colors group"
                                      >
                                        {itemIcon(it.kind)}
                                        <span className="flex-1 min-w-0">
                                          <span className="flex items-center gap-1">
                                            <span className="truncate text-[12.5px] text-ink-text group-hover:text-[#2C6BED]">{it.name}</span>
                                            {locked && <Lock size={11} className="text-[#D64545] shrink-0" />}
                                          </span>
                                          <span className="flex items-center gap-1.5 text-[10.5px] text-ink-text-3">
                                            <span
                                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${status === 'saving' ? 'animate-pulse' : ''}`}
                                              style={{ background: STATUS_COLOR[status] }}
                                              title={STATUS_LABEL[status]}
                                            />
                                            <span className="shrink-0">{formatRelative(it.lastOpenedAt)}</span>
                                            {wc != null && <span className="shrink-0">· {wc} 字</span>}
                                          </span>
                                        </span>
                                      </button>
                                    )
                                  })
                                )}
                              </div>

                              {/* 打开完整文件管理器 */}
                              <div className="border-t border-ink-line p-1">
                                <button
                                  onClick={() => { openFileManager('recent'); setFlyout(false); setOpen(null) }}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-[12.5px] text-ink-text-2 hover:bg-[#2C6BED]/10 hover:text-[#2C6BED] transition-colors"
                                >
                                  <FolderOpen size={13} className="shrink-0" />
                                  <span className="flex-1">打开文件管理器…</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
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
