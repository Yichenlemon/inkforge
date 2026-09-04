import { useEffect, useState } from 'react'
import { Modal, toast, Spinner } from '../lib/ui.js'
import { useUI } from '../store/useUI.js'
import { useFileStore } from './useFileStore.js'
import { filesApi } from '../lib/api.js'

interface DedupGroup {
  sha256: string
  ids: string[]
}

export default function DedupModal() {
  const open = useUI((s) => s.modals.dedup)
  const close = useUI((s) => s.closeModal)

  const [groups, setGroups] = useState<DedupGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busySha, setBusySha] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    setError(null)
    setGroups([])
    filesApi
      .dedup()
      .then((res: any) => { if (alive) setGroups(res?.groups ?? []) })
      .catch((e: any) => {
        if (!alive) return
        setError(e?.message ?? '扫描失败')
        toast('去重扫描失败', 'error')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open])

  const merge = async (group: DedupGroup) => {
    const rest = group.ids.slice(1)
    setBusySha(group.sha256)
    for (const id of rest) {
      try {
        await filesApi.del(id) // 软删除，进入回收站
      } catch {
        /* 单个失败不影响其余，继续 */
      }
    }
    try {
      await useFileStore.getState().refreshFacet('all')
      await useFileStore.getState().refreshFacet('trash')
    } catch {
      /* 后端容错 */
    }
    setGroups((prev) => prev.filter((g) => g.sha256 !== group.sha256))
    setBusySha(null)
    toast(`已合并 ${rest.length} 个重复项`, 'success')
  }

  return (
    <Modal open={open} onClose={() => close('dedup')} title="素材去重" width={520}>
      {loading ? (
        <div className="flex items-center justify-center py-8 gap-2 text-ink-text-3">
          <Spinner />
          <span className="text-[12.5px]">扫描中…</span>
        </div>
      ) : error ? (
        <div className="text-[12.5px] text-[#D64545] py-6 text-center">{error}</div>
      ) : groups.length === 0 ? (
        <div className="text-[12.5px] text-ink-text-3 py-6 text-center">没有发现重复素材</div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[60vh] overflow-auto">
          {groups.map((g) => (
            <div key={g.sha256} className="border border-ink-line rounded-lg p-2.5">
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <span className="text-[12px] text-ink-text-2">{g.ids.length} 个文件内容相同</span>
                <button
                  className="btn btn-primary btn-sm shrink-0"
                  disabled={busySha === g.sha256}
                  onClick={() => merge(g)}
                >
                  {busySha === g.sha256 ? '合并中…' : '合并（保留首个，其余移入回收站）'}
                </button>
              </div>
              <div className="text-[11px] text-ink-text-3 break-all">{g.ids.join(', ')}</div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
