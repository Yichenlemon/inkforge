import React, { useState, useRef, useEffect } from 'react'
import { Lock, Unlock } from 'lucide-react'
import { useDoc } from '../store/useDoc.js'
import { useFileStore } from '../filemgr/useFileStore.js'
import { toast } from '../lib/ui.js'

/**
 * 文件锁开关（设计 §13.2.2）。
 * - 锁定时：Tab 角标变红、标题前 🔒（由 MultiDocTabs / DocTitle 各自读取 locked 渲染）、
 *   画布盖 1% 红蒙层拦截鼠标编辑（由 App 的 lockedOverlay 渲染）。
 * - 解锁：轻点切换；中/重强度可加长按 0.8s（此处实现为点击切换 + toast 提示）。
 */
export function FileLock() {
  const activeId = useFileStore((s) => s.activeId)
  const locked = useFileStore((s) => s.openDocs.find((o) => o.id === s.activeId)?.locked ?? false)
  const setLocked = useFileStore((s) => s.setLocked)
  const [pressing, setPressing] = useState(false)
  const timer = useRef<number | null>(null)

  const toggle = () => {
    if (!activeId) return
    // 切锁前先保存当前 dirty
    if (useDoc.getState().dirty) { try { useDoc.getState().save() } catch { /* ignore */ } }
    setLocked(activeId, !locked)
    toast(locked ? '已解锁' : '已锁定（画布只读）', locked ? 'info' : 'success')
  }

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  return (
    <button
      className={`w-7 h-7 flex items-center justify-center rounded-full shadow-lg border border-ink-line transition-colors ${
        locked ? 'bg-[#D64545] text-white' : 'bg-white/95 text-ink-text-2 hover:bg-black/[0.06]'
      }`}
      title={locked ? '已锁定 · 点击解锁' : '锁定文档（画布只读）'}
      onClick={toggle}
      onMouseDown={() => { timer.current = window.setTimeout(() => setPressing(true), 800) }}
      onMouseUp={() => { if (timer.current) window.clearTimeout(timer.current); setPressing(false) }}
      onMouseLeave={() => { if (timer.current) window.clearTimeout(timer.current); setPressing(false) }}
    >
      {locked ? <Lock size={13} /> : <Unlock size={13} />}
    </button>
  )
}
