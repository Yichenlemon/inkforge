import React, { useEffect, useRef, useState } from 'react'
import { Upload, Loader2, CheckCircle2, XCircle, AlertTriangle, Link as LinkIcon, FileJson } from 'lucide-react'
import type { LottieReport, LottieExportMode } from '../../shared/types.js'
import { mediaApi } from '../lib/api.js'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { Modal, toast, Segmented, Select, NumberInput, Field, Toggle, Spinner, Empty } from '../lib/ui.js'

export function LottieDialog() {
  const open = useUI((s) => s.modals.lottie)
  const close = useUI((s) => s.closeModal)
  const doc = useDoc((s) => s.doc)
  const selectedId = useUI((s) => s.selectedId)
  const insertBlocks = useDoc((s) => s.insertBlocks)
  const updateData = useDoc((s) => s.updateData)

  const [json, setJson] = useState<any>(null)
  const [name, setName] = useState('')
  const [report, setReport] = useState<LottieReport | null>(null)
  const [mode, setMode] = useState<LottieExportMode | 'auto'>('auto')
  const [width, setWidth] = useState(480)
  const [loop, setLoop] = useState(true)
  const [output, setOutput] = useState('')
  const [gifUrl, setGifUrl] = useState('')
  const [busy, setBusy] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const [urlInput, setUrlInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  /** 若已有 lottie 区块被选中，则进入编辑模式 */
  const targetBlock = doc.blocks.find((b) => b.id === selectedId && b.type === 'lottie')

  useEffect(() => {
    if (open && targetBlock) {
      setMode((targetBlock.data as any).mode ?? 'auto')
      setOutput((targetBlock.data as any).output ?? '')
      setGifUrl((targetBlock.data as any).gifUrl ?? '')
      setReport((targetBlock.data as any).report ?? null)
    }
  }, [open, selectedId])

  const readFile = async (file: File) => {
    setBusy('read')
    try {
      if (file.name.endsWith('.lottie') || file.name.endsWith('.zip')) {
        // .lottie 由服务端解压
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/convert/dotlottie', { method: 'POST', body: fd })
        const j = await res.json()
        if (!j.ok) throw new Error(j.message)
        setJson(j.json); setName(file.name); await probe(j.json)
      } else {
        const text = await file.text()
        const parsed = JSON.parse(text)
        setJson(parsed); setName(file.name); await probe(parsed)
      }
    } catch (e: any) {
      toast(e?.message ?? '解析失败，请确认是合法的 Lottie JSON', 'error')
    } finally { setBusy('') }
  }

  const probe = async (data: any) => {
    setBusy('probe')
    try {
      const r = await mediaApi.lottieProbe(data)
      setReport(r.report)
      setLogs([`检测到 ${r.report.layers} 个图层，${r.report.frames} 帧，${(r.report.durationMs / 1000).toFixed(2)}s`])
    } catch (e: any) { toast(e?.message ?? '探测失败', 'error') }
    finally { setBusy('') }
  }

  const convert = async () => {
    if (!json) { toast('先导入 Lottie 文件', 'error'); return }
    setBusy('convert')
    try {
      const r = await mediaApi.lottieConvert(json, mode, { width, loop })
      setOutput(r.output ?? '')
      setGifUrl(r.gifUrl ?? '')
      if (r.report) setReport(r.report)
      setLogs((l) => [...l, `已按 ${r.mode.toUpperCase()} 导出`, ...(r.warnings ?? [])])
      toast(`已转换为 ${r.mode.toUpperCase()}`, 'success')
    } catch (e: any) { toast(e?.message ?? '转换失败', 'error') }
    finally { setBusy('') }
  }

  const insert = () => {
    const idx = doc.blocks.findIndex((b) => b.id === selectedId)
    const block = {
      id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
      type: 'lottie' as const,
      data: {
        name: name || 'Lottie 动画',
        output,
        gifUrl,
        mode: (report?.suggested ?? 'frames') as LottieExportMode,
        report,
        width: report?.width ?? 400,
        height: report?.height ?? 400,
        loop,
      },
      style: { marginTop: 8, marginBottom: 16 },
    }
    if (targetBlock) updateData(targetBlock.id, block.data)
    else insertBlocks([block], idx >= 0 ? idx + 1 : undefined)
    toast('已插入 Lottie', 'success')
    close('lottie')
  }

  if (!open) return null

  return (
    <Modal open onClose={() => close('lottie')} title="Lottie 导入与转换" width={880} fullHeight>
      <div className="grid grid-cols-[1fr_340px] h-[64vh]">
        {/* 左：预览 */}
        <div className="flex flex-col border-r border-ink-line min-w-0">
          <div className="flex items-center gap-2 px-3 h-10 border-b border-ink-line shrink-0 flex-wrap">
            <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              <Upload size={12} /> 导入 .json / .lottie
            </button>
            <input ref={fileRef} type="file" accept=".json,.lottie,.zip" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = '' }} />
            <div className="flex items-center gap-1">
              <input className="input w-[220px]" placeholder="或粘贴 Lottie JSON 链接"
                value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
              <button className="btn btn-soft btn-sm" disabled={!urlInput || !!busy} onClick={async () => {
                setBusy('url')
                try {
                  const res = await fetch(urlInput)
                  if (!res.ok) throw new Error(`HTTP ${res.status}`)
                  const data = await res.json()
                  setJson(data); setName(urlInput.split('/').pop() ?? 'remote.json')
                  await probe(data)
                } catch (e: any) { toast(e?.message ?? '加载失败（注意跨域限制）', 'error') }
                finally { setBusy('') }
              }}><LinkIcon size={12} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-[#F7F7F5] flex items-center justify-center p-6 min-h-0">
            {busy ? <Spinner size={22} />
              : output
                ? <div className="max-w-[420px] bg-white rounded-lg border border-ink-line p-3" dangerouslySetInnerHTML={{ __html: output }} />
                : gifUrl
                  ? <img src={gifUrl} alt="" className="max-w-[360px] rounded-lg border border-ink-line" />
                  : <Empty text="导入 Lottie 后这里会显示转换结果" icon={<FileJson size={22} />} />}
          </div>

          {logs.length > 0 && (
            <div className="border-t border-ink-line px-3 py-2 max-h-24 overflow-y-auto shrink-0">
              {logs.map((l, i) => <div key={i} className="text-[11.5px] text-ink-text-2">· {l}</div>)}
            </div>
          )}
        </div>

        {/* 右：能力探测与导出设置 */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 px-3 h-10 border-b border-ink-line shrink-0">
            <span className="text-[12.5px] font-semibold flex-1">能力探测</span>
            <button className="btn btn-primary btn-sm" onClick={insert} disabled={!output && !gifUrl}>
              {targetBlock ? '更新' : '插入到文章'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {!report && (
              <div className="text-[12.5px] text-ink-text-3 leading-relaxed">
                支持 .json（bodymovin 导出）与 .lottie（zip 包）。
                <br /><br />
                导入后会先做能力探测，告诉你能走哪一级导出；不能走 SMIL 的会自动降级，不会让你导完才发现是静态图。
              </div>
            )}

            {report && (
              <>
                <div className="grid grid-cols-2 gap-1.5 mb-3">
                  <Stat label="尺寸" value={`${report.width}×${report.height}`} />
                  <Stat label="帧数" value={String(report.frames)} />
                  <Stat label="时长" value={`${(report.durationMs / 1000).toFixed(2)}s`} />
                  <Stat label="图层" value={String(report.layers)} />
                </div>

                <div className="section-title px-0 pt-0">降级路径</div>
                <CapabilityRow name="L1 · SMIL" desc="原生矢量动画，体积最小，可无损缩放"
                  ok={report.capability.smil} suggested={report.suggested === 'smil'} />
                <CapabilityRow name="L2 · 帧序列 SVG" desc="逐帧切换，保留全部视觉效果，体积随帧数增长"
                  ok={report.capability.frames} suggested={report.suggested === 'frames'} />
                <CapabilityRow name="L3 · GIF" desc="位图兜底，兼容性最好，注意 300 帧 / 10MB 上限"
                  ok={report.capability.gif} suggested={report.suggested === 'gif'} />

                {report.unsupported.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {report.unsupported.map((u, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[11.5px] text-[#B7791F] bg-[#FFF7E6] rounded px-2 py-1.5">
                        <AlertTriangle size={12} className="shrink-0 mt-px" />{u}
                      </div>
                    ))}
                  </div>
                )}

                {report.notes?.length > 0 && (
                  <>
                    <div className="section-title px-0">逐图层判定</div>
                    <div className="space-y-0.5 max-h-40 overflow-y-auto">
                      {report.notes.map((n, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[11px]">
                          {n.ok
                            ? <CheckCircle2 size={12} className="text-[#1D9E75] shrink-0 mt-px" />
                            : <XCircle size={12} className="text-[#D64545] shrink-0 mt-px" />}
                          <span className="flex-1 truncate text-ink-text-2">{n.layer}</span>
                          {!n.ok && <span className="text-ink-text-3 text-right">{n.reason}</span>}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="section-title px-0">导出设置</div>
                <Field label="方式">
                  <Select value={mode} onChange={(v) => setMode(v as any)}
                    options={[
                      { value: 'auto', label: `自动（建议 ${report.suggested.toUpperCase()}）` },
                      { value: 'smil', label: 'L1 · SMIL' },
                      { value: 'frames', label: 'L2 · 帧序列 SVG' },
                      { value: 'gif', label: 'L3 · GIF' },
                      { value: 'static', label: 'L4 · 静态首帧' },
                    ]} />
                </Field>
                <Field label="循环"><Toggle value={loop} onChange={setLoop} /></Field>
                {mode === 'gif' && (
                  <Field label="宽度" hint="GIF 有 300 帧 / 10MB 上限，超宽会明显增大体积">
                    <NumberInput value={width} onChange={(v) => setWidth(v ?? 480)} min={120} max={640} suffix="px" />
                  </Field>
                )}

                <button className="btn btn-primary w-full mt-2" onClick={convert} disabled={!!busy}>
                  {busy === 'convert' ? <Loader2 size={13} className="animate-spin" /> : null} 开始转换
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-line px-2 py-1.5">
      <div className="text-[10.5px] text-ink-text-3">{label}</div>
      <div className="text-[13px] font-medium">{value}</div>
    </div>
  )
}

function CapabilityRow({ name, desc, ok, suggested }: { name: string; desc: string; ok: boolean; suggested?: boolean }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg px-2.5 py-2 mb-1.5 ${
      suggested ? 'bg-[#1D9E75]/10' : ok ? 'bg-black/[0.03]' : 'bg-black/[0.02] opacity-70'}`}>
      {ok
        ? <CheckCircle2 size={13} className="text-[#1D9E75] shrink-0 mt-px" />
        : <XCircle size={13} className="text-ink-text-3 shrink-0 mt-px" />}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium">
          {name}{suggested && <span className="ml-1.5 chip bg-[#1D9E75] text-white">推荐</span>}
        </div>
        <div className="text-[10.5px] text-ink-text-3 leading-snug">{desc}</div>
      </div>
    </div>
  )
}
