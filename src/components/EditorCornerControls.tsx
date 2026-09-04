import React from 'react'
import { Search } from 'lucide-react'
import { useUI } from '../store/useUI.js'
import { CanvasZoomer } from './CanvasZoomer.jsx'
import { FileLock } from './FileLock.jsx'

/** 编辑器右下角统一控件簇：文件锁 + 画布缩放器 + 命令面板入口（设计 §13.2） */
export function EditorCornerControls({ html, loading }: { html: string; loading: boolean }) {
  const openModal = useUI((s) => s.openModal)
  return (
    <div className="fixed bottom-3.5 right-3.5 z-20 flex items-center gap-2 no-print">
      <button
        className="btn btn-soft btn-sm shadow-lg"
        onClick={() => openModal('command')}
        title="命令面板 ⌘K"
      >
        <Search size={12} /> 命令 <span className="chip bg-black/[0.06] text-ink-text-3 ml-0.5">⌘K</span>
      </button>
      <FileLock />
      <CanvasZoomer html={html} loading={loading} />
    </div>
  )
}
