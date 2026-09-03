import React, { useEffect, useState } from 'react'
import { History, Clock, RotateCcw, X, Save, Dot } from 'lucide-react'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { docsApi } from '../lib/api.js'
import { Modal, toast } from '../lib/ui.js'

function fmt(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function HistoryPanel() {
  const open = useUI((s) => s.modals.history)
  const closeModal = useUI((s) => s.closeModal)
  const currentDocId = useUI((s) => s.currentDocId)
  const past = useDoc((s) => s.past)
  const future = useDoc((s) => s.future)
  const jumpTo = useDoc((s) => s.jumpTo)
  const load = useDoc((s) => s.load)

  const [snaps, setSnaps] = useState<{ id: string; label: string; createdAt: number }[]>([])
  const [loadingSnaps, setLoadingSnaps] = useState(false)

  useEffect(() => {
    if (!open || !currentDocId) return
    setLoadingSnaps(true)
    docsApi.history(currentDocId).then((r) => setSnaps(r.history ?? [])).catch(() => setSnaps([])).finally(() => setLoadingSnaps(false))
  }, [open, currentDocId])

  if (!open) return null

  // 合并 past + 当前 + future 为时间线
  const timeline: { key: string; label: string; at: number; kind: 'past' | 'current' | 'future'; index: number }[] = []
  past.forEach((h, i) => timeline.push({ key: `p${i}`, label: h.label, at: h.at, kind: 'past', index: i }))
  timeline.push({ key: 'cur', label: '当前状态', at: Date.now(), kind: 'current', index: past.length })
  future.forEach((h, i) => timeline.push({ key: `f${i}`, label: h.label, at: h.at, kind: 'future', index: past.length + 1 + i }))

  const restoreSnap = async (id: string) => {
    try {
      const r = await docsApi.historyGet(id)
      load(r.doc)
      toast('已恢复该版本', 'success')
      closeModal('history')
    } catch (e: any) { toast(e?.message ?? '恢复失败', 'error') }
  }

  return (
    <Modal open={open} title="历史记录" onClose={() => closeModal('history')} width={460}>
      <div className="text-[12px] text-ink-text-3 mb-3">
        点击任意一步可跳转到该状态；下方为保存到数据库的版本快照，可整体恢复。
      </div>

      {/* 操作时间线 */}
      <div className="text-[12px] font-semibold text-ink-text-2 mb-2 flex items-center gap-1.5">
        <RotateCcw size={13} /> 操作时间线（{timeline.length} 步）
      </div>
      <div className="max-h-[230px] overflow-y-auto border border-ink-line rounded-lg p-1.5 space-y-0.5">
        {timeline.map((t) => (
          <button
            key={t.key}
            onClick={() => { jumpTo(t.index); closeModal('history') }}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-[12.5px] transition-colors ${
              t.kind === 'current' ? 'bg-[#2C6BED]/10 text-[#2C6BED] font-medium'
                : t.kind === 'future' ? 'text-ink-text-3 hover:bg-black/[0.04]'
                : 'hover:bg-black/[0.04]'
            }`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${t.kind === 'current' ? 'bg-[#2C6BED]' : t.kind === 'future' ? 'bg-ink-line' : 'bg-[#1D9E75]'}`} />
            <span className="flex-1 truncate">{t.label}</span>
            <span className="text-[10.5px] text-ink-text-3">{fmt(t.at)}</span>
          </button>
        ))}
      </div>

      {/* 版本快照 */}
      <div className="text-[12px] font-semibold text-ink-text-2 mt-4 mb-2 flex items-center gap-1.5">
        <Save size={13} /> 已保存版本
      </div>
      <div className="max-h-[150px] overflow-y-auto border border-ink-line rounded-lg p-1.5 space-y-0.5">
        {loadingSnaps ? (
          <div className="text-[12px] text-ink-text-3 text-center py-3">加载中…</div>
        ) : snaps.length === 0 ? (
          <div className="text-[12px] text-ink-text-3 text-center py-3">暂无保存的版本</div>
        ) : snaps.map((s) => (
          <div key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-black/[0.04]">
            <span className="flex-1 truncate text-[12.5px]">{s.label || '自动快照'}</span>
            <span className="text-[10.5px] text-ink-text-3">{fmt(s.createdAt)}</span>
            <button className="btn btn-soft btn-xs" onClick={() => void restoreSnap(s.id)}>恢复</button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
