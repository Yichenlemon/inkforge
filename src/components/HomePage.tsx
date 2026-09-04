import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Plus, FileText, Clock, Trash2, History, RefreshCw, Loader2, FilePlus2,
  LayoutTemplate, Sparkles, Search, ArrowRight, Filter,
  Newspaper, Feather, GraduationCap, Gift, Users, Star, ListChecks, BookOpen,
  Wand2, Hash, Link2, Settings2, ChevronRight, Zap, TrendingUp, Calendar,
  FileCode2, Eye, Edit3, ChevronDown,
} from 'lucide-react'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { BrandLogo } from './BrandLogo.jsx'
import { docsApi } from '../lib/api.js'
import { DOC_TEMPLATES, type DocTemplate } from '../lib/docTemplates.js'
import { toast } from '../lib/ui.js'

/* ------------------------------------------------------------------ */
/* 数据类型                                                            */
/* ------------------------------------------------------------------ */
interface DocCard {
  id: string
  title: string
  themeId: string
  meta: any
  createdAt: number
  updatedAt: number
  lastOpenedAt?: number
  blockCount: number
  wordCount: number
}

/** 主题对应的卡片封面渐变 */
const THEME_COVER: Record<string, string> = {
  clean: 'linear-gradient(135deg,#f5f7fa 0%,#c3cfe2 100%)',
  tech:  'linear-gradient(135deg,#43cea2 0%,#185a9d 100%)',
  warm:  'linear-gradient(135deg,#FFB199 0%,#FFDEE9 100%)',
  news:  'linear-gradient(135deg,#FF9966 0%,#FF5E62 100%)',
}

/** 主题色 → accent */
const THEME_ACCENT: Record<string, string> = {
  clean: '#5C7CFA', tech: '#1A73E8', warm: '#E07A5F', news: '#FF5E62',
}

