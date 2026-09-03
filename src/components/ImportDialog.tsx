import React, { useRef, useState } from 'react'
import { Upload, FileText, Code, Table2, Link2, Loader2, FileJson, Sparkles } from 'lucide-react'
import { convertApi, mediaApi } from '../lib/api.js'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { Modal, toast, Tabs, Spinner, Toggle, Field, Segmented } from '../lib/ui.js'
import { migrateDoc } from '../../shared/types.js'

type Tab = 'md' | 'html' | 'docx' | 'svg' | 'xlsx' | 'json'

export function ImportDialog() {
  const open = useUI((s) => s.modals.import)
  const close = useUI((s) => s.closeModal)
  const doc = useDoc((s) => s.doc)
  const docLoad = useDoc((s) => s.load)
  const insertBlocks = useDoc((s) => s.insertBlocks)
  const replaceBlocks = useDoc((s) => s.replaceBlocks)
  const selectedId = useUI((s) => s.selectedId)
  const [tab, setTab] = useState<Tab>('md')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [replace, setReplace] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const place = (blocks: any[]) => {
    if (replace) replaceBlocks(blocks)
    else {
      const idx = doc.blocks.findIndex((b) => b.id === selectedId)
      insertBlocks(blocks, idx >= 0 ? idx + 1 : undefined)
    }
  }

  const runMd = async () => {
    if (!text.trim()) { toast('请输入 Markdown', 'error'); return }
    setBusy(true)
    try {
      const r = await convertApi.md2blocks(text)
      place(r.blocks ?? [])
      toast(`已导入 ${r.blocks?.length ?? 0} 个区块`, 'success')
      setText('')
      close('import')
    } catch (e: any) { toast(e?.message ?? '导入失败', 'error') }
    finally { setBusy(false) }
  }

  const runHtml = async () => {
    if (!text.trim()) { toast('请输入 HTML', 'error'); return }
    setBusy(true)
    try {
      const r = await convertApi.html2blocks(text)
      place(r.blocks ?? [])
      toast(`已导入 ${r.blocks?.length ?? 0} 个区块`, 'success')
      setText('')
      close('import')
    } catch (e: any) { toast(e?.message ?? '导入失败', 'error') }
    finally { setBusy(false) }
  }

  const runSvg = async (svg: string) => {
    setBusy(true)
    try {
      const r = await mediaApi.svgIngest(svg)
      place([{
        id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
        type: 'svg',
        data: { svg: r.svg, bytes: r.bytes, elements: r.elements, viewBox: r.viewBox, width: r.width, height: r.height },
        style: { marginTop: 8, marginBottom: 16 },
      }])
      toast(`已导入 SVG（${r.bytesBefore} → ${r.bytes} B，${r.elements.length} 个元素）`, 'success')
      close('import')
    } catch (e: any) { toast(e?.message ?? 'SVG 解析失败', 'error') }
    finally { setBusy(false) }
  }

  const handleFile = async (file: File) => {
    setBusy(true)
    try {
      if (tab === 'docx') {
        const r = await convertApi.docx(file)
        place(r.blocks ?? [])
        toast(`已从 Word 导入 ${r.blocks?.length ?? 0} 个区块`, 'success')
        close('import')
      } else if (tab === 'xlsx') {
        const r = await convertApi.xlsx(file)
        const blocks = (r.tables ?? []).map((t: any) => ({
          id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
          type: 'table' as const,
          data: { header: true, rows: t.rows, zebra: true, borderMode: 'all' },
          style: { marginTop: 8, marginBottom: 16 },
        }))
        place(blocks)
        toast(`已导入 ${blocks.length} 张表格`, 'success')
        close('import')
      } else if (tab === 'svg') {
        await runSvg(await file.text())
      } else if (tab === 'json') {
        const parsed = migrateDoc(JSON.parse(await file.text()))
        docLoad(parsed)
        toast('已载入工程文件', 'success')
        close('import')
      }
    } catch (e: any) { toast(e?.message ?? '导入失败', 'error') }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={() => close('import')} title="导入内容" width={720}>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'md', label: 'Markdown' },
        { value: 'html', label: 'HTML / 粘贴' },
        { value: 'docx', label: 'Word' },
        { value: 'xlsx', label: 'Excel' },
        { value: 'svg', label: 'SVG' },
        { value: 'json', label: '工程文件' },
      ]} />

      <div className="pt-3">
        {(tab === 'md' || tab === 'html' || tab === 'svg') && (
          <textarea className="textarea font-mono text-[12px]" rows={12}
            placeholder={tab === 'md'
              ? '# 标题\n\n正文段落，支持 **加粗**、列表、表格、```代码块```…'
              : tab === 'html'
                ? '直接粘贴网页 / 秀米 / 135 / 飞书复制出来的富文本…'
                : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">…</svg>'}
            value={text} onChange={(e) => setText(e.target.value)} />
        )}

        {(tab === 'docx' || tab === 'xlsx' || tab === 'json') && (
          <button className="w-full rounded-lg border border-dashed border-ink-line-strong py-10 flex flex-col items-center gap-2 text-ink-text-3 hover:border-[#2C6BED] hover:text-ink-text-2"
            onClick={() => fileRef.current?.click()}>
            <Upload size={22} />
            <span className="text-[13px]">
              {tab === 'docx' ? '选择 .docx 文件' : tab === 'xlsx' ? '选择 .xlsx 文件' : '选择 InkForge 导出的 .json'}
            </span>
            <span className="text-[11px]">
              {tab === 'docx' ? '保留标题层级、加粗、列表、表格与图片' : tab === 'xlsx' ? '每个工作表转成一张表格' : '完整恢复文章结构'}
            </span>
          </button>
        )}
        {tab === 'svg' && (
          <div className="mt-2 text-center">
            <button className="btn btn-soft btn-sm" onClick={() => fileRef.current?.click()}>或选择 .svg 文件</button>
          </div>
        )}

        <input ref={fileRef} type="file" className="hidden"
          accept={tab === 'docx' ? '.docx' : tab === 'xlsx' ? '.xlsx,.xls' : tab === 'json' ? '.json' : '.svg,image/svg+xml'}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = '' }} />

        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-ink-line">
          <Toggle value={replace} onChange={setReplace} label="替换全文（不选则插入到当前位置之后）" />
          <div className="flex-1" />
          {(tab === 'md' || tab === 'html' || tab === 'svg') && (
            <button className="btn btn-primary" disabled={busy || !text.trim()}
              onClick={() => (tab === 'md' ? runMd() : tab === 'html' ? runHtml() : runSvg(text))}>
              {busy && <Loader2 size={13} className="animate-spin" />} 导入
            </button>
          )}
        </div>

        <div className="mt-3 text-[11.5px] text-ink-text-3 leading-relaxed space-y-1">
          <div>· 从秀米 / 135 / 飞书 / Word 直接复制粘贴到画布里也可以，会自动归一化并清掉微信不支持的样式。</div>
          <div>· 导入的 SVG 会自动去掉 script、外链、id，并做压缩，保证导出后仍然可用。</div>
        </div>
      </div>
    </Modal>
  )
}
