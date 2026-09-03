import React, { useEffect, useRef, useState } from 'react'
import {
  Copy, Download, FileCode, FileText, FileJson, Image as ImageIcon, FileType,
  Check, Loader2, AlertTriangle,
} from 'lucide-react'
import { toPng, toBlob } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { compileApi } from '../lib/api.js'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { Modal, toast, copyHtml, copyText, downloadText, downloadBlob, Toggle, Tabs } from '../lib/ui.js'
import { DiagnosticsPanel } from './Preview.js'

type Tab = 'copy' | 'file' | 'image'

export function ExportDialog({
  diagnostics, stats, onReload,
}: { diagnostics: any[]; stats: any; onReload: () => void }) {
  const open = useUI((s) => s.modals.export)
  const close = useUI((s) => s.closeModal)
  const doc = useDoc((s) => s.doc)
  const stripAnimation = useUI((s) => s.stripAnimation)
  const setStrip = useUI((s) => s.setStripAnimation)
  const [tab, setTab] = useState<Tab>('copy')
  const [busy, setBusy] = useState<string | null>(null)
  const [html, setHtml] = useState('')
  const [copied, setCopied] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setCopied(false)
    compileApi.compile(doc, { stripAnimation, maxWidth: doc.articleWidth }).then((r) => setHtml(r.html)).catch(() => setHtml(''))
  }, [open, doc, stripAnimation])

  const guard = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try { await fn() } catch (e: any) { toast(e?.message ?? '操作失败', 'error') }
    finally { setBusy(null) }
  }

  const doExport = async (kind: 'html' | 'md' | 'json' | 'txt') => {
    const name = (doc.title || '文章').replace(/[\\/:*?"<>|]/g, '_')
    if (kind === 'html') {
      const r = await compileApi.exportHtml(doc, { stripAnimation, maxWidth: doc.articleWidth })
      downloadText(r.full, `${name}.html`, 'text/html;charset=utf-8')
    } else if (kind === 'md') {
      const r = await compileApi.exportMd(doc, { stripAnimation })
      downloadText(r.markdown, `${name}.md`, 'text/markdown;charset=utf-8')
    } else if (kind === 'json') {
      const r = await compileApi.exportJson(doc)
      downloadText(r.json, `${name}.json`, 'application/json;charset=utf-8')
    } else {
      const r = await compileApi.exportText(doc, { stripAnimation })
      downloadText(r.text, `${name}.txt`)
    }
    toast('已开始下载', 'success')
  }

  const doLongImage = async () => {
    const node = previewRef.current
    if (!node) { toast('预览尚未就绪', 'error'); return }
    const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${(doc.title || '文章').replace(/[\\/:*?"<>|]/g, '_')}-长图.png`
    a.click()
    toast('长图已导出', 'success')
  }

  const doPdf = async () => {
    const node = previewRef.current
    if (!node) { toast('预览尚未就绪', 'error'); return }
    const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: '#ffffff' })
    if (!blob) { toast('图片生成失败', 'error'); return }
    const url = URL.createObjectURL(blob)
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('图片渲染失败'))
      img.src = url
    })
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const imgH = (img.height * pageW) / img.width
    let y = 0
    let remaining = imgH
    // 分页：按 A4 高度切片
    let srcY = 0
    while (remaining > 0) {
      const sliceH = Math.min(remaining, pageH)
      const canvas = document.createElement('canvas')
      const ratio = img.width / pageW
      canvas.width = img.width
      canvas.height = Math.min(sliceH * ratio, img.height - srcY)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, -srcY, img.width, img.height)
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, canvas.height / ratio)
      srcY += canvas.height
      remaining -= sliceH
      if (remaining > 0) pdf.addPage()
    }
    URL.revokeObjectURL(url)
    pdf.save(`${(doc.title || '文章').replace(/[\\/:*?"<>|]/g, '_')}.pdf`)
    toast('PDF 已导出', 'success')
  }

  return (
    <Modal open={open} onClose={() => close('export')} title="导出与发布" width={860}>
      <div className="flex items-center gap-3 px-4 pb-3 border-b border-ink-line -mt-4 -mx-4 pt-3 flex-wrap">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'copy', label: '复制到公众号' },
          { value: 'file', label: '文件导出' },
          { value: 'image', label: '长图 / PDF' },
        ]} />
        <div className="flex-1" />
        <Toggle value={stripAnimation} onChange={setStrip} label="保守模式（关闭动效）" />
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-4 pt-3">
        <div>
          {tab === 'copy' && (
            <div className="space-y-3">
              <div className="rounded-lg bg-[#EEF4FF] border border-[#D6E4FF] px-3 py-2.5 text-[12.5px] text-[#1F3A6E] leading-relaxed">
                1. 点击下面的「复制全文」&nbsp;→&nbsp;2. 打开公众号后台正文编辑区&nbsp;→&nbsp;3. 粘贴（⌘/Ctrl+V）。
                <br />复制时会同时写入富文本，粘贴后样式不会丢。
              </div>
              <button
                className={`btn w-full h-10 text-[14px] ${copied ? 'bg-[#1D9E75] text-white' : 'btn-primary'}`}
                disabled={!!busy}
                onClick={() => guard('copy', async () => {
                  if (!html) { toast('内容为空', 'error'); return }
                  const okk = copyHtml(html)
                  if (!okk) { copyText(html) }
                  setCopied(true)
                  toast('已复制，去公众号后台粘贴即可', 'success')
                  setTimeout(() => setCopied(false), 2500)
                })}>
                {busy === 'copy' ? <Loader2 size={15} className="animate-spin" /> : copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? '已复制' : '复制全文'}
              </button>
              <button className="btn btn-soft w-full" onClick={() => guard('copytext', async () => {
                const r = await compileApi.exportText(doc, { stripAnimation })
                copyText(r.text); toast('纯文本已复制')
              })}>
                {busy === 'copytext' ? <Loader2 size={14} className="animate-spin" /> : <FileType size={14} />} 复制为纯文本
              </button>

              <div className="border-t border-ink-line pt-3">
                <div className="label mb-1.5">导出后的 HTML（只读，用于排查问题）</div>
                <textarea className="textarea font-mono text-[11px]" rows={9} readOnly value={html} />
              </div>
            </div>
          )}

          {tab === 'file' && (
            <div className="grid grid-cols-2 gap-2">
              <ExportCard icon={<FileCode size={18} />} title="HTML" desc="完整网页，可直接打开" busy={busy === 'html'} onClick={() => guard('html', () => doExport('html'))} />
              <ExportCard icon={<FileText size={18} />} title="Markdown" desc="转 .md，便于二次编辑" busy={busy === 'md'} onClick={() => guard('md', () => doExport('md'))} />
              <ExportCard icon={<FileJson size={18} />} title="JSON" desc="InkForge 工程文件，可再导入" busy={busy === 'json'} onClick={() => guard('json', () => doExport('json'))} />
              <ExportCard icon={<FileType size={18} />} title="纯文本" desc="去掉所有样式" busy={busy === 'txt'} onClick={() => guard('txt', () => doExport('txt'))} />
            </div>
          )}

          {tab === 'image' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <ExportCard icon={<ImageIcon size={18} />} title="长图 PNG" desc="整篇导出为一张图（2x）" busy={busy === 'png'} onClick={() => guard('png', doLongImage)} />
                <ExportCard icon={<FileText size={18} />} title="PDF" desc="按 A4 分页" busy={busy === 'pdf'} onClick={() => guard('pdf', doPdf)} />
              </div>
              <div className="rounded-lg border border-ink-line overflow-hidden" style={{ maxHeight: 340, overflowY: 'auto' }}>
                {/* 用于长图截图的离线副本：宽度锁定 677，与公众号一致 */}
                <div ref={previewRef} style={{ width: 677, background: '#fff', padding: '20px 16px' }}>
                  <div dangerouslySetInnerHTML={{ __html: html }} />
                </div>
              </div>
              <div className="text-[11px] text-ink-text-3">
                长图按 677px（公众号正文实际宽度）渲染，2 倍像素密度输出。
              </div>
            </div>
          )}
        </div>

        {/* 诊断 */}
        <div className="border-l border-ink-line pl-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-semibold">导出前检查</span>
            <button className="btn btn-ghost btn-xs" onClick={onReload}>重新检查</button>
          </div>
          <DiagnosticsPanel diagnostics={diagnostics} stats={stats} />
          {(diagnostics.filter((d) => d.level === 'error').length > 0) && (
            <div className="mt-3 flex items-start gap-1.5 text-[11.5px] text-[#B7791F] bg-[#FFF7E6] rounded px-2 py-1.5">
              <AlertTriangle size={13} className="shrink-0 mt-px" />
              <span>存在错误级问题，微信端可能会删掉对应样式，建议先处理再发布。</span>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function ExportCard({ icon, title, desc, onClick, busy }: {
  icon: React.ReactNode; title: string; desc: string; onClick: () => void; busy?: boolean
}) {
  return (
    <button onClick={onClick} disabled={busy}
      className="panel p-3 text-left hover:border-[#2C6BED] hover:bg-[#2C6BED]/[0.03] transition-colors disabled:opacity-60">
      <div className="flex items-center gap-2 mb-1 text-ink-text">
        {busy ? <Loader2 size={18} className="animate-spin" /> : icon}
        <span className="text-[13px] font-medium">{title}</span>
      </div>
      <div className="text-[11.5px] text-ink-text-3">{desc}</div>
    </button>
  )
}
