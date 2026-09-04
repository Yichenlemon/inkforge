import { useEffect, useState } from 'react'
import { Modal, toast, Spinner } from '../lib/ui.js'
import { useUI } from '../store/useUI.js'
import { useFileStore } from './useFileStore.js'
import { filesApi } from '../lib/api.js'

interface UsedRef {
  docId: string
  docTitle: string
}

export default function UsedInModal() {
  const open = useUI((s) => s.modals.usedIn)
  const close = useUI((s) => s.closeModal)
  const inspectId = useFileStore((s) => s.inspectId)

  const [refs, setRefs] = useState<UsedRef[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !inspectId) return
    let alive = true
    setLoading(true)
    setError(null)
    setRefs([])
    filesApi
      .usedIn(inspectId)
      .then((res: any) => { if (alive) setRefs(res?.refs ?? []) })
      .catch((e: any) => {
        if (!alive) return
        setError(e?.message ?? '加载失败')
        toast('加载引用失败', 'error')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open, inspectId])

  const onOpen = (docId: string) => {
    useFileStore.getState().openFile(docId).catch(() => {})
    close('usedIn')
  }

  return (
    <Modal open={open} onClose={() => close('usedIn')} title="被哪些文档引用" width={460}>
      {loading ? (
        <div className="flex items-center justify-center py-8 gap-2 text-ink-text-3">
          <Spinner />
          <span className="text-[12.5px]">加载中…</span>
        </div>
      ) : error ? (
        <div className="text-[12.5px] text-[#D64545] py-6 text-center">{error}</div>
      ) : refs.length === 0 ? (
        <div className="text-[12.5px] text-ink-text-3 py-6 text-center">没有被任何文档引用</div>
      ) : (
        <div className="flex flex-col gap-1 max-h-[60vh] overflow-auto">
          {refs.map((r) => (
            <button
              key={r.docId}
              onClick={() => onOpen(r.docId)}
              className="text-left px-2.5 py-2 rounded-md hover:bg-black/[0.04] text-[13px] text-ink-text truncate"
              title="跳转到该文档"
            >
              {r.docTitle || '(未命名文档)'}
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
