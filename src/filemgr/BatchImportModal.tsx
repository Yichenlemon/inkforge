import { useEffect, useRef, useState } from 'react'
import { Modal, toast, Spinner } from '../lib/ui.js'
import { useUI } from '../store/useUI.js'
import { useFileStore } from './useFileStore.js'
import { filesApi } from '../lib/api.js'

export default function BatchImportModal() {
  const open = useUI((s) => s.modals.batchImport)
  const close = useUI((s) => s.closeModal)

  const [files, setFiles] = useState<File[]>([])
  const [urlsText, setUrlsText] = useState('')
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setFiles([])
      setUrlsText('')
      setSummary(null)
    }
  }, [open])

  const onImport = async () => {
    if (loading) return
    setLoading(true)
    setSummary(null)

    let ok = 0
    let fail = 0

    // 本地文件
    for (const f of files) {
      try {
        await filesApi.import(f)
        ok++
      } catch {
        fail++
      }
    }

    // 远程链接（每行一个，过滤空行）
    const urls = urlsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (urls.length) {
      try {
        await filesApi.importUrls(urls)
        ok += urls.length
      } catch {
        fail += urls.length
      }
    }

    setLoading(false)
    setSummary(`已导入 ${ok} 项 / 失败 ${fail} 项`)

    if (ok > 0) {
      try {
        await useFileStore.getState().refreshFacet('all')
      } catch {
        /* 后端容错 */
      }
      close('batchImport')
    } else if (files.length || urls.length) {
      toast(`导入失败：${fail} 项`, 'error')
    }
  }

  return (
    <Modal open={open} onClose={() => close('batchImport')} title="批量导入素材" width={520}>
      <div className="space-y-3">
        <div>
          <div className="text-[12px] text-ink-text-2 mb-1">本地文件</div>
          <button className="btn btn-soft btn-sm" onClick={() => fileRef.current?.click()}>选择文件…</button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const list = Array.from(e.target.files ?? [])
              setFiles((prev) => [...prev, ...list])
              e.target.value = ''
            }}
          />
          {files.length > 0 && (
            <div className="text-[11px] text-ink-text-3 mt-1 break-all">
              已选 {files.length} 个文件：{files.map((f) => f.name).join(', ')}
            </div>
          )}
        </div>

        <div>
          <div className="text-[12px] text-ink-text-2 mb-1">远程链接（每行一个）</div>
          <textarea
            className="input w-full h-24 resize-none text-[12.5px]"
            placeholder="https://example.com/image.png"
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
          />
        </div>

        {summary && (
          <div className="text-[12.5px] text-ink-text-2">{summary}</div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button className="btn btn-ghost btn-sm" onClick={() => close('batchImport')}>取消</button>
          <button className="btn btn-primary btn-sm" disabled={loading} onClick={onImport}>
            {loading ? (
              <span className="flex items-center gap-1.5"><Spinner size={12} /> 导入中…</span>
            ) : '导入'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
