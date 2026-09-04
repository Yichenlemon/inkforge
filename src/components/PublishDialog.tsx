import React, { useEffect, useRef, useState } from 'react'
import { Send, Loader2, CheckCircle2, XCircle, RefreshCw, Trash2, Upload, Smartphone, Settings2 } from 'lucide-react'
import { libraryApi, wechatApi, assetsApi } from '../lib/api.js'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { Modal, toast, Field, Toggle, Spinner, Empty, Select } from '../lib/ui.js'
import { getDefaultAccountId } from '../lib/accountDefault.js'
import AccountManager from './AccountManager.js'

/**
 * 把任意可能的本地资源地址规范成后端可识别的 `/uploads/...` 相对路径。
 * - 已相对：/uploads/xxx → 原样返回
 * - 同源绝对：https://same.host/uploads/xxx → /uploads/xxx
 * - 外链 / data URI / 已有 media_id → 返回 null（跳过）
 */
function toUploadPath(url: string): string | null {
  if (!url || typeof url !== 'string') return null
  if (url.startsWith('/uploads/')) return url
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url)
      const sameOrigin = typeof location === 'undefined' ? true : u.origin === location.origin
      if (sameOrigin && u.pathname.startsWith('/uploads/')) return u.pathname
    } catch { /* 忽略非法 URL */ }
  }
  return null
}

/** 在富文本 HTML 里把本地图片 <img src> 替换为微信 media_id */
function rewriteHtmlImages(html: string, map: Record<string, string>): string {
  return html.replace(/<img\b([^>]*?)\ssrc=["']([^"']+)["']([^>]*)>/gi, (full, pre, src, post) => {
    const p = toUploadPath(src)
    const media = p ? map[p] : undefined
    if (!media) return full
    return `<img${pre} src="${media}"${post}>`
  })
}

/**
 * 收集当前文档里所有本地图片（image 块 data.src 以及富文本里的 <img src>），
 * 上传到微信素材库，并把 src 改写为返回的 media_id，最后保存文档。
 * 返回成功同步的图片数量。任何异常向上抛出，由调用方决定是否阻断发布。
 */
async function syncBodyImagesToWechat(accountId: string, doc: any): Promise<number> {
  const urlSet = new Set<string>()
  for (const b of doc?.blocks ?? []) {
    const data = b?.data
    if (!data) continue
    if (b.type === 'image' && typeof data.src === 'string') {
      const p = toUploadPath(data.src)
      if (p) urlSet.add(p)
    }
    if (typeof data.html === 'string') {
      for (const m of data.html.matchAll(/<img\b[^>]*?\ssrc=["']([^"']+)["'][^>]*>/gi)) {
        const p = toUploadPath(m[1])
        if (p) urlSet.add(p)
      }
    }
  }
  const urls = Array.from(urlSet)
  if (!urls.length) return 0

  const r: any = await wechatApi.uploadImages(accountId, urls)
  const map: Record<string, string> = r?.map ?? {}
  const mapped = Object.keys(map)
  if (!mapped.length) return 0

  const newBlocks = (doc.blocks ?? []).map((b: any) => {
    const data = b?.data
    if (!data) return b
    let changed = false
    let nextData = data
    if (b.type === 'image' && typeof data.src === 'string') {
      const p = toUploadPath(data.src)
      if (p && map[p]) { nextData = { ...data, src: map[p] }; changed = true }
    }
    if (typeof data.html === 'string') {
      const next = rewriteHtmlImages(data.html, map)
      if (next !== data.html) { nextData = { ...nextData, html: next }; changed = true }
    }
    return changed ? { ...b, data: nextData } : b
  })

  await useDoc.getState().replaceBlocks(newBlocks)
  await useDoc.getState().save()
  return mapped.length
}

