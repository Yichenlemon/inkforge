import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { X, ChevronDown, Check } from 'lucide-react'

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */

type ToastKind = 'info' | 'success' | 'error'
interface ToastItem { id: number; kind: ToastKind; text: string }

let toastSeq = 0
const toastListeners = new Set<(t: ToastItem) => void>()

export function toast(text: string, kind: ToastKind = 'info') {
  const item = { id: ++toastSeq, kind, text }
  toastListeners.forEach((fn) => fn(item))
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => {
    const fn = (t: ToastItem) => {
      setItems((prev) => [...prev, t])
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 2800)
    }
    toastListeners.add(fn)
    return () => { toastListeners.delete(fn) }
  }, [])
  return createPortal(
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 no-print">
      {items.map((t) => (
        <div key={t.id}
          className={`ink-fade-in px-3.5 py-2 rounded-lg shadow-lg text-[13px] text-white max-w-[80vw] ${
            t.kind === 'error' ? 'bg-[#D64545]' : t.kind === 'success' ? 'bg-[#1D9E75]' : 'bg-[#2C2C2A]'
          }`}>
          {t.text}
        </div>
      ))}
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open, onClose, title, children, width = 620, footer, fullHeight = false,
}: {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  width?: number | string
  footer?: React.ReactNode
  fullHeight?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 no-print">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div
        className="relative bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden ink-fade-in"
        style={{ width: typeof width === 'number' ? Math.min(width, window.innerWidth - 32) : width, maxHeight: '92vh' }}
      >
        {title && (
          <div className="flex items-center justify-between px-4 h-11 border-b border-ink-line shrink-0">
            <div className="text-[14px] font-semibold text-ink-text">{title}</div>
            <button className="btn btn-ghost btn-sm px-1" onClick={onClose}><X size={15} /></button>
          </div>
        )}
        <div className={`flex-1 overflow-auto ${fullHeight ? '' : 'p-4'}`}>{children}</div>
        {footer && <div className="px-4 h-12 border-t border-ink-line flex items-center justify-end gap-2 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/* 表单原子                                                             */
/* ------------------------------------------------------------------ */

export function Field({ label, hint, children, inline = true }: { label: string; hint?: string; children: React.ReactNode; inline?: boolean }) {
  return (
    <div className={inline ? 'flex items-center gap-2 py-1' : 'py-1'}>
      <label className="w-[76px] shrink-0 text-[12px] text-ink-text-2">{label}</label>
      <div className="flex-1 min-w-0">
        {children}
        {hint && <div className="text-[11px] text-ink-text-3 mt-0.5 leading-snug">{hint}</div>}
      </div>
    </div>
  )
}

export function NumberInput({
  value, onChange, min, max, step = 1, suffix, className = '',
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  min?: number; max?: number; step?: number; suffix?: string; className?: string
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <input
        type="number"
        className="input"
        value={value ?? ''}
        min={min} max={max} step={step}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') return onChange(undefined)
          let n = Number(raw)
          if (!isNaN(n)) {
            if (min != null) n = Math.max(min, n)
            if (max != null) n = Math.min(max, n)
            onChange(n)
          }
        }}
      />
      {suffix && <span className="text-[11px] text-ink-text-3 shrink-0">{suffix}</span>}
    </div>
  )
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number
}) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" className="flex-1 accent-[#2C6BED]" value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(Number(e.target.value))} />
      <span className="w-9 text-right text-[11.5px] text-ink-text-2 tabular-nums">{value}</span>
    </div>
  )
}

