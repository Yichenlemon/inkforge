import React, { useEffect, useRef, useState } from 'react'
import { Modal, Field, Segmented, NumberInput, toast } from '../lib/ui.js'
import { useUI } from '../store/useUI.js'
import { useDoc } from '../store/useDoc.js'
import { makeBlock } from '../../shared/types.js'

/** 从粘贴的 QQ音乐 分享链接里尽量提取歌曲 ID */
function parseQQSongId(input: string): string | null {
  if (!input) return null
  try {
    const u = new URL(input)
    const fromQuery = u.searchParams.get('songid') || u.searchParams.get('song_id') || u.searchParams.get('songmid')
    if (fromQuery) return fromQuery
    const m = input.match(/\/(?:songDetail|playsong|song)\/([^/?#]+)/i)
    if (m) return m[1]
  } catch {
    const m = input.match(/\/(?:songDetail|playsong|song)\/([^/?#]+)/i)
    if (m) return m[1]
    const qm = input.match(/[?&](?:songid|song_id|songmid)=([^&]+)/i)
    if (qm) return qm[1]
  }
  if (/^[0-9a-zA-Z]+$/.test(input.trim())) return input.trim()
  return null
}

export default function InsertAudioDialog() {
  const open = useUI((s) => s.modals.insertAudio)
  const close = useUI((s) => s.closeModal)
  const [title, setTitle] = useState('')
  const [source, setSource] = useState<'upload' | 'qqmusic'>('upload')
  const [src, setSrc] = useState('')
  const [cover, setCover] = useState('')
  const [duration, setDuration] = useState<number | undefined>()
  const [mediaId, setMediaId] = useState('')
  const [songName, setSongName] = useState('')
  const [singer, setSinger] = useState('')
  const [songId, setSongId] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTitle(''); setSource('upload'); setSrc(''); setCover(''); setDuration(undefined)
      setMediaId(''); setSongName(''); setSinger(''); setSongId(''); setCoverUrl('')
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
    const data: any = { title: title || '音频' }
    if (source === 'upload') {
      data.source = 'upload'
      data.src = src || undefined
      data.cover = cover || undefined
      data.duration = duration
      data.mediaId = mediaId || undefined
    } else {
      data.source = 'qqmusic'
      data.songName = songName || undefined
      data.singer = singer || undefined
      data.songId = songId || undefined
      data.coverUrl = coverUrl || undefined
    }
    useDoc.getState().addBlock(makeBlock('audio', data))
    close('insertAudio')
    toast('已插入音频', 'success')
  }

  return (
    <Modal open={open} onClose={() => close('insertAudio')} title="插入音频" width={560}>
      <div className="space-y-2">
        <Field label="标题">
          <input className="input" placeholder="音频标题" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="来源">
          <Segmented value={source} onChange={setSource} options={[
            { value: 'upload', label: '本地上传' },
            { value: 'qqmusic', label: 'QQ音乐' },
          ]} />
        </Field>

        {source === 'upload' && (
          <>
            <Field label="音频">
              <div className="flex items-center gap-2">
                <button className="btn btn-soft btn-sm" onClick={() => fileRef.current?.click()}>本地文件</button>
                <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onFile} />
                <input className="input" placeholder="或填写音频地址" value={src} onChange={(e) => setSrc(e.target.value)} />
              </div>
            </Field>
            <Field label="media_id">
              <input className="input" placeholder="微信素材 media_id" value={mediaId} onChange={(e) => setMediaId(e.target.value)} />
              <div className="text-[11px] text-ink-text-3 mt-0.5">导出前需在微信素材库上传并填 media_id。</div>
            </Field>
            <Field label="封面">
              <input className="input" placeholder="封面 URL" value={cover} onChange={(e) => setCover(e.target.value)} />
            </Field>
            <Field label="时长">
              <NumberInput value={duration} onChange={setDuration} suffix="秒" />
            </Field>
          </>
        )}

        {source === 'qqmusic' && (
          <>
            <Field label="歌名">
              <input className="input" placeholder="歌曲名" value={songName} onChange={(e) => setSongName(e.target.value)} />
            </Field>
            <Field label="歌手">
              <input className="input" placeholder="歌手" value={singer} onChange={(e) => setSinger(e.target.value)} />
            </Field>
            <Field label="ID/链接">
              <input className="input" placeholder="歌曲 ID 或粘贴 QQ音乐 分享链接" value={songId} onChange={(e) => setSongId(e.target.value)} />
              <div className="text-[11px] text-ink-text-3 mt-0.5">支持从 QQ音乐 分享链接自动提取歌曲 ID。</div>
            </Field>
            <Field label="封面">
              <input className="input" placeholder="封面 URL" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
            </Field>
          </>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button className="btn btn-ghost btn-sm" onClick={() => close('insertAudio')}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={submit}>确定</button>
        </div>
      </div>
    </Modal>
  )
}
