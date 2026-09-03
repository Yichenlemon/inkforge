import React, { useEffect, useState } from 'react'
import { Hash, Copy, Download, FileDown, FileText, Plus, Replace, Loader2 } from 'lucide-react'
import { useUI } from '../store/useUI.js'
import { useDoc } from '../store/useDoc.js'
import { convertApi } from '../lib/api.js'
import { Modal, Tabs, toast, copyText, downloadText } from '../lib/ui.js'

const SAMPLE = `# 公众号标题示例

这是一段 **加粗** 与 *斜体* 的正文，支持 [链接](https://example.com) 与行内 \`代码\`。

## 小标题

- 列表项一
- 列表项二
- 列表项三

1. 有序一
2. 有序二

> 引用：好的排版是内容的延伸，而不是束缚。

\`\`\`js
console.log('Hello InkForge')
\`\`\`

| 名称 | 说明 |
| --- | --- |
| 模板 | 商业级公众号版式 |
| 导出 | 一键同步到公众号 |

![示例图片](https://picsum.photos/seed/inkforge/600/300)

---

正文结束。
`

export function MarkdownDialog() {
  const open = useUI((s) => s.modals.markdown)
  const closeModal = useUI((s) => s.closeModal)
  const doc = useDoc((s) => s.doc)
  const replaceBlocks = useDoc((s) => s.replaceBlocks)
  const insertBlocks = useDoc((s) => s.insertBlocks)

  const [tab, setTab] = useState<'import' | 'export'>('import')
  const [md, setMd] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')
  const [busy, setBusy] = useState(false)
  const [exportMd, setExportMd] = useState('')
  const [exportLoading, setExportLoading] = useState(false)

  /* 打开时生成「导出 Markdown」 */
  useEffect(() => {
    if (!open) return
    let alive = true
    setExportLoading(true)
    convertApi.blocks2md(doc.blocks, doc.themeId)
      .then((r) => { if (alive) setExportMd(r.md ?? '') })
      .catch(() => { if (alive) setExportMd('') })
      .finally(() => { if (alive) setExportLoading(false) })
    return () => { alive = false }
  }, [open])

  /* 导入：防抖实时预览 */
  useEffect(() => {
    if (!open || !md.trim()) { setPreviewHtml(''); return }
    const t = setTimeout(() => {
      convertApi.md2html(md)
        .then((r) => setPreviewHtml(r.html ?? ''))
        .catch(() => setPreviewHtml(''))
    }, 250)
    return () => clearTimeout(t)
  }, [md, open])

  const doImport = async (mode: 'replace' | 'append') => {
    if (!md.trim()) { toast('请先输入 Markdown', 'error'); return }
    setBusy(true)
    try {
      const r = await convertApi.md2blocks(md)
      if (!r.blocks?.length) { toast('没有解析出任何区块', 'error'); return }
      if (mode === 'replace') replaceBlocks(r.blocks)
      else insertBlocks(r.blocks)
      const stat = r.stats ? Object.entries(r.stats).map(([k, v]) => `${k}·${v}`).join('  ') : ''
      toast(`已${mode === 'replace' ? '替换全文' : '追加'} ${r.blocks.length} 个区块${stat ? `（${stat}）` : ''}`, 'success')
      setMd('')
      closeModal('markdown')
    } catch (e: any) {
      toast(e?.message ?? '转换失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <Modal open={open} title="Markdown 模式" onClose={() => closeModal('markdown')} width={780} fullHeight>
      <div className="flex flex-col h-full">
        <div className="px-4 pt-1">
          <Tabs
            tabs={[
              { value: 'import', label: '导入 Markdown', icon: <FileDown size={13} /> },
              { value: 'export', label: '导出 Markdown', icon: <FileText size={13} /> },
            ]}
            value={tab}
            onChange={(v) => setTab(v as 'import' | 'export')}
          />
        </div>

        <div className="flex-1 overflow-auto p-4">
          {tab === 'import' ? (
            <div className="space-y-3">
              <div className="text-[12px] text-ink-text-3">
                粘贴 Markdown，右侧实时预览，一键转为可编辑区块（标题 / 正文 / 列表 / 引用 / 代码 / 表格 / 图片 / 分割线）。
              </div>
              <div className="grid grid-cols-2 gap-3" style={{ height: 360 }}>
                <textarea
                  className="input w-full h-full font-mono text-[12.5px] leading-relaxed resize-none"
                  placeholder="在此粘贴 Markdown…"
                  value={md}
                  onChange={(e) => setMd(e.target.value)}
                />
                <div className="border border-ink-line rounded-lg p-3 overflow-auto bg-ink-bg text-[13px] leading-relaxed break-words">
                  {previewHtml
                    ? <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                    : <div className="text-ink-text-3 text-[12px]">预览区（输入后自动渲染）</div>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => setMd(SAMPLE)}>载入示例</button>
                <div className="flex-1" />
                <button className="btn btn-soft btn-sm" disabled={busy} onClick={() => void doImport('append')}>
                  <Plus size={13} /> {busy ? '转换中…' : '追加到文末'}
                </button>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void doImport('replace')}>
                  <Replace size={13} /> {busy ? '转换中…' : '转为区块（替换全文）'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-[12px] text-ink-text-3">
                把当前文档导出为 Markdown，可再粘贴回「导入」实现往返编辑。
              </div>
              {exportLoading ? (
                <div className="flex items-center gap-2 text-ink-text-3 text-[12px] py-10 justify-center">
                  <Loader2 size={14} className="animate-spin" /> 正在生成…
                </div>
              ) : (
                <textarea
                  className="input w-full font-mono text-[12.5px] leading-relaxed resize-none"
                  style={{ height: 360 }}
                  readOnly
                  value={exportMd}
                />
              )}
              <div className="flex items-center gap-2">
                <button className="btn btn-soft btn-sm" onClick={() => { copyText(exportMd); toast('已复制 Markdown', 'success') }}>
                  <Copy size={13} /> 复制
                </button>
                <button className="btn btn-soft btn-sm" onClick={() => downloadText(exportMd, `${(doc.title || 'inkforge').replace(/[\\/:*?"<>|]/g, '_')}.md`, 'text/markdown;charset=utf-8')}>
                  <Download size={13} /> 下载 .md
                </button>
                <div className="flex-1" />
                <span className="text-[11px] text-ink-text-3">{exportMd.length} 字符</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
