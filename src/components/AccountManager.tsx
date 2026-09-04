import React, { useEffect, useState } from 'react'
import {
  Plus, Pencil, Trash2, Star, RefreshCw, Loader2, CheckCircle2, XCircle,
  Smartphone,
} from 'lucide-react'
import { libraryApi, wechatApi } from '../lib/api.js'
import { useUI } from '../store/useUI.js'
import { Modal, toast, Field, Empty } from '../lib/ui.js'
import { getDefaultAccountId, setDefaultAccountId, clearDefaultAccountId } from '../lib/accountDefault.js'
import type { WechatAccount } from '../../shared/types.js'

interface BindStatus {
  ok: boolean
  message: string
  ts: number
}

function maskAppId(appId: string): string {
  if (!appId) return '—'
  const tail = appId.slice(-4)
  return `****${tail}`
}

/**
 * 真实的多公众号账号管理器。
 * - 列表展示：名称 / AppID 尾号 / 类型 / 是否默认 / 绑定状态（未知→未校验，诊断后变绑定/未绑定）
 * - 新增账号后立刻调用 wechatApi.diagnose 校验 token 可达性
 * - 行内编辑名称 / AppID / AppSecret
 * - 删除前二次确认，并清理该账号的草稿缓存、默认标记
 * - 「设为默认」写入 localStorage，发布面板据此选目标账号
 */
