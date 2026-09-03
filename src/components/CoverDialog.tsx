import React, { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { Download, Loader2, Type, Image as ImageIcon, Palette } from 'lucide-react'
import { assetsApi } from '../lib/api.js'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { Modal, toast, Field, ColorField, NumberInput, Segmented, Select, Slider, downloadBlob } from '../lib/ui.js'
import { ImagePicker } from './ImagePicker.jsx'

const RATIOS = [
  { value: '2.35', label: '2.35 : 1（首条封面）' },
  { value: '1', label: '1 : 1（次条封面）' },
  { value: '1.78', label: '16 : 9' },
]

export function CoverDialog() {
  const open = useUI((s) => s.modals.cover)
  const close = useUI((s) => s.closeModal)
  const doc = useDoc((s) => s.doc)
  const setMeta = useDoc((s) => s.setMeta)

  const [ratio, setRatio] = useState('2.35')
  const [title, setTitle] = useState(doc.title ?? '')
  const [subtitle, setSubtitle] = useState('')
  const [bgImage, setBgImage] = useState('')
  const [bgType, setBgType] = useState<'color' | 'gradient'>('gradient')
  const [bgColor, setBgColor] = useState('#2C6BED')
  const [bgColor2, setBgColor2] = useState('#7C5CFF')
  const [titleSize, setTitleSize] = useState(38)
  const [titleColor, setTitleColor] = useState('#FFFFFF')
  const [align, setAlign] = useState<'left' | 'center'>('left')
  const [dim, setDim] = useState(40)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const W = 900
  const H = Math.round(W / Number(ratio))

  const exportPng = async () => {
    if (!ref.current) return
    setBusy(true)
    try {
      const dataUrl = await toPng(ref.current, { pixelRatio: 2, cacheBust: true })
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], `cover-${Date.now()}.png`, { type: 'image/png' })
      const res = await assetsApi.upload(file)
      setMeta({ cover: res.asset.url })
      toast('封面已生成并设为文章封面', 'success')
      close('cover')
    } catch (e: any) { toast(e?.message ?? '生成失败', 'error') }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={() => close('cover')} title="制作封面" width={980} fullHeight>
      <div className="grid grid-cols-[1fr_320px] h-[60vh]">
        <div className="flex items-center justify-center bg-[#F0F0EE] p-5 overflow-auto min-w-0">
          <div ref={ref}
            className="relative overflow-hidden rounded-lg shadow-xl"
            style={{
              width: W, height: H,
              background: bgType === 'gradient'
                ? `linear-gradient(135deg, ${bgColor}, ${bgColor2})`
                : bgColor,
            }}>
            {bgImage && (
              <img src={bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )}
            {bgImage && <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${dim / 100})` }} />}
            <div className="relative h-full flex flex-col justify-end p-10"
              style={{ textAlign: align, alignItems: align === 'center' ? 'center' : 'flex-start' }}>
              <div style={{
                fontSize: titleSize, fontWeight: 800, color: titleColor,
                lineHeight: 1.25, maxWidth: '82%', letterSpacing: 1,
                textShadow: '0 2px 12px rgba(0,0,0,.18)',
              }}>
                {title || '封面标题'}
              </div>
              {subtitle && (
                <div style={{
                  fontSize: Math.round(titleSize * 0.42), color: titleColor,
                  opacity: .85, marginTop: 12, maxWidth: '82%', lineHeight: 1.5,
                }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-l border-ink-line overflow-y-auto p-3">
          <div className="section-title px-0 pt-0">尺寸</div>
          <Field label="比例">
            <Select value={ratio} onChange={setRatio} options={RATIOS} />
          </Field>
          <div className="text-[11px] text-ink-text-3 mb-2">输出 {W * 2} × {H * 2} px（2 倍图）</div>

          <div className="section-title px-0">背景</div>
          <Field label="类型">
            <Segmented value={bgType} onChange={setBgType}
              options={[{ value: 'gradient', label: '渐变' }, { value: 'color', label: '纯色' }]} />
          </Field>
          <Field label="主色"><ColorField value={bgColor} onChange={(v) => v && setBgColor(v)} allowEmpty={false} /></Field>
          {bgType === 'gradient' && (
            <Field label="副色"><ColorField value={bgColor2} onChange={(v) => v && setBgColor2(v)} allowEmpty={false} /></Field>
          )}
          <div className="py-1">
            <div className="label mb-1">底图</div>
            <ImagePicker value={bgImage} onChange={setBgImage} />
          </div>
          {bgImage && (
            <Field label="遮罩">
              <Slider value={dim} onChange={setDim} min={0} max={80} />
            </Field>
          )}

          <div className="section-title px-0">文字</div>
          <Field label="主标题">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="副标题">
            <input className="input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </Field>
          <Field label="字号">
            <NumberInput value={titleSize} onChange={(v) => setTitleSize(v ?? 38)} min={18} max={90} suffix="px" />
          </Field>
          <Field label="颜色"><ColorField value={titleColor} onChange={(v) => v && setTitleColor(v)} allowEmpty={false} /></Field>
          <Field label="对齐">
            <Segmented value={align} onChange={setAlign}
              options={[{ value: 'left', label: '左对齐' }, { value: 'center', label: '居中' }]} />
          </Field>

          <div className="flex gap-1.5 pt-3">
            <button className="btn btn-primary flex-1" onClick={exportPng} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} 生成并设为封面
            </button>
          </div>
          <button className="btn btn-soft w-full mt-1.5" disabled={busy} onClick={async () => {
            if (!ref.current) return
            setBusy(true)
            try {
              const dataUrl = await toPng(ref.current, { pixelRatio: 2 })
              const a = document.createElement('a')
              a.href = dataUrl
              a.download = `cover-${Date.now()}.png`
              a.click()
              toast('已下载', 'success')
            } finally { setBusy(false) }
          }}>仅下载 PNG</button>
        </div>
      </div>
    </Modal>
  )
}
