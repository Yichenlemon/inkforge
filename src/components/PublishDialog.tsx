import React, { useEffect, useRef, useState } from 'react'
import { Send, Loader2, CheckCircle2, XCircle, RefreshCw, Trash2, Plus, Upload, Smartphone } from 'lucide-react'
import { libraryApi, wechatApi, assetsApi } from '../lib/api.js'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { Modal, toast, Field, Toggle, Spinner, Empty, Select } from '../lib/ui.js'

export function PublishDialog() {
  const open = useUI((s) => s.modals.publish)
  const close = useUI((s) => s.closeModal)
  const doc = useDoc((s) => s.doc)
  const stripAnimation = useUI((s) => s.stripAnimation)
  const [tab, setTab] = useState<'push' | 'accounts' | 'drafts'>('push')
  const [accounts, setAccounts] = useState<any[]>([])
  const [accountId, setAccountId] = useState('')
  const [thumbMediaId, setThumbMediaId] = useState('')
  const [coverAssetId, setCoverAssetId] = useState('')
  const [diag, setDiag] = useState<any>(null)
  const [busy, setBusy] = useState('')
  const [drafts, setDrafts] = useState<any[]>([])
  const [wxName, setWxName] = useState('')
  const [useCover, setUseCover] = useState(true)

  const refresh = async () => {
    const r = await libraryApi.accounts()
    setAccounts(r.accounts ?? [])
    if (!accountId && r.accounts?.[0]) setAccountId(r.accounts[0].id)
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
      const r = await wechatApi.draft({
        accountId, doc, thumbMediaId: useCover ? thumbMediaId : '',
        title: doc.title, author: doc.meta?.author, digest: doc.meta?.digest,
        sourceUrl: doc.meta?.sourceUrl,
        needOpenComment: doc.meta?.needOpenComment,
        onlyFansCanComment: doc.meta?.onlyFansCanComment,
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
            <Select value={accountId} onChange={setAccountId}
              options={accounts.length ? accounts.map((a) => ({ value: a.id, label: a.name })) : [{ value: '', label: '未配置账号' }]} />
          </Field>

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

      {tab === 'accounts' && <AccountsTab onChanged={refresh} />}

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

function AccountsTab({ onChanged }: { onChanged: () => void }) {
  const [name, setName] = useState('')
  const [appId, setAppId] = useState('')
  const [secret, setSecret] = useState('')
  const [list, setList] = useState<any[]>([])
  const [busy, setBusy] = useState(false)

  const load = async () => { setList((await libraryApi.accounts()).accounts ?? []) }
  useEffect(() => { void load() }, [])

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-[#EEF4FF] border border-[#D6E4FF] px-3 py-2.5 text-[12px] text-[#1F3A6E] leading-relaxed">
        在「公众号后台 → 设置与开发 → 基本配置」拿到 AppID 和 AppSecret，
        并把运行本工具的机器公网 IP 加进 IP 白名单，否则会报 40164。
      </div>
      <Field label="名称"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="我的公众号" /></Field>
      <Field label="AppID"><input className="input" value={appId} onChange={(e) => setAppId(e.target.value)} /></Field>
      <Field label="AppSecret"><input className="input" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} /></Field>
      <button className="btn btn-primary w-full" disabled={busy || !appId || !secret} onClick={async () => {
        setBusy(true)
        try {
          await libraryApi.addAccount(name || '未命名公众号', appId, secret)
          setName(''); setAppId(''); setSecret('')
          await load(); onChanged()
          toast('已添加', 'success')
        } catch (e: any) { toast(e?.message ?? '添加失败', 'error') }
        finally { setBusy(false) }
      }}><Plus size={13} /> 添加账号</button>

      <div className="border-t border-ink-line pt-3">
        {!list.length && <Empty text="还没有配置账号" />}
        {list.map((a) => (
          <div key={a.id} className="panel p-2.5 mb-1.5 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium truncate">{a.name}</div>
              <div className="text-[10.5px] text-ink-text-3 truncate">{a.appId}</div>
            </div>
            <button className="btn btn-ghost btn-xs" onClick={async () => {
              await libraryApi.delAccount(a.id); await load(); onChanged(); toast('已删除')
            }}><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