export function Segmented<T extends string>({
  value, onChange, options, size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: React.ReactNode; title?: string }[]
  size?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex bg-black/[0.04] rounded-md p-0.5 gap-0.5">
      {options.map((o) => (
        <button key={o.value} title={o.title}
          onClick={() => onChange(o.value)}
          className={`rounded ${size === 'sm' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-[12px]'} transition-colors ${
            value === o.value ? 'bg-white text-ink-text shadow-sm font-medium' : 'text-ink-text-3 hover:text-ink-text-2'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button onClick={() => onChange(!value)} className="flex items-center gap-1.5 select-none">
      <span className={`w-8 h-[17px] rounded-full transition-colors relative ${value ? 'bg-[#2C6BED]' : 'bg-black/15'}`}>
        <span className={`absolute top-[2px] w-[13px] h-[13px] rounded-full bg-white shadow transition-all ${value ? 'left-[16px]' : 'left-[2px]'}`} />
      </span>
      {label && <span className="text-[12px] text-ink-text-2">{label}</span>}
    </button>
  )
}

export function ColorField({ value, onChange, allowEmpty = true }: {
  value?: string; onChange: (v?: string) => void; allowEmpty?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative flex items-center gap-1.5" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className="w-6 h-6 rounded border border-ink-line shrink-0"
          style={{ background: value ?? 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 50% / 8px 8px' }} />
        <span className="text-[12px] text-ink-text-2 truncate">{value ?? '默认'}</span>
      </button>
      {allowEmpty && value && (
        <button className="btn btn-ghost btn-xs" onClick={() => onChange(undefined)} title="清除">×</button>
      )}
      {open && (
        <div className="absolute top-7 left-0 z-50 bg-white rounded-lg shadow-xl border border-ink-line p-2.5 space-y-2">
          <HexColorPicker color={value ?? '#ffffff'} onChange={(c) => onChange(c)} />
          <HexColorInput className="input text-center" color={value ?? '#ffffff'} onChange={(c) => onChange(c)} />
        </div>
      )}
    </div>
  )
}

export function Select<T extends string | number>({
  value, onChange, options, className = '',
}: {
  value: T; onChange: (v: T) => void
  options: { value: T; label: string }[]; className?: string
}) {
  return (
    <select className={`select ${className}`} value={value}
      onChange={(e) => {
        const raw = e.target.value
        const opt = options.find((o) => String(o.value) === raw)
        if (opt) onChange(opt.value)
      }}>
      {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
    </select>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { value: T; label: string; icon?: React.ReactNode }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex border-b border-ink-line shrink-0 overflow-x-auto">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={`flex items-center gap-1 px-3 h-9 text-[12.5px] whitespace-nowrap border-b-2 transition-colors ${
            value === t.value ? 'border-[#2C6BED] text-[#2C6BED] font-medium' : 'border-transparent text-ink-text-3 hover:text-ink-text-2'
          }`}>
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  )
}

export function Collapse({ title, children, defaultOpen = false, right }: {
  title: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; right?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-ink-line">
      <div className="flex items-center px-3 h-9">
        <button className="flex items-center gap-1.5 flex-1 text-left" onClick={() => setOpen((v) => !v)}>
          <ChevronDown size={13} className={`transition-transform text-ink-text-3 ${open ? '' : '-rotate-90'}`} />
          <span className="text-[12.5px] font-medium text-ink-text">{title}</span>
        </button>
        {right}
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

export function Empty({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-ink-text-3 gap-2">
      {icon}
      <div className="text-[12.5px]">{text}</div>
    </div>
  )
}

/** 复制到剪贴板（带 execCommand 兜底，保证在公众号编辑器里也能粘贴） */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const okk = document.execCommand('copy')
    document.body.removeChild(ta)
    return okk
  } catch {
    return false
  }
}

/** 复制富文本到剪贴板（保留格式，粘贴进公众号后台时样式才不会丢） */
export function copyHtml(html: string): boolean {
  const handler = (e: ClipboardEvent) => {
    e.clipboardData?.setData('text/html', html)
    e.clipboardData?.setData('text/plain', html.replace(/<[^>]+>/g, ''))
    e.preventDefault()
  }
  document.addEventListener('copy', handler)
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.removeEventListener('copy', handler)
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type: mime }), filename)
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

export function useAsync<T>(fn: () => Promise<T>, deps: any[], initial: T | null = null) {
  const [data, setData] = useState<T | null>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(() => {
    let alive = true
    setLoading(true)
    setError(null)
    fn().then((d) => { if (alive) setData(d) })
      .catch((e: any) => { if (alive) setError(e?.message ?? '加载失败') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(run, [run])
  return { data, loading, error, reload: run }
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span className="inline-block animate-spin rounded-full border-2 border-ink-line border-t-[#2C6BED]"
      style={{ width: size, height: size }} />
  )
}

export function CheckItem({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center gap-2 w-full text-left py-0.5">
      <span className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center shrink-0 ${
        checked ? 'bg-[#2C6BED] border-[#2C6BED] text-white' : 'border-ink-line-strong'}`}>
        {checked && <Check size={10} strokeWidth={4} />}
      </span>
      <span className="text-[12.5px] text-ink-text-2">{children}</span>
    </button>
  )
}
