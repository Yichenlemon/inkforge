import React, { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Loader2, Sparkles, Wand2, AlertTriangle } from 'lucide-react'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { assetsApi } from '../lib/api.js'
import { Modal, Slider, Toggle, Field, toast } from '../lib/ui.js'

interface Params {
  brightness: number
  contrast: number
  saturation: number
  blur: number
  rotate: number
  hue: number
  grayscale: boolean
  negate: boolean
  removeBg: boolean
  tolerance: number
  feather: number
}

const DEFAULTS: Params = {
  brightness: 1, contrast: 1, saturation: 1, blur: 0, rotate: 0, hue: 0,
  grayscale: false, negate: false, removeBg: false, tolerance: 32, feather: 1,
}

function buildBody(p: Params, src: string): any {
  const b: any = { url: src }
  if (p.brightness !== 1) b.brightness = p.brightness
  if (p.contrast !== 1) b.contrast = p.contrast
  if (p.saturation !== 1) b.saturation = p.saturation
  if (p.blur !== 0) b.blur = p.blur
  if (p.rotate !== 0) b.rotate = p.rotate
  if (p.hue !== 0) b.hue = p.hue
  if (p.grayscale) b.grayscale = true
  if (p.negate) b.negate = true
  if (p.removeBg) { b.removeBg = true; b.tolerance = p.tolerance; b.feather = p.feather }
  return b
}