const ICONS: Record<string, any> = {
  FilePlus2, Newspaper, Feather, GraduationCap, Gift, Users, Star, ListChecks, BookOpen,
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtRelative(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day} 天前`
  if (day < 30) return `${Math.floor(day / 7)} 周前`
  if (day < 365) return `${Math.floor(day / 30)} 个月前`
  return `${Math.floor(day / 365)} 年前`
}

function fmtCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/** 文档标题的"封面首字母"用主题色大写 */
function titleAvatar(title: string, themeId: string): string {
  const s = (title || '未命名').trim()
  // 优先取首个中文字符,否则首个英文
  const ch = s.match(/[\u4e00-\u9fa5]/)
  if (ch) return ch[0]
  const en = s.match(/[A-Za-z]/)
  return (en ? en[0] : s[0] || '墨').toUpperCase()
}

/* ------------------------------------------------------------------ */
/* 主组件                                                              */
/* ------------------------------------------------------------------ */
export function HomePage() {
  const [docs, setDocs] = useState<DocCard[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [tplCat, setTplCat] = useState<DocTemplate['category'] | '全部'>('全部')
  // 最近文档分页状态：每页 12 个，Load More 加载下一页
  const [visibleCount, setVisibleCount] = useState(12)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await docsApi.list()
      setDocs((res.docs ?? []).map((d: any) => ({
        ...d, meta: (() => { try { return d.meta ? JSON.parse(d.meta) : {} } catch { return {} } })(),
      })))
    } catch (e: any) {
      toast(e?.message ?? '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadList() }, [loadList])
  // 列表重新加载 / 搜索时把分页重置回第一页
  useEffect(() => { setVisibleCount(12) }, [docs, query])

  const newFromTemplate = async (tpl: DocTemplate) => {
    setBusyId('__new')
    try {
      const title = tpl.id === 'blank' ? '未命名文档' : `${tpl.name} · 示例`
      useDoc.getState().newDoc(tpl.themeId, {
        title,
        initBlocks: tpl.initBlocks(title),
      })
      await useDoc.getState().save()
      const id = useDoc.getState().doc.id
      useUI.getState().setCurrentDocId(id)
      useUI.getState().setPage('editor')
      toast(`已新建「${title}」`, 'success')
    } catch (e: any) {
      toast(e?.message ?? '新建失败', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const openDoc = async (id: string) => {
    setBusyId(id)
    try {
      await useDoc.getState().loadFromServer(id)
      useUI.getState().setCurrentDocId(id)
      useUI.getState().setPage('editor')
    } catch (e: any) {
      toast(e?.message ?? '打开失败', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const removeDoc = async (id: string, title: string) => {
    if (!confirm(`确定删除「${title || '未命名文档'}」？此操作不可恢复。`)) return
    setBusyId(id)
    try {
      await docsApi.remove(id)
      await loadList()
      toast('已删除', 'success')
    } catch (e: any) {
      toast(e?.message ?? '删除失败', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const dupDoc = async (id: string) => {
    setBusyId(id)
    try {
      const res = await docsApi.get(id)
      const src = res.doc
      const newId = `d_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      await docsApi.save({ ...src, id: newId, title: `${src.title} 副本` })
      await loadList()
      toast('已复制为副本', 'success')
    } catch (e: any) {
      toast(e?.message ?? '复制失败', 'error')
    } finally {
      setBusyId(null)
    }
  }

  /* ------- 派生数据 ------- */
  const filtered = useMemo(
    () => docs.filter((d) => d.title.toLowerCase().includes(query.toLowerCase())),
    [docs, query],
  )
  // 搜索时重置可见数；搜索框为空时，按 visibleCount 截断渲染
  const visibleDocs = useMemo(
    () => (query.trim() ? filtered : filtered.slice(0, visibleCount)),
    [filtered, visibleCount, query],
  )

  const stats = useMemo(() => {
    const totalWords = docs.reduce((s, d) => s + (d.wordCount || 0), 0)
    const totalBlocks = docs.reduce((s, d) => s + (d.blockCount || 0), 0)
    // 「最近活动」= 最近编辑 + 最近打开中的最大值
    const last = docs[0]?.lastOpenedAt
      ?? docs[0]?.updatedAt
      ?? null
    const days = last ? Math.floor((Date.now() - last) / 86400000) : null
    const themes = new Set(docs.map((d) => d.themeId)).size
    return { totalWords, totalBlocks, last, days, themes }
  }, [docs])

  const tplCategories: Array<DocTemplate['category'] | '全部'> = useMemo(
    () => ['全部', ...Array.from(new Set(DOC_TEMPLATES.map((t) => t.category)))],
    [],
  )
  const tplFiltered = useMemo(
    () => tplCat === '全部' ? DOC_TEMPLATES : DOC_TEMPLATES.filter((t) => t.category === tplCat),
    [tplCat],
  )

  return (
    <div className="h-full flex flex-col bg-[#F5F7FB] text-ink-text overflow-hidden">
      {/* ============ Header ============ */}
      <header className="h-14 shrink-0 bg-white/90 backdrop-blur border-b border-ink-line flex items-center gap-3 px-6 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <BrandLogo size={32} />
        </div>

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-1 mr-1">
          <span className="chip bg-[#2C6BED]/10 text-[#2C6BED]">v0.3</span>
          <span className="chip bg-black/[0.05] text-ink-text-3">⌘K 命令面板</span>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-text-3 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文档…"
            className="h-9 w-64 pl-9 pr-3 rounded-lg bg-black/[0.04] outline-none text-[13px] focus:bg-white focus:ring-2 focus:ring-[#2C6BED]/30 transition-all"
          />
        </div>
        <button className="btn btn-ghost btn-sm px-1.5" onClick={() => void loadList()} title="刷新">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => newFromTemplate(DOC_TEMPLATES[0])}>
          <FilePlus2 size={14} /> 新建文档
        </button>
      </header>

      {/* ============ Main ============ */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1240px] mx-auto px-6 py-7 space-y-9">

          {/* ============ Hero Banner ============ */}
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F1B3D] via-[#2C6BED] to-[#6E8EFB] text-white p-7 lg:p-9 shadow-xl">
            <div className="absolute inset-0 pointer-events-none opacity-20">
              <div className="absolute top-4 right-12 w-44 h-44 rounded-full bg-white blur-3xl" />
              <div className="absolute bottom-4 right-40 w-32 h-32 rounded-full bg-[#A777E3] blur-3xl" />
              <div className="absolute -top-8 left-1/3 w-64 h-64 rounded-full bg-[#43cea2] blur-3xl opacity-40" />
            </div>

            <div className="relative grid lg:grid-cols-[1.4fr_1fr] gap-6 items-center">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-[11px] backdrop-blur mb-3">
                  <Sparkles size={11} /> 欢迎回来 · 今天也来写一篇
                </div>
                <h1 className="text-[28px] lg:text-[34px] font-bold leading-tight tracking-tight">
                  让排版不再是<br />
                  <span className="bg-gradient-to-r from-[#FFE082] via-[#FFDEE9] to-[#FFD180] bg-clip-text text-transparent">
                    灵感的拦路虎
                  </span>
                </h1>
                <p className="text-[13.5px] text-white/85 mt-3 max-w-md">
                  SMIL 互动、SVG 海报、模板封面、AI 排版质检、Markdown 一键互换 —— 写一篇值得反复读的公众号文章。
                </p>

                <div className="flex flex-wrap gap-2 mt-5">
                  <button className="btn btn-sm bg-white text-[#2C6BED] hover:bg-white/90 border-0 shadow"
                    onClick={() => newFromTemplate(DOC_TEMPLATES[0])}>
                    <FilePlus2 size={14} /> 空白开始
                  </button>
                  <button className="btn btn-sm bg-white/15 text-white hover:bg-white/25 border-0 backdrop-blur"
                    onClick={() => useUI.getState().openModal('markdown')}>
                    <Hash size={14} /> Markdown 导入
                  </button>
                  <button className="btn btn-sm bg-white/15 text-white hover:bg-white/25 border-0 backdrop-blur"
                    onClick={() => useUI.getState().openModal('import')}>
                    <FileCode2 size={14} /> 导入 / 转换
                  </button>
                  <button className="btn btn-sm bg-white/15 text-white hover:bg-white/25 border-0 backdrop-blur"
                    onClick={() => { useUI.getState().setPage('editor'); useUI.getState().openModal('command') }}>
                    <Wand2 size={14} /> 命令面板 <span className="chip bg-black/20 text-white/80 ml-1">⌘K</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <StatCard icon={<FileText size={16} />} label="文档" value={fmtCount(docs.length)} sub="总篇数" />
                <StatCard icon={<Edit3 size={16} />} label="累计" value={fmtCount(stats.totalWords)} sub="中英字数" />
                <StatCard icon={<Layers size={16} />} label="模板" value={fmtCount(DOC_TEMPLATES.length)} sub="立即可用" />
                <StatCard icon={<TrendingUp size={16} />} label="主题" value={fmtCount(stats.themes)} sub="已使用" />
                <StatCard icon={<Clock size={16} />} label="上次" value={stats.days === null ? '—' : stats.days < 1 ? '今天' : `${stats.days}天前`} sub="最近编辑" />
                <StatCard icon={<Zap size={16} />} label="区块" value={fmtCount(stats.totalBlocks)} sub="合计" />
              </div>
            </div>
          </section>

          {/* ============ 最近文档 ============ */}
          <section>
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="text-[17px] font-bold flex items-center gap-2">
                  <FileText size={17} className="text-[#2C6BED]" /> 最近文档
                  {/* badge 显示实际查到的总数（与渲染数对应） */}
                  <span className="chip bg-black/[0.05] text-ink-text-3">{filtered.length}</span>
                </h2>
                <p className="text-[12px] text-ink-text-3 mt-1">
                  按「最近活动」倒序：最后打开 / 最后编辑，越靠上越新。每 12 篇一页，可展开全部。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-soft btn-sm" onClick={() => useUI.getState().openModal('command')}>
                  <Search size={13} /> 快速跳转 <span className="chip bg-black/[0.06] text-ink-text-3 ml-0.5">⌘K</span>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => <DocCardSkeleton key={i} />)}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyDocs
                hasAny={docs.length > 0}
                onCreate={() => newFromTemplate(DOC_TEMPLATES[0])}
                onClear={() => setQuery('')}
              />
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {visibleDocs.map((d) => (
                    <DocCardEl key={d.id} doc={d} onOpen={() => openDoc(d.id)}
                      onDelete={() => removeDoc(d.id, d.title)}
                      onDup={() => dupDoc(d.id)}
                      onHistory={() => { useUI.getState().setCurrentDocId(d.id); useUI.getState().openModal('history') }} />
                  ))}
                </div>
                {/* 翻页器：每页 12，超过则展开下一组；总数显示当前位置 */}
                {filtered.length > visibleCount && (
                  <div className="mt-5 flex items-center justify-center gap-3">
                    <button className="btn btn-soft btn-sm"
                      onClick={() => setVisibleCount((n) => n + 12)}
                      aria-label="加载更多">
                      <ChevronDown size={14} /> 加载更多
                      <span className="chip bg-black/[0.05] text-ink-text-3 ml-1">
                        还剩 {filtered.length - visibleCount} 篇
                      </span>
                    </button>
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => setVisibleCount(filtered.length)}
                      aria-label="展开全部">
                      展开全部 ({filtered.length})
                    </button>
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => setVisibleCount(12)}
                      aria-label="收起">
                      收起
                    </button>
                  </div>
                )}
                <div className="mt-2 text-center text-[11.5px] text-ink-text-3">
                  正在显示 {visibleDocs.length} / {filtered.length} 篇
                </div>
              </>
            )}
          </section>

          {/* ============ 模板库 ============ */}
          <section>
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="text-[17px] font-bold flex items-center gap-2">
                  <LayoutTemplate size={17} className="text-[#2C6BED]" /> 模板库
                  <span className="chip bg-black/[0.05] text-ink-text-3">{DOC_TEMPLATES.length}</span>
                </h2>
                <p className="text-[12px] text-ink-text-3 mt-1">每个模板都自带封面 + 章节骨架 + 引导关注,选一个就开始。</p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <Filter size={13} className="text-ink-text-3 mr-0.5" />
                {tplCategories.map((c) => (
                  <button key={c}
                    onClick={() => setTplCat(c)}
                    className={`text-[12px] px-2.5 h-7 rounded-full transition-colors ${
                      tplCat === c ? 'bg-[#2C6BED] text-white shadow' : 'bg-white border border-ink-line text-ink-text-2 hover:border-[#2C6BED]/40'
                    }`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {tplFiltered.map((tpl) => (
                <TemplateCard key={tpl.id} tpl={tpl} onUse={() => newFromTemplate(tpl)} busy={busyId === '__new'} />
              ))}
            </div>
          </section>

          {/* ============ 快捷入口 ============ */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <QuickAction
              gradient="linear-gradient(135deg,#FFE082,#FF9A9E)"
              icon={<Hash size={18} />} title="Markdown 模式"
              desc="粘贴 MD 直接转可编辑区块,或导出当前文章为 MD"
              onClick={() => useUI.getState().openModal('markdown')}
            />
            <QuickAction
              gradient="linear-gradient(135deg,#A8E6CF,#88D8C0)"
              icon={<FileCode2 size={18} />} title="从 HTML / Word 导入"
              desc="把已有内容转成可继续编辑的区块,而不是糊一团 HTML"
              onClick={() => useUI.getState().openModal('import')}
            />
            <QuickAction
              gradient="linear-gradient(135deg,#B5C7FF,#759BFA)"
              icon={<Wand2 size={18} />} title="排版质检 / 动效 / Lottie"
              desc="一键看诊断、插动效、加 Lottie 动画"
              onClick={() => useUI.getState().openModal('tools')}
            />
          </section>

          {/* ============ Footer ============ */}
          <footer className="text-[11.5px] text-ink-text-3 flex items-center justify-between pt-2 pb-4 border-t border-ink-line">
            <div className="flex items-center gap-3">
              <span>© InkForge 墨痕</span>
              <span>·</span>
              <span>所有数据本地保存,无需登录</span>
              <span>·</span>
              <span>支持 Markdown / HTML / Word 互转</span>
            </div>
            <div className="flex items-center gap-3">
              <a className="hover:text-[#2C6BED] cursor-pointer flex items-center gap-1">
                <Link2 size={11} /> 复制公众号迁移链接
              </a>
              <span>·</span>
              <a className="hover:text-[#2C6BED] cursor-pointer flex items-center gap-1">
                <Settings2 size={11} /> 设置
              </a>
            </div>
          </footer>
        </div>
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 子组件                                                              */
/* ------------------------------------------------------------------ */
function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="relative bg-white/12 backdrop-blur rounded-xl p-3 border border-white/15">
      <div className="flex items-center gap-1.5 text-[11px] text-white/75">
        {icon}<span>{label}</span>
      </div>
      <div className="text-[22px] font-bold leading-tight mt-1">{value}</div>
      <div className="text-[10.5px] text-white/60 mt-0.5">{sub}</div>
    </div>
  )
}

function Layers({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.82l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22 12.18-9.17 4.16a2 2 0 0 1-1.66 0L2 12.18" opacity=".6" />
      <path d="m22 17.18-9.17 4.16a2 2 0 0 1-1.66 0L2 17.18" opacity=".3" />
    </svg>
  )
}

function DocCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-ink-line overflow-hidden">
      <div className="aspect-[16/10] bg-gradient-to-br from-black/[0.04] to-black/[0.08] animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-black/[0.06] rounded animate-pulse" />
        <div className="h-2.5 w-2/3 bg-black/[0.05] rounded animate-pulse" />
      </div>
    </div>
  )
}

function EmptyDocs({ hasAny, onCreate, onClear }: { hasAny: boolean; onCreate: () => void; onClear: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-ink-line py-16 text-center">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#f4f7ff] to-[#e0e9ff] flex items-center justify-center text-[#2C6BED] mb-4">
        <FileText size={28} />
      </div>
      <div className="text-[15px] font-semibold">{hasAny ? '没有匹配的文档' : '还没有任何文档'}</div>
      <div className="text-[12.5px] text-ink-text-3 mt-1">
        {hasAny ? '换个关键词试试,或者清空搜索' : '从模板开始,几分钟就能写一篇像样的公众号文章'}
      </div>
      <div className="mt-5 flex items-center justify-center gap-2">
        {hasAny
          ? <button className="btn btn-soft btn-sm" onClick={onClear}>清空搜索</button>
          : <button className="btn btn-primary btn-sm" onClick={onCreate}><Plus size={14} /> 创建第一篇</button>}
      </div>
    </div>
  )
}

function DocCardEl({ doc, onOpen, onDelete, onDup, onHistory }:
  { doc: DocCard; onOpen: () => void; onDelete: () => void; onDup: () => void; onHistory: () => void }) {
  const cover = THEME_COVER[doc.themeId] || THEME_COVER.clean
  const accent = THEME_ACCENT[doc.themeId] || THEME_ACCENT.clean
  const initial = titleAvatar(doc.title, doc.themeId)
  const isNew = (Date.now() - doc.updatedAt) < 86400000

  return (
    <div className="group relative bg-white rounded-xl border border-ink-line overflow-hidden cursor-pointer transition-all hover:shadow-xl hover:border-[#2C6BED]/40 hover:-translate-y-0.5"
      onClick={onOpen}>
      {/* 封面 */}
      <div className="relative aspect-[16/10] overflow-hidden">
        <div className="absolute inset-0" style={{ background: cover }} />
        {/* 半透明蒙板 + 大字首字母/标题 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
        <div className="absolute left-3 top-3 right-3 flex items-center justify-between">
          <span className="chip bg-white/85 text-[10.5px] backdrop-blur" style={{ color: accent, fontWeight: 600 }}>
            {doc.themeId}
          </span>
          {isNew && <span className="chip bg-[#FF5E62] text-white text-[10px]">NEW</span>}
        </div>
        <div className="absolute left-3 bottom-3 right-3 text-white">
          <div className="text-[18px] font-bold leading-tight drop-shadow line-clamp-2">{doc.title || '未命名文档'}</div>
        </div>
        {/* 角落大首字母 */}
        <div className="absolute -right-3 -bottom-4 text-white/[0.18] text-[80px] font-black leading-none tracking-tighter select-none">
          {initial}
        </div>
      </div>

      {/* meta */}
      <div className="px-3 py-2.5 flex items-center gap-2 text-[11.5px] text-ink-text-3">
        <Clock size={11} />
        <span>{fmtRelative(doc.updatedAt)}</span>
        <span>·</span>
        <span>{doc.blockCount || 0} 区块</span>
        <span>·</span>
        <span>{fmtCount(doc.wordCount || 0)} 字</span>
      </div>

      {/* hover 操作条 */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}>
        <button className="w-7 h-7 rounded-md bg-white/95 hover:bg-white shadow flex items-center justify-center text-ink-text-2 hover:text-[#2C6BED]" title="编辑" onClick={onOpen}>
          <Edit3 size={13} />
        </button>
        <button className="w-7 h-7 rounded-md bg-white/95 hover:bg-white shadow flex items-center justify-center text-ink-text-2 hover:text-[#2C6BED]" title="历史" onClick={onHistory}>
          <History size={13} />
        </button>
        <button className="w-7 h-7 rounded-md bg-white/95 hover:bg-white shadow flex items-center justify-center text-ink-text-2 hover:text-[#2C6BED]" title="复制副本" onClick={onDup}>
          <FileText size={13} />
        </button>
        <button className="w-7 h-7 rounded-md bg-white/95 hover:bg-white shadow flex items-center justify-center text-ink-text-3 hover:text-[#D64545]" title="删除" onClick={onDelete}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function TemplateCard({ tpl, onUse, busy }: { tpl: DocTemplate; onUse: () => void; busy: boolean }) {
  const Icon = ICONS[tpl.icon] || FilePlus2
  return (
    <div className="group relative bg-white rounded-xl border border-ink-line overflow-hidden cursor-pointer transition-all hover:shadow-xl hover:-translate-y-0.5 hover:border-[#2C6BED]/40"
      onClick={onUse}>
      <div className="relative aspect-[4/3] overflow-hidden">
        <div className="absolute inset-0 transition-transform group-hover:scale-105" style={{ background: tpl.coverGradient }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        <div className="absolute left-3 top-3">
          <span className="chip bg-white/90 text-ink-text-2 text-[10.5px] backdrop-blur">{tpl.category}</span>
        </div>
        <div className="absolute right-3 bottom-3 text-white/95">
          <Icon size={26} strokeWidth={2.4} />
        </div>
        <div className="absolute left-3 bottom-3 right-12">
          <div className="text-white text-[14px] font-semibold leading-tight drop-shadow truncate">{tpl.name}</div>
        </div>
      </div>
      <div className="px-3 py-2.5">
        <div className="text-[12px] text-ink-text-3 line-clamp-2 leading-relaxed min-h-[34px]">{tpl.desc}</div>
        <div className="flex items-center justify-between mt-2">
          <span className="chip bg-black/[0.04] text-ink-text-3 text-[10.5px]">{tpl.themeId}</span>
          <span className="text-[11px] text-[#2C6BED] font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            {busy ? <><Loader2 size={11} className="animate-spin" /> 创建中</> : <>立即使用 <ArrowRight size={11} /></>}
          </span>
        </div>
      </div>
    </div>
  )
}

function QuickAction({ gradient, icon, title, desc, onClick }:
  { gradient: string; icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="group text-left bg-white rounded-xl border border-ink-line p-4 hover:shadow-lg hover:border-transparent hover:-translate-y-0.5 transition-all">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white shadow" style={{ background: gradient }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-[13.5px] font-semibold">
            {title}
            <ChevronRight size={13} className="text-ink-text-3 group-hover:text-[#2C6BED] group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="text-[11.5px] text-ink-text-3 mt-0.5 leading-relaxed line-clamp-2">{desc}</div>
        </div>
      </div>
    </button>
  )
}