export default function AccountManager({ onChanged }: { onChanged?: () => void }) {
  const open = useUI((s) => s.modals.accounts)
  const close = useUI((s) => s.closeModal)

  const [accounts, setAccounts] = useState<WechatAccount[]>([])
  const [statuses, setStatuses] = useState<Record<string, BindStatus | undefined>>({})
  const [defaultId, setDefaultId] = useState('')

  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', appId: '', appSecret: '' })
  const [formErr, setFormErr] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', appId: '', appSecret: '' })
  const [editErr, setEditErr] = useState('')

  const load = async () => {
    try {
      const r: any = await libraryApi.accounts()
      setAccounts(r.accounts ?? [])
    } catch (e: any) {
      toast(e?.message ?? '读取账号失败', 'error')
    }
  }

  useEffect(() => {
    if (open) {
      setDefaultId(getDefaultAccountId())
      setAdding(false)
      setEditingId(null)
      void load()
    }
  }, [open])

  const notify = () => {
    try { onChanged?.() } catch { /* ignore */ }
  }

  const doDiagnose = async (id: string): Promise<boolean> => {
    setStatuses((p) => ({ ...p, [id]: undefined }))
    try {
      const r: any = await wechatApi.diagnose(id)
      const ok = !!r?.ok
      const msg = ok
        ? '连接正常'
        : (r?.steps?.find((s: any) => !s.ok)?.message || '连接失败')
      setStatuses((p) => ({ ...p, [id]: { ok, message: msg, ts: Date.now() } }))
      return ok
    } catch (e: any) {
      setStatuses((p) => ({
        ...p,
        [id]: { ok: false, message: e?.message ?? '检测失败', ts: Date.now() },
      }))
      return false
    }
  }

  const onAdd = async () => {
    setFormErr('')
    if (!form.appId.trim() || !form.appSecret.trim()) {
      setFormErr('AppID 和 AppSecret 不能为空')
      return
    }
    setBusy(true)
    try {
      const r: any = await libraryApi.addAccount(
        form.name.trim() || '未命名公众号',
        form.appId.trim(),
        form.appSecret,
      )
      const id: string = r.id
      toast('账号已添加，正在校验连接…', 'success')
      await doDiagnose(id)
      setForm({ name: '', appId: '', appSecret: '' })
      setAdding(false)
      await load()
      notify()
    } catch (e: any) {
      setFormErr(e?.message ?? '添加失败')
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (a: WechatAccount) => {
    setEditingId(a.id)
    setEditErr('')
    setEditForm({ name: a.name, appId: a.appId, appSecret: '' })
  }

  const onSaveEdit = async (id: string) => {
    setEditErr('')
    if (!editForm.appId.trim()) {
      setEditErr('AppID 不能为空')
      return
    }
    setBusy(true)
    try {
      await libraryApi.updateAccount(id, {
        name: editForm.name.trim() || '未命名公众号',
        appId: editForm.appId.trim(),
        appSecret: editForm.appSecret || undefined,
      })
      toast('已保存', 'success')
      setEditingId(null)
      await load()
      await doDiagnose(id)
      notify()
    } catch (e: any) {
      setEditErr(e?.message ?? '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (a: WechatAccount) => {
    if (!window.confirm(`确定删除账号「${a.name}」？该操作不可恢复，相关草稿缓存也会一并清除。`)) return
    setBusy(true)
    try {
      await libraryApi.delAccount(a.id)
      // 清理该账号的草稿缓存（本地容错缓存键）
      try { localStorage.removeItem(`inkforge.drafts.${a.id}`) } catch { /* ignore */ }
      if (defaultId === a.id) {
        setDefaultId('')
        clearDefaultAccountId()
      }
      setStatuses((p) => {
        const n = { ...p }
        delete n[a.id]
        return n
      })
      await load()
      notify()
      toast('已删除', 'success')
    } catch (e: any) {
      toast(e?.message ?? '删除失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const onSetDefault = (id: string) => {
    setDefaultId(id)
    setDefaultAccountId(id)
    notify()
    toast('已设为默认账号', 'success')
  }

  return (
    <Modal open={open} onClose={() => close('accounts')} title="公众号账号管理" width={640}>
      <div className="space-y-3">
        <div className="rounded-lg bg-[#EEF4FF] border border-[#D6E4FF] px-3 py-2.5 text-[12px] text-[#1F3A6E] leading-relaxed">
          在「公众号后台 → 设置与开发 → 基本配置」拿到 AppID 与 AppSecret，
          并把运行本工具的机器公网 IP 加入 IP 白名单，否则连接自检会报 40164。
        </div>

        <div className="flex items-center justify-between">
          <div className="text-[12px] text-ink-text-2">共 {accounts.length} 个账号</div>
          {!adding && (
            <button className="btn btn-primary btn-sm" onClick={() => { setForm({ name: '', appId: '', appSecret: '' }); setFormErr(''); setAdding(true) }}>
              <Plus size={13} /> 新增账号
            </button>
          )}
        </div>

        {adding && (
          <div className="panel p-3 space-y-1">
            <Field label="名称">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="我的公众号" />
            </Field>
            <Field label="AppID">
              <input className="input" value={form.appId} onChange={(e) => setForm({ ...form, appId: e.target.value })} placeholder="wx..." />
            </Field>
            <Field label="AppSecret">
              <input className="input" type="password" value={form.appSecret} onChange={(e) => setForm({ ...form, appSecret: e.target.value })} placeholder="AppSecret" />
            </Field>
            {formErr && <div className="text-[11.5px] text-[#D64545] pl-[84px]">{formErr}</div>}
            <div className="flex gap-2 pt-1">
              <button className="btn btn-primary btn-sm flex-1" disabled={busy} onClick={onAdd}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} 保存并校验
              </button>
              <button className="btn btn-soft btn-sm" disabled={busy} onClick={() => { setAdding(false); setFormErr('') }}>取消</button>
            </div>
          </div>
        )}

        {!accounts.length && !adding && <Empty text="还没有配置公众号账号" icon={<Smartphone size={26} /> } />}

        {accounts.map((a) => {
          const status = statuses[a.id]
          const isDefault = defaultId === a.id
          const editing = editingId === a.id
          return (
            <div key={a.id} className="panel p-3">
              {!editing ? (
                <>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13.5px] font-semibold text-ink-text truncate">{a.name}</span>
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-black/[0.05] text-ink-text-2">公众号</span>
                        {isDefault && (
                          <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-[#FFF4DD] text-[#9A6B00] font-medium">默认</span>
                        )}
                      </div>
                      <div className="text-[11px] text-ink-text-3 mt-0.5">AppID {maskAppId(a.appId)}</div>
                    </div>
                    {/* 绑定状态 */}
                    <div className="shrink-0 text-right">
                      {status === undefined ? (
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-black/[0.04] text-ink-text-3">未校验</span>
                      ) : status.ok ? (
                        <span className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded bg-[#E7F7F0] text-[#1D9E75] font-medium">
                          <CheckCircle2 size={11} /> 已绑定
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded bg-[#FDECEC] text-[#D64545] font-medium">
                          <XCircle size={11} /> 未绑定
                        </span>
                      )}
                    </div>
                  </div>

                  {status && !status.ok && (
                    <div className="text-[11px] text-[#D64545] mt-1 break-all">{status.message}</div>
                  )}

                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <button className="btn btn-soft btn-xs" disabled={busy} onClick={() => void doDiagnose(a.id)}>
                      {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} 校验连接
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => startEdit(a)}>
                      <Pencil size={12} /> 编辑
                    </button>
                    <button className="btn btn-ghost btn-xs" disabled={isDefault} onClick={() => onSetDefault(a.id)} title={isDefault ? '已是默认' : '设为默认'}>
                      <Star size={12} className={isDefault ? 'text-[#E0A200] fill-[#E0A200]' : ''} /> 设为默认
                    </button>
                    <button className="btn btn-ghost btn-xs text-[#D64545] hover:bg-[#FDECEC]" onClick={() => void onDelete(a)}>
                      <Trash2 size={12} /> 删除
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <div className="text-[12px] font-medium text-ink-text mb-1">编辑账号</div>
                  <Field label="名称">
                    <input className="input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  </Field>
                  <Field label="AppID">
                    <input className="input" value={editForm.appId} onChange={(e) => setEditForm({ ...editForm, appId: e.target.value })} />
                  </Field>
                  <Field label="AppSecret">
                    <input className="input" type="password" value={editForm.appSecret} onChange={(e) => setEditForm({ ...editForm, appSecret: e.target.value })} placeholder="留空则不修改" />
                  </Field>
                  {editErr && <div className="text-[11.5px] text-[#D64545] pl-[84px]">{editErr}</div>}
                  <div className="flex gap-2 pt-1">
                    <button className="btn btn-primary btn-sm flex-1" disabled={busy} onClick={() => void onSaveEdit(a.id)}>
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} 保存
                    </button>
                    <button className="btn btn-soft btn-sm" disabled={busy} onClick={() => { setEditingId(null); setEditErr('') }}>取消</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
