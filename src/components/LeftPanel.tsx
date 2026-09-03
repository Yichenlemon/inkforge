import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import {
  Search, Plus, Trash2, Upload, LayoutGrid, ListTree, Library, Image as ImageIcon,
  FileText, Package, Copy, Download, Loader2, RefreshCw, Scissors, Sparkles, Star, GripVertical,
} from 'lucide-react'
import type { Block, AssetRecord } from '../../shared/types.js'
import { getTheme } from '../../shared/themes.js'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import {
  COMPONENTS_BY_CATEGORY, COMPONENTS, searchComponents, findComponent,
} from '../lib/components.js'
import {
  ILLUSTRATIONS_BY_CATEGORY, searchIllustrations, tintIllustration,
} from '../lib/illustrations.js'
import { BUILTIN_TEMPLATES } from '../lib/templates.js'
import { assetsApi, libraryApi, convertApi, onlineApi, yibanApi } from '../lib/api.js'
import { toast, Tabs, Empty, Spinner, Select } from '../lib/ui.js'

type Tab = 'components' | 'yiban' | 'assets' | 'outline' | 'library'

export function LeftPanel() {
  const tab = useUI((s) => s.leftTab)
  const setTab = useUI((s) => s.setLeftTab)
  return (
    <div className="flex flex-col h-full bg-white border-r border-ink-line">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'components', label: '组件', icon: <LayoutGrid size={12} /> },
          { value: 'yiban', label: '样式库', icon: <Sparkles size={12} /> },
          { value: 'assets', label: '素材', icon: <ImageIcon size={12} /> },
          { value: 'outline', label: '大纲', icon: <ListTree size={12} /> },
          { value: 'library', label: '复用', icon: <Library size={12} /> },
        ]}
      />
      {tab === 'components' && <ComponentsTab />}
      {tab === 'yiban' && <YibanTab />}
      {tab === 'assets' && <AssetsTab />}
      {tab === 'outline' && <OutlineTab />}
      {tab === 'library' && <LibraryTab />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 组件库                                                               */
/* ------------------------------------------------------------------ */

function ComponentsTab() {
  const [kw, setKw] = useState('')
  const [cat, setCat] = useState<string>('全部')
  const doc = useDoc((s) => s.doc)
  const insertBlocks = useDoc((s) => s.insertBlocks)
  const selectedId = useUI((s) => s.selectedId)
  const tokens = useMemo(() => ({ ...getTheme(doc.themeId).tokens }), [doc.themeId])

  const insert = (id: string) => {
    const def = findComponent(id)
    if (!def) return
    let inputs: Record<string, string> | undefined
    if (def.prompt) {
      const v = window.prompt(def.prompt.label, def.prompt.example ?? '')
      if (v === null) return
      inputs = { value: v }
    }
    const blocks = def.create(tokens, inputs).map(cloneBlock)
    const idx = doc.blocks.findIndex((b) => b.id === selectedId)
    insertBlocks(blocks, idx >= 0 ? idx + 1 : undefined)
    if (def.category === '微信生态') {
      toast('已插入。视频号/小程序/微信购物需在微信编辑器内完成最终关联，此处生成合规占位卡片与规范链接。', 'success')
    } else {
      toast(`已插入「${def.name}」`)
    }
  }

  const groups = cat === '全部'
    ? COMPONENTS_BY_CATEGORY
    : COMPONENTS_BY_CATEGORY.filter((g) => g.category === cat)

  const filtered = kw.trim()
    ? [{ category: '搜索结果', items: searchComponents(kw) }]
    : groups

  return (
    <div className="flex flex-col h-full">
      <div className="p-2.5 border-b border-ink-line space-y-2 shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-text-3" />
          <input className="input pl-7" placeholder="搜索组件…" value={kw} onChange={(e) => setKw(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          {['全部', ...COMPONENTS_BY_CATEGORY.map((g) => g.category)].map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className={`chip ${cat === c ? 'bg-[#2C6BED] text-white' : 'bg-black/[0.05] text-ink-text-3 hover:bg-black/[0.08]'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5">
        {filtered.map((g) => (
          <div key={g.category} className="mb-3">
            <div className="text-[11px] font-semibold text-ink-text-3 mb-1.5">{g.category}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {g.items.map((c) => (
                <button key={c.id} onClick={() => insert(c.id)} title={c.name}
                  className="rounded-lg border border-ink-line p-2 text-left hover:border-[#2C6BED] hover:bg-[#2C6BED]/[0.04] transition-colors">
                  <div className="text-[12px] font-medium text-ink-text truncate mb-1.5">{c.name}</div>
                  <Thumb kind={c.thumb} tokens={tokens} />
                </button>
              ))}
            </div>
          </div>
        ))}
        {filtered.every((g) => !g.items.length) && <Empty text="没有匹配的组件" />}
      </div>
    </div>
  )
}

function Thumb({ kind, tokens }: { kind: string; tokens: any }) {
  const bar = <span className="block w-1 h-3 rounded" style={{ background: tokens.colorPrimary }} />
  const line = (w: string) => <span className="block h-1.5 rounded-sm" style={{ width: w, background: tokens.colorBorder }} />
  switch (kind) {
    case 'bar': return <div className="flex items-center gap-1">{bar}{line('70%')}</div>
    case 'card': return <div className="rounded p-1.5 space-y-1" style={{ background: tokens.colorSurface }}>{line('80%')}{line('55%')}</div>
    case 'grid': return <div className="grid grid-cols-3 gap-0.5">{Array.from({ length: 6 }, (_, i) => <span key={i} className="h-3 rounded-sm" style={{ background: tokens.colorSurface }} />)}</div>
    case 'quote': return <div className="pl-1.5 space-y-1" style={{ borderLeft: `2px solid ${tokens.colorPrimary}` }}>{line('75%')}</div>
    case 'divider': return <div className="py-1.5"><span className="block h-px" style={{ background: tokens.colorBorder }} /></div>
    case 'list': return <div className="space-y-1">{Array.from({ length: 3 }, (_, i) => <div key={i} className="flex items-center gap-1"><span className="w-1 h-1 rounded-full" style={{ background: tokens.colorPrimary }} />{line('60%')}</div>)}</div>
    case 'image': return <div className="space-y-1">{Array.from({ length: 2 }, (_, i) => <span key={i} className="block h-4 rounded" style={{ background: tokens.colorSurface }} />)}</div>
    case 'code': return <div className="rounded p-1.5 space-y-1 font-mono text-[9px]" style={{ background: '#2E3440' }}><span className="block h-1 w-3/4 rounded-sm bg-white/25" /><span className="block h-1 w-1/2 rounded-sm bg-white/15" /></div>
    case 'badge': return <div className="flex justify-center"><span className="px-2 py-0.5 rounded text-[10px] text-white" style={{ background: tokens.colorPrimary }}>按钮</span></div>
    case 'timeline': return <div className="space-y-1 pl-1" style={{ borderLeft: `1px solid ${tokens.colorBorder}` }}>{Array.from({ length: 3 }, (_, i) => <div key={i} className="flex items-center gap-1 -ml-[3px]"><span className="w-1.5 h-1.5 rounded-full" style={{ background: tokens.colorPrimary }} />{line('45%')}</div>)}</div>
    default: return <div className="space-y-1">{line('90%')}{line('70%')}{line('45%')}</div>
  }
}

function cloneBlock(b: Block): Block {
  return JSON.parse(JSON.stringify({ ...b, id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4) }))
}

/* ------------------------------------------------------------------ */
/* 壹伴样式库（16,000+ 微信兼容内联样式，服务端分页）                       */
/* ------------------------------------------------------------------ */

interface YibanItem {
  id: number
  desc: string
  tags: string[]
  type: string
  free: boolean
  category: string
  detail: string
}

function YibanTab() {
  const [kw, setKw] = useState('')
  const [appliedKw, setAppliedKw] = useState('')
  const [cat, setCat] = useState('全部')
  const [cats, setCats] = useState<{ name: string; count: number }[]>([])
  const [total, setTotal] = useState(0)
  const [items, setItems] = useState<YibanItem[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [favs, setFavs] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('inkforge-yiban-favs') ?? '[]') } catch { return [] }
  })
  const [favOnly, setFavOnly] = useState(false)
  const doc = useDoc((s) => s.doc)
  const insertBlocks = useDoc((s) => s.insertBlocks)
  const selectedId = useUI((s) => s.selectedId)

  useEffect(() => {
    yibanApi.categories()
      .then((r: any) => setCats(r.categories ?? []))
      .catch(() => setCats([]))
  }, [])

  const load = useCallback(async (p: number, c: string, k: string, ids = '') => {
    setLoading(true)
    try {
      const r = await yibanApi.list(k, p, 24, c, ids)
      setItems(r.items ?? [])
      setTotal(r.total ?? 0)
      setPage(p)
    } catch { setItems([]); setTotal(0) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load(1, '全部', '') }, [load])

  const toggleFav = (id: number) => {
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev]
      try { localStorage.setItem('inkforge-yiban-favs', JSON.stringify(next)) } catch { /* ignore */ }
      // 若当前处于收藏筛选，取消收藏后应从列表移除
      if (favOnly && !next.includes(id)) setItems((its) => its.filter((m) => m.id !== id))
      return next
    })
  }

  const showFavs = () => {
    setFavOnly(true)
    setCat('全部')
    void load(1, '全部', appliedKw, favs.slice(0, 300).join(','))
  }
  const showAll = () => {
    setFavOnly(false)
    void load(1, cat, appliedKw)
  }

  const insert = (m: YibanItem) => {
    const idx = doc.blocks.findIndex((b) => b.id === selectedId)
    insertBlocks([{ id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4), type: 'html', data: { html: m.detail }, style: { marginTop: 8, marginBottom: 16 } } as Block], idx >= 0 ? idx + 1 : undefined)
    toast(`已插入「${m.desc?.slice(0, 12) || '样式'}」`)
  }

  const totalPages = Math.max(1, Math.ceil(total / 24))

  return (
    <div className="flex flex-col h-full">
      <div className="p-2.5 border-b border-ink-line space-y-2 shrink-0">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-text-3" />
            <input className="input pl-7" placeholder="搜索 16,000+ 样式（回车）…" value={kw}
              onChange={(e) => setKw(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setAppliedKw(kw.trim()); setFavOnly(false); void load(1, cat, kw.trim()) } }} />
          </div>
          <button className={`btn btn-sm px-2 shrink-0 ${favOnly ? 'btn-primary' : 'btn-soft'}`}
            title="收藏的样式" onClick={() => (favOnly ? showAll() : showFavs())}>
            <Star size={13} className={favOnly ? 'fill-current' : ''} />
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 -mb-1">
          {[{ name: '全部', count: cats.reduce((a, c) => a + c.count, 0) }, ...cats].map((c) => (
            <button key={c.name} onClick={() => { setCat(c.name); setFavOnly(false); void load(1, c.name, appliedKw) }}
              className={`chip whitespace-nowrap shrink-0 ${cat === c.name && !favOnly ? 'bg-[#2C6BED] text-white' : 'bg-black/[0.05] text-ink-text-3 hover:bg-black/[0.08]'}`}>
              {c.name}{c.count ? ` ${c.count}` : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5">
        {loading && <div className="py-6 flex justify-center"><Spinner /></div>}
        {!loading && !items.length && <Empty text={favOnly ? '还没有收藏样式，点击卡片右上角星标收藏' : '没有匹配的样式'} />}
        <div className="grid grid-cols-2 gap-1.5">
          {items.map((m) => (
            <div key={m.id} className="group/yb relative rounded-lg border border-ink-line overflow-hidden text-left hover:border-[#2C6BED] hover:bg-[#2C6BED]/[0.04] transition-colors">
              <button title={`${m.desc?.slice(0, 20) || '样式'} — 点击插入`} onClick={() => insert(m)} className="block w-full text-left">
                <div className="h-20 overflow-hidden relative bg-white pointer-events-none select-none">
                  <div className="origin-top-left" style={{ transform: 'scale(0.55)', width: '182%' }} dangerouslySetInnerHTML={{ __html: m.detail }} />
                </div>
                <div className="px-1.5 py-1 border-t border-ink-line flex items-center gap-1">
                  <span className="text-[10px] px-1 py-px rounded bg-black/[0.05] text-ink-text-3 shrink-0">{m.category}</span>
                  <span className="text-[11px] text-ink-text-2 truncate flex-1">{m.desc?.slice(0, 16) || '未命名样式'}</span>
                </div>
              </button>
              <button title={favs.includes(m.id) ? '取消收藏' : '收藏'}
                onClick={(e) => { e.stopPropagation(); toggleFav(m.id) }}
                className={`absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 border border-ink-line flex items-center justify-center shadow-sm transition-opacity ${favs.includes(m.id) ? 'opacity-100' : 'opacity-0 group-hover/yb:opacity-100'}`}>
                <Star size={11} className={favs.includes(m.id) ? 'text-[#E8A33D] fill-[#E8A33D]' : 'text-ink-text-3'} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="p-2 border-t border-ink-line shrink-0 space-y-1.5">
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2">
            <button className="btn btn-ghost btn-xs" disabled={page <= 1} onClick={() => void load(page - 1, cat, appliedKw, favOnly ? favs.slice(0, 300).join(',') : '')}>上一页</button>
            <span className="text-[11px] text-ink-text-3">{page} / {totalPages} 页 · 共 {total.toLocaleString()} 条</span>
            <button className="btn btn-ghost btn-xs" disabled={page >= totalPages} onClick={() => void load(page + 1, cat, appliedKw, favOnly ? favs.slice(0, 300).join(',') : '')}>下一页</button>
          </div>
        )}
        <div className="text-[10.5px] text-ink-text-3">
          样式来自壹伴样式中心抓取，插入为原生 HTML 块，导出时原样保留内联样式。含远程图片的样式需图片可访问。
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 素材库                                                               */
/* ------------------------------------------------------------------ */

function AssetsTab() {
  const [assetTab, setAssetTab] = useState<'builtin' | 'mine' | 'online-photo' | 'online-icon'>('builtin')
  const [kind, setKind] = useState('all')
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [illKw, setIllKw] = useState('')
  const [illCat, setIllCat] = useState('手绘符号')
  const doc = useDoc((s) => s.doc)
  const insertBlocks = useDoc((s) => s.insertBlocks)
  const selectedId = useUI((s) => s.selectedId)
  const fileRef = useRef<HTMLInputElement>(null)
  const tokens = useMemo(() => ({ ...getTheme(doc.themeId).tokens }), [doc.themeId])

  const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  const mkInsert = (block: Omit<Block, 'id'>) => {
    const idx = doc.blocks.findIndex((b) => b.id === selectedId)
    insertBlocks([{ id: newId(), ...block } as Block], idx >= 0 ? idx + 1 : undefined)
    toast('已插入')
  }

  const load = async () => {
    setLoading(true)
    try { setAssets((await assetsApi.list(kind)).assets ?? []) }
    catch { setAssets([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { if (assetTab === 'mine') void load() }, [kind, assetTab])

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    let ok = 0
    for (const f of Array.from(files)) {
      try { await assetsApi.upload(f); ok++ } catch { /* 跳过失败项 */ }
    }
    if (ok) toast(`已上传 ${ok} 个文件`, 'success')
    void load()
  }

  const insertImage = (a: AssetRecord) => {
    mkInsert({ type: 'image', data: { src: a.url, alt: a.name, naturalWidth: a.width ?? undefined }, style: { marginTop: 0, marginBottom: 16 } })
  }

  const insertIllustration = (svg: string) => {
    // 包一层固定尺寸的居中容器，避免插画被画布撑成大块空白
    const wrapped = `<section style="text-align:center;margin:6px 0;line-height:0"><span style="display:inline-block;width:64px;height:64px;line-height:0">${svg.replace(/<svg /, '<svg width="64" height="64" ')}</span></section>`
    mkInsert({ type: 'html', data: { html: wrapped }, style: { marginTop: 6, marginBottom: 6 } })
  }

  const list = illKw.trim() ? searchIllustrations(illKw) : (ILLUSTRATIONS_BY_CATEGORY.find((g) => g.category === illCat)?.items ?? [])

  return (
    <div className="flex flex-col h-full">
      <div className="px-2.5 pt-2 border-b border-ink-line shrink-0">
        <div className="flex gap-1 mb-2">
          {([['builtin', '插画'], ['mine', '我的'], ['online-photo', '在线图'], ['online-icon', '在线图标']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setAssetTab(v)}
              className={`flex-1 h-7 rounded text-[11.5px] ${assetTab === v ? 'bg-[#2C6BED] text-white' : 'bg-black/[0.05] text-ink-text-2'}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {assetTab === 'builtin' && (
          <div className="p-2.5 border-b border-ink-line">
            <div className="flex gap-1 overflow-x-auto pb-1 mb-1.5">
              {ILLUSTRATIONS_BY_CATEGORY.map((g) => (
                <button key={g.category} onClick={() => { setIllCat(g.category); setIllKw('') }}
                  className={`chip whitespace-nowrap ${illCat === g.category && !illKw ? 'bg-[#2C6BED] text-white' : 'bg-black/[0.05] text-ink-text-3'}`}>
                  {g.category}
                </button>
              ))}
            </div>
            <input className="input mb-1.5" placeholder="搜索插画…" value={illKw} onChange={(e) => setIllKw(e.target.value)} />
            <div className="grid grid-cols-4 gap-1.5">
              {list.map((il) => (
                <button key={il.id} title={`${il.name}${il.dynamic ? '（动效）' : ''} — 点击插入`}
                  onClick={() => insertIllustration(tintIllustration(il.svg, tokens.colorPrimary))}
                  className="group/il aspect-square rounded-lg border border-ink-line flex flex-col items-center justify-center p-1 hover:border-[#2C6BED] hover:bg-[#2C6BED]/[0.04] relative">
                  <div className="flex-1 w-full flex items-center justify-center text-ink-text" dangerouslySetInnerHTML={{ __html: tintIllustration(il.svg, tokens.colorPrimary) }} />
                  <div className="text-[9.5px] text-ink-text-3 truncate w-full text-center">{il.name}</div>
                  {il.dynamic && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[#2C6BED]" title="带 SMIL 动效" />}
                </button>
              ))}
            </div>
            <div className="text-[10.5px] text-ink-text-3 mt-1.5">点击插入，颜色自动跟随主题主色</div>
          </div>
        )}

        {assetTab === 'mine' && (
          <div className="p-2.5">
            <div className="flex gap-1.5 mb-2">
              <button className="btn btn-primary btn-sm flex-1" onClick={() => fileRef.current?.click()}>
                <Upload size={12} /> 上传素材
              </button>
              <button className="btn btn-soft btn-sm px-1.5" onClick={load} title="刷新"><RefreshCw size={12} /></button>
            </div>
            <input ref={fileRef} type="file" multiple accept="image/*,.svg,.json" className="hidden"
              onChange={(e) => { void upload(e.target.files); e.target.value = '' }} />
            <Select value={kind} onChange={setKind}
              options={[
                { value: 'all', label: '全部' }, { value: 'image', label: '图片' },
                { value: 'svg', label: 'SVG' }, { value: 'lottie', label: 'Lottie' }, { value: 'gif', label: 'GIF' },
              ]} />
            <div className="text-[11px] font-semibold text-ink-text-3 mt-2 mb-1.5">我的素材</div>
            {loading && <div className="py-6 flex justify-center"><Spinner /></div>}
            {!loading && !assets.length && <Empty text="还没有素材，点击上方上传" icon={<ImageIcon size={20} />} />}
            <div className="grid grid-cols-3 gap-1.5">
              {assets.map((a) => (
                <div key={a.id} className="group relative aspect-square rounded-lg border border-ink-line overflow-hidden bg-black/[0.02]">
                  {a.kind === 'image' || a.kind === 'gif'
                    ? <img src={a.url} alt={a.name} className="w-full h-full object-cover cursor-pointer" onClick={() => insertImage(a)} />
                    : <button className="w-full h-full flex flex-col items-center justify-center gap-1 text-ink-text-3"
                      onClick={() => insertImage(a)}>
                      <FileText size={16} /><span className="text-[10px]">{a.kind.toUpperCase()}</span>
                      </button>}
                  <button className="absolute top-1 right-1 w-5 h-5 rounded bg-black/55 text-white items-center justify-center hidden group-hover:flex"
                    onClick={async () => { await assetsApi.remove(a.id); void load(); toast('已删除') }}>
                    <Trash2 size={11} />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/55 text-white text-[9.5px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100">
                    {formatBytes(a.bytes)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {assetTab === 'online-photo' && (
          <OnlinePhotos onInsert={(url) => mkInsert({ type: 'image', data: { src: url, alt: '' }, style: { marginTop: 0, marginBottom: 16 } })} />
        )}
        {assetTab === 'online-icon' && (
          <OnlineIcons onInsert={(svg) => mkInsert({ type: 'svg', data: { svg, bytes: svg.length }, style: { marginTop: 8, marginBottom: 16 } })} tokens={tokens} />
        )}
      </div>
    </div>
  )
}

function OnlinePhotos({ onInsert }: { onInsert: (url: string) => void }) {
  const [q, setQ] = useState('风景')
  const [items, setItems] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'search' | 'random'>('search')
  const [provider, setProvider] = useState('')
  const [cat, setCat] = useState('风景')

  const CATS = ['美女', '风景', '动漫', '二次元', '萌宠', '游戏', '汽车', '建筑', '植物', '城市', '人物', '夜景', '静物']

  const search = async (p = 1) => {
    setLoading(true)
    try {
      const r = await onlineApi.photos(q || '风景', p, 24, 'auto')
      const its: any[] = r.items ?? []
      setProvider(r.provider ?? '')
      if (!its.length) {
        const rr = await onlineApi.randomPhotos(q || '风景', 12, cat)
        setItems(rr.items ?? [])
        setProvider(rr.provider ?? 'picsum')
        toast('关键词图库暂无结果，已切到分类随机图', 'info')
      } else {
        setItems(its)
      }
      setPage(p)
    } catch { setItems([]) } finally { setLoading(false) }
  }
  const random = async () => {
    setLoading(true)
    try { const r = await onlineApi.randomPhotos(cat, 12, cat); setItems(r.items ?? []); setProvider(r.provider ?? '') } catch { setItems([]) } finally { setLoading(false) }
  }
  useEffect(() => { void search(1) }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="p-2.5 border-b border-ink-line space-y-2 shrink-0">
        <div className="flex gap-1">
          {([['search', '关键词'], ['random', '随机图']] as const).map(([v, l]) => (
            <button key={v} onClick={() => { setMode(v); v === 'random' ? void random() : void search(1) }}
              className={`flex-1 h-7 rounded text-[11.5px] ${mode === v ? 'bg-[#2C6BED] text-white' : 'bg-black/[0.05] text-ink-text-2'}`}>{l}</button>
          ))}
        </div>
        {mode === 'random' && (
          <div className="flex gap-1 overflow-x-auto pb-1 -mb-1">
            {CATS.map((c) => (
              <button key={c} onClick={() => { setCat(c); void random() }}
                className={`chip whitespace-nowrap shrink-0 ${cat === c ? 'bg-[#2C6BED] text-white' : 'bg-black/[0.05] text-ink-text-3'}`}>{c}</button>
            ))}
          </div>
        )}
        {mode === 'search' && (
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-text-3" />
            <input className="input pl-7" placeholder="支持中文：风景、动物、城市…" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void search(1) }} />
          </div>
        )}
        <button className="btn btn-primary btn-sm w-full" onClick={() => mode === 'random' ? void random() : void search(1)}><Search size={12} /> 搜索</button>
      </div>
      <div className="flex-1 overflow-y-auto p-2.5">
        {loading && <div className="py-6 flex justify-center"><Spinner /></div>}
        {!loading && !items.length && <Empty text="没有找到图片" />}
        <div className="grid grid-cols-3 gap-1.5">
          {items.map((it) => (
            <button key={it.id} title="点击插入" onClick={() => onInsert(it.url)}
              className="group relative aspect-square rounded-lg border border-ink-line overflow-hidden bg-black/[0.02]">
              <img src={it.thumb} alt={it.title} loading="lazy" className="w-full h-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[9.5px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100">{it.source || ''}</span>
            </button>
          ))}
        </div>
        {items.length > 0 && !loading && mode === 'search' && (
          <div className="flex justify-center gap-2 mt-2">
            <button className="btn btn-ghost btn-xs" disabled={page <= 1} onClick={() => void search(page - 1)}>上一页</button>
            <span className="text-[11px] text-ink-text-3">第 {page} 页</span>
            <button className="btn btn-ghost btn-xs" onClick={() => void search(page + 1)}>下一页</button>
          </div>
        )}
      </div>
      <div className="p-2 border-t border-ink-line text-[10.5px] text-ink-text-3">
        来源：{provider || '多源聚合（Openverse 国际 + 每日壁纸 中文 + Picsum 兜底）'}。插入为远程链接，正式发布前建议在「我的」上传到微信素材库。
      </div>
    </div>
  )
}

function OnlineIcons({ onInsert, tokens }: { onInsert: (svg: string) => void; tokens: any }) {
  const [q, setQ] = useState('房子')
  const [icons, setIcons] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const QUICK = ['房子', '爱心', '星星', '火', '太阳', '月亮', '礼物', '购物', '用户', '搜索', '电话', '设置']
  const load = async () => {
    setLoading(true)
    try { const r = await onlineApi.icons(q || 'star', 60); setIcons(r.icons ?? []) } catch { setIcons([]) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const insert = async (name: string) => {
    try {
      const r = await onlineApi.iconSvg(name, tokens?.colorPrimary ?? '#2C6BED', 48)
      if (r.svg) onInsert(r.svg)
      else toast('该图标获取失败', 'error')
    } catch { toast('图标获取失败', 'error') }
  }
  return (
    <div className="flex flex-col h-full">
      <div className="p-2.5 border-b border-ink-line space-y-2 shrink-0">
        <div className="flex gap-1 overflow-x-auto pb-1 -mb-1">
          {QUICK.map((c) => (
            <button key={c} onClick={() => { setQ(c); void (async () => { setLoading(true); try { const r = await onlineApi.icons(c, 60); setIcons(r.icons ?? []) } catch { setIcons([]) }; setLoading(false) })() }}
              className={`chip whitespace-nowrap shrink-0 ${q === c ? 'bg-[#2C6BED] text-white' : 'bg-black/[0.05] text-ink-text-3'}`}>{c}</button>
          ))}
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-text-3" />
          <input className="input pl-7" placeholder="中文：房子 / 爱心 / 箭头…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void load() }} />
        </div>
        <button className="btn btn-primary btn-sm w-full" onClick={() => void load()}><Search size={12} /> 搜索</button>
      </div>
      <div className="flex-1 overflow-y-auto p-2.5">
        {loading && <div className="py-6 flex justify-center"><Spinner /></div>}
        {!loading && !icons.length && <Empty text="没有找到图标" />}
        <div className="grid grid-cols-5 gap-1.5">
          {icons.map((name) => (
            <button key={name} title={name} onClick={() => void insert(name)}
              className="aspect-square rounded-lg border border-ink-line flex items-center justify-center p-1.5 hover:border-[#2C6BED] hover:bg-[#2C6BED]/[0.04] text-[#2C6BED]">
              <img src={`https://api.iconify.design/${name}.svg?color=${encodeURIComponent(tokens?.colorPrimary ?? '#2C6BED')}`}
                alt={name} className="w-full h-full object-contain" />
            </button>
          ))}
        </div>
      </div>
      <div className="p-2 border-t border-ink-line text-[10.5px] text-ink-text-3">
        来源：Iconify（全球图标集，免 key）。点击插入为 SVG 块，颜色跟随主题主色。
      </div>
    </div>
  )
}

const formatBytes = (n: number) => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`

/* ------------------------------------------------------------------ */
/* 大纲                                                                 */
/* ------------------------------------------------------------------ */

function OutlineTab() {
  const doc = useDoc((s) => s.doc)
  const select = useUI((s) => s.select)
  const selectedId = useUI((s) => s.selectedId)
  const removeBlock = useDoc((s) => s.removeBlock)
  const moveBlockBy = useDoc((s) => s.moveBlockBy)
  const moveBlock = useDoc((s) => s.moveBlock)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const onDrop = (targetId: string) => {
    if (dragId && dragId !== targetId) moveBlock(dragId, doc.blocks.findIndex((b) => b.id === targetId))
    setDragId(null)
    setOverId(null)
  }

  return (
    <div className="flex-1 overflow-y-auto p-2">
      <div className="text-[10.5px] text-ink-text-3 px-1 pb-1.5">拖动手柄可排序 · 点击定位到区块</div>
      {doc.blocks.map((b, i) => (
        <div key={b.id}
          draggable
          onDragStart={() => setDragId(b.id)}
          onDragOver={(e) => { e.preventDefault(); setOverId(b.id) }}
          onDrop={() => onDrop(b.id)}
          onDragEnd={() => { setDragId(null); setOverId(null) }}
          className={`group flex items-center gap-1.5 px-1.5 py-1.5 rounded cursor-pointer ${
            dragId === b.id ? 'opacity-40' : ''
          } ${overId === b.id && dragId !== b.id ? 'ring-1 ring-[#2C6BED]' : ''} ${
            selectedId === b.id ? 'bg-[#2C6BED]/10 text-[#2C6BED]' : 'hover:bg-black/[0.04]'}`}
          onClick={() => select(b.id)}>
          <GripVertical size={12} className="text-ink-text-3 shrink-0 cursor-grab opacity-0 group-hover:opacity-100" />
          <span className="w-5 h-5 shrink-0 rounded-full bg-black/[0.06] text-[10px] font-semibold flex items-center justify-center text-ink-text-2 tabular-nums">{i + 1}</span>
          <span className="text-[12px] truncate flex-1">{outlineLabel(b)}</span>
          <button className="btn btn-ghost btn-xs px-0.5 hidden group-hover:flex" title="上移" onClick={(e) => { e.stopPropagation(); moveBlockBy(b.id, -1) }}>↑</button>
          <button className="btn btn-ghost btn-xs px-0.5 hidden group-hover:flex" title="下移" onClick={(e) => { e.stopPropagation(); moveBlockBy(b.id, 1) }}>↓</button>
          <button className="btn btn-ghost btn-xs px-0.5 hidden group-hover:flex" title="删除" onClick={(e) => { e.stopPropagation(); removeBlock(b.id) }}>
            <Trash2 size={11} />
          </button>
        </div>
      ))}
      {!doc.blocks.length && <Empty text="还没有内容" />}
    </div>
  )
}

function outlineLabel(b: Block): string {
  const plain = (s: string) => (s ?? '').replace(/<[^>]+>/g, '').trim()
  switch (b.type) {
    case 'heading': return `▸ ${plain((b.data as any).html)}`
    case 'paragraph': return plain((b.data as any).html).slice(0, 24)
    case 'quote': return `❝ ${plain((b.data as any).html).slice(0, 20)}`
    case 'list': return '• 列表'
    case 'image': return '🖼 图片'
    case 'gallery': return `🖼 图组（${(b.data as any).images?.length ?? 0}）`
    case 'code': return `⌨ ${(b.data as any).lang ?? 'code'}`
    case 'table': return `▦ 表格 ${(b.data as any).rows?.length ?? 0} 行`
    case 'divider': return '— 分割线'
    case 'card': return `▤ ${plain((b.data as any).title).slice(0, 18) || '卡片'}`
    case 'callout': return `💡 ${plain((b.data as any).title).slice(0, 16) || '提示'}`
    case 'timeline': return `⌚ 时间轴（${(b.data as any).items?.length ?? 0}）`
    case 'steps': return `① 步骤（${(b.data as any).items?.length ?? 0}）`
    case 'accordion': return `▾ 折叠（${(b.data as any).items?.length ?? 0}）`
    case 'button': return `⬢ ${plain((b.data as any).text) || '按钮'}`
    case 'svg': return '✎ SVG'
    case 'lottie': return `▶ Lottie ${(b.data as any).mode?.toUpperCase() ?? ''}`
    case 'video': return '🎬 视频'
    case 'audio': return '🎵 音频'
    case 'qrcode': return '▣ 二维码'
    case 'interactive': return `✨ ${(b.data as any).kind}`
    case 'columns': return `▥ 分栏（${(b.data as any).columns?.length ?? 0}）`
    case 'html': return '</> 自定义 HTML'
    default: return b.type
  }
}

/* ------------------------------------------------------------------ */
/* 复用（片段 / 模板 / 我的文章）                                         */
/* ------------------------------------------------------------------ */

function LibraryTab() {
  const [tab, setTab] = useState<'snippets' | 'templates' | 'docs'>('snippets')
  const [snippets, setSnippets] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const doc = useDoc((s) => s.doc)
  const load = useDoc((s) => s.load)
  const insertBlocks = useDoc((s) => s.insertBlocks)
  const replaceBlocks = useDoc((s) => s.replaceBlocks)
  const selectedId = useUI((s) => s.selectedId)

  const refresh = async () => {
    setLoading(true)
    try {
      const [s, t, d] = await Promise.all([libraryApi.snippets(), libraryApi.templates(), docsApiList()])
      setSnippets(s.snippets ?? [])
      setTemplates(t.templates ?? [])
      setDocs(d.docs ?? [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])

  const insertHtml = async (html: string) => {
    const idx = doc.blocks.findIndex((b) => b.id === selectedId)
    const res = await convertApi.html2blocks(html)
    insertBlocks(res.blocks ?? [], idx >= 0 ? idx + 1 : undefined)
    toast('已插入')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-ink-line shrink-0">
        <Segmented3 value={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-2.5">
        {loading && <div className="py-6 flex justify-center"><Spinner /></div>}

        {!loading && tab === 'snippets' && (
          <>
            <button className="btn btn-soft btn-sm w-full mb-2" onClick={async () => {
              const sel = window.getSelection?.()?.toString()
              if (!sel) { toast('请先在画布中选中文本', 'error'); return }
              const name = window.prompt('片段名称', '我的片段')
              if (!name) return
              await libraryApi.addSnippet(name, sel)
              void refresh()
              toast('已保存片段', 'success')
            }}><Scissors size={12} /> 把选中内容存为片段</button>
            {!snippets.length && <Empty text="还没有片段" />}
            {snippets.map((s) => (
              <div key={s.id} className="panel p-2 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-medium flex-1 truncate">{s.name}</span>
                  <button className="btn btn-ghost btn-xs" onClick={() => insertHtml(s.html)} title="插入"><Plus size={12} /></button>
                  <button className="btn btn-ghost btn-xs" onClick={async () => { await libraryApi.delSnippet(s.id); void refresh() }}><Trash2 size={12} /></button>
                </div>
                {s.variables && <div className="text-[10.5px] text-ink-text-3 mt-0.5">变量：{s.variables}</div>}
              </div>
            ))}
          </>
        )}

        {!loading && tab === 'templates' && (
          <>
            <div className="text-[11px] font-semibold text-ink-text-3 mb-1.5">内置模板（点击直接套用）</div>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {BUILTIN_TEMPLATES.map((t) => (
                <button key={t.id} onClick={() => {
                  useDoc.getState().setTheme(t.themeId)
                  replaceBlocks(t.blocks.map(cloneBlock))
                  toast(`已套用「${t.name}」`, 'success')
                }} className="text-left rounded-lg border border-ink-line p-2 hover:border-[#2C6BED] hover:bg-[#2C6BED]/[0.04] transition-colors">
                  <div className="text-[12.5px] font-medium text-ink-text">{t.name}</div>
                  <div className="text-[10.5px] text-ink-text-3 mt-0.5">{t.group}</div>
                </button>
              ))}
            </div>

            <button className="btn btn-soft btn-sm w-full mb-2" onClick={async () => {
              const name = window.prompt('模板名称', `${doc.title} 模板`)
              if (!name) return
              await libraryApi.addTemplate(name, '自定义', doc.themeId, doc.blocks)
              void refresh()
              toast('已保存模板', 'success')
            }}><Package size={12} /> 把当前文章存为模板</button>
            {!templates.length && <Empty text="还没有我的模板" />}
            {templates.map((t) => (
              <div key={t.id} className="panel p-2 mb-1.5 flex items-center gap-1.5">
                <span className="text-[12.5px] font-medium flex-1 truncate">{t.name}</span>
                <span className="chip bg-black/[0.05] text-ink-text-3">{t.grp}</span>
                <button className="btn btn-ghost btn-xs" title="套用到当前文章" onClick={async () => {
                  const full = await libraryApi.getTemplate(t.id)
                  replaceBlocks(full.template.blocks.map(cloneBlock))
                  toast('已套用模板', 'success')
                }}><Copy size={12} /></button>
                <button className="btn btn-ghost btn-xs" onClick={async () => { await libraryApi.delTemplate(t.id); void refresh() }}><Trash2 size={12} /></button>
              </div>
            ))}
          </>
        )}

        {!loading && tab === 'docs' && (
          <>
            {!docs.length && <Empty text="还没有保存的文章" />}
            {docs.map((d) => (
              <div key={d.id} className="panel p-2 mb-1.5 flex items-center gap-1.5">
                <span className="text-[12.5px] font-medium flex-1 truncate">{d.title || '未命名'}</span>
                <span className="text-[10.5px] text-ink-text-3">{new Date(d.updatedAt).toLocaleDateString()}</span>
                <button className="btn btn-ghost btn-xs" onClick={async () => {
                  await useDoc.getState().loadFromServer(d.id)
                  toast('已打开', 'success')
                }}><Download size={12} /></button>
              </div>
            ))}
          </>
        )}
      </div>
      <div className="p-2 border-t border-ink-line shrink-0">
        <button className="btn btn-ghost btn-sm w-full" onClick={refresh}><RefreshCw size={12} /> 刷新</button>
      </div>
    </div>
  )
}

function Segmented3({ value, onChange }: { value: string; onChange: (v: any) => void }) {
  const opts = [
    { v: 'snippets', l: '片段' }, { v: 'templates', l: '模板' }, { v: 'docs', l: '文章' },
  ]
  return (
    <div className="inline-flex bg-black/[0.04] rounded-md p-0.5 gap-0.5 w-full">
      {opts.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={`flex-1 h-6 rounded text-[12px] transition-colors ${
            value === o.v ? 'bg-white text-ink-text shadow-sm font-medium' : 'text-ink-text-3'}`}>
          {o.l}
        </button>
      ))}
    </div>
  )
}

/* 小工具：避免循环 import */
import { docsApi } from '../lib/api.js'
const docsApiList = () => docsApi.list()