export function ImageEditor() {
  const open = useUI((s) => s.modals.imageEditor)
  const closeModal = useUI((s) => s.closeModal)
  const selectedId = useUI((s) => s.selectedId)
  const doc = useDoc((s) => s.doc)
  const updateData = useDoc((s) => s.updateData)

  const block = useMemo(
    () => (open && selectedId ? doc.blocks.find((b) => b.id === selectedId) : undefined),
    [open, selectedId, doc.blocks],
  )
  const isImage = block?.type === 'image'
  const src = isImage ? (block!.data as any).src as string : ''

  const [p, setP] = useState<Params>(DEFAULTS)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [applyBusy, setApplyBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reqId = useRef(0)
  const firstRef = useRef(true)

  // 打开时重置参数
  useEffect(() => {
    if (open) { setP(DEFAULTS); setPreview(null); setError(null); firstRef.current = true }
  }, [open])

  // 参数变化 → 防抖实时预览
  useEffect(() => {
    if (!open || !src) return
    if (firstRef.current) { firstRef.current = false; return }
    const id = ++reqId.current
    const t = setTimeout(async () => {
      setBusy(true); setError(null)
      try {
        const r = await assetsApi.preview({ ...buildBody(p, src), outputExt: 'png' })
        if (id === reqId.current) setPreview(r.dataUrl ?? null)
      } catch (e: any) {
        if (id === reqId.current) setError(e?.message ?? '预览失败')
      } finally {
        if (id === reqId.current) setBusy(false)
      }
    }, 220)
    return () => clearTimeout(t)
  }, [open, src, p])

  const apply = async () => {
    if (!block || !src) return
    setApplyBusy(true); setError(null)
    try {
      const outExt = p.removeBg ? 'png' : 'jpeg'
      const r = await assetsApi.process({ ...buildBody(p, src), outputExt: outExt, name: 'edited.png' })
      const asset = r.asset
      if (!asset?.url) throw new Error('处理失败，未返回图片')
      // 旋转已烘焙进图片，清掉原来的 CSS 旋转避免叠加
      updateData(block.id, { src: asset.url, width: asset.width, height: asset.height, rotate: 0 })
      toast('已应用到图片', 'success')
      closeModal('imageEditor')
    } catch (e: any) {
      setError(e?.message ?? '应用失败')
    } finally { setApplyBusy(false) }
  }

  const patch = (k: keyof Params, v: any) => setP((s) => ({ ...s, [k]: v }))
  const hasChanges = JSON.stringify(p) !== JSON.stringify(DEFAULTS)

  return (
    <Modal open={open} onClose={() => closeModal('imageEditor')} title="图片编辑" width={760}
      footer={
        <div className="flex items-center gap-2 w-full">
          {error && <span className="text-[12px] text-red-500 flex items-center gap-1 flex-1 truncate"><AlertTriangle size={13} />{error}</span>}
          <div className="flex-1" />
          <button className="btn btn-ghost btn-sm" onClick={() => setP(DEFAULTS)} disabled={!hasChanges}>重置</button>
          <button className="btn btn-primary btn-sm" onClick={apply} disabled={applyBusy || !src}>
            {applyBusy && <Loader2 size={13} className="animate-spin" />} 应用到区块
          </button>
        </div>
      }>
      {!isImage ? (
        <div className="py-10 text-center text-[13px] text-ink-text-3">请先在画布中选中一个图片区块，再打开图片编辑。</div>
      ) : (
        <div className="grid grid-cols-[1fr_220px] gap-4">
          {/* 预览区 */}
          <div className="min-w-0">
            <div className="relative rounded-lg border border-ink-line bg-[repeating-conic-gradient(#eee_0%_25%,#fafafa_0%_50%)] bg-[length:16px_16px] flex items-center justify-center overflow-hidden"
              style={{ minHeight: 260 }}>
              {busy && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
                  <Loader2 size={20} className="animate-spin text-ink-text-3" />
                </div>
              )}
              {preview ? (
                <img src={preview} alt="预览" className="max-w-full max-h-[50vh] object-contain" />
              ) : (
                <img src={src} alt="原图" className="max-w-full max-h-[50vh] object-contain" />
              )}
            </div>
            <div className="text-[11px] text-ink-text-3 mt-1.5 flex items-center gap-1.5">
              <Wand2 size={12} /> 左侧为实时预览（仅本地调整，未修改原文，点「应用到区块」才生效）
            </div>
          </div>

          {/* 控制区 */}
          <div className="overflow-y-auto max-h-[60vh] pr-1">
            <div className="section-title px-0 pt-0">基础</div>
            <Field label="亮度"><Slider value={p.brightness} onChange={(v) => patch('brightness', v)} min={0.2} max={2} step={0.02} /></Field>
            <Field label="对比度"><Slider value={p.contrast} onChange={(v) => patch('contrast', v)} min={0.5} max={2} step={0.02} /></Field>
            <Field label="饱和度"><Slider value={p.saturation} onChange={(v) => patch('saturation', v)} min={0} max={2} step={0.02} /></Field>
            <Field label="色相"><Slider value={p.hue} onChange={(v) => patch('hue', v)} min={0} max={360} step={1} /></Field>

            <div className="section-title px-0">变换</div>
            <Field label="旋转"><Slider value={p.rotate} onChange={(v) => patch('rotate', v)} min={-180} max={180} step={1} /></Field>
            <Field label="模糊"><Slider value={p.blur} onChange={(v) => patch('blur', v)} min={0} max={20} step={0.5} /></Field>

            <div className="section-title px-0">特效</div>
            <Field label="灰度"><Toggle value={p.grayscale} onChange={(v) => patch('grayscale', v)} /></Field>
            <Field label="反相"><Toggle value={p.negate} onChange={(v) => patch('negate', v)} /></Field>

            <div className="section-title px-0 flex items-center gap-1.5">
              <Sparkles size={12} /> 智能抠图
            </div>
            <Field label="去背景"><Toggle value={p.removeBg} onChange={(v) => patch('removeBg', v)} /></Field>
            {p.removeBg && (
              <>
                <Field label="容差"><Slider value={p.tolerance} onChange={(v) => patch('tolerance', v)} min={1} max={120} step={1} /></Field>
                <Field label="羽化"><Slider value={p.feather} onChange={(v) => patch('feather', v)} min={0} max={4} step={1} /></Field>
                <div className="text-[10.5px] text-ink-text-3 -mt-1 mb-1">对纯色 / 接近纯色的背景效果最好，输出透明 PNG。</div>
              </>
            )}

            {hasChanges && (
              <button className="btn btn-ghost btn-sm w-full mt-2" onClick={() => setP(DEFAULTS)}>
                <RotateCcw size={12} /> 还原全部参数
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
