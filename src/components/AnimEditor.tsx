import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus, Trash2, Play, Pause, RotateCcw, Wand2, ChevronRight, AlertTriangle,
} from 'lucide-react'
import type { AnimationIR, AnimTrack, AnimProperty, EasingName, SvgElementRef, TriggerKind, Easing } from '../../shared/types.js'
import { mediaApi } from '../lib/api.js'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { Modal, Field, NumberInput, Select, Segmented, toast, Spinner, useDebounced } from '../lib/ui.js'

const PROPERTIES: { value: AnimProperty; label: string; needsPath?: boolean }[] = [
  { value: 'translate', label: '位移' },
  { value: 'scale', label: '缩放' },
  { value: 'rotate', label: '旋转' },
  { value: 'opacity', label: '透明度' },
  { value: 'stroke-dashoffset', label: '路径描边' },
  { value: 'motion', label: '沿路径运动', needsPath: true },
  { value: 'morph', label: '形变（d）' },
  { value: 'fill', label: '填充色' },
  { value: 'stroke', label: '描边色' },
  { value: 'stroke-width', label: '描边粗细' },
  { value: 'width', label: '宽度' },
  { value: 'height', label: '高度' },
  { value: 'r', label: '半径' },
  { value: 'cx', label: '圆心 X' },
  { value: 'cy', label: '圆心 Y' },
]

const EASINGS: { value: EasingName; label: string }[] = [
  { value: 'linear', label: '线性' },
  { value: 'ease', label: '缓入缓出' },
  { value: 'ease-in', label: '缓入' },
  { value: 'ease-out', label: '缓出' },
  { value: 'ease-in-out', label: '标准' },
  { value: 'power2.out', label: '快出' },
  { value: 'power2.inOut', label: '平滑' },
  { value: 'back.out', label: '回弹' },
  { value: 'elastic.out', label: '弹性' },
  { value: 'bounce.out', label: '弹跳' },
]

const DEFAULT_VALUES: Partial<Record<AnimProperty, [string, string]>> = {
  translate: ['0 0', '100 0'],
  scale: ['1 1', '1.2 1.2'],
  rotate: ['0', '360'],
  opacity: ['1', '0'],
  'stroke-dashoffset': ['1', '0'],
  fill: ['#2C6BED', '#E8703A'],
  stroke: ['#2C6BED', '#E8703A'],
  'stroke-width': ['1', '6'],
  width: ['100', '160'],
  height: ['100', '60'],
  r: ['10', '40'],
  cx: ['50', '150'],
  cy: ['50', '150'],
  morph: ['', ''],
  motion: ['', ''],
}

export function AnimEditor() {
  const open = useUI((s) => s.modals.anim)
  const close = useUI((s) => s.closeModal)
  const doc = useDoc((s) => s.doc)
  const selectedId = useUI((s) => s.selectedId)
  const updateData = useDoc((s) => s.updateData)
  const select = useUI((s) => s.select)

  /** 找到当前操作的 SVG 区块：优先选中项，否则文章里最后一个 svg 块 */
  const svgBlock = useMemo(() => {
    const sel = doc.blocks.find((b) => b.id === selectedId && b.type === 'svg')
    if (sel) return sel
    return [...doc.blocks].reverse().find((b) => b.type === 'svg')
  }, [doc.blocks, selectedId])

  if (!open) return null
  if (!svgBlock) {
    return (
      <Modal open onClose={() => close('anim')} title="SVG 动效编辑器" width={520}>
        <div className="py-6 text-center text-[13px] text-ink-text-2">
          文章里还没有 SVG 区块。先在左侧「素材」插入一个插画，或导入自己的 SVG，再做动效。
        </div>
      </Modal>
    )
  }

  return (
    <AnimEditorInner
      key={svgBlock.id}
      blockId={svgBlock.id}
      svg={(svgBlock.data as any).svg}
      initial={(svgBlock.data as any).anim}
      onSave={(anim) => { updateData(svgBlock.id, { anim }); toast('动效已保存', 'success') }}
      onClose={() => close('anim')}
      onSelect={() => select(svgBlock.id)}
    />
  )
}

