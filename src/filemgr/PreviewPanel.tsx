import React, { useEffect, useRef, useState } from 'react'
import { Download, History, RefreshCw, Copy, FileImage, Code2, Plus, FileText } from 'lucide-react'
import { useFileStore } from './useFileStore.js'
import { useUI } from '../store/useUI.js'
import { docsApi, compileApi, assetsApi, libraryApi } from '../lib/api.js'
import { downloadText, copyText, downloadBlob, toast } from '../lib/ui.js'
import { runAction } from './registry.js'
import { formatSize, formatDate } from './shared.js'
import type { FileItem } from '../../shared/types.js'

interface Props {
  item: FileItem | null
  width: number
  onResize: (w: number) => void
}

export function PreviewPanel({ item, width, onResize }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [svgSrcOpen, setSvgSrcOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  /* 拖拽左边缘改变宽度（280–600） */
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const onMove = (ev: MouseEvent) => {
      const nw = Math.min(600, Math.max(280, startW - (ev.clientX - startX)))
      onResize(nw)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  if (!item) {
    return (
      <div className="h-full flex items-center justify-center text-ink-text-3 text-[12.5px]" style={{ width }}>
        <div className="text-center px-4">选择左侧文件以预览</div>
      </div>
    )
  }

  return (
    <div className="relative h-full flex flex-col bg-white" style={{ width }}>
      {/* 拖拽手柄 */}
      <div
        onMouseDown={startDrag}
        className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-[rgb(var(--ink-accent))]/30 z-10"
        title="拖动调整宽度"
      />

      <div className="px-3 h-10 flex items-center border-b border-ink-line shrink-0">
        <span className="text-[12.5px] font-semibold text-ink-text truncate">{item.name}</span>
        <span className="ml-2 chip bg-black/[0.05] text-ink-text-3">{item.kind}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <PreviewBody
          key={item.id}
          item={item}
          svgSrcOpen={svgSrcOpen}
          setSvgSrcOpen={setSvgSrcOpen}
          busy={busy}
          setBusy={setBusy}
          fileInput={fileInput}
        />
      </div>

      {/* 隐藏的文件选择（图片替换） */}
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          try {
            setBusy(true)
            await assetsApi.upload(f)
            toast('已替换资源（best-effort）', 'success')
            useFileStore.getState().refreshFacet(useFileStore.getState().facet)
          } catch (err: any) { toast(err?.message ?? '替换失败', 'error') }
          finally { setBusy(false); if (fileInput.current) fileInput.current.value = '' }
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 各类型预览                                                            */
/* ------------------------------------------------------------------ */

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 py-1 text-[12px] border-b border-ink-line last:border-0">
      <span className="text-ink-text-3 shrink-0">{label}</span>
      <span className="text-ink-text-2 text-right truncate">{value}</span>
    </div>
  )
}

function PreviewBody({
  item, svgSrcOpen, setSvgSrcOpen, busy, setBusy, fileInput,
}: {
  item: FileItem
  svgSrcOpen: boolean
  setSvgSrcOpen: (v: boolean) => void
  busy: boolean
  setBusy: (v: boolean) => void
  fileInput: React.RefObject<HTMLInputElement>
}) {
  if (item.kind === 'doc') return <DocPreview item={item} />
  if (item.kind === 'image') return <ImagePreview item={item} busy={busy} setBusy={setBusy} fileInput={fileInput} />
  if (item.kind === 'svg') return <SvgPreview item={item} svgSrcOpen={svgSrcOpen} setSvgSrcOpen={setSvgSrcOpen} />
  if (item.kind === 'lottie') return <LottiePreview item={item} busy={busy} setBusy={setBusy} fileInput={fileInput} />
  if (item.kind === 'snippet' || item.kind === 'template') return <SnippetPreview item={item} />
  return <div className="text-ink-text-3 text-[12.5px]">暂无可预览内容</div>
}

function DocPreview({ item }: { item: FileItem }) {
  const [exporting, setExporting] = useState(false)

  const exportHtml = async () => {
    try {
      setExporting(true)
      const res: any = await docsApi.get(item.id)
      const r: any = await compileApi.exportHtml(res.doc)
      const text = typeof r === 'string' ? r : (r?.html ?? r?.content ?? JSON.stringify(r))
      downloadText(text, `${item.name}.html`, 'text/html;charset=utf-8')
      toast('已导出 HTML 快照', 'success')
    } catch (e: any) { toast(e?.message ?? '导出失败', 'error') }
    finally { setExporting(false) }
  }
  const openHistory = () => {
    useUI.getState().setCurrentDocId(item.id)
    useUI.getState().openModal('history')
  }

  return (
    <div className="space-y-3">
      <div className="text-[13px] text-ink-text-2 leading-relaxed">{item.name}</div>
      <div>
        <Meta label="修改时间" value={formatDate(item.updatedAt)} />
        <Meta label="作者" value={item.author ?? '—'} />
        <Meta label="字数" value={(item.meta?.wordCount as number) ?? '—'} />
        <Meta label="状态" value={item.status} />
      </div>
      <div className="flex flex-col gap-1.5 pt-1">
        <button className="btn btn-sm btn-primary" disabled={exporting} onClick={exportHtml}>
          <Download size={14} /> {exporting ? '导出中…' : '导出 HTML 快照'}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={openHistory}>
          <History size={14} /> 查看历史
        </button>
      </div>
    </div>
  )
}

function ImagePreview({
  item, busy, setBusy, fileInput,
}: {
  item: FileItem
  busy: boolean
  setBusy: (v: boolean) => void
  fileInput: React.RefObject<HTMLInputElement>
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-ink-line overflow-hidden bg-black/[0.02] flex items-center justify-center max-h-[260px]">
        {item.thumbnail
          ? <img src={item.thumbnail} alt={item.name} className="max-w-full max-h-[260px] object-contain" />
          : <FileImage size={40} className="text-ink-text-3 m-8" />}
      </div>
      <div>
        <Meta label="格式" value={item.mime ?? '—'} />
        <Meta label="大小" value={formatSize(item.size)} />
        <Meta label="上传时间" value={formatDate(item.createdAt)} />
        <Meta label="标签" value={(item.tags ?? []).join('、') || '—'} />
        <Meta label="被引用" value={item.refs?.length ? `${item.refs.length} 处` : '未使用'} />
      </div>
      <button className="btn btn-sm btn-ghost w-full" disabled={busy} onClick={() => fileInput.current?.click()}>
        <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> 替换
      </button>
    </div>
  )
}

function SvgPreview({
  item, svgSrcOpen, setSvgSrcOpen,
}: {
  item: FileItem
  svgSrcOpen: boolean
  setSvgSrcOpen: (v: boolean) => void
}) {
  const svg = (item.meta?.svg as string) ?? ''
  const exportPng = () => {
    if (!svg) { toast('没有 SVG 源码', 'info'); return }
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width || 300
      canvas.height = img.height || 300
      canvas.getContext('2d')?.drawImage(img, 0, 0)
      canvas.toBlob((b) => {
        if (b) downloadBlob(b, `${item.name}.png`)
        URL.revokeObjectURL(url)
      }, 'image/png')
    }
    img.onerror = () => { URL.revokeObjectURL(url); toast('SVG 转 PNG 失败', 'error') }
    img.src = url
  }
  const copyDataUrl = async () => {
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    await copyText(dataUrl)
    toast('已复制 dataURL', 'success')
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-ink-line overflow-auto bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22><rect width=%2210%22 height=%2210%22 fill=%22%23fff%22/><rect width=%225%22 height=%225%22 fill=%22%23eee%22/><rect x=%225%22 y=%225%22 width=%225%22 height=%225%22 fill=%22%23eee%22/></svg>')] p-2 max-h-[200px] flex items-center justify-center">
        {svg ? (
          <div className="max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <span className="text-ink-text-3 text-[12px]">无 SVG 源码</span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <button className="btn btn-sm btn-ghost" onClick={() => copyText(svg)}><Copy size={14} /> 复制 SVG</button>
        <button className="btn btn-sm btn-ghost" onClick={copyDataUrl}><Copy size={14} /> 复制 dataURL</button>
        <button className="btn btn-sm btn-ghost" onClick={exportPng}><Download size={14} /> 导出 PNG</button>
        <button className="btn btn-sm btn-ghost" onClick={() => setSvgSrcOpen(!svgSrcOpen)}>
          <Code2 size={14} /> {svgSrcOpen ? '收起源码' : '查看源码'}
        </button>
      </div>
      {svgSrcOpen && (
        <textarea className="textarea h-40 font-mono text-[11px]" readOnly value={svg} />
      )}
    </div>
  )
}

function LottiePreview({
  item, busy, setBusy, fileInput,
}: {
  item: FileItem
  busy: boolean
  setBusy: (v: boolean) => void
  fileInput: React.RefObject<HTMLInputElement>
}) {
  const hasPlayer = typeof customElements !== 'undefined' && !!customElements.get('lottie-player')
  const src = item.thumbnail || (item.meta?.url as string | undefined)
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-ink-line overflow-hidden bg-black/[0.02] flex items-center justify-center min-h-[160px]">
        {hasPlayer && src ? (
          // @ts-ignore 自定义元素
          <lottie-player src={src} autoplay loop style={{ width: 220, height: 220 }} />
        ) : (
          <div className="text-center text-[12px] text-ink-text-3 p-4">
            当前环境未注册 <code>&lt;lottie-player&gt;</code> 组件，无法内联预览动画。<br />可在编辑器中插入该 Lottie。
          </div>
        )}
      </div>
      <div>
        <Meta label="大小" value={formatSize(item.size)} />
        <Meta label="被引用" value={item.refs?.length ? `${item.refs.length} 处` : '未使用'} />
      </div>
      <button className="btn btn-sm btn-ghost w-full" disabled={busy} onClick={() => fileInput.current?.click()}>
        <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> 替换
      </button>
    </div>
  )
}

function SnippetPreview({ item }: { item: FileItem }) {
  const html = (item.meta?.html as string) ?? ''
  const clone = async () => {
    try {
      const name = window.prompt('克隆为片段，名称', `${item.name} 副本`)
      if (!name) return
      await libraryApi.addSnippet(name, html || '<p>内容</p>')
      toast('已克隆为我的片段', 'success')
    } catch (e: any) { toast(e?.message ?? '克隆失败', 'error') }
  }
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-ink-line overflow-hidden bg-white p-2 max-h-[200px] overflow-y-auto">
        {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <span className="text-ink-text-3 text-[12px]">无预览内容</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        <button className="btn btn-sm btn-primary" onClick={() => runAction('insert-into-doc', item)}>
          <Plus size={14} /> 插入到文档
        </button>
        <button className="btn btn-sm btn-ghost" onClick={clone}>
          <FileText size={14} /> 克隆为我的片段
        </button>
      </div>
    </div>
  )
}
