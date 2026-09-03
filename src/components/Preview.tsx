import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Smartphone, Monitor, RotateCcw, ZoomIn, ZoomOut, Copy, Check, RefreshCw, Loader2 } from 'lucide-react'
import { compileApi } from '../lib/api.js'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { Modal, toast, copyHtml, Spinner, Segmented } from '../lib/ui.js'

export function PreviewModal() {
  const open = useUI((s) => s.modals.export) // 占位，实际由 App 控制
  return null
}

export interface PreviewProps {
  html: string
  loading: boolean
  onReload: () => void
}

/** 手机 / 桌面预览。SMIL 的事件触发（touchstart/click）在 iframe 内原生生效，所以交互是"真的" */
export function Preview(props: PreviewProps) {
  const [device, setDevice] = useState<'phone' | 'desktop'>('phone')
  const [scale, setScale] = useState(1)
  const [darkSim, setDarkSim] = useState(false)
  const stripAnimation = useUI((s) => s.stripAnimation)
  const setStrip = useUI((s) => s.setStripAnimation)
  const title = useDoc((s) => s.doc?.title?.trim() || '微信公众号')
  const articleBackground = useDoc((s) => (s.doc?.meta as any)?.articleBackground as string | undefined)

  const docHtml = useMemo(() => {
    const body = props.html ?? ''
    // 深色模式模拟（壹伴「深色模式预览」对标）：页面反色 + 图片二次反色还原
    const darkCss = darkSim
      ? `body{background:#111 !important;} #page{filter:invert(1) hue-rotate(180deg);} #page img,#page video,#page iframe{filter:invert(1) hue-rotate(180deg);}`
      : ''
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>
  html,body{margin:0;padding:0;background:#fff;}
  body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',Arial,sans-serif;}
  #page{max-width:677px;margin:0 auto;padding:16px 16px 60px;overflow-x:hidden;${articleBackground ? `background:${articleBackground};` : ''}}
  img{max-width:100% !important;height:auto !important;}
  section{max-width:100% !important;}
  ::-webkit-scrollbar{width:0;height:0;}
  ${darkCss}
</style></head><body><div id="page">${body}</div></body></html>`
  }, [props.html, darkSim, articleBackground])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 h-10 border-b border-ink-line shrink-0 flex-wrap">
        <Segmented value={device} onChange={setDevice}
          options={[
            { value: 'phone', label: <span className="flex items-center gap-1"><Smartphone size={12} />手机</span> },
            { value: 'desktop', label: <span className="flex items-center gap-1"><Monitor size={12} />桌面</span> },
          ]} />
        <div className="flex items-center gap-0.5">
          <button className="btn btn-ghost btn-xs px-1" onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}><ZoomOut size={12} /></button>
          <span className="text-[11px] text-ink-text-3 w-8 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button className="btn btn-ghost btn-xs px-1" onClick={() => setScale((s) => Math.min(1.5, s + 0.1))}><ZoomIn size={12} /></button>
        </div>
        <button className="btn btn-ghost btn-xs px-1" onClick={() => setScale(1)} title="重置缩放"><RotateCcw size={12} /></button>
        <button className="btn btn-soft btn-sm" onClick={props.onReload}><RefreshCw size={12} /> 重新编译</button>
        <div className="flex-1" />
        <Toggle2 value={darkSim} onChange={setDarkSim} label="深色模式预览" />
        <Toggle2 value={stripAnimation} onChange={setStrip} label="关闭全部动效" />
      </div>

      <div className="flex-1 overflow-auto bg-[#F0F0EE] flex items-start justify-center p-4">
        {props.loading
          ? <div className="py-20"><Spinner size={22} /></div>
          : device === 'phone'
            ? (
              <div className="phone-frame" style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
                {/* 灵动岛：浮在状态栏上方，不再遮挡正文 */}
                <div className="phone-island" />

                {/* iOS 状态栏 */}
                <div className="phone-statusbar">
                  <span>9:41</span>
                  <span className="phone-status-right">
                    {/* 信号 */}
                    <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor" aria-hidden="true">
                      <rect x="0" y="7" width="3" height="4" rx="0.5" />
                      <rect x="4.5" y="5" width="3" height="6" rx="0.5" />
                      <rect x="9" y="2.5" width="3" height="8.5" rx="0.5" />
                      <rect x="13.5" y="0" width="3" height="11" rx="0.5" />
                    </svg>
                    {/* Wi-Fi */}
                    <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor" aria-hidden="true">
                      <path d="M7.5 0C4.6 0 1.9 1.1 0 2.9l1.4 1.5C2.9 3 5.1 2.1 7.5 2.1s4.6 0.9 6.1 2.3L15 2.9C13.1 1.1 10.4 0 7.5 0z" />
                      <path d="M7.5 4.1c-1.9 0-3.6 0.7-4.9 1.9L4 7.5c1-0.9 2.2-1.4 3.5-1.4s2.5 0.5 3.5 1.4l1.4-1.5C11.1 4.8 9.4 4.1 7.5 4.1z" />
                      <path d="M7.5 8.1c-0.8 0-1.6 0.3-2.1 0.9L7.5 11l2.1-2c-0.5-0.6-1.3-0.9-2.1-0.9z" />
                    </svg>
                    {/* 电池 */}
                    <svg width="27" height="12" viewBox="0 0 27 12" fill="none" aria-hidden="true">
                      <rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke="currentColor" strokeOpacity="0.4" />
                      <rect x="2" y="2" width="19" height="8" rx="1.5" fill="currentColor" />
                      <rect x="24" y="4" width="2" height="4" rx="1" fill="currentColor" fillOpacity="0.4" />
                    </svg>
                  </span>
                </div>

                {/* 公众号文章顶部栏 */}
                <div className="phone-wxbar">
                  <span className="phone-wx-back">‹</span>
                  <span className="phone-wx-title">{title}</span>
                  <span className="phone-wx-more">···</span>
                </div>

                {/* 正文 */}
                <iframe title="预览" srcDoc={docHtml} className="phone-content" sandbox="allow-same-origin" />

                {/* Home indicator */}
                <div className="phone-home-indicator" />
              </div>
            )
            : (
              <div className="bg-white rounded-lg shadow-lg overflow-hidden"
                style={{ width: 900 * scale, height: 1100 * scale, transformOrigin: 'top center' }}>
                <iframe title="预览" srcDoc={docHtml} className="w-full h-full border-0"
                  style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 900, height: 1100 }} sandbox="allow-same-origin" />
              </div>
            )}
      </div>
    </div>
  )
}

function Toggle2({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!value)} className="flex items-center gap-1.5">
      <span className={`w-8 h-[17px] rounded-full transition-colors relative ${value ? 'bg-[#D64545]' : 'bg-black/15'}`}>
        <span className={`absolute top-[2px] w-[13px] h-[13px] rounded-full bg-white shadow transition-all ${value ? 'left-[16px]' : 'left-[2px]'}`} />
      </span>
      <span className="text-[11.5px] text-ink-text-2">{label}</span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* 实时预览容器（供 App 使用）                                            */
/* ------------------------------------------------------------------ */

export function useCompiledPreview(): { html: string; loading: boolean; stats: any; diagnostics: any[]; reload: () => void } {
  const doc = useDoc((s) => s.doc)
  const stripAnimation = useUI((s) => s.stripAnimation)
  const [html, setHtml] = useState('')
  const [stats, setStats] = useState<any>(null)
  const [diagnostics, setDiagnostics] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)
  const timer = useRef<any>(null)

  useEffect(() => {
    setLoading(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const res = await compileApi.compile(doc, { stripAnimation, wrap: false, maxWidth: doc.articleWidth })
        setHtml(res.html)
        setStats(res.stats)
        setDiagnostics(res.diagnostics ?? [])
      } catch (e: any) {
        toast(e?.message ?? '编译失败', 'error')
      } finally {
        setLoading(false)
      }
    }, 500)
    return () => clearTimeout(timer.current)
  }, [doc, stripAnimation, nonce])

  return { html, loading, stats, diagnostics, reload: () => setNonce((n) => n + 1) }
}

/* ------------------------------------------------------------------ */
/* 诊断面板                                                             */
/* ------------------------------------------------------------------ */

export function DiagnosticsPanel({ diagnostics, stats, onJump }: {
  diagnostics: any[]
  stats?: any
  onJump?: (blockId: string) => void
}) {
  const errors = diagnostics.filter((d) => d.level === 'error')
  const warnings = diagnostics.filter((d) => d.level === 'warning')
  const infos = diagnostics.filter((d) => d.level === 'info')

  return (
    <div className="text-[12.5px]">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="chip bg-[#D64545]/12 text-[#D64545]">错误 {errors.length}</span>
        <span className="chip bg-[#E8A33D]/15 text-[#B7791F]">警告 {warnings.length}</span>
        <span className="chip bg-black/[0.06] text-ink-text-3">提示 {infos.length}</span>
        {stats && (
          <>
            <span className="flex-1" />
            <span className="text-[11px] text-ink-text-3">
              {formatSize(stats.bytes)} · {stats.blocks} 区块 · {stats.animations} 动效
            </span>
          </>
        )}
      </div>

      {!diagnostics.length && (
        <div className="flex items-center gap-2 text-[#1D9E75] py-2">
          <Check size={15} /> 没有发现问题，可以放心导出。
        </div>
      )}

      <div className="space-y-1 max-h-[46vh] overflow-y-auto">
        {[...errors, ...warnings, ...infos].map((d, i) => (
          <div key={i}
            className={`flex items-start gap-2 rounded-lg px-2.5 py-2 ${
              d.level === 'error' ? 'bg-[#D64545]/8' : d.level === 'warning' ? 'bg-[#E8A33D]/10' : 'bg-black/[0.03]'}`}>
            <span className={`mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full ${
              d.level === 'error' ? 'bg-[#D64545]' : d.level === 'warning' ? 'bg-[#E8A33D]' : 'bg-ink-text-3'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-ink-text leading-snug">{d.message}</div>
              <div className="text-[10.5px] text-ink-text-3 mt-0.5">规则 {d.rule}</div>
            </div>
            {d.blockId && onJump && (
              <button className="btn btn-ghost btn-xs shrink-0" onClick={() => onJump(d.blockId)}>定位</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const formatSize = (n: number) => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)}MB` : `${Math.round(n / 1024)}KB`