/* ------------------------------------------------------------------ */

function AnimEditorInner({ blockId, svg, initial, onSave, onClose, onSelect }: {
  blockId: string
  svg: string
  initial?: AnimationIR
  onSave: (anim: AnimationIR) => void
  onClose: () => void
  onSelect: () => void
}) {
  const [elements, setElements] = useState<SvgElementRef[]>([])
  const [anim, setAnim] = useState<AnimationIR>(() => initial ?? {
    duration: 2, loop: true, trigger: 'auto', tracks: [],
  })
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null)
  const [playing, setPlaying] = useState(true)
  const [preview, setPreview] = useState('')
  const [compiling, setCompiling] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [playKey, setPlayKey] = useState(0)
  const debounced = useDebounced(anim, 350)

  useEffect(() => { onSelect() }, [blockId])

  useEffect(() => {
    let alive = true
    mediaApi.svgElements(svg).then((r) => { if (alive) setElements(r.elements ?? [] as any) }).catch(() => {})
    return () => { alive = false }
  }, [svg])

  useEffect(() => {
    if (!anim.tracks.length) { setPreview(svg); setWarnings([]); return }
    let alive = true
    setCompiling(true)
    mediaApi.svgAnimate(svg, anim)
      .then((r) => { if (alive) { setPreview(r.svg); setWarnings(r.warnings ?? []) } })
      .catch(() => {})
      .finally(() => { if (alive) setCompiling(false) })
    return () => { alive = false }
  }, [debounced, svg, playKey])

  const patch = (p: Partial<AnimationIR>) => setAnim((a) => ({ ...a, ...p }))
  const patchTrack = (id: string, p: Partial<AnimTrack>) =>
    setAnim((a) => ({ ...a, tracks: a.tracks.map((t) => (t.id === id ? { ...t, ...p } : t)) }))

  const addTrack = () => {
    const el = elements[0]
    if (!el) { toast('SVG 里没有可动画的图形元素', 'error'); return }
    const prop: AnimProperty = 'translate'
    const [v0, v1] = DEFAULT_VALUES[prop] ?? ['0', '1']
    const track: AnimTrack = {
      id: Math.random().toString(36).slice(2, 9),
      target: el.ref,
      targetPath: el.path,
      property: prop,
      keyframes: [{ t: 0, value: v0 }, { t: 1, value: v1 }],
      easing: { type: 'preset', name: 'ease-in-out' },
      begin: 0,
      dur: anim.duration,
      repeat: 'indefinite',
      fill: 'freeze',
    }
    setAnim((a) => ({ ...a, tracks: [...a.tracks, track] }))
    setSelectedTrack(track.id)
  }

  const track = anim.tracks.find((t) => t.id === selectedTrack)
  const totalDur = Math.max(anim.duration, ...anim.tracks.map((t) => t.begin + t.dur), 0.1)

  return (
    <Modal open onClose={onClose} title="SVG 动效编辑器" width={1080} fullHeight>
      <div className="grid grid-cols-[1fr_360px] h-[68vh]">
        {/* 左：预览 + 时间轴 */}
        <div className="flex flex-col border-r border-ink-line min-w-0">
          <div className="flex items-center gap-2 px-3 h-10 border-b border-ink-line shrink-0">
            <button className="btn btn-soft btn-sm" onClick={() => { setPlayKey((k) => k + 1); setPlaying(true) }}>
              {playing ? <Pause size={12} /> : <Play size={12} />} {playing ? '重播' : '播放'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setPlayKey((k) => k + 1) }}>
              <RotateCcw size={12} /> 重启动画
            </button>
            <div className="flex-1" />
            {compiling && <Spinner />}
            <span className="text-[11px] text-ink-text-3">{anim.tracks.length} 条轨道 · {totalDur.toFixed(2)}s</span>
          </div>

          <div className="flex-1 overflow-auto bg-[#F7F7F5] flex items-center justify-center p-6 min-h-0">
            <div className="bg-white rounded-lg border border-ink-line p-4 max-w-full">
              <div key={playKey} className="max-w-[420px]" dangerouslySetInnerHTML={{ __html: preview || svg }} />
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="px-3 py-2 border-t border-ink-line bg-[#FFF7E6] shrink-0 max-h-20 overflow-y-auto">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11.5px] text-[#8A5A12]">
                  <AlertTriangle size={12} className="shrink-0 mt-px" />{w}
                </div>
              ))}
            </div>
          )}

          {/* 时间轴 */}
          <div className="border-t border-ink-line shrink-0">
            <div className="flex items-center gap-2 px-3 h-8 border-b border-ink-line">
              <span className="text-[11.5px] font-medium">时间轴</span>
              <div className="flex-1" />
              <button className="btn btn-soft btn-sm" onClick={addTrack}><Plus size={12} /> 添加轨道</button>
            </div>
            <div className="overflow-x-auto">
              <div style={{ minWidth: 640 }}>
                <div className="flex">
                  <div className="w-[190px] shrink-0 border-r border-ink-line" />
                  <div className="flex-1 anim-ruler relative">
                    {Array.from({ length: Math.ceil(totalDur) + 1 }, (_, i) => (
                      <span key={i} className="absolute top-0 text-[9.5px] text-ink-text-3 pl-0.5"
                        style={{ left: `${(i / totalDur) * 100}%` }}>{i}s</span>
                    ))}
                  </div>
                </div>
                {anim.tracks.length === 0 && (
                  <div className="py-6 text-center text-[12px] text-ink-text-3">还没有轨道，点「添加轨道」开始</div>
                )}
                {anim.tracks.map((t) => (
                  <TrackRow
                    key={t.id}
                    track={t}
                    totalDur={totalDur}
                    selected={selectedTrack === t.id}
                    onSelect={() => setSelectedTrack(t.id)}
                    onMoveBegin={(begin) => patchTrack(t.id, { begin: Math.max(0, begin) })}
                    onResizeDur={(dur) => patchTrack(t.id, { dur: Math.max(0.1, dur) })}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 右：属性 */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 px-3 h-10 border-b border-ink-line shrink-0">
            <span className="text-[12.5px] font-semibold flex-1">属性</span>
            <button className="btn btn-primary btn-sm" onClick={() => { onSave(anim); onClose() }}>
              <Wand2 size={12} /> 应用到文章
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <div className="section-title px-0 pt-0">全局</div>
            <Field label="触发">
              <Select value={anim.trigger} onChange={(v) => patch({ trigger: v as TriggerKind })}
                options={[
                  { value: 'auto', label: '自动播放' },
                  { value: 'click', label: '点击触发' },
                  { value: 'longpress', label: '长按触发' },
                ]} />
            </Field>
            <Field label="循环" hint={anim.trigger === 'auto' ? '自动播放时可无限循环' : '交互触发的动画只能播放指定次数'}>
              <div className="flex items-center gap-2">
                <Segmented value={anim.loop ? 'on' : 'off'} onChange={(v) => patch({ loop: v === 'on' })}
                  options={[{ value: 'on', label: '循环' }, { value: 'off', label: '单次' }]} />
              </div>
            </Field>
            <Field label="时长">
              <NumberInput value={anim.duration} onChange={(v) => patch({ duration: v ?? 1 })} min={0.1} max={60} step={0.1} suffix="s" />
            </Field>

            {track && (
              <>
                <div className="section-title px-0">轨道</div>
                <Field label="目标">
                  <Select value={track.target}
                    onChange={(v) => {
                      const el = elements.find((e) => e.ref === v)
                      if (el) patchTrack(track.id, { target: el.ref, targetPath: el.path })
                    }}
                    options={elements.map((e) => ({ value: e.ref, label: e.label }))} />
                </Field>
                <Field label="属性">
                  <Select value={track.property}
                    onChange={(v) => {
                      const prop = v as AnimProperty
                      const [a, b] = DEFAULT_VALUES[prop] ?? ['0', '1']
                      patchTrack(track.id, {
                        property: prop,
                        keyframes: [{ t: 0, value: a }, { t: 1, value: b }],
                      })
                    }}
                    options={PROPERTIES} />
                </Field>

                {track.property === 'motion' && (
                  <Field label="路径">
                    <Select value={elements.find((e) => samePath(e.path, track.pathRef ?? []))?.ref ?? ''}
                      onChange={(v) => {
                        const el = elements.find((e) => e.ref === v)
                        if (el) patchTrack(track.id, { pathRef: el.path })
                      }}
                      options={[
                        { value: '', label: '选择一条路径…' },
                        ...elements.filter((e) => e.tag === 'path').map((e) => ({ value: e.ref, label: e.label })),
                      ]} />
                  </Field>
                )}
                {track.property === 'motion' && (
                  <Field label="沿路径转向">
                    <Segmented value={track.rotateAlong ? 'on' : 'off'} onChange={(v) => patchTrack(track.id, { rotateAlong: v === 'on' })}
                      options={[{ value: 'on', label: '是' }, { value: 'off', label: '否' }]} />
                  </Field>
                )}

                <Field label="缓动">
                  <Select value={(track.easing.name ?? 'linear') as string}
                    onChange={(v) => patchTrack(track.id, { easing: { type: 'preset', name: v as EasingName } })}
                    options={EASINGS} />
                </Field>
                <Field label="开始">
                  <NumberInput value={track.begin} onChange={(v) => patchTrack(track.id, { begin: v ?? 0 })} min={0} max={60} step={0.1} suffix="s" />
                </Field>
                <Field label="时长">
                  <NumberInput value={track.dur} onChange={(v) => patchTrack(track.id, { dur: v ?? 1 })} min={0.1} max={60} step={0.1} suffix="s" />
                </Field>
                <Field label="重复" hint={anim.loop ? '' : '非循环动画填 1'}>
                  <Segmented value={track.repeat === 'indefinite' ? 'indefinite' : 'fixed'}
                    onChange={(v) => patchTrack(track.id, { repeat: v === 'indefinite' ? 'indefinite' : 1 })}
                    options={[{ value: 'indefinite', label: '无限' }, { value: 'fixed', label: '指定次数' }]} />
                </Field>
                {track.repeat !== 'indefinite' && (
                  <Field label="次数">
                    <NumberInput value={Number(track.repeat) || 1} onChange={(v) => patchTrack(track.id, { repeat: v ?? 1 })} min={1} max={999} />
                  </Field>
                )}

                <div className="section-title px-0">关键帧</div>
                {track.keyframes.map((kf, i) => (
                  <div key={i} className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[11px] text-ink-text-3 w-6 shrink-0">{i + 1}</span>
                    <div className="w-[70px] shrink-0">
                      <NumberInput value={kf.t} onChange={(v) => {
                        const next = [...track.keyframes]
                        next[i] = { ...next[i], t: Math.max(0, Math.min(1, v ?? 0)) }
                        patchTrack(track.id, { keyframes: next })
                      }} min={0} max={1} step={0.05} />
                    </div>
                    <input className="input flex-1" value={kf.value}
                      onChange={(e) => {
                        const next = [...track.keyframes]
                        next[i] = { ...next[i], value: e.target.value }
                        patchTrack(track.id, { keyframes: next })
                      }} />
                    <button className="btn btn-ghost btn-xs px-1"
                      disabled={track.keyframes.length <= 2}
                      onClick={() => patchTrack(track.id, { keyframes: track.keyframes.filter((_, idx) => idx !== i) })}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
                <button className="btn btn-soft btn-sm w-full" onClick={() => {
                  const last = track.keyframes[track.keyframes.length - 1]
                  patchTrack(track.id, {
                    keyframes: [...track.keyframes, { t: Math.min(1, (last?.t ?? 0) + 0.25), value: last?.value ?? '0' }],
                  })
                }}><Plus size={12} /> 添加关键帧</button>

                <button className="btn btn-ghost btn-sm w-full mt-2 text-[#D64545]"
                  onClick={() => {
                    setAnim((a) => ({ ...a, tracks: a.tracks.filter((t) => t.id !== track.id) }))
                    setSelectedTrack(null)
                  }}><Trash2 size={12} /> 删除这条轨道</button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* 时间轴轨道行                                                         */
/* ------------------------------------------------------------------ */

function TrackRow({ track, totalDur, selected, onSelect, onMoveBegin, onResizeDur }: {
  track: AnimTrack
  totalDur: number
  selected: boolean
  onSelect: () => void
  onMoveBegin: (begin: number) => void
  onResizeDur: (dur: number) => void
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ mode: 'move' | 'resize'; startX: number; startBegin: number; startDur: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const pct = (s: number) => `${Math.min(100, (s / totalDur) * 100)}%`

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      const el = barRef.current
      if (!d || !el) return
      const rect = el.parentElement!.getBoundingClientRect()
      const deltaSec = ((e.clientX - d.startX) / rect.width) * totalDur
      if (d.mode === 'move') onMoveBegin(Math.max(0, d.startBegin + deltaSec))
      else onResizeDur(Math.max(0.1, d.startDur + deltaSec))
    }
    const onUp = () => { dragRef.current = null; setDragging(false) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [totalDur, onMoveBegin, onResizeDur])

  return (
    <div className={`anim-track-row ${selected ? 'bg-[#2C6BED]/[0.06]' : ''}`} onClick={onSelect}>
      <div className="px-2.5 py-1.5 border-r border-ink-line min-w-0">
        <div className="text-[12px] truncate">{PROPERTIES.find((p) => p.value === track.property)?.label ?? track.property}</div>
        <div className="text-[10.5px] text-ink-text-3 truncate">{track.target}</div>
      </div>
      <div className="relative h-full min-h-[32px] px-1">
        <div ref={barRef}
          className={`absolute top-1.5 h-5 rounded flex items-center px-1.5 cursor-grab select-none ${
            selected ? 'bg-[#2C6BED]' : 'bg-[#2C6BED]/60'} ${dragging ? 'cursor-grabbing' : ''}`}
          style={{ left: pct(track.begin), width: `max(14px, ${pct(track.dur)})` }}
          onMouseDown={(e) => {
            e.stopPropagation()
            onSelect()
            dragRef.current = { mode: 'move', startX: e.clientX, startBegin: track.begin, startDur: track.dur }
            setDragging(true)
          }}>
          <span className="text-[10px] text-white truncate pointer-events-none">
            {track.dur.toFixed(1)}s{track.repeat === 'indefinite' ? ' ∞' : ''}
          </span>
        </div>
        {/* 右侧 resize 手柄 */}
        <div className="absolute top-1.5 w-1.5 h-5 cursor-col-resize"
          style={{ left: `calc(${pct(track.begin)} + max(14px, ${pct(track.dur)}) - 6px)` }}
          onMouseDown={(e) => {
            e.stopPropagation()
            dragRef.current = { mode: 'resize', startX: e.clientX, startBegin: track.begin, startDur: track.dur }
            setDragging(true)
          }} />
        {/* 关键帧标记 */}
        {track.keyframes.map((kf, i) => (
          <span key={i} className="absolute top-[26px] w-1.5 h-1.5 rounded-full bg-[#E8703A] -ml-0.5"
            style={{ left: `calc(${pct(track.begin)} + ${pct(track.dur)} * ${kf.t})` }} />
        ))}
      </div>
    </div>
  )
}

const samePath = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i])
