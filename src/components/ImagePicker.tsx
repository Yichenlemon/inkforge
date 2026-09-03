import React, { useRef, useState } from 'react'
import { Upload, Link as LinkIcon, Image as ImageIcon, X, Loader2 } from 'lucide-react'
import { assetsApi } from '../lib/api.js'
import { toast, Modal } from '../lib/ui.js'

interface Props {
  value?: string
  onChange: (url: string, meta?: { width?: number; height?: number; id?: string }) => void
  /** 方形裁剪展示（头像/封面） */
  square?: boolean
  hint?: string
}

export function ImagePicker({ value, onChange, square = false, hint }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [dragging, setDragging] = useState(false)

  const handleFile = async (file: File) => {
    if (!file) return
    if (!/^image\//.test(file.type)) { toast('请选择图片文件', 'error'); return }
    setBusy(true)
    try {
      const res = await assetsApi.upload(file)
      onChange(res.asset.url, { width: res.asset.width, height: res.asset.height, id: res.asset.id })
      toast('上传成功', 'success')
    } catch (e: any) {
      toast(e?.message ?? '上传失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files?.[0]
          if (f) handleFile(f)
        }}
        className={`relative rounded-lg border border-dashed overflow-hidden transition-colors ${
          dragging ? 'border-[#2C6BED] bg-[#2C6BED]/5' : 'border-ink-line-strong bg-black/[0.015]'
        } ${square ? 'aspect-square w-full' : 'w-full'}`}
      >
        {value ? (
          <div className="relative group">
            <img src={value} alt="" className={`w-full object-cover ${square ? 'aspect-square' : 'max-h-[180px]'}`} />
            <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
              <button className="btn btn-soft btn-sm bg-white/90" onClick={() => inputRef.current?.click()}>更换</button>
              <button className="btn btn-soft btn-sm bg-white/90" onClick={() => setUrlOpen(true)}>URL</button>
              <button className="btn btn-soft btn-sm bg-white/90" onClick={() => onChange('')}>移除</button>
            </div>
          </div>
        ) : (
          <button className="w-full flex flex-col items-center justify-center gap-1.5 py-6 text-ink-text-3 hover:text-ink-text-2"
            onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : square ? <ImageIcon size={18} /> : <Upload size={18} />}
            <span className="text-[12px]">点击上传或拖拽图片</span>
            {hint && <span className="text-[11px] text-ink-text-3">{hint}</span>}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-1.5">
        <input className="input flex-1" placeholder="或直接粘贴图片地址" value={value ?? ''}
          onChange={(e) => onChange(e.target.value)} />
        <button className="btn btn-soft btn-sm" title="抓取外链图片到服务器" onClick={() => setUrlOpen(true)}>
          <LinkIcon size={12} />
        </button>
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />

      <Modal open={urlOpen} onClose={() => setUrlOpen(false)} title="抓取外链图片" width={420}>
        <p className="text-[12.5px] text-ink-text-2 mb-3">
          公众号正文不接受外部图片链接，抓取后会把图片存到服务器，发布时再上传到微信素材库。
        </p>
        <input className="input" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn btn-soft" onClick={() => setUrlOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={async () => {
            if (!/^https?:\/\//.test(url)) { toast('请输入 http(s) 链接', 'error'); return }
            setBusy(true)
            try {
              const res = await assetsApi.fetchUrl(url)
              onChange(res.asset.url, { width: res.asset.width, height: res.asset.height, id: res.asset.id })
              setUrlOpen(false); setUrl('')
              toast('抓取成功', 'success')
            } catch (e: any) { toast(e?.message ?? '抓取失败', 'error') }
            finally { setBusy(false) }
          }}>抓取</button>
        </div>
      </Modal>
    </div>
  )
}

/** 多图选择（图组） */
export function MultiImagePicker({ values, onChange }: {
  values: { src: string; alt?: string; caption?: string }[]
  onChange: (v: { src: string; alt?: string; caption?: string }[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const addFiles = async (files: FileList) => {
    setBusy(true)
    const added: { src: string }[] = []
    try {
      for (const f of Array.from(files)) {
        if (!/^image\//.test(f.type)) continue
        const res = await assetsApi.upload(f)
        added.push({ src: res.asset.url })
      }
      onChange([...values, ...added])
      if (added.length) toast(`已添加 ${added.length} 张`, 'success')
    } catch (e: any) { toast(e?.message ?? '上传失败', 'error') }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {values.map((it, i) => (
          <div key={i} className="relative group rounded-md overflow-hidden border border-ink-line aspect-square bg-black/[0.02]">
            <img src={it.src} alt="" className="w-full h-full object-cover" />
            <button className="absolute top-1 right-1 w-5 h-5 rounded bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100"
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}>
              <X size={11} />
            </button>
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
              <input className="w-full bg-transparent text-white text-[11px] px-1.5 py-1 outline-none placeholder:text-white/60"
                placeholder="说明文字"
                value={it.caption ?? ''}
                onChange={(e) => {
                  const next = [...values]
                  next[i] = { ...next[i], caption: e.target.value }
                  onChange(next)
                }} />
            </div>
          </div>
        ))}
        <button className="aspect-square rounded-md border border-dashed border-ink-line-strong flex flex-col items-center justify-center gap-1 text-ink-text-3 hover:text-ink-text-2 hover:border-[#2C6BED]"
          onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          <span className="text-[11px]">添加</span>
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = '' }} />
    </div>
  )
}
