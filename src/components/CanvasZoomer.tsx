import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Maximize, Minus, Plus, Scan } from 'lucide-react'
import { useUI } from '../store/useUI.js'

const PRESETS: { label: string; zoom: number }[] = [
  { label: '手机', zoom: 50 },
  { label: 'iPad', zoom: 75 },
  { label: '桌面', zoom: 100 },
  { label: '公众号头图', zoom: 130 },
  { label: '自定义', zoom: 0 },
]

/** 解析用户输入：50 / 75% / 0.5 / fit 都接受 */
function parseZoom(raw: string, cur: number): number | null {
  const s = raw.trim().toLowerCase()
  if (s === 'fit' || s === '1' && false) return 100
  if (s.endsWith('%')) return Number(s.slice(0, -1))
  if (s.startsWith('0.') || (s.includes('.') && Number(s) < 1)) return Math.round(Number(s) * 100)
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function CanvasZoomer({ html, loading }: { html: string; loading: boolean }) {
  const zoom = useUI((s) => s.canvasZoom)
  const setZoom = useUI((s) => s.setCanvasZoom)
  const maxWidth = useUI((s) => s.maxWidth)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(zoom))
  const [eye, setEye] = useState(false)
  const eyeTimer = useRef<number | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [vp, setVp] = useState({ top: 0, height: 0 })

  /* 缩放快捷键：⌘/Ctrl + = / - / 0 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const k = e.key
      if (k === '=' || k === '+') { e.preventDefault(); setZoom(zoom + 10) }
      else if (k === '-') { e.preventDefault(); setZoom(zoom - 10) }
      else if (k === '0') { e.preventDefault(); setZoom(100) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom, setZoom])

  /* 鸟瞰图：悬停 200ms 显示，离开 400ms 隐藏 */
  const openEye = useCallback(() => {
    if (eyeTimer.current) window.clearTimeout(eyeTimer.current)
    eyeTimer.current = window.setTimeout(() => setEye(true), 200)
  }, [])
  const closeEye = useCallback(() => {
    if (eyeTimer.current) window.clearTimeout(eyeTimer.current)
    eyeTimer.current = window.setTimeout(() => setEye(false), 400)
  }, [])

  /* 资源清理（设计 §18.5）：组件卸载时清除悬停计时器，避免对已卸载组件调用 setState；
     鸟瞰图浮窗本身由 `{eye && ...}` 条件渲染，关闭时 iframe 即被 React 卸载。 */
  useEffect(() => {
    return () => {
      if (eyeTimer.current) window.clearTimeout(eyeTimer.current)
    }
  }, [])

  /* 计算视口矩形（基于 #editor-scroll 的真实滚动指标） */
  const recomputeVp = useCallback(() => {
    const el = scrollRef.current
    if (!el || el.scrollHeight <= 0) { setVp({ top: 0, height: 0 }); return }
    const ratio = el.clientHeight / el.scrollHeight
    const top = (el.scrollTop / el.scrollHeight) * 100
    setVp({ top, height: ratio * 100 })
  }, [])

  useEffect(() => { if (eye) recomputeVp() }, [eye, html, recomputeVp])
  useEffect(() => {
    const el = document.getElementById('editor-scroll')
    scrollRef.current = (el as HTMLDivElement) ?? null
    if (!el) return
    const onScroll = () => recomputeVp()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [recomputeVp, eye])

  /* 拖动红矩形 → 滚动画布 */
  const dragRef = useRef<{ y: number; scrollTop: number } | null>(null)
  const onVpDown = (e: React.MouseEvent) => {
    const el = scrollRef.current
    if (!el) return
    e.preventDefault(); e.stopPropagation()
    dragRef.current = { y: e.clientY, scrollTop: el.scrollTop }
    const move = (ev: MouseEvent) => {
      if (!dragRef.current || !el) return
      const fit = 240 / (maxWidth || 677)
      el.scrollTop = dragRef.current.scrollTop + (ev.clientY - dragRef.current.y) / fit
    }
    const up = () => { dragRef.current = null; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const commitDraft = () => {
    const v = parseZoom(draft, zoom)
    if (v != null) setZoom(v)
    setEditing(false)
  }

  const fit = 240 / (maxWidth || 677)

  return (
    <div className="relative" onMouseEnter={openEye} onMouseLeave={closeEye}>
      {/* 鸟瞰图浮窗 */}
      {eye && (
        <div className="absolute bottom-10 right-0 z-[70] w-[260px] h-[340px] bg-white rounded-xl shadow-2xl border border-ink-line overflow-hidden flex flex-col"
          onMouseEnter={openEye} onMouseLeave={closeEye}>
          <div className="px-3 h-8 flex items-center justify-between border-b border-ink-line text-[11px] text-ink-text-3">
            <span className="flex items-center gap-1"><Scan size={12} /> 鸟瞰图</span>
            <span>{Math.round(zoom)}%</span>
          </div>
          <div className="flex-1 relative bg-[#F2F3F5] overflow-hidden" style={{ padding: 8 }}>
            <div style={{ width: maxWidth, transform: `scale(${fit})`, transformOrigin: 'top left' }}>
              <iframe
                ref={iframeRef}
                title="birdseye"
                sandbox=""
                srcDoc={loading ? '<div style="padding:16px;font-family:sans-serif;color:#999">编译中…</div>' : html}
                style={{ width: maxWidth, border: 'none', height: 4800, background: '#fff', pointerEvents: 'none' }}
              />
            </div>
            {vp.height > 0 && (
              <div
                onMouseDown={onVpDown}
                className="absolute left-1 right-1 cursor-pointer border-2 border-[#D64545] bg-[#D64545]/15"
                style={{ top: `${8 + vp.top * fit}%`, height: `${vp.height * fit}%` }}
                title="拖动调整画布位置"
              />
            )}
          </div>
        </div>
      )}

      {/* 缩放胶囊 */}
      <div className="flex items-center gap-1 h-7 px-1.5 rounded-full bg-white/95 backdrop-blur shadow-lg border border-ink-line">
        <button className="w-5 h-5 flex items-center justify-center rounded text-ink-text-2 hover:bg-black/[0.06]" title="缩小 ⌘-" onClick={() => setZoom(zoom - 10)}><Minus size={12} /></button>
        {editing ? (
          <input
            autoFocus value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => { if (e.key === 'Enter') commitDraft(); else if (e.key === 'Escape') { setEditing(false); setDraft(String(zoom)) } }}
            className="w-10 h-5 text-center text-[11px] rounded bg-black/[0.05] outline-none"
          />
        ) : (
          <button className="w-10 text-[11px] font-medium tabular-nums text-ink-text-2 hover:text-[#2C6BED]" title="点击输入缩放（50 / 75% / 0.5 / fit）" onClick={() => { setDraft(String(zoom)); setEditing(true) }}>{zoom}%</button>
        )}
        <button className="w-5 h-5 flex items-center justify-center rounded text-ink-text-2 hover:bg-black/[0.06]" title="放大 ⌘=" onClick={() => setZoom(zoom + 10)}><Plus size={12} /></button>

        <div className="w-px h-4 bg-ink-line mx-0.5" />

        <input
          type="range" min={25} max={400} step={5} value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-24 accent-[#2C6BED] cursor-pointer"
          title="画布缩放（25%–400%）"
        />

        <div className="w-px h-4 bg-ink-line mx-0.5" />

        <select
          value={PRESETS.find((p) => p.zoom === zoom) ? zoom : 0}
          onChange={(e) => { const z = Number(e.target.value); if (z) setZoom(z) }}
          className="h-5 text-[11px] bg-transparent outline-none text-ink-text-2 cursor-pointer"
          title="预设缩放"
        >
          {PRESETS.map((p) => <option key={p.label} value={p.zoom} disabled={p.zoom === 0}>{p.label}</option>)}
        </select>

        <button className="w-5 h-5 flex items-center justify-center rounded text-ink-text-2 hover:bg-black/[0.06]" title="适配宽度 ⌘1" onClick={() => setZoom(100)}><Maximize size={12} /></button>
      </div>
    </div>
  )
}
