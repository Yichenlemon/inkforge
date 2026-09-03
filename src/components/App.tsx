import React, { useEffect, useState } from 'react'
import {
  PanelLeft, PanelRight, Undo2, Redo2, Save, Eye, Pencil, Code2,
  FileDown, Send, CheckCircle2, Search, Loader2, History as HistoryIcon,
} from 'lucide-react'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { Canvas } from './Canvas.jsx'
import { LeftPanel } from './LeftPanel.jsx'
import { RightPanel } from './RightPanel.jsx'
import { Preview, useCompiledPreview, DiagnosticsPanel } from './Preview.jsx'
import { ExportDialog } from './ExportDialog.jsx'
import { PublishDialog } from './PublishDialog.jsx'
import { ImportDialog } from './ImportDialog.jsx'
import { ToolsDialog } from './ToolsDialog.jsx'
import { LottieDialog } from './LottieDialog.jsx'
import { AnimEditor } from './AnimEditor.jsx'
import { CoverDialog } from './CoverDialog.jsx'
import { CommandPalette } from './CommandPalette.jsx'
import { HistoryPanel } from './HistoryPanel.jsx'
import { MarkdownDialog } from './MarkdownDialog.jsx'
import { MenuBar } from './MenuBar.jsx'
import { HomePage } from './HomePage.jsx'
import { Modal, ToastHost, toast, copyText } from '../lib/ui.js'

