import React from 'react'
import { FileText, Image as ImageIcon, FileCode, Film, Sparkles, FileImage } from 'lucide-react'
import type { FileItem, FileKind } from '../../shared/types.js'
import { runAction } from './registry.js'

export const STATUS_COLOR: Record<FileItem['status'], string> = {
  saved: '#1D9E75',
  dirty: '#E0A23B',
  saving: '#2C6BED',
  error: '#D64545',
}

export const STATUS_LABEL: Record<FileItem['status'], string> = {
  saved: '已保存',
  dirty: '未保存',
  saving: '保存中',
  error: '错误',
}

export function StatusDot({ status, size = 8 }: { status: FileItem['status']; size?: number }) {
  return (
    <span
      title={STATUS_LABEL[status]}
      style={{ width: size, height: size, background: STATUS_COLOR[status] }}
      className="inline-block rounded-full shrink-0"
    />
  )
}

const KIND_ICON: Record<FileKind, React.ReactNode> = {
  doc: <FileText size={22} />,
  image: <ImageIcon size={22} />,
  svg: <FileCode size={22} />,
  lottie: <Film size={22} />,
  snippet: <Sparkles size={22} />,
  template: <FileImage size={22} />,
}

export function KindGlyph({ kind, size = 22 }: { kind: FileKind; size?: number }) {
  return <span className="text-[rgb(var(--ink-text-3))]">{React.cloneElement(KIND_ICON[kind] as React.ReactElement, { size })}</span>
}

export function formatSize(bytes?: number): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function formatDate(ts?: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 卡片/行点击：默认 runAction('open')，按住 Cmd/Ctrl 则在新标签打开。 */
export function openItem(item: FileItem, e?: React.MouseEvent) {
  if (e && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    runAction('open-new-tab', item)
  } else {
    runAction('open', item)
  }
}