export function PublishDialog() {
  const open = useUI((s) => s.modals.publish)
  const close = useUI((s) => s.closeModal)
  const openAccounts = useUI((s) => s.openModal)
  const doc = useDoc((s) => s.doc)
  const stripAnimation = useUI((s) => s.stripAnimation)
  const [tab, setTab] = useState<'push' | 'accounts' | 'drafts'>('push')
  const [accounts, setAccounts] = useState<any[]>([])
  const [accountId, setAccountId] = useState('')
  const [defaultId, setDefaultId] = useState('')
  const [thumbMediaId, setThumbMediaId] = useState('')
  const [coverAssetId, setCoverAssetId] = useState('')
  const [diag, setDiag] = useState<any>(null)
  const [busy, setBusy] = useState('')
  const [drafts, setDrafts] = useState<any[]>([])
  const [wxName, setWxName] = useState('')
  const [useCover, setUseCover] = useState(true)
  const [syncImages, setSyncImages] = useState(true)

  const refresh = async () => {
    const r = await libraryApi.accounts()
    const list = r.accounts ?? []
    setAccounts(list)
    const def = getDefaultAccountId()
    const validDefault = def && list.some((a: any) => a.id === def) ? def : (list[0]?.id ?? '')
    setDefaultId(validDefault)
    if (!accountId || !list.some((a: any) => a.id === accountId)) setAccountId(validDefault)
  }
  useEffect(() => { if (open) void refresh() }, [open])

  const runDiagnose = async () => {
    if (!accountId) { toast('先添加一个公众号账号', 'error'); return }
    setBusy('diag')
    try { setDiag(await wechatApi.diagnose(accountId)) }
    catch (e: any) { toast(e?.message ?? '检测失败', 'error') }
    finally { setBusy('') }
  }

  const uploadCover = async () => {
    if (!accountId || !coverAssetId) { toast('先选账号和封面素材', 'error'); return }
    setBusy('cover')
    try {
      const r = await wechatApi.uploadThumb(accountId, coverAssetId)
      setThumbMediaId(r.mediaId)
      toast('封面已上传', 'success')
    } catch (e: any) { toast(e?.message ?? '上传失败', 'error') }
    finally { setBusy('') }
  }

  const push = async () => {
    if (!accountId) { toast('先选择账号', 'error'); return }
    if (useCover && !thumbMediaId) { toast('先上传封面', 'error'); return }
    setBusy('push')
    try {
      // 发布前自动把正文本地图片同步到公众号素材库（可在下方关闭；失败不阻断发布）
      if (syncImages && accountId) {
        try {
          const n = await syncBodyImagesToWechat(accountId, useDoc.getState().doc)
          if (n > 0) toast(`已同步 ${n} 张图片到公众号素材库`, 'success')
        } catch (e: any) {
          toast(`正文图片同步失败，仍继续发布：${e?.message ?? '未知错误'}`, 'error')
        }
      }
      // 同步后文档可能已被改写 src，重新读取最新 doc 再推送
      const currentDoc = useDoc.getState().doc
      const r = await wechatApi.draft({
        accountId, doc: currentDoc, thumbMediaId: useCover ? thumbMediaId : '',
        title: currentDoc.title, author: currentDoc.meta?.author, digest: currentDoc.meta?.digest,
        sourceUrl: currentDoc.meta?.sourceUrl,
        needOpenComment: currentDoc.meta?.needOpenComment,
        onlyFansCanComment: currentDoc.meta?.onlyFansCanComment,
        stripAnimation,
      })
      toast(`已推送到草稿箱（media_id: ${r.mediaId.slice(0, 12)}…）`, 'success')
      setTab('drafts')
      void loadDrafts()
    } catch (e: any) { toast(e?.message ?? '推送失败', 'error') }
    finally { setBusy('') }
  }

  const loadDrafts = async () => {
    if (!accountId) return
    setBusy('drafts')
    try { const r = await wechatApi.drafts(accountId); setDrafts(r.item ?? []) }
    catch (e: any) { toast(e?.message ?? '读取失败', 'error') }
    finally { setBusy('') }
  }
  useEffect(() => { if (open && tab === 'drafts' && accountId) void loadDrafts() }, [open, tab, accountId])

  return (
    <>
    <Modal open={open} onClose={() => close('publish')} title="发布到公众号" width={720}>
      <div className="flex gap-1 mb-3">
        {([['push', '推送草稿'], ['accounts', '账号管理'], ['drafts', '草稿箱']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`btn btn-sm ${tab === v ? 'bg-[#2C6BED] text-white' : 'btn-soft'}`}>{l}</button>
        ))}
      </div>

      {tab === 'push' && (
        <div className="space-y-3">
          <Field label="公众号">
            <div className="flex items-center gap-2">
              <Select value={accountId} onChange={setAccountId}
                options={accounts.length ? accounts.map((a) => ({ value: a.id, label: a.name })) : [{ value: '', label: '未配置账号' }]} />
              <button className="btn btn-soft btn-sm shrink-0" onClick={() => openAccounts('accounts')} title="管理公众号账号">
                <Settings2 size={13} /> 管理
              </button>
            </div>
          </Field>

          <Toggle value={syncImages} onChange={setSyncImages} label="同步正文图片到公众号" />

          <button className="btn btn-soft w-full" disabled={!accountId || !!busy} onClick={runDiagnose}>
            {busy === 'diag' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} 连接自检
          </button>

          {diag && (
            <div className="space-y-1">
              {diag.steps.map((s: any, i: number) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-black/[0.03] px-2.5 py-1.5">
                  {s.ok ? <CheckCircle2 size={13} className="text-[#1D9E75] shrink-0 mt-px" /> : <XCircle size={13} className="text-[#D64545] shrink-0 mt-px" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px]">{s.name}</div>
                    <div className="text-[10.5px] text-ink-text-3 break-all">{s.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-ink-line pt-3">
            <Field label="设置封面">
              <Toggle value={useCover} onChange={setUseCover} label="推送时设置封面" />
            </Field>
            {useCover && (
              <>
                <CoverAssetPicker value={coverAssetId} onChange={setCoverAssetId} />
                <button className="btn btn-soft btn-sm w-full mt-1.5" disabled={!coverAssetId || !!busy} onClick={uploadCover}>
                  {busy === 'cover' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} 上传封面到素材库
                </button>
                {thumbMediaId && (
                  <div className="text-[11px] text-[#1D9E75] mt-1 break-all">thumb_media_id: {thumbMediaId}</div>
                )}
              </>
            )}
          </div>

          <button className="btn btn-primary w-full h-9" disabled={!!busy} onClick={push}>
            {busy === 'push' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} 推送到草稿箱
          </button>
          <div className="text-[11px] text-ink-text-3 leading-relaxed">
            推送时会自动把正文里的本地图片上传到微信素材库并替换链接。
            草稿箱接口需要<strong>已认证</strong>的公众号，且服务器 IP 必须在「开发 → 基本配置 → IP 白名单」中。
          </div>
        </div>
      )}

      {tab === 'accounts' && (
        <div className="space-y-3">
          <div className="rounded-lg bg-[#EEF4FF] border border-[#D6E4FF] px-3 py-2.5 text-[12px] text-[#1F3A6E] leading-relaxed">
            在「公众号后台 → 设置与开发 → 基本配置」拿到 AppID 和 AppSecret，
            并把运行本工具的机器公网 IP 加进 IP 白名单，否则会报 40164。
          </div>
          <button className="btn btn-primary w-full" onClick={() => openAccounts('accounts')}>
            <Settings2 size={13} /> 打开账号管理器
          </button>
          <div className="text-[12px] text-ink-text-2">
            已配置 {accounts.length} 个账号{defaultId ? `，默认：${accounts.find((a: any) => a.id === defaultId)?.name ?? '（已删除）'}` : ''}。
          </div>
          <button className="btn btn-soft btn-sm w-full" onClick={refresh}>刷新列表</button>
        </div>
      )}

      {tab === 'drafts' && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <button className="btn btn-soft btn-sm" onClick={loadDrafts} disabled={!!busy}>
              {busy === 'drafts' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} 刷新
            </button>
            <div className="flex-1" />
            <input className="input w-[180px]" placeholder="预览微信号" value={wxName} onChange={(e) => setWxName(e.target.value)} />
          </div>
          {!drafts.length && <Empty text="草稿箱里还没有内容" />}
          {drafts.map((d: any) => (
            <div key={d.media_id} className="panel p-2.5 mb-1.5 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{d.content?.news_item?.[0]?.title ?? '（无标题）'}</div>
                <div className="text-[10.5px] text-ink-text-3">{new Date(d.update_time * 1000).toLocaleString()}</div>
              </div>
              <button className="btn btn-ghost btn-xs" title="发送到手机预览" onClick={async () => {
                if (!wxName) { toast('先填预览微信号（需在公众号白名单内）', 'error'); return }
                try { await wechatApi.preview(accountId, d.media_id, wxName); toast('预览已发送', 'success') }
                catch (e: any) { toast(e?.message ?? '发送失败', 'error') }
              }}><Smartphone size={12} /></button>
              <button className="btn btn-ghost btn-xs" onClick={async () => {
                try { await wechatApi.draftDelete(accountId, d.media_id); toast('已删除'); void loadDrafts() }
                catch (e: any) { toast(e?.message ?? '删除失败', 'error') }
              }}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </Modal>
      <AccountManager onChanged={refresh} />
    </>
  )
}

function CoverAssetPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [assets, setAssets] = useState<any[]>([])
  const openModal = useUI((s) => s.openModal)
  useEffect(() => { assetsApi.list('image').then((r) => setAssets(r.assets ?? [])).catch(() => {}) }, [])
  return (
    <div>
      <div className="grid grid-cols-5 gap-1.5 max-h-32 overflow-y-auto">
        {assets.map((a) => (
          <button key={a.id} onClick={() => onChange(a.id)}
            className={`aspect-square rounded-md overflow-hidden border-2 ${value === a.id ? 'border-[#2C6BED]' : 'border-transparent'}`}>
            <img src={a.url} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
      <button className="btn btn-ghost btn-xs mt-1" onClick={() => openModal('cover')}>或现场制作一张封面</button>
    </div>
  )
}