export default function App() {
  const dirty = useDoc((s) => s.dirty)
  const saving = useDoc((s) => s.saving)
  const viewMode = useUI((s) => s.viewMode)
  const setViewMode = useUI((s) => s.setViewMode)
  const leftOpen = useUI((s) => s.leftOpen)
  const rightOpen = useUI((s) => s.rightOpen)
  const page = useUI((s) => s.page)
  const toggleLeft = useUI((s) => s.toggleLeft)
  const toggleRight = useUI((s) => s.toggleRight)
  const isNarrow = useUI((s) => s.isNarrow)
  const setNarrow = useUI((s) => s.setNarrow)
  const openModal = useUI((s) => s.openModal)
  const select = useUI((s) => s.select)
  const { html, loading, stats, diagnostics, reload } = useCompiledPreview()

  /* 启动时如果有上次打开的文档，直接进编辑器 */
  useEffect(() => {
    const lastId = useUI.getState().currentDocId
    if (lastId) {
      useDoc.getState().loadFromServer(lastId).then(() => useUI.getState().setPage('editor')).catch(() => {})
    }
  }, [])

  /* 响应式 */
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 1100)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [setNarrow])

  /* 快捷键 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement
      const typing = ['INPUT', 'TEXTAREA'].includes(target?.tagName) || target?.isContentEditable

      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openModal('command'); return }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return }
      if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); openModal('export'); return }
      if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); setViewMode(viewMode === 'preview' ? 'edit' : 'preview'); return }
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault()
        if (e.shiftKey) useDoc.getState().redo()
        else useDoc.getState().undo()
        return
      }
      if (e.key === 'Escape' && !typing) select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewMode, openModal, setViewMode, select])

  /* 自动保存 */
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => { void save(true) }, 4000)
    return () => clearTimeout(t)
  }, [dirty])

  const save = async (silent = false) => {
    try {
      await useDoc.getState().save()
      if (!silent) toast('已保存', 'success')
    } catch (e: any) {
      if (!silent) toast(e?.message ?? '保存失败', 'error')
    }
  }

  const jumpTo = (blockId: string) => {
    select(blockId)
    setViewMode('edit')
    setTimeout(() => {
      document.querySelector(`[data-block-id="${blockId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
  }

  const errCount = diagnostics.filter((d) => d.level === 'error').length
  const warnCount = diagnostics.filter((d) => d.level === 'warning').length

  return (
    <div className="h-full flex flex-col bg-ink-bg text-ink-text overflow-hidden">
      {/* 顶栏（仅编辑器显示，首页自带 header） */}
      {page === 'editor' && (
      <header className="h-12 shrink-0 bg-white border-b border-ink-line flex items-center gap-1 px-2.5 z-30">
        <button className="btn btn-ghost btn-sm px-1.5" onClick={toggleLeft} title="左侧面板">
          <PanelLeft size={15} />
        </button>

        <div className="flex items-center gap-1.5 mr-1">
          <span className="w-6 h-6 rounded-md bg-[#2C6BED] text-white flex items-center justify-center text-[12px] font-bold cursor-pointer"
            onClick={() => useUI.getState().setPage('home')} title="返回首页">墨</span>
          <span className="text-[14px] font-semibold hide-md">InkForge</span>
        </div>

        <div className="w-px h-5 bg-ink-line mx-1" />

        {/* 应用菜单栏：文件 / 编辑 / 插入 / 视图 / 帮助 */}
        <MenuBar />

        <div className="w-px h-5 bg-ink-line mx-1" />

        <button className="btn btn-ghost btn-sm px-1.5" title="撤销 ⌘Z" onClick={() => useDoc.getState().undo()}><Undo2 size={14} /></button>
        <button className="btn btn-ghost btn-sm px-1.5" title="重做 ⌘⇧Z" onClick={() => useDoc.getState().redo()}><Redo2 size={14} /></button>
        <button className="btn btn-ghost btn-sm px-1.5" title="历史记录（点击跳转到任意步骤）" onClick={() => useUI.getState().openModal('history')}><HistoryIcon size={14} /></button>
        <button className="btn btn-ghost btn-sm px-1.5" title="保存 ⌘S" onClick={() => void save()}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        </button>
        <span className="text-[11px] text-ink-text-3 w-12 hide-lg">
          {saving ? '保存中' : dirty ? '未保存' : '已保存'}
        </span>

        <div className="w-px h-5 bg-ink-line mx-1" />

        {/* 视图切换 */}
        <div className="inline-flex bg-black/[0.045] rounded-md p-0.5 gap-0.5">
          {([
            ['edit', <Pencil size={13} />, '编辑'],
            ['preview', <Eye size={13} />, '预览'],
            ['code', <Code2 size={13} />, '源码'],
          ] as const).map(([m, icon, label]) => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`h-6 px-2 rounded flex items-center gap-1 text-[12px] transition-colors ${
                viewMode === m ? 'bg-white text-ink-text shadow-sm font-medium' : 'text-ink-text-3 hover:text-ink-text-2'}`}>
              {icon}<span className="hide-lg">{label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* 诊断概览 */}
        <button className="btn btn-ghost btn-sm" onClick={() => openModal('export')} title="查看诊断">
          {errCount > 0
            ? <span className="chip bg-[#D64545]/12 text-[#D64545]">{errCount} 错误</span>
            : warnCount > 0
              ? <span className="chip bg-[#E8A33D]/15 text-[#B7791F]">{warnCount} 警告</span>
              : <span className="chip bg-[#1D9E75]/12 text-[#1D9E75] flex items-center gap-1"><CheckCircle2 size={11} /> 通过</span>}
        </button>

        <button className="btn btn-primary btn-sm" onClick={() => openModal('export')}>
          <FileDown size={13} /><span className="hide-lg">导出</span>
        </button>
        <button className="btn btn-soft btn-sm" onClick={() => openModal('publish')}>
          <Send size={13} /><span className="hide-lg">发布</span>
        </button>

        <div className="w-px h-5 bg-ink-line mx-0.5" />
        <button className="btn btn-ghost btn-sm px-1.5" onClick={toggleRight} title="右侧面板">
          <PanelRight size={15} />
        </button>
      </header>
      )}

      {/* 首页 */}
      {page === 'home' && <HomePage />}

      {/* 编辑器主体 */}
      {page === 'editor' && (
      <div className="flex-1 flex min-h-0 relative">
        {/* 左 */}
        {leftOpen && (
          isNarrow
            ? <div className="absolute inset-y-0 left-0 z-40 w-[290px] shadow-2xl animate-in">
              <div className="h-full"><LeftPanel /></div>
            </div>
            : <div className="w-[290px] shrink-0"><LeftPanel /></div>
        )}

        {/* 中 */}
        <main className="flex-1 min-w-0 flex flex-col">
          {viewMode === 'edit' && <Canvas />}
          {viewMode === 'preview' && <Preview html={html} loading={loading} onReload={reload} />}
          {viewMode === 'code' && <CodeView html={html} loading={loading} diagnostics={diagnostics} stats={stats} onJump={jumpTo} />}
        </main>

        {/* 右 */}
        {rightOpen && (
          isNarrow
            ? <div className="absolute inset-y-0 right-0 z-40 w-[300px] shadow-2xl">
              <div className="h-full border-l border-ink-line"><RightPanel /></div>
            </div>
            : <div className="w-[300px] shrink-0 border-l border-ink-line"><RightPanel /></div>
        )}

        {/* 遮罩（窄屏抽屉） */}
        {isNarrow && (leftOpen || rightOpen) && (
          <div className="absolute inset-0 bg-black/20 z-30"
            onClick={() => { if (leftOpen) toggleLeft(); if (rightOpen) toggleRight() }} />
        )}
      </div>
      )}

      {/* 命令面板提示 */}
      {page === 'editor' && (
      <button className="fixed bottom-3.5 right-3.5 btn btn-soft btn-sm shadow-lg z-20 no-print"
        onClick={() => openModal('command')}>
        <Search size={12} /> 命令面板 <span className="chip bg-black/[0.06] text-ink-text-3 ml-0.5">⌘K</span>
      </button>
      )}

      {/* 弹层 */}
      <ExportDialog diagnostics={diagnostics} stats={stats} onReload={reload} />
      <PublishDialog />
      <ImportDialog />
      <ToolsDialog />
      <LottieDialog />
      <AnimEditor />
      <CoverDialog />
      <CommandPalette />
      <HistoryPanel />
      <MarkdownDialog />
      <ToastHost />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 源码视图                                                             */
/* ------------------------------------------------------------------ */

function CodeView({ html, loading, diagnostics, stats, onJump }: {
  html: string; loading: boolean; diagnostics: any[]; stats: any; onJump: (id: string) => void
}) {
  const [tab, setTab] = useState<'html' | 'diag'>('html')
  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-4 h-10 border-b border-ink-line bg-white shrink-0">
          <div className="inline-flex bg-black/[0.045] rounded-md p-0.5 gap-0.5">
            {([['html', '编译后 HTML'], ['diag', '诊断']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)}
                className={`h-6 px-2.5 rounded text-[12px] ${tab === v ? 'bg-white shadow-sm font-medium' : 'text-ink-text-3'}`}>{l}</button>
            ))}
          </div>
          <div className="flex-1" />
          <span className="text-[11px] text-ink-text-3">
            {stats ? `${Math.round(stats.bytes / 1024)}KB · ${stats.blocks} 区块 · ${stats.animations} 动效` : ''}
          </span>
          <button className="btn btn-primary btn-sm" onClick={() => { copyText(html); toast('已复制', 'success') }}>复制</button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {tab === 'html'
            ? <pre className="text-[11.5px] font-mono leading-relaxed whitespace-pre-wrap break-all bg-white rounded-lg border border-ink-line p-3">
              {loading ? '编译中…' : html}
            </pre>
            : <div className="bg-white rounded-lg border border-ink-line p-3"><DiagnosticsPanel diagnostics={diagnostics} stats={stats} onJump={onJump} /></div>}
        </div>
      </div>
    </div>
  )
}
