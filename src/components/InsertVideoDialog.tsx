import React, { useEffect, useRef, useState } from 'react'
import { Modal, Field, Segmented, toast } from '../lib/ui.js'
import { useUI } from '../store/useUI.js'
import { useDoc } from '../store/useDoc.js'
import { makeBlock } from '../../shared/types.js'

/** 从粘贴的腾讯视频 / 微信链接里尽量提取 vid */
function parseTencentVid(input: string): string | null {
  if (!input) return null
  try {
    const u = new URL(input)
    const v = u.searchParams.get('vid')
    if (v) return v
  } catch { /* 非 URL */ }
  const qm = input.match(/[?&]vid=([^&]+)/i)
  if (qm) return qm[1]
  const pm = input.match(/\/(?:page|cover|detail)\/([a-zA-Z0-9]+)/i)
  if (pm) return pm[1]
  if (/^[a-zA-Z0-9]+$/.test(input.trim())) return input.trim()
  return null
}

export default function InsertVideoDialog() {
  const open = useUI((s) => s.modals.insertVideo)
  const close = useUI((s) => s.closeModal)
  const [title, setTitle] = useState('')
  const [source, setSource] = useState<'upload' | 'tencent' | 'media'>('upload')
  const [src, setSrc] = useState('')
  const [poster, setPoster] = useState('')
  const [tencentVid, setTencentVid] = useState('')
  const [mediaId, setMediaId] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTitle(''); setSource('upload'); setSrc(''); setPoster('')
      setTencentVid(''); setMediaId('')
    }
  }, [open])

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setSrc(URL.createObjectURL(f))
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
    e.target.value = ''
  }

  const submit = () => {
    const data: any = { title: title || '视频' }
    if (source === 'upload') {
      data.src = src || undefined
      data.poster = poster || undefined
    } else if (source === 'tencent') {
      data.tencentVid = tencentVid || undefined
    } else {
      data.mediaId = mediaId || undefined
    }
    useDoc.getState().addBlock(makeBlock('video', data))
    close('insertVideo')
    toast('已插入视频', 'success')
  }

  return (
    <Modal open={open} onClose={() => close('insertVideo')} title="插入视频" width={560}>
      <div className="space-y-2">
        <Field label="标题">
          <input className="input" placeholder="视频标题" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="来源">
          <Segmented value={source} onChange={setSource} options={[
            { value: 'upload', label: '本地 MP4' },
            { value: 'tencent', label: '腾讯视频' },
            { value: 'media', label: '素材库' },
          ]} />
        </Field>

        {source === 'upload' && (
          <>
            <Field label="视频">
              <div className="flex items-center gap-2">
                <button className="btn btn-soft btn-sm" onClick={() => fileRef.current?.click()}>本地文件</button>
                <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={onFile} />
                <input className="input" placeholder="或填写视频地址（本地预览）" value={src} onChange={(e) => setSrc(e.target.value)} />
              </div>
            </Field>
            <Field label="海报">
              <input className="input" placeholder="海报图 URL" value={poster} onChange={(e) => setPoster(e.target.value)} />
            </Field>
          </>
        )}

        {source === 'tencent' && (
          <Field label="链接">
            <input className="input" placeholder="粘贴 v.qq.com / mp.weixin.qq.com 链接" value={tencentVid} onChange={(e) => setTencentVid(parseTencentVid(e.target.value) ?? e.target.value)} />
            <div className="text-[11px] text-ink-text-3 mt-0.5">自动提取 vid，导出为 &lt;mp-common-video&gt; 组件。</div>
          </Field>
        )}

        {source === 'media' && (
          <Field label="media_id">
            <input className="input" placeholder="微信素材 media_id" value={mediaId} onChange={(e) => setMediaId(e.target.value)} />
            <div className="text-[11px] text-ink-text-3 mt-0.5">导出前需在微信素材库上传并填 media_id。</div>
          </Field>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button className="btn btn-ghost btn-sm" onClick={() => close('insertVideo')}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={submit}>确定</button>
        </div>
      </div>
    </Modal>
  )
}
