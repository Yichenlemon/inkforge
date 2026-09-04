import React, { useState, useRef, useEffect } from 'react'
import { X, Lock, FolderOpen, Copy, PanelTop, Pencil, History } from 'lucide-react'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { useFileStore } from '../filemgr/useFileStore.js'
import { openFileManager } from '../filemgr/index.js'
import { docsApi } from '../lib/api.js'
import { toast } from '../lib/ui.js'

/** 状态色：saved=灰绿 / dirty=琥珀 / saving=蓝脉冲 / error=红 */
const STATUS_COLOR: Record<string, string> = {
  saved: '#1D9E75',
  dirty: '#E8A33D',
  saving: '#2C6BED',
  error: '#D64545',
}

export function MultiDocTabs() {
  const openDocs = useFileStore((s) => s.openDocs)
  const activeId = useFileStore((s) => s.activeId)
  const tabBarPinned = useUI((s) => s.tabBarPinned)
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ctx) return
    const onDown = (e: MouseEvent) => { if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtx(null) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtx(null) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [ctx])

  if (!tabBarPinned || openDocs.length === 0) return null

  /** 切到指定文档：若当前有未保存修改先静默保存，避免切换丢失 */
  const switchTo = async (id: string) => {
    if (id === activeId) return
    try {
      if (useDoc.getState().dirty) await useDoc.getState().save()
    } catch { /* 忽略保存失败，继续切换 */ }
    try {
      await useDoc.getState().loadFromServer(id)
      useUI.getState().setCurrentDocId(id)
      useFileStore.getState().setActive(id)
      useUI.getState().setPage('editor')
    } catch (e: any) {
      toast(e?.message ?? '打开失败', 'error')
    }
  }

  const closeTab = async (id: string) => {
    const entry = openDocs.find((o) => o.id === id)
    const isActive = id === activeId
    // 关闭有未保存修改的激活页：先保存再关，杜绝数据丢失
    if (isActive && useDoc.getState().dirty) {
      try { await useDoc.getState().save() } catch { /* ignore */ }
    }
    useFileStore.getState().closeFile(id)
    // closeFile 已把 activeId 指向相邻页；同步把该页载入选中
    const next = useFileStore.getState().activeId
    if (next && next !== useDoc.getState().doc.id) {
      try { await useDoc.getState().loadFromServer(next); useUI.getState().setCurrentDocId(next) }
      catch { /* ignore */ }
    } else if (!next) {
      useUI.getState().setPage('home')
    }
    void entry
  }

  const closeOthers = (id: string) => {
    for (const o of openDocs) if (o.id !== id) useFileStore.getState().closeFile(o.id)
    void switchTo(id)
    setCtx(null)
  }

  // 关闭 ctx.id 右侧的全部标签：保留 index ≤ 目标 index 的标签
  const closeRight = (id: string) => {
    const idx = openDocs.findIndex((o) => o.id === id)
    if (idx === -1) return
    for (let i = openDocs.length - 1; i > idx; i--) useFileStore.getState().closeFile(openDocs[i].id)
    void switchTo(id)
    setCtx(null)
  }

  // 复制副本：拉取原文 → 另存为新 doc(id 重新生成 + 标题加「副本」)
  const duplicate = async (id: string) => {
    try {
      const res = await docsApi.get(id)
      await docsApi.save({ ...res.doc, id: 'd_' + Date.now(), title: res.doc.title + ' 副本' })
      setCtx(null)
      toast('已复制副本')
    } catch (e: any) {
      toast(e?.message ?? '复制失败', 'error')
    }
  }

  // 重命名：prompt 取新名称后 patch
  const rename = async (id: string) => {
    const cur = useFileStore.getState().openDocs.find((o) => o.id === id)?.doc.title ?? ''
    const title = window.prompt('新名称', cur)
    if (title === null) return
    try {
      await docsApi.patch(id, { title })
      setCtx(null)
    } catch (e: any) {
      toast(e?.message ?? '重命名失败', 'error')
    }
  }

  // 锁定 / 解锁：读取当前 locked 状态后切换
  const toggleLock = async (id: string) => {
    const locked = useFileStore.getState().openDocs.find((o) => o.id === id)?.locked ?? false
    try {
      await useFileStore.getState().setLocked(id, !locked)
      setCtx(null)
    } catch (e: any) {
      toast(e?.message ?? '操作失败', 'error')
    }
  }

  // 查看历史：定位当前文档并打开 history 弹窗
  const viewHistory = (id: string) => {
    useUI.getState().setCurrentDocId(id)
    useUI.getState().openModal('history')
    setCtx(null)
  }

  return (
    <div className="h-9 shrink-0 bg-[#FBFCFE] border-b border-ink-line flex items-stretch px-1 z-20 select-none">
      <div className="flex-1 flex items-stretch overflow-x-auto hide-scroll">
        {openDocs.map((o) => {
          const isActive = o.id === activeId
          const status = isActive
            ? (useDoc.getState().saving ? 'saving' : useDoc.getState().dirty ? 'dirty' : 'saved')
            : 'saved'
          return (
            <div
              key={o.id}
              onClick={() => void switchTo(o.id)}
              onContextMenu={(e) => { e.preventDefault(); setCtx({ id: o.id, x: e.clientX, y: e.clientY }) }}
              title={o.doc.title}
              className={`group relative flex items-center gap-1.5 pl-3 pr-1.5 max-w-[200px] cursor-pointer border-r border-ink-line
                ${isActive ? 'bg-white shadow-[inset_0_-2px_0_0_#2C6BED]' : 'hover:bg-black/[0.03]'}`}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${status === 'saving' ? 'animate-pulse' : ''}`}
                style={{ background: STATUS_COLOR[status] }}
                title={status === 'saving' ? '保存中' : status === 'dirty' ? '未保存' : '已保存'}
              />
              {o.locked && <Lock size={11} className="text-[#D64545] shrink-0" />}
              <span className={`text-[12.5px] truncate ${isActive ? 'font-medium text-ink-text' : 'text-ink-text-2'}`}>
                {useDoc.getState().dirty && isActive ? '● ' : ''}{o.doc.title || '未命名文档'}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); void closeTab(o.id) }}
                className="w-4 h-4 rounded-full flex items-center justify-center text-ink-text-3 opacity-0 group-hover:opacity-100 hover:bg-black/[0.08] hover:text-ink-text transition-opacity shrink-0"
                title="关闭"
              >
                <X size={11} />
              </button>
            </div>
          )
        })}
      </div>

      <button
        className="shrink-0 px-2 flex items-center gap-1 text-[12px] text-ink-text-2 hover:text-[#2C6BED] hover:bg-black/[0.03]"
        onClick={() => openFileManager('all')}
        title="打开文件管理器"
      >
        <PanelTop size={13} /> 管理
      </button>

      {ctx && (
        <div ref={ctxRef} className="fixed z-[80] min-w-[170px] bg-white rounded-lg shadow-xl border border-ink-line py-1 ink-fade-in"
          style={{ left: ctx.x, top: ctx.y }}>
          <MenuItem label="关闭" icon={<X size={12} />} onClick={() => { void closeTab(ctx.id); setCtx(null) }} />
          <MenuItem label="关闭其他" icon={<Copy size={12} />} onClick={() => closeOthers(ctx.id)} />
          <MenuItem label="关闭右侧" icon={<X size={12} />} onClick={() => closeRight(ctx.id)} />
          <div className="h-px bg-ink-line my-1" />
          <MenuItem label="复制副本" icon={<Copy size={12} />} onClick={() => void duplicate(ctx.id)} />
          <MenuItem label="重命名" icon={<Pencil size={12} />} onClick={() => void rename(ctx.id)} />
          <MenuItem
            label={openDocs.find((o) => o.id === ctx.id)?.locked ? '解锁' : '锁定'}
            icon={<Lock size={12} />}
            onClick={() => void toggleLock(ctx.id)}
          />
          <MenuItem label="查看历史" icon={<History size={12} />} onClick={() => viewHistory(ctx.id)} />
          <div className="h-px bg-ink-line my-1" />
          <MenuItem label="在文件管理器中打开" icon={<FolderOpen size={12} />} onClick={() => { openFileManager('all'); setCtx(null) }} />
        </div>
      )}
    </div>
  )
}

function MenuItem({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-[5px] text-left text-[12.5px] text-ink-text-2 hover:bg-[#2C6BED]/10 hover:text-[#2C6BED] transition-colors"
    >
      {icon}<span className="flex-1 whitespace-nowrap">{label}</span>
    </button>
  )
}
