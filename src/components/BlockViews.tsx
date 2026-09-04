import React, { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { css as cmCss } from '@codemirror/lang-css'
import { html as cmHtml } from '@codemirror/lang-html'
import { json as cmJson } from '@codemirror/lang-json'
import {
  Plus, Trash2, ArrowUp, ArrowDown, GripVertical, Copy, Eye, EyeOff, AlertTriangle,
  Wand2, Loader2, Table2, Settings2, Play, Pause, RefreshCw, Move, Download, Maximize2,
} from 'lucide-react'
import type { Block, ThemeTokens, RichTextData, TableData, TimelineData, StepsData, AccordionData, InteractiveData, CodeData, CardData, CalloutData, GalleryData, ColumnsData, QrcodeData, SvgData, LottieData, ButtonData, DividerData, VideoData, AudioData, HtmlData, ImageData, WechatEcoData, FrameData, FrameInlineItem } from '../../shared/types.js'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { RichEditor } from './RichEditor.jsx'
import { ImagePicker, MultiImagePicker } from './ImagePicker.jsx'
import { mediaApi, assetsApi, wechatApi } from '../lib/api.js'
import { toast, Field, NumberInput, Segmented, Select, Toggle, Slider, ColorField, Spinner, useDebounced, copyText } from '../lib/ui.js'
import { CALLOUT_COLORS } from './calloutColors.js'

/* ------------------------------------------------------------------ */
/* 基础                                                                 */
/* ------------------------------------------------------------------ */

export interface BlockViewProps<T = any> {
  block: Block
  data: T
  tokens: ThemeTokens
  readOnly?: boolean
}

function useUpdate(block: Block) {
  const updateData = useDoc((s) => s.updateData)
  return (patch: Record<string, any>) => updateData(block.id, patch)
}

const textStyle = (t: ThemeTokens, extra: React.CSSProperties = {}): React.CSSProperties => ({
  fontSize: t.fontSize,
  lineHeight: t.lineHeight,
  letterSpacing: t.letterSpacing,
  color: t.colorText,
  ...extra,
})

/* ------------------------------------------------------------------ */
/* 富文本类                                                             */
/* ------------------------------------------------------------------ */

export function ParagraphView({ block, data, tokens }: BlockViewProps<RichTextData>) {
  const up = useUpdate(block)
  return (
    <RichEditor
      html={data.html}
      onChange={(h) => up({ html: h })}
      placeholder="输入正文，回车换行"
      style={textStyle(tokens)}
      bubble
    />
  )
}

const HEADING_SIZE: Record<number, number> = { 1: 22, 2: 19, 3: 17, 4: 16 }

export function HeadingView({ block, data, tokens }: BlockViewProps<RichTextData>) {
  const up = useUpdate(block)
  const level = data.level ?? 2
  const variant = data.headingStyle ?? 'plain'
  const size = HEADING_SIZE[level]
  const base: React.CSSProperties = { fontSize: size, fontWeight: 700, color: tokens.headingColor, lineHeight: 1.4, letterSpacing: tokens.letterSpacing }

  if (variant === 'bar') {
    return (
      <div className="flex items-center gap-2.5">
        <span className="inline-block w-1 rounded-full shrink-0" style={{ height: size * 1.15, background: tokens.colorPrimary }} />
        <RichEditor html={data.html} onChange={(h) => up({ html: h })} style={base} singleLine bubble />
      </div>
    )
  }
  if (variant === 'underline') {
    return (
      <div>
        <RichEditor html={data.html} onChange={(h) => up({ html: h })} singleLine bubble
          style={{ ...base, borderBottom: `3px solid ${tokens.colorPrimary}`, paddingBottom: 4, display: 'inline-block' }} />
      </div>
    )
  }
  if (variant === 'bracket') {
    return (
      <div className="flex items-start gap-0.5" style={base}>
        <span style={{ color: tokens.colorPrimary }}>【</span>
        <RichEditor html={data.html} onChange={(h) => up({ html: h })} singleLine bubble style={{ flex: 1 }} />
        <span style={{ color: tokens.colorPrimary }}>】</span>
      </div>
    )
  }
  if (variant === 'number') {
    return (
      <div className="flex items-start gap-2.5">
        <span className="shrink-0 rounded flex items-center justify-center text-white font-bold"
          style={{ width: size * 1.5, height: size * 1.5, fontSize: size * 0.68, background: tokens.colorPrimary, lineHeight: 1 }}>
          1
        </span>
        <RichEditor html={data.html} onChange={(h) => up({ html: h })} singleLine bubble style={{ ...base, flex: 1 }} />
      </div>
    )
  }
  if (variant === 'background') {
    return (
      <div>
        <RichEditor html={data.html} onChange={(h) => up({ html: h })} singleLine bubble
          style={{ ...base, background: `linear-gradient(to top, ${tokens.colorPrimary}33 50%, transparent 50%)`, padding: '0 6px', display: 'inline-block' }} />
      </div>
    )
  }
  return <RichEditor html={data.html} onChange={(h) => up({ html: h })} singleLine bubble style={base} />
}

export function QuoteView({ block, data, tokens }: BlockViewProps<RichTextData>) {
  const up = useUpdate(block)
  const v = data.quoteStyle ?? 'bar'
  const inner = (
    <RichEditor html={data.html} onChange={(h) => up({ html: h })} bubble
      style={textStyle(tokens, { color: tokens.colorMuted })} />
  )
  if (v === 'card') {
    return <div className="rounded-lg px-4 py-3" style={{ background: tokens.colorSurface, borderRadius: tokens.radius }}>{inner}</div>
  }
  if (v === 'quote-mark') {
    return (
      <div className="text-center">
        <div className="text-[36px] leading-none opacity-30" style={{ color: tokens.colorPrimary }}>“</div>
        {inner}
      </div>
    )
  }
  if (v === 'minimal') {
    return <div className="pl-3" style={{ color: tokens.colorMuted, fontSize: tokens.fontSize - 1 }}>{inner}</div>
  }
  return <div className="pl-3.5" style={{ borderLeft: `3px solid ${tokens.colorPrimary}` }}>{inner}</div>
}

export function ListItemEditor({ html, onChange, ordered, index, tokens }: {
  html: string; onChange: (h: string) => void; ordered?: boolean; index: number; tokens: ThemeTokens
}) {
  return (
    <div className="flex items-start gap-1.5" style={textStyle(tokens)}>
      <span className="shrink-0 select-none" style={{ color: tokens.colorPrimary, minWidth: '1.3em', fontWeight: 600 }}>
        {ordered ? `${index + 1}.` : '•'}
      </span>
      <div className="flex-1 min-w-0">
        <RichEditor html={html} onChange={onChange} bubble placeholder="列表项" />
      </div>
    </div>
  )
}

export function ListView({ block, data, tokens }: BlockViewProps<RichTextData>) {
  const up = useUpdate(block)
  const [items, setItems] = useState<string[]>(() => splitItems(data.html))
  useEffect(() => { setItems(splitItems(data.html)) }, [data.html])

  const commit = (next: string[]) => {
    setItems(next)
    up({ html: next.map((s) => `<li>${s}</li>`).join('') })
  }

  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-1 group">
          <div className="flex-1 min-w-0">
            <ListItemEditor html={it} onChange={(h) => commit(items.map((x, idx) => (idx === i ? h : x)))}
              ordered={data.ordered} index={i} tokens={tokens} />
          </div>
          <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5">
            <button className="btn btn-ghost btn-xs px-1" title="上移"
              onClick={() => { if (i > 0) commit(swap(items, i, i - 1)) }}><ArrowUp size={11} /></button>
            <button className="btn btn-ghost btn-xs px-1" title="下移"
              onClick={() => { if (i < items.length - 1) commit(swap(items, i, i + 1)) }}><ArrowDown size={11} /></button>
            <button className="btn btn-ghost btn-xs px-1" title="删除"
              onClick={() => commit(items.filter((_, idx) => idx !== i))}><Trash2 size={11} /></button>
          </div>
        </div>
      ))}
      <button className="btn btn-soft btn-sm" onClick={() => commit([...items, ''])}>
        <Plus size={12} /> 添加一项
      </button>
    </div>
  )
}

const splitItems = (html: string): string[] => {
  const m = html.match(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)
  if (m?.length) return m.map((s) => s.replace(/^<li\b[^>]*>/i, '').replace(/<\/li>$/i, ''))
  return html ? [html] : ['']
}
const swap = <T,>(arr: T[], a: number, b: number): T[] => {
  const n = [...arr]; [n[a], n[b]] = [n[b], n[a]]; return n
}

/* ------------------------------------------------------------------ */
/* 图片 / 图组                                                          */
/* ------------------------------------------------------------------ */

export function ImageView({ block, data, tokens }: BlockViewProps<ImageData>) {
  const up = useUpdate(block)
  const selected = useUI((s) => s.selectedId === block.id)
  const begin = useDoc((s) => s.beginTransient)
  const live = useDoc((s) => s.updateLive)
  const end = useDoc((s) => s.endTransient)
  const wrapRef = useRef<HTMLDivElement>(null)
  const display = data.display ?? 'block'

  if (!data.src) {
    return <ImagePicker value={data.src} onChange={(src, meta) => up({ src, naturalWidth: meta?.width })} hint="支持 JPG / PNG / GIF / WebP" />
  }

  const width = data.width || (display === 'block' ? '100%' : '45%')
  const shadowMap: Record<string, string> = {
    sm: '0 1px 2px rgba(0,0,0,.06)', md: '0 4px 12px rgba(0,0,0,.08)',
    lg: '0 8px 24px rgba(0,0,0,.10)', xl: '0 16px 40px rgba(0,0,0,.14)',
  }
  const shadow = data.shadow && data.shadow !== 'none' ? shadowMap[data.shadow] : ''
  const border = data.borderWidth ? `${data.borderWidth}px solid ${data.borderColor ?? '#eee'}` : ''
  const transform = [data.flipX ? 'scaleX(-1)' : '', data.rotate ? `rotate(${data.rotate}deg)` : ''].filter(Boolean).join(' ') || undefined

  const imgStyle: React.CSSProperties = {
    width: '100%',
    display: 'block',
    borderRadius: data.radius ?? 0,
    boxShadow: shadow,
    border,
    transform,
    transformOrigin: 'center',
  }

  // 拖动右下角缩放 → 写入 width（百分比），拖拽过程中不进历史，松手记一步
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    const wrap = wrapRef.current; if (!wrap) return
    const parent = wrap.parentElement
    const containerW = parent ? parent.clientWidth : wrap.clientWidth
    const startW = wrap.getBoundingClientRect().width
    const startX = e.clientX
    let started = false
    const move = (ev: PointerEvent) => {
      if (!started) { started = true; begin() }
      const newPx = Math.max(24, Math.min(containerW, startW + (ev.clientX - startX)))
      const pct = Math.round((newPx / containerW) * 100)
      live(block.id, { width: `${pct}%` })
    }
    const upH = () => {
      if (started) end('缩放图片')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', upH)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', upH)
  }

  // 浮动模式拖动微调与正文的水平间距
  const startMove = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX
    const startM = data.floatMargin ?? 0
    let started = false
    const move = (ev: PointerEvent) => {
      if (!started) { started = true; begin() }
      const m = Math.max(-12, Math.min(140, startM + (ev.clientX - startX)))
      live(block.id, { floatMargin: Math.round(m) })
    }
    const upH = () => {
      if (started) end('调整图片间距')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', upH)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', upH)
  }

  return (
    <div ref={wrapRef} style={{ lineHeight: 0, position: 'relative' }}>
      <img src={data.src} alt={data.alt ?? ''} style={imgStyle} draggable={false} />
      {selected && (
        <>
          {display !== 'block' && (
            <span className="img-move-handle no-print" onPointerDown={startMove} title="拖动调整与正文的间距"><Move size={12} /></span>
          )}
          <span className="img-resize-handle no-print" onPointerDown={startResize} title="拖动缩放" />
        </>
      )}
      {selected ? (
        <div className="flex items-center gap-1.5 mt-2 no-print" style={{ lineHeight: 1.4 }}>
          <input className="input flex-1" placeholder="图片说明（可选）" value={data.caption ?? ''}
            onChange={(e) => up({ caption: e.target.value })} />
          <button className="btn btn-soft btn-sm" onClick={() => up({ src: '' })}>更换</button>
        </div>
      ) : data.caption ? (
        <div className="text-center text-[12px] mt-1" style={{ color: tokens.colorMuted, lineHeight: 1.6 }}>{data.caption}</div>
      ) : null}
    </div>
  )
}

export function WechatEcoView({ block, data, tokens }: BlockViewProps<WechatEcoData>) {
  const up = useUpdate(block)
  const [url, setUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const eco = data.ecoType ?? 'miniprogram'

  const buildSnippet = (d: WechatEcoData): string => {
    const e = d.ecoType ?? 'miniprogram'
    if (e === 'miniprogram') {
      return `<mp-miniprogram\n  data-miniprogram-appid="${d.appId || 'APPID'}"\n  data-miniprogram-path="${d.path || 'PAGE/PATH'}"\n  data-miniprogram-title="${d.title || '标题'}"\n  data-miniprogram-imageurl="${d.imageUrl || 'COVER_URL'}"\n  data-miniprogram-type="card"></mp-miniprogram>`
    }
    if (e === 'channels') return `<!-- 视频号：在公众号后台插入「视频号」组件，填入 feedId：${d.feedId || 'FINDER_FEED_ID'} -->`
    return `<!-- 微信小店：在公众号后台插入「微信小店」组件，填入商品 id：${d.productId || 'PRODUCT_ID'} -->`
  }

  const fetchFromUrl = async () => {
    if (!url.trim()) { toast('请先粘贴公众号文章链接'); return }
    setImporting(true)
    try {
      const r = await wechatApi.fetchArticle(url.trim())
      if (!r.ok || !r.components?.length) {
        toast(r.error ? `提取失败：${r.error}` : '未提取到生态组件，请手动填写。', 'error')
        return
      }
      const c = r.components.find((x: any) => x.type === 'miniprogram') ?? r.components[0]
      up({
        ecoType: c.type === 'channels' ? 'channels' : 'miniprogram',
        appId: c.appId, path: c.path, title: c.title, imageUrl: c.imageUrl, snippet: c.snippet,
      })
      toast('已从文章提取组件信息', 'success')
    } catch (e: any) {
      toast(`提取失败：${e?.message ?? e}`, 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="chip bg-[#2C6BED]/10 text-[#2C6BED]">微信生态组件</span>
        <span className="text-[11px] text-ink-text-3">需在公众号后台关联账号后渲染</span>
      </div>

      <Segmented value={eco} onChange={(v) => up({ ecoType: v })}
        options={[
          { value: 'miniprogram', label: '小程序' },
          { value: 'channels', label: '视频号' },
          { value: 'shop', label: '小店' },
        ]} />

      <div className="rounded-lg p-2 space-y-1.5" style={{ background: tokens.colorSurface, borderRadius: tokens.radius }}>
        <div className="flex gap-2">
          <div className="w-20 shrink-0">
            <ImagePicker value={data.imageUrl} onChange={(u) => up({ imageUrl: u })} square />
          </div>
          <div className="flex-1 space-y-1.5">
            <input className="input" placeholder="标题" value={data.title ?? ''} onChange={(e) => up({ title: e.target.value })} />
            {eco === 'miniprogram' && (
              <>
                <input className="input" placeholder="小程序 AppID" value={data.appId ?? ''} onChange={(e) => up({ appId: e.target.value })} />
                <input className="input" placeholder="跳转路径 pages/index/index" value={data.path ?? ''} onChange={(e) => up({ path: e.target.value })} />
              </>
            )}
            {eco === 'channels' && (
              <input className="input" placeholder="视频号 feedId" value={data.feedId ?? ''} onChange={(e) => up({ feedId: e.target.value })} />
            )}
            {eco === 'shop' && (
              <input className="input" placeholder="小店商品 id" value={data.productId ?? ''} onChange={(e) => up({ productId: e.target.value })} />
            )}
            <input className="input" placeholder="兜底跳转链接（可选）" value={data.url ?? ''} onChange={(e) => up({ url: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-ink-line p-2 space-y-1.5">
        <div className="text-[11px] font-medium text-ink-text-2">从公众号文章链接导入</div>
        <div className="flex gap-1.5">
          <input className="input flex-1" placeholder="粘贴已保存的公众号文章链接" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn btn-soft btn-sm" onClick={fetchFromUrl} disabled={importing}>
            {importing ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} 提取
          </button>
        </div>
        <div className="text-[10.5px] text-ink-text-3">秀米 / 135 等同行的真实做法：在公众号后台插入组件并保存文章，复制链接粘贴此处即可回填 appid / 路径 / 封面。</div>
      </div>

      <div className="rounded-lg border border-ink-line p-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium text-ink-text-2">可直接粘贴到公众号后台的组件代码</span>
          <button className="btn btn-ghost btn-xs" onClick={() => { copyText(buildSnippet(data)); toast('已复制组件代码') }}>复制</button>
        </div>
        <pre className="text-[10.5px] bg-black/[0.04] rounded p-2 whitespace-pre-wrap break-all text-ink-text-2">{buildSnippet(data)}</pre>
      </div>
    </div>
  )
}

export function GalleryView({ block, data, tokens }: BlockViewProps<GalleryData>) {
  const up = useUpdate(block)
  const imgs = data.images ?? []
  const cols = data.layout === 'grid2' ? 2 : data.layout === 'grid3' ? 3 : 1
  return (
    <div>
      <MultiImagePicker values={imgs} onChange={(v) => up({ images: v })} />
      {imgs.length > 0 && (
        <div className="mt-3 rounded-md overflow-hidden" style={{ background: tokens.colorSurface, padding: 6 }}>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {imgs.map((it, i) => <img key={i} src={it.src} alt="" className="w-full block rounded" style={{ borderRadius: data.radius ?? 6 }} />)}
          </div>
        </div>
      )}
      {data.layout === 'scroll' && imgs.length > 0 && (
        <div className="text-[11px] text-ink-text-3 mt-1.5">横向滑动：在手机上可左右拖动查看</div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 代码                                                                 */
/* ------------------------------------------------------------------ */

const LANG_EXT: Record<string, any> = {}

export function CodeView({ block, data, tokens }: BlockViewProps<CodeData>) {
  const up = useUpdate(block)
  const [langs, setLangs] = useState<string[]>([])
  const [themes, setThemes] = useState<string[]>([])
  const [preview, setPreview] = useState<string>('')
  const [editing, setEditing] = useState(false)
  const debounced = useDebounced(data, 400)

  useEffect(() => {
    mediaApi.codeMeta().then((r) => { setLangs(r.langs); setThemes(r.themes) }).catch(() => {})
  }, [])

  useEffect(() => {
    let alive = true
    mediaApi.highlight({
      code: debounced.code ?? '', lang: debounced.lang, theme: debounced.theme,
      showLineNumbers: debounced.showLineNumbers, highlight: debounced.highlight,
      diff: debounced.diff, scroll: debounced.scroll ?? true, title: debounced.title,
      startLine: debounced.startLine,
    }).then((r) => { if (alive) setPreview(r.html) }).catch(() => {})
    return () => { alive = false }
  }, [debounced])

  const lang = (data.lang ?? 'plaintext').toLowerCase()
  const ext = ['js', 'jsx', 'ts', 'tsx', 'json'].includes(lang) ? javascript({ typescript: lang.startsWith('ts') })
    : lang === 'css' || lang === 'scss' ? cmCss()
      : lang === 'html' || lang === 'vue' ? cmHtml()
        : lang === 'json' ? cmJson()
          : javascript()

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <Select value={data.lang ?? 'plaintext'} onChange={(v) => up({ lang: v })}
          options={(langs.length ? langs : ['plaintext']).map((l) => ({ value: l, label: l }))} />
        <Select value={data.theme ?? 'github-light'} onChange={(v) => up({ theme: v })}
          options={(themes.length ? themes : ['github-light']).map((l) => ({ value: l, label: l }))} />
        <input className="input w-[120px]" placeholder="标题（可选）" value={data.title ?? ''}
          onChange={(e) => up({ title: e.target.value })} />
        <input className="input w-[92px]" placeholder="高亮行 1,3-5" value={data.highlight ?? ''}
          onChange={(e) => up({ highlight: e.target.value })} />
        <div className="flex-1" />
        <button className="btn btn-soft btn-sm" onClick={() => setEditing((v) => !v)}>
          {editing ? '预览' : '编辑代码'}
        </button>
      </div>

      {editing ? (
        <div className="rounded-lg overflow-hidden border border-ink-line">
          <CodeMirror
            value={data.code ?? ''}
            height="auto"
            extensions={[ext]}
            onChange={(v) => up({ code: v })}
            basicSetup={{ lineNumbers: data.showLineNumbers ?? true, foldGutter: false, highlightActiveLine: false }}
          />
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden border border-ink-line"
          dangerouslySetInnerHTML={{ __html: preview || '<div style="padding:20px;text-align:center;color:#999;font-size:13px">渲染中…</div>' }} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 表格                                                                 */
/* ------------------------------------------------------------------ */

export function TableView({ block, data, tokens }: BlockViewProps<TableData>) {
  const up = useUpdate(block)
  const rows = data.rows ?? [['', '']]
  const cols = Math.max(...rows.map((r) => r.length), 1)

  const setCell = (r: number, c: number, v: string) => {
    const next = rows.map((row, ri) => {
      const copy = [...row]
      while (copy.length < cols) copy.push('')
      if (ri === r) copy[c] = v
      return copy
    })
    up({ rows: next })
  }
  const addRow = () => up({ rows: [...rows, Array.from({ length: cols }, () => '')] })
  const addCol = () => up({ rows: rows.map((r) => [...r, '']) })
  const delRow = (i: number) => up({ rows: rows.filter((_, idx) => idx !== i) })
  const delCol = (c: number) => up({ rows: rows.map((r) => r.filter((_, idx) => idx !== c)) })

  const headerBg = data.headerBg ?? tokens.colorSurface
  const borderColor = data.borderColor ?? tokens.colorBorder

  return (
    <div>
      <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${borderColor}` }}>
        <table className="table-editor w-full border-collapse" style={{ fontSize: 13 }}>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ background: data.header && ri === 0 ? headerBg : (data.zebra && ri % 2 === 1 ? (data.zebraColor ?? 'rgba(0,0,0,.02)') : undefined) }}>
                {Array.from({ length: cols }, (_, ci) => (
                  <td key={ci} style={{
                    border: data.borderMode === 'all' ? `1px solid ${borderColor}` : data.borderMode === 'horizontal' ? `border-bottom:1px solid ${borderColor}` : undefined,
                    textAlign: data.align?.[ci] ?? 'left',
                    fontWeight: data.header && ri === 0 ? 600 : undefined,
                    color: data.header && ri === 0 ? (data.headerColor ?? tokens.headingColor) : undefined,
                  }}>
                    <input value={row[ci] ?? ''} onChange={(e) => setCell(ri, ci, e.target.value)} placeholder={ri === 0 && data.header ? '表头' : ''} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <button className="btn btn-soft btn-sm" onClick={addRow}><Plus size={12} /> 行</button>
        <button className="btn btn-soft btn-sm" onClick={addCol}><Plus size={12} /> 列</button>
        <button className="btn btn-ghost btn-sm" onClick={() => delRow(rows.length - 1)} disabled={rows.length <= 1}>
          <Trash2 size={12} /> 末行
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => delCol(cols - 1)} disabled={cols <= 1}>
          <Trash2 size={12} /> 末列
        </button>
        <div className="flex-1" />
        <button className="btn btn-ghost btn-sm" title="清空内容" onClick={() => up({ rows: rows.map((r) => r.map(() => '')) })}>
          清空
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 分割线                                                               */
/* ------------------------------------------------------------------ */

export function DividerView({ block, data, tokens }: BlockViewProps<DividerData>) {
  const v = data.variant
  const color = data.color ?? tokens.colorBorder
  if (v === 'space') return <div className="text-center text-[11px] text-ink-text-3 py-2">空白间隔 {data.height ?? 24}px</div>
  if (v === 'symbol') {
    return <div className="text-center" style={{ color, letterSpacing: 4, fontSize: 13 }}>{data.symbol ?? '• • •'}</div>
  }
  if (v === 'gradient') {
    return <div className="w-full rounded" style={{
      height: data.height ?? 3,
      background: `linear-gradient(to right, transparent, ${tokens.colorPrimary}, transparent)`,
    }} />
  }
  const style = v === 'dashed' ? 'dashed' : v === 'dotted' ? 'dotted' : 'solid'
  return <div className="w-full" style={{ borderTop: `${data.height ?? 1}px ${style} ${color}` }} />
}

/* ------------------------------------------------------------------ */
/* 卡片 / 提示                                                          */
/* ------------------------------------------------------------------ */

export function CardView({ block, data, tokens }: BlockViewProps<CardData>) {
  const up = useUpdate(block)
  const variant = data.variant ?? 'plain'
  const box: React.CSSProperties = {
    padding: 16,
    borderRadius: tokens.radius,
    background: variant === 'plain' ? tokens.colorSurface : '#fff',
    border: variant === 'outline' ? `1px solid ${tokens.colorBorder}` : undefined,
    boxShadow: variant === 'shadow' ? '0 4px 12px rgba(0,0,0,.08)' : undefined,
    borderLeft: variant === 'accent' ? `4px solid ${tokens.colorPrimary}` : undefined,
  }
  return (
    <div style={box}>
      {data.imagePosition === 'top' && (
        <div className="mb-3"><ImagePicker value={data.imageUrl} onChange={(u) => up({ imageUrl: u })} /></div>
      )}
      <div className="flex gap-3" style={{ flexDirection: data.imagePosition === 'left' ? 'row' : data.imagePosition === 'right' ? 'row-reverse' : 'column' }}>
        {(data.imagePosition === 'left' || data.imagePosition === 'right') && (
          <div className="w-[36%] shrink-0"><ImagePicker value={data.imageUrl} onChange={(u) => up({ imageUrl: u })} square /></div>
        )}
        <div className="flex-1 min-w-0">
          <RichEditor html={data.title ?? ''} onChange={(h) => up({ title: h })} singleLine
            placeholder="卡片标题"
            style={{ fontSize: tokens.fontSize * 1.05, fontWeight: 600, color: tokens.headingColor, marginBottom: 6 }} />
          <RichEditor html={data.html ?? ''} onChange={(h) => up({ html: h })} bubble
            placeholder="卡片内容"
            style={textStyle(tokens)} />
          <RichEditor html={data.footer ?? ''} onChange={(h) => up({ footer: h })} singleLine
            placeholder="页脚（可选）"
            style={{ fontSize: 12, color: tokens.colorMuted, marginTop: 8 }} />
        </div>
      </div>
    </div>
  )
}

export function CalloutView({ block, data, tokens }: BlockViewProps<CalloutData>) {
  const up = useUpdate(block)
  const c = CALLOUT_COLORS[data.tone] ?? CALLOUT_COLORS.info
  const v = data.variant ?? 'card'
  const body = (
    <>
      <RichEditor html={data.title ?? ''} onChange={(h) => up({ title: h })} singleLine
        placeholder="标题（可选）"
        style={{ fontWeight: 600, color: c.fg, fontSize: tokens.fontSize, marginBottom: 4 }} />
      <RichEditor html={data.html ?? ''} onChange={(h) => up({ html: h })} bubble
        placeholder="提示内容" style={textStyle(tokens)} />
    </>
  )
  if (v === 'minimal') return <div style={{ borderLeft: `3px solid ${c.bar}`, paddingLeft: 10 }}>{body}</div>
  if (v === 'bar') return <div style={{ background: c.bg, borderLeft: `4px solid ${c.bar}`, padding: '10px 14px', borderRadius: 4 }}>{body}</div>
  return (
    <div style={{ background: c.bg, borderRadius: tokens.radius, padding: '12px 14px', display: 'flex', gap: 10 }}>
      <span className="shrink-0 flex items-center justify-center text-white font-bold rounded-full"
        style={{ width: 20, height: 20, fontSize: 12, background: c.bar }}>
        {data.icon ?? { info: 'i', success: '✓', warning: '!', danger: '✕', tip: '★' }[data.tone] ?? 'i'}
      </span>
      <div className="flex-1 min-w-0">{body}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 时间轴 / 步骤 / 折叠                                                  */
/* ------------------------------------------------------------------ */

export function TimelineView({ block, data, tokens }: BlockViewProps<TimelineData>) {
  const up = useUpdate(block)
  const items = data.items ?? []
  const set = (i: number, patch: any) => up({ items: items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) })
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="flex gap-2.5 mb-2.5 group">
          <div className="flex flex-col items-center shrink-0 pt-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: tokens.colorPrimary }} />
            {i < items.length - 1 && <span className="w-px flex-1 mt-1" style={{ background: tokens.colorBorder, minHeight: 20 }} />}
          </div>
          <div className="flex-1 min-w-0 rounded-lg px-3 py-2" style={{ background: tokens.colorSurface, borderRadius: tokens.radius }}>
            <input className="w-full text-[11px] bg-transparent outline-none mb-0.5" placeholder="时间"
              style={{ color: tokens.colorMuted }}
              value={it.time ?? ''} onChange={(e) => set(i, { time: e.target.value })} />
            <RichEditor html={it.title ?? ''} onChange={(h) => set(i, { title: h })} singleLine
              placeholder="标题"
              style={{ fontWeight: 600, color: tokens.headingColor, fontSize: tokens.fontSize }} />
            <RichEditor html={it.html ?? ''} onChange={(h) => set(i, { html: h })} bubble
              placeholder="说明"
              style={{ fontSize: tokens.fontSize - 1, color: tokens.colorText, lineHeight: tokens.lineHeight }} />
          </div>
          <button className="btn btn-ghost btn-xs px-1 opacity-0 group-hover:opacity-100 h-5"
            onClick={() => up({ items: items.filter((_, idx) => idx !== i) })}><Trash2 size={11} /></button>
        </div>
      ))}
      <button className="btn btn-soft btn-sm" onClick={() => up({ items: [...items, {}] })}><Plus size={12} /> 添加节点</button>
    </div>
  )
}

export function StepsView({ block, data, tokens }: BlockViewProps<StepsData>) {
  const up = useUpdate(block)
  const items = data.items ?? []
  const set = (i: number, patch: any) => up({ items: items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) })
  const v = data.variant ?? 'number'
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="flex gap-2.5 mb-2.5 group">
          <span className="shrink-0 flex items-center justify-center rounded-full text-white text-[11px] font-bold"
            style={{ width: 22, height: 22, background: tokens.colorPrimary }}>
            {v === 'check' ? '✓' : v === 'dot' ? '' : i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <RichEditor html={it.title ?? ''} onChange={(h) => set(i, { title: h })} singleLine placeholder="步骤标题"
              style={{ fontWeight: 600, color: tokens.headingColor, fontSize: tokens.fontSize }} />
            <RichEditor html={it.html ?? ''} onChange={(h) => set(i, { html: h })} bubble placeholder="说明"
              style={{ fontSize: tokens.fontSize - 1, color: tokens.colorText, lineHeight: tokens.lineHeight }} />
          </div>
          <button className="btn btn-ghost btn-xs px-1 opacity-0 group-hover:opacity-100 h-5"
            onClick={() => up({ items: items.filter((_, idx) => idx !== i) })}><Trash2 size={11} /></button>
        </div>
      ))}
      <button className="btn btn-soft btn-sm" onClick={() => up({ items: [...items, {}] })}><Plus size={12} /> 添加步骤</button>
    </div>
  )
}

export function AccordionView({ block, data, tokens }: BlockViewProps<AccordionData>) {
  const up = useUpdate(block)
  const items = data.items ?? []
  const set = (i: number, patch: any) => up({ items: items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) })
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="mb-2 rounded-lg group" style={{ background: tokens.colorSurface, borderRadius: tokens.radius }}>
          <div className="flex items-center gap-1.5 px-3 py-2">
            <span style={{ color: tokens.colorPrimary }}>▾</span>
            <div className="flex-1 min-w-0">
              <RichEditor html={it.title ?? ''} onChange={(h) => set(i, { title: h })} singleLine placeholder="标题"
                style={{ fontWeight: 600, color: tokens.headingColor, fontSize: tokens.fontSize }} />
            </div>
            <button className="btn btn-ghost btn-xs px-1 opacity-0 group-hover:opacity-100"
              onClick={() => up({ items: items.filter((_, idx) => idx !== i) })}><Trash2 size={11} /></button>
          </div>
          <div className="px-3 pb-2 -mt-1">
            <RichEditor html={it.html ?? ''} onChange={(h) => set(i, { html: h })} bubble placeholder="内容"
              style={{ fontSize: tokens.fontSize - 1, color: tokens.colorText, lineHeight: tokens.lineHeight }} />
          </div>
        </div>
      ))}
      <button className="btn btn-soft btn-sm" onClick={() => up({ items: [...items, { title: '', html: '' }] })}>
        <Plus size={12} /> 添加一项
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 按钮 / 视频 / 音频                                                    */
/* ------------------------------------------------------------------ */

export function ButtonView({ block, data, tokens }: BlockViewProps<ButtonData>) {
  const up = useUpdate(block)
  const size = data.size ?? 'md'
  const pad = { sm: '8px 16px', md: '11px 24px', lg: '14px 34px' }[size]
  const fs = { sm: 13, md: 15, lg: 17 }[size]
  const inner: React.CSSProperties = data.variant === 'outline' || data.variant === 'ghost'
    ? { background: 'transparent', color: tokens.colorPrimary, border: `1px solid ${tokens.colorPrimary}` }
    : data.variant === 'gradient'
      ? { backgroundImage: `linear-gradient(135deg, ${tokens.colorPrimary}, ${tokens.colorAccent})`, color: '#fff' }
      : { background: tokens.colorPrimary, color: '#fff' }
  return (
    <div className="text-center">
      <div className="inline-flex items-center" style={{ ...inner, padding: pad, fontSize: fs, borderRadius: Math.max(4, tokens.radius), fontWeight: 600 }}>
        <RichEditor html={data.text ?? ''} onChange={(h) => up({ text: h.replace(/<[^>]+>/g, '') })} singleLine
          placeholder="按钮文字" style={{ color: 'inherit' }} />
      </div>
      <div className="mt-2">
        <input className="input" placeholder="跳转链接（可选）" value={data.link ?? ''}
          onChange={(e) => up({ link: e.target.value })} />
      </div>
    </div>
  )
}

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

export function VideoView({ block, data, tokens }: BlockViewProps<VideoData>) {
  const up = useUpdate(block)
  const [source, setSource] = useState<'upload' | 'tencent' | 'media'>('upload')
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    up({ src: URL.createObjectURL(f), title: data.title || f.name.replace(/\.[^.]+$/, '') })
    e.target.value = ''
  }

  const onTencent = (raw: string) => up({ tencentVid: parseTencentVid(raw) ?? raw })

  return (
    <div className="space-y-2">
      {data.src && (
        <video controls poster={data.poster} src={data.src} className="w-full rounded-lg bg-black"
          style={{ borderRadius: tokens.radius }} />
      )}

      <Field label="标题">
        <input className="input" placeholder="视频标题" value={data.title ?? ''} onChange={(e) => up({ title: e.target.value })} />
      </Field>

      <Field label="来源">
        <Segmented value={source} onChange={setSource} options={[
          { value: 'upload', label: '本地 MP4' },
          { value: 'tencent', label: '腾讯视频' },
          { value: 'media', label: '素材库' },
        ]} />
      </Field>

      {source === 'upload' && (
        <Field label="视频">
          <div className="flex items-center gap-2">
            <button className="btn btn-soft btn-sm" onClick={() => fileRef.current?.click()}>本地文件</button>
            <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={onFile} />
            <input className="input" placeholder="或填写视频地址（本地预览）" value={data.src ?? ''} onChange={(e) => up({ src: e.target.value })} />
          </div>
        </Field>
      )}

      {source === 'tencent' && (
        <Field label="链接">
          <input className="input" placeholder="粘贴 v.qq.com / mp.weixin.qq.com 链接" value={data.tencentVid ?? ''} onChange={(e) => onTencent(e.target.value)} />
          <div className="text-[11px] text-ink-text-3 mt-0.5">自动提取 vid，导出为 &lt;mp-common-video&gt; 组件。</div>
        </Field>
      )}

      {source === 'media' && (
        <Field label="media_id">
          <input className="input" placeholder="微信素材 media_id" value={data.mediaId ?? ''} onChange={(e) => up({ mediaId: e.target.value })} />
          <div className="text-[11px] text-ink-text-3 mt-0.5">导出前需在微信素材库上传并填 media_id。</div>
        </Field>
      )}

      <Field label="海报">
        <input className="input" placeholder="海报图 URL" value={data.poster ?? ''} onChange={(e) => up({ poster: e.target.value })} />
      </Field>
    </div>
  )
}

export function AudioView({ block, data, tokens }: BlockViewProps<AudioData>) {
  const up = useUpdate(block)
  const [source, setSource] = useState<'upload' | 'qqmusic'>(data.source ?? 'upload')
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    up({ src: URL.createObjectURL(f), title: data.title || f.name.replace(/\.[^.]+$/, ''), source: 'upload' })
    e.target.value = ''
  }

  const onQQ = (raw: string) => up({ songId: parseQQSongId(raw) ?? raw })

  return (
    <div className="space-y-2">
      {data.src && <audio controls src={data.src} className="w-full" />}

      <Field label="标题">
        <input className="input" placeholder="音频标题" value={data.title ?? ''} onChange={(e) => up({ title: e.target.value })} />
      </Field>

      <Field label="来源">
        <Segmented value={source} onChange={(v) => { setSource(v); up({ source: v }) }} options={[
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
              <input className="input" placeholder="或填写音频地址" value={data.src ?? ''} onChange={(e) => up({ src: e.target.value })} />
            </div>
          </Field>
          <Field label="media_id">
            <input className="input" placeholder="微信素材 media_id" value={data.mediaId ?? ''} onChange={(e) => up({ mediaId: e.target.value })} />
            <div className="text-[11px] text-ink-text-3 mt-0.5">导出前需在微信素材库上传并填 media_id。</div>
          </Field>
          <Field label="封面">
            <input className="input" placeholder="封面 URL" value={data.cover ?? ''} onChange={(e) => up({ cover: e.target.value })} />
          </Field>
          <Field label="时长">
            <NumberInput value={data.duration} onChange={(v) => up({ duration: v })} suffix="秒" />
          </Field>
        </>
      )}

      {source === 'qqmusic' && (
        <>
          <Field label="歌名">
            <input className="input" placeholder="歌曲名" value={data.songName ?? ''} onChange={(e) => up({ songName: e.target.value })} />
          </Field>
          <Field label="歌手">
            <input className="input" placeholder="歌手" value={data.singer ?? ''} onChange={(e) => up({ singer: e.target.value })} />
          </Field>
          <Field label="ID/链接">
            <input className="input" placeholder="歌曲 ID 或粘贴 QQ音乐 分享链接" value={data.songId ?? ''} onChange={(e) => onQQ(e.target.value)} />
            <div className="text-[11px] text-ink-text-3 mt-0.5">支持从 QQ音乐 分享链接自动提取歌曲 ID。</div>
          </Field>
          <Field label="封面">
            <input className="input" placeholder="封面 URL" value={data.coverUrl ?? ''} onChange={(e) => up({ coverUrl: e.target.value })} />
          </Field>
          {data.coverUrl && (
            <div className="flex items-center gap-3 rounded-lg p-3" style={{ background: tokens.colorSurface, borderRadius: tokens.radius }}>
              <img src={data.coverUrl} alt="" className="w-14 h-14 rounded object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{data.songName || '未知歌曲'}</div>
                <div className="text-[11px] text-ink-text-3 truncate">{data.singer || '未知歌手'}</div>
              </div>
              <button className="btn btn-soft btn-sm shrink-0" title="播放" onClick={() => toast('需在公众号后台播放（QQ音乐）', 'info')}><Play size={14} /></button>
            </div>
          )}
          <div className="text-[11px] text-ink-text-3">需在公众号后台播放（QQ音乐），此处仅作静态展示。</div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 二维码                                                               */
/* ------------------------------------------------------------------ */

export function QrcodeView({ block, data, tokens }: BlockViewProps<QrcodeData>) {
  const up = useUpdate(block)
  const [url, setUrl] = useState('')
  const debouncedContent = useDebounced(data.content, 400)
  const debouncedSize = useDebounced(data.size ?? 220, 400)

  useEffect(() => {
    let alive = true
    if (!debouncedContent) { setUrl(''); return }
    mediaApi.qrcode(debouncedContent, debouncedSize, data.fg, data.bg)
      .then((r) => { if (alive) setUrl(r.dataUrl) })
      .catch(() => {})
    return () => { alive = false }
  }, [debouncedContent, debouncedSize, data.fg, data.bg])

  return (
    <div className="text-center">
      {url
        ? <img src={url} alt="" style={{ width: data.size ?? 220, height: 'auto', display: 'inline-block' }} />
        : <div className="py-8 text-ink-text-3 text-[12px]">输入内容后生成二维码</div>}
      <div className="mt-2 space-y-1.5 text-left">
        <input className="input" placeholder="二维码内容（链接或文字）" value={data.content ?? ''}
          onChange={(e) => up({ content: e.target.value })} />
        <div className="flex gap-1.5">
          <input className="input flex-1" placeholder="主标题" value={data.label ?? ''} onChange={(e) => up({ label: e.target.value })} />
          <input className="input flex-1" placeholder="副标题" value={data.caption ?? ''} onChange={(e) => up({ caption: e.target.value })} />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* SVG / Lottie                                                        */
/* ------------------------------------------------------------------ */

export function SvgView({ block, data, tokens }: BlockViewProps<SvgData>) {
  const up = useUpdate(block)
  const openModal = useUI((s) => s.openModal)
  const strip = useUI((s) => s.stripAnimation)
  const [rendered, setRendered] = useState(data.svg)

  useEffect(() => {
    let alive = true
    if (!data.svg) { setRendered(''); return }
    if (data.anim?.tracks?.length) {
      mediaApi.svgAnimate(data.svg, data.anim).then((r) => { if (alive) setRendered(strip ? data.svg : r.svg) }).catch(() => setRendered(data.svg))
    } else {
      setRendered(data.svg)
    }
    return () => { alive = false }
  }, [data.svg, data.anim, strip])

  if (!data.svg) {
    return (
      <div className="text-center py-6">
        <button className="btn btn-primary btn-sm" onClick={() => openModal('import')}>导入 SVG</button>
      </div>
    )
  }

  return (
    <div>
      <div className="rounded-lg border border-ink-line overflow-hidden bg-white py-2 px-2 text-center max-h-48 flex items-center justify-center"
        dangerouslySetInnerHTML={{ __html: rendered }} />
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className="chip bg-black/[0.05] text-ink-text-3">{(data.bytes ?? data.svg.length)} B</span>
        {data.anim?.tracks?.length ? <span className="chip bg-[#2C6BED]/10 text-[#2C6BED]">{data.anim.tracks.length} 条动效</span> : null}
        <div className="flex-1" />
        <button className="btn btn-soft btn-sm" onClick={() => openModal('anim')}>
          <Wand2 size={12} /> 动效编辑
        </button>
      </div>
    </div>
  )
}

export function LottieView({ block, data, tokens }: BlockViewProps<LottieData>) {
  const up = useUpdate(block)
  const openModal = useUI((s) => s.openModal)
  if (!data.output && !data.gifUrl) {
    return (
      <div className="text-center py-6">
        <button className="btn btn-primary btn-sm" onClick={() => openModal('lottie')}>导入 Lottie</button>
      </div>
    )
  }
  return (
    <div>
      {data.mode === 'gif' && data.gifUrl
        ? <img src={data.gifUrl} alt="" className="w-full block rounded-lg" style={{ background: '#f6f6f6' }} />
        : <div className="rounded-lg border border-ink-line overflow-hidden bg-white p-2 text-center"
          dangerouslySetInnerHTML={{ __html: data.output ?? '' }} />}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className="chip bg-black/[0.05] text-ink-text-3">{data.mode.toUpperCase()}</span>
        <span className="chip bg-black/[0.05] text-ink-text-3">{data.report?.frames ?? 0} 帧</span>
        <div className="flex-1" />
        <button className="btn btn-soft btn-sm" onClick={() => openModal('lottie')}><Settings2 size={12} /> 重新转换</button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 交互                                                                 */
/* ------------------------------------------------------------------ */

const IX_LABEL: Record<string, string> = {
  slider: '横向滑动', 'click-reveal': '点击揭晓', scratch: '刮刮卡',
  longpress: '长按查看', flip: '点击翻牌', 'accordion-click': '点击展开', tab: '点击切换',
  carousel: '图片轮播', progress: '进度条', marquee: '图片跑马灯',
  'read-more': '展开全文', like: '点赞', rating: '星级评分', zoom: '图片放大', typewriter: '打字机', switch: '开关',
  'progress-ring': '环形进度', tooltip: '点击提示', hotzone: '图片标注', 'before-after': '前后对比',
  faq: '多问答折叠', confetti: '点击撒花', loading: '加载三点', soundwave: '声波', poll: '投票',
  chat: '逐条对话', badge: '角标弹出', countdown: '倒计时', 'marquee-text': '文字跑马灯', 'reveal-fade': '渐显文字',
  counter: '数字滚动', rotate: '图片旋转', ripple: '水波纹', fireworks: '点击烟花', snow: '飘雪',
  'bubble-rise': '气泡上升', 'heart-float': '飘心', 'star-burst': '星光', 'typing-dots': '输入中',
  shake: '抖动提醒', magnifier: '放大镜', pagination: '分页切换', 'steps-flow': '步骤条',
  'toggle-text': '文字切换', 'highlight-text': '划词高亮', 'accordion-vert': '折叠面板',
  spoiler: '剧透遮罩', 'timeline-int': '时间轴', 'confetti-rain': '彩带雨', pulse: '呼吸边框',
}

export function InteractiveView({ block, data, tokens }: BlockViewProps<InteractiveData>) {
  const up = useUpdate(block)
  const panels = data.panels ?? []
  const set = (i: number, patch: any) => up({ panels: panels.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) })

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="chip bg-[#2C6BED]/10 text-[#2C6BED]">{IX_LABEL[data.kind] ?? data.kind}</span>
        <span className="text-[11px] text-ink-text-3">在手机上{IX_LABEL[data.kind]?.replace('点击', '点击后') ?? ''}触发</span>
      </div>

      {data.kind === 'scratch' && (
        <div className="mb-2 flex items-start gap-1.5 text-[11.5px] text-[#B7791F] bg-[#FFF7E6] rounded px-2 py-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-px" />
          <span>刮刮卡依赖 JS 手势，公众号正文无法支持，导出时会降级为静态展示。</span>
        </div>
      )}

      {panels.map((p, i) => (
        <div key={i} className="rounded-lg px-3 py-2 mb-2 group" style={{ background: tokens.colorSurface, borderRadius: tokens.radius }}>
          <div className="flex items-start gap-1.5">
            <div className="flex-1 min-w-0 space-y-1">
              <RichEditor html={p.title ?? ''} onChange={(h) => set(i, { title: h })} singleLine placeholder={`第 ${i + 1} 屏标题`}
                style={{ fontWeight: 600, color: tokens.headingColor, fontSize: tokens.fontSize }} />
              <RichEditor html={p.html ?? ''} onChange={(h) => set(i, { html: h })} bubble placeholder="内容"
                style={{ fontSize: tokens.fontSize - 1, color: tokens.colorText, lineHeight: tokens.lineHeight }} />
              {(data.kind === 'slider' || data.kind === 'scratch' || data.kind === 'carousel' || data.kind === 'marquee' || data.kind === 'zoom') && (
                <ImagePicker value={p.imageUrl} onChange={(u) => set(i, { imageUrl: u })} />
              )}
            </div>
            <button className="btn btn-ghost btn-xs px-1 opacity-0 group-hover:opacity-100"
              onClick={() => up({ panels: panels.filter((_, idx) => idx !== i) })}><Trash2 size={11} /></button>
          </div>
        </div>
      ))}
      <button className="btn btn-soft btn-sm" onClick={() => up({ panels: [...panels, {}] })}><Plus size={12} /> 添加一屏</button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 自定义 HTML / 分栏                                                   */
/* ------------------------------------------------------------------ */

export function HtmlView({ block, data }: BlockViewProps<HtmlData>) {
  const up = useUpdate(block)
  const [tab, setTab] = useState<'edit' | 'view'>('edit')
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'edit', label: '编辑' }, { value: 'view', label: '预览' }]} />
        <span className="text-[11px] text-ink-text-3">导出时会被微信白名单过滤</span>
      </div>
      {tab === 'edit'
        ? <div className="rounded-lg overflow-hidden border border-ink-line">
          <CodeMirror value={data.html ?? ''} height="auto" extensions={[cmHtml()]} onChange={(v) => up({ html: v })} />
        </div>
        : <div className="rounded-lg border border-ink-line p-3" dangerouslySetInnerHTML={{ __html: data.html ?? '' }} />}
    </div>
  )
}

export function ColumnsView({ block, data, tokens }: BlockViewProps<ColumnsData>) {
  const up = useUpdate(block)
  const cols = data.columns ?? []
  const set = (i: number, html: string) => up({ columns: cols.map((c, idx) => (idx === i ? { ...c, html } : c)) })
  return (
    <div>
      <div className="flex gap-3">
        {cols.map((c, i) => (
          <div key={i} className="flex-1 min-w-0 group">
            <RichEditor html={c.html ?? ''} onChange={(h) => set(i, h)} bubble placeholder={`第 ${i + 1} 栏`} style={textStyle(tokens)} />
            {cols.length > 2 && (
              <button className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100"
                onClick={() => up({ columns: cols.filter((_, idx) => idx !== i) })}><Trash2 size={11} /> 删除</button>
            )}
          </div>
        ))}
      </div>
      {cols.length < 3 && (
        <button className="btn btn-soft btn-sm mt-2" onClick={() => up({ columns: [...cols, { html: '' }] })}>
          <Plus size={12} /> 添加一栏
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Frame（元素框）：编辑态展示 + 嵌套 children 渲染                     */
/* ------------------------------------------------------------------ */

export function FrameView({ block, data, tokens }: BlockViewProps<FrameData>) {
  const up = useUpdate(block)
  const layout = data.layout ?? 'vertical'
  const children = Array.isArray(data.children) ? data.children : []
  const inline = Array.isArray(data.inline) ? data.inline : []
  const setInline = (i: number, patch: Partial<FrameInlineItem>) =>
    up({ inline: inline.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) })

  const selected = useUI((s) => s.selectedId === block.id)
  const begin = useDoc((s) => s.beginTransient)
  const live = useDoc((s) => s.updateLive)
  const end = useDoc((s) => s.endTransient)
  const isAbs = layout === 'absolute'
  const bodyRef = useRef<HTMLDivElement>(null)
  const [snap, setSnap] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] })
  /** 流式布局（横排/纵排）下内联元素拖拽排序的落点索引 */
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  /** 子块多选（用于组合/拆分） */
  const [selKids, setSelKids] = useState<string[]>([])
  const dragRef = useRef<{ move: (e: MouseEvent) => void; stop: () => void } | null>(null)
  // 拖拽中若本组件被卸载，清理 window 监听，避免泄漏
  useEffect(() => () => {
    if (dragRef.current) {
      window.removeEventListener('mousemove', dragRef.current.move)
      window.removeEventListener('mouseup', dragRef.current.stop)
      dragRef.current = null
    }
  }, [])

  const toggleKid = (id: string) =>
    setSelKids((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const moveKid = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= children.length) return
    const arr = [...children]
    const [m] = arr.splice(i, 1)
    arr.splice(j, 0, m)
    up({ children: arr })
  }

  type HandleMode =
    | 'frame-resize:se' | 'frame-rotate'
    | 'inline-move' | 'inline-resize' | 'inline-rotate' | 'inline-reorder'

  /**
   * 元素框手柄拖拽：
   * - frame-resize:se / frame-rotate：框级缩放、旋转（仅自由布局）
   * - inline-move：自由布局内联元素拖动（带智能吸附）
   * - inline-resize / inline-rotate：内联元素（图片/SVG/文本）画布上直接缩放、旋转
   * - inline-reorder：流式布局（横排/纵排）内联元素拖拽排序
   */
  const beginHandle = (e: React.MouseEvent, mode: HandleMode, index: number) => {
    if ((mode === 'frame-rotate' || mode === 'frame-resize:se') && !isAbs) return
    if (mode === 'inline-reorder' && isAbs) return
    e.preventDefault(); e.stopPropagation()
    const body = bodyRef.current; if (!body) return
    const startX = e.clientX, startY = e.clientY
    const item = inline[index]
    const startItemX = item?.x ?? 0, startItemY = item?.y ?? 0
    const startItemW = item?.width ?? (item?.kind === 'text' ? 60 : 80)
    const startItemH = item?.height ?? 24
    const group = item?.groupId
    const groupItems = group ? inline.filter((it) => it.groupId === group) : null
    const startW = data.width && data.width !== 'auto' ? Number(data.width) : body.offsetWidth
    const startH = data.height && data.height !== 'auto' ? Number(data.height) : body.offsetHeight
    let started = false
    let reorderTarget: number | null = null

    /** 屏幕位移 → 框内本地位移：先绕中心旋转 -θ 再除以 scale */
    const localDelta = (ev: MouseEvent) => {
      const s = (data.scale ?? 1) || 1
      const th = ((data.rotate ?? 0) * Math.PI) / 180
      const sx = ev.clientX - startX, sy = ev.clientY - startY
      const cos = Math.cos(-th), sin = Math.sin(-th)
      return { dx: (sx * cos - sy * sin) / s, dy: (sx * sin + sy * cos) / s, s }
    }

    const move = (ev: MouseEvent) => {
      if (mode === 'inline-reorder') {
        // 流式布局：按指针位置计算落点索引并绘制参考线
        const els = Array.from(body.querySelectorAll<HTMLElement>('[data-inline-id]'))
        const horiz = layout === 'horizontal'
        const pos = horiz ? ev.clientX : ev.clientY
        let target = els.length
        for (let i = 0; i < els.length; i++) {
          const r = els[i].getBoundingClientRect()
          const mid = horiz ? r.left + r.width / 2 : r.top + r.height / 2
          if (pos < mid) { target = i; break }
        }
        reorderTarget = target
        setDropIdx(target)
        return
      }
      if (!started) { started = true; begin() }
      if (mode === 'frame-resize:se') {
        const w = Math.max(40, Math.round(startW + (ev.clientX - startX)))
        const h = Math.max(20, Math.round(startH + (ev.clientY - startY)))
        live(block.id, { width: w, height: h })
      } else if (mode === 'frame-rotate') {
        const r = body.getBoundingClientRect()
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2
        let ang = Math.round(Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI) + 90
        ang = ((ang % 360) + 360) % 360
        live(block.id, { rotate: ang })
      } else if (mode === 'inline-move') {
        const { dx, dy, s } = localDelta(ev)
        let ddx = Math.round(dx), ddy = Math.round(dy)
        // 吸附阈值按 scale 折算到本地空间，保持屏幕上约 6px 手感
        const SNAP = Math.max(2, Math.round(6 / s))
        const frameW = body.offsetWidth, frameH = body.offsetHeight
        const targetsV = [0, frameW / 2, frameW]
        const targetsH = [0, frameH / 2, frameH]
        for (const it of inline) {
          if (it === item) continue
          const w = it.width ?? (it.kind === 'image' || it.kind === 'svg' ? 80 : 60)
          const h = it.height ?? 24
          const l = it.x ?? 0, t = it.y ?? 0
          targetsV.push(l, l + w / 2, l + w)
          targetsH.push(t, t + h / 2, t + h)
        }
        const iw = item?.width ?? 80, ih = item?.height ?? 24
        const candV = [startItemX + ddx, startItemX + ddx + iw / 2, startItemX + ddx + iw]
        const candH = [startItemY + ddy, startItemY + ddy + ih / 2, startItemY + ddy + ih]
        let bestV: { d: number; delta: number; pos: number } | null = null
        let bestH: { d: number; delta: number; pos: number } | null = null
        for (const t of targetsV) for (const s of candV) { const d = Math.abs(s - t); if (d <= SNAP && (!bestV || d < bestV.d)) bestV = { d, delta: t - s, pos: t } }
        for (const t of targetsH) for (const s of candH) { const d = Math.abs(s - t); if (d <= SNAP && (!bestH || d < bestH.d)) bestH = { d, delta: t - s, pos: t } }
        const vLines: number[] = [], hLines: number[] = []
        if (bestV) { ddx += bestV.delta; vLines.push(bestV.pos) }
        if (bestH) { ddy += bestH.delta; hLines.push(bestH.pos) }
        setSnap({ v: vLines, h: hLines })
        const nx = startItemX + ddx, ny = startItemY + ddy
        if (group && groupItems) {
          const deltaX = nx - startItemX, deltaY = ny - startItemY
          const ids = new Set(groupItems.map((g) => g.id))
          live(block.id, { inline: inline.map((it) => ids.has(it.id) ? { ...it, x: (it.x ?? 0) + deltaX, y: (it.y ?? 0) + deltaY } : it) })
        } else {
          live(block.id, { inline: inline.map((it, idx) => idx === index ? { ...it, x: nx, y: ny } : it) })
        }
      } else if (mode === 'inline-resize') {
        const { dx, dy } = localDelta(ev)
        const w = Math.max(16, Math.round(startItemW + dx))
        const h = Math.max(16, Math.round(startItemH + dy))
        live(block.id, {
          inline: inline.map((it, idx) => idx === index
            ? (it.kind === 'text' ? { ...it, width: w } : { ...it, width: w, height: h })
            : it),
        })
      } else if (mode === 'inline-rotate') {
        const els = Array.from(body.querySelectorAll<HTMLElement>('[data-inline-id]'))
        const el = els.find((x) => x.getAttribute('data-inline-id') === item?.id)
        const r = el?.getBoundingClientRect()
        if (!r) return
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2
        let ang = Math.round(Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI) + 90
        ang = ((ang % 360) + 360) % 360
        live(block.id, { inline: inline.map((it, idx) => idx === index ? { ...it, rotate: ang } : it) })
      }
    }
    const stop = () => {
      setSnap({ v: [], h: [] })
      setDropIdx(null)
      if (mode === 'inline-reorder' && reorderTarget != null) {
        const arr = [...inline]
        const [m] = arr.splice(index, 1)
        const insertAt = reorderTarget > index ? reorderTarget - 1 : reorderTarget
        arr.splice(Math.max(0, Math.min(arr.length, insertAt)), 0, m)
        up({ inline: arr })
      } else if (started) {
        end(mode === 'frame-rotate' ? '旋转元素框'
          : mode === 'frame-resize:se' ? '缩放元素框'
          : mode === 'inline-resize' ? '缩放元素'
          : mode === 'inline-rotate' ? '旋转元素'
          : '移动元素')
      }
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', stop)
      dragRef.current = null
    }
    dragRef.current = { move, stop }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', stop)
  }

  return (
    <div className="relative">
      {/* frame 本体 */}
      <div
        ref={bodyRef}
        data-frame-body={block.id}
        className="relative"
        style={{
          display: layout === 'horizontal' ? 'flex' : 'block',
          flexDirection: layout === 'horizontal' ? 'row' : undefined,
          flexWrap: layout === 'horizontal' ? 'wrap' : undefined,
          justifyContent: layout === 'horizontal'
            ? (data.align === 'between' ? 'space-between' : data.align ?? 'flex-start')
            : undefined,
          alignItems: layout === 'horizontal' ? 'center' : undefined,
          gap: layout === 'horizontal' ? `${data.gap ?? 12}px` : `${data.gap ?? 6}px`,
          width: data.width === 'auto' || data.width == null ? '100%' : `${data.width}px`,
          height: data.height === 'auto' || data.height == null ? 'auto' : `${data.height}px`,
          minHeight: 56,
          padding: `${data.padding ?? 8}px`,
          background: data.background ?? 'transparent',
          borderRadius: `${data.borderRadius ?? 8}px`,
          border: data.borderWidth
            ? `${data.borderWidth}px ${(data as any).borderStyle ?? 'solid'} ${data.borderColor ?? '#ddd'}`
            : undefined,
          position: 'relative',
          boxSizing: 'border-box',
          transform: `rotate(${isAbs ? data.rotate ?? 0 : 0}deg) scale(${isAbs ? data.scale ?? 1 : 1}) skewX(${data.skewX ?? 0}deg) skewY(${data.skewY ?? 0}deg)`,
          transformOrigin: 'center',
        }}
      >
        {/* 选中态：缩放/旋转手柄 + 智能吸附参考线 */}
        {selected && isAbs && (
          <>
            <span className="no-print" title="拖动缩放"
              onMouseDown={(e) => beginHandle(e, 'frame-resize:se', -1)}
              style={{ position: 'absolute', right: -7, bottom: -7, width: 14, height: 14, borderRadius: 3, background: '#2C6BED', cursor: 'nwse-resize', boxShadow: '0 0 0 2px #fff', zIndex: 5 }} />
            {isAbs && (
              <span className="no-print" title="拖动旋转"
                onMouseDown={(e) => beginHandle(e, 'frame-rotate', -1)}
                style={{ position: 'absolute', left: '50%', top: -30, transform: 'translateX(-50%)', width: 18, height: 18, borderRadius: '50%', background: '#fff', border: '2px solid #2C6BED', cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2C6BED', zIndex: 5 }}>
                <Maximize2 size={11} />
              </span>
            )}
          </>
        )}
        {snap.v.map((x, i) => (
          <span key={'sv' + i} className="no-print" style={{ position: 'absolute', left: x, top: 0, bottom: 0, width: 1, background: '#F25FA8', pointerEvents: 'none', zIndex: 6 }} />
        ))}
        {snap.h.map((y, i) => (
          <span key={'sh' + i} className="no-print" style={{ position: 'absolute', left: 0, right: 0, top: y, height: 1, background: '#F25FA8', pointerEvents: 'none', zIndex: 6 }} />
        ))}
        {/* children blocks（可嵌套任意 Block） */}
        {children.length === 0 && inline.length === 0 && (
          <div className="text-ink-text-3 text-[12px] italic w-full text-center py-3 select-none">
            空元素框 · 在左侧组件库拖入 / 点击右侧插入新子区块
          </div>
        )}
        {children.map((ch, i) => {
          const kidSel = selKids.includes(ch.id)
          return (
          <div key={ch.id} className="flex-1 min-w-[80px] group/child"
            style={{ flexBasis: layout === 'horizontal' ? 'auto' : '100%', outline: kidSel ? '2px solid #2C6BED' : undefined, borderRadius: 6 }}>
            <div className="flex items-start gap-1">
              <span className="cursor-grab text-ink-text-3 active:cursor-grabbing mt-1 no-print select-none" draggable
                onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('application/x-ink-blockmove', JSON.stringify({ blockId: ch.id, source: 'frame' })); e.dataTransfer.effectAllowed = 'move' }}
                title="拖到其它元素框或画布（已组合则整组一起移动）">⠿</span>
              <button className="btn btn-ghost btn-xs px-0.5 no-print" title="选中（可多选后组合）"
                onClick={(e) => { e.stopPropagation(); toggleKid(ch.id) }}>
                {kidSel ? '☑' : '☐'}
              </button>
              <div className="flex-1 min-w-0">
                {ch.groupId && <span className="chip bg-[#2C6BED]/10 text-[#2C6BED] no-print" title="已组合">组</span>}
                <BlockView block={ch} tokens={tokens} />
              </div>
              <div className="flex flex-col no-print">
                <button className="btn btn-ghost btn-xs px-0.5" title="上移" disabled={i === 0}
                  onClick={() => moveKid(i, -1)}><ArrowUp size={10} /></button>
                <button className="btn btn-ghost btn-xs px-0.5" title="下移" disabled={i === children.length - 1}
                  onClick={() => moveKid(i, 1)}><ArrowDown size={10} /></button>
              </div>
            </div>
            <button className="btn btn-ghost btn-xs opacity-50 hover:opacity-100 mt-0.5"
              onClick={() => up({ children: children.filter((_, idx) => idx !== i) })}>
              <Trash2 size={10} /> 移除此子块
            </button>
          </div>
          )
        })}
        {/* inline 子元素（图片/SVG/文本）：自由布局拖动定位，流式布局拖动排序 */}
        {inline.map((it, i) => (
          <React.Fragment key={it.id}>
            {dropIdx === i && <DropGuide verticalBar={layout === 'horizontal'} />}
            <FrameInlineEl item={it} layout={layout}
              onChange={(patch) => setInline(i, patch)}
              onRemove={() => up({ inline: inline.filter((_, idx) => idx !== i) })}
              onStartDrag={
                isAbs
                  ? (e) => beginHandle(e, 'inline-move', i)
                  : (e) => beginHandle(e, 'inline-reorder', i)
              }
              onStartResize={(e) => beginHandle(e, 'inline-resize', i)}
              onStartRotate={(e) => beginHandle(e, 'inline-rotate', i)}
              showHandles={selected}
            />
          </React.Fragment>
        ))}
        {dropIdx === inline.length && <DropGuide verticalBar={layout === 'horizontal'} />}
      </div>

      {/* 选中态：元素框工具条（PowerPoint 风格：组合/拆分/缩放/变形） */}
      {selected && (
        <div className="mt-2 rounded-lg border border-ink-line bg-white/90 p-2 space-y-1.5 no-print">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Segmented value={layout} onChange={(v) => up({ layout: v as any })}
              options={[{ value: 'horizontal', label: '横排' }, { value: 'vertical', label: '纵排' }, { value: 'absolute', label: '自由' }]} />
            <label className="text-ink-text-3 text-[10.5px]">宽</label>
            <input className="input input-xs w-14" type="number" value={data.width === 'auto' || data.width == null ? '' : data.width}
              onChange={(e) => up({ width: e.target.value === '' ? 'auto' : Number(e.target.value) })} />
            <label className="text-ink-text-3 text-[10.5px]">高</label>
            <input className="input input-xs w-14" type="number" value={data.height === 'auto' || data.height == null ? '' : data.height}
              onChange={(e) => up({ height: e.target.value === '' ? 'auto' : Number(e.target.value) })} />
            {isAbs && (<>
              <label className="text-ink-text-3 text-[10.5px]">角</label>
              <input className="input input-xs w-12" type="number" value={data.rotate ?? 0}
                onChange={(e) => up({ rotate: Number(e.target.value) })} />
              <label className="text-ink-text-3 text-[10.5px]">比</label>
              <input className="input input-xs w-12" type="number" step="0.1" value={data.scale ?? 1}
                onChange={(e) => up({ scale: Number(e.target.value) })} />
            </>)}
            <button className="btn btn-ghost btn-xs" onClick={() => up({ width: 'auto', height: 'auto', rotate: 0, scale: 1, skewX: 0, skewY: 0 })} title="重置尺寸/角度/比例/变形">归位</button>
          </div>
          {/* 变形：斜切（所有布局生效，导出为 CSS transform） */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-ink-text-3 text-[10.5px]">变形</span>
            <label className="text-ink-text-3 text-[10.5px]">斜切 X</label>
            <input className="input input-xs w-12" type="number" value={data.skewX ?? 0}
              onChange={(e) => up({ skewX: Number(e.target.value) || 0 })} />
            <label className="text-ink-text-3 text-[10.5px]">斜切 Y</label>
            <input className="input input-xs w-12" type="number" value={data.skewY ?? 0}
              onChange={(e) => up({ skewY: Number(e.target.value) || 0 })} />
            <button className="btn btn-ghost btn-xs" onClick={() => up({ skewX: 0, skewY: 0 })} title="重置变形">重置变形</button>
          </div>
          {/* 内联元素组合/拆分 */}
          {inline.length > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="text-ink-text-3 text-[10.5px]">内联元素</span>
              <button className="btn btn-soft btn-xs" onClick={() => { const g = 'g_' + Date.now().toString(36); up({ inline: inline.map((it) => ({ ...it, groupId: g })) }) }}>组合全部</button>
              <button className="btn btn-soft btn-xs" onClick={() => up({ inline: inline.map((it) => ({ ...it, groupId: undefined })) })}>拆分</button>
              <span className="text-ink-text-3 text-[10.5px]">{inline.filter((it) => it.groupId).length} 个已组合</span>
            </div>
          )}
          {/* 子块组合/拆分：多选后组合，拖动时整组一起移动 */}
          {children.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-ink-text-3 text-[10.5px]">子块</span>
              <span className="text-ink-text-3 text-[10.5px]">已选 {selKids.length}</span>
              <button className="btn btn-soft btn-xs" disabled={selKids.length < 2}
                onClick={() => { const g = 'g_' + Date.now().toString(36); up({ children: children.map((c) => selKids.includes(c.id) ? { ...c, groupId: g } : c) }) }}>组合选中</button>
              <button className="btn btn-soft btn-xs" disabled={selKids.length === 0}
                onClick={() => up({ children: children.map((c) => selKids.includes(c.id) ? { ...c, groupId: undefined } : c) })}>拆分选中</button>
              <button className="btn btn-ghost btn-xs" onClick={() => setSelKids([])}>清空选择</button>
              <span className="text-ink-text-3 text-[10.5px]">{children.filter((c) => c.groupId).length} 个已组合</span>
            </div>
          )}
        </div>
      )}

      {/* 右下角快速添加子块 + inline */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button className="btn btn-soft btn-xs"
          onClick={() => up({ children: [...children, {
            id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
            type: 'paragraph', data: { html: '新段落' }, style: { marginTop: 0, marginBottom: 8 },
          } as Block] })}>
          <Plus size={11} /> 加段落
        </button>
        <button className="btn btn-soft btn-xs"
          onClick={() => up({ children: [...children, {
            id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
            type: 'image', data: { src: '', alt: '', display: 'block' }, style: { marginBottom: 8 },
          } as Block] })}>
          <Plus size={11} /> 加图片
        </button>
        <button className="btn btn-soft btn-xs"
          onClick={() => up({ children: [...children, {
            id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
            type: 'button', data: { text: '按钮', href: '#' }, style: { marginBottom: 0 },
          } as Block] })}>
          <Plus size={11} /> 加按钮
        </button>
        <span className="text-ink-text-3 text-[10.5px] self-center mx-1">|</span>
        <button className="btn btn-soft btn-xs"
          onClick={() => up({ inline: [...inline, {
            id: 'i_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            kind: 'image', src: '', alt: '', width: 120, x: 12, y: 12,
          } as FrameInlineItem] })}>
          <Plus size={11} /> 加图片(可拖位)
        </button>
        <button className="btn btn-soft btn-xs"
          onClick={() => up({ inline: [...inline, {
            id: 'i_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            kind: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><circle cx="12" cy="12" r="10" fill="#2C6BED"/></svg>', width: 32, x: 12, y: 12,
          } as FrameInlineItem] })}>
          <Plus size={11} /> 加 SVG(可拖位)
        </button>
        <button className="btn btn-soft btn-xs"
          onClick={() => up({ inline: [...inline, {
            id: 'i_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            kind: 'text', text: '文本元素', x: 12, y: 12, color: '#222',
          } as FrameInlineItem] })}>
          <Plus size={11} /> 加文本(可拖位)
        </button>
      </div>
    </div>
  )
}

/** 流式布局（横排/纵排）下内联元素拖拽排序的落点参考线 */
function DropGuide({ verticalBar }: { verticalBar: boolean }) {
  return (
    <span className="no-print" style={verticalBar
      ? { width: 2, alignSelf: 'stretch', background: '#2C6BED', borderRadius: 1 }
      : { flexBasis: '100%', height: 2, background: '#2C6BED', borderRadius: 1 }} />
  )
}

/** inline 子元素控件：可视化渲染 + 输入 src/文字 + 变形，并支持画布上手柄缩放/旋转/拖动 */
function FrameInlineEl({ item, layout, onChange, onRemove, onStartDrag, onStartResize, onStartRotate, showHandles }: {
  item: FrameInlineItem
  layout: 'horizontal' | 'vertical' | 'absolute'
  onChange: (patch: Partial<FrameInlineItem>) => void
  onRemove: () => void
  onStartDrag?: (e: React.MouseEvent) => void
  onStartResize?: (e: React.MouseEvent) => void
  onStartRotate?: (e: React.MouseEvent) => void
  showHandles?: boolean
}) {
  const abs = layout === 'absolute'
  return (
    <div
      data-inline-id={item.id}
      className="bg-white/70 border border-ink-line rounded p-1.5 text-[11px] flex flex-col gap-1 relative"
      style={{
        position: abs ? 'absolute' : 'relative',
        left: abs ? `${item.x ?? 0}px` : undefined,
        top: abs ? `${item.y ?? 0}px` : undefined,
        transform: `rotate(${item.rotate ?? 0}deg) scale(${item.scale ?? 1}) skewX(${item.skewX ?? 0}deg) skewY(${item.skewY ?? 0}deg)`,
        transformOrigin: 'center',
        width: item.width ? `${item.width}px` : undefined,
        height: item.kind !== 'text' && item.height ? `${item.height}px` : undefined,
        maxWidth: '100%',
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-1">
          {onStartDrag && (
            <span className="cursor-grab text-ink-text-3 active:cursor-grabbing" onMouseDown={(e) => { e.stopPropagation(); onStartDrag(e) }} title="拖动定位">⠿</span>
          )}
          <span className="chip bg-black/[0.05]">{item.kind.toUpperCase()}</span>
          {item.groupId && <span className="chip bg-[#2C6BED]/10 text-[#2C6BED]" title="已组合">组</span>}
        </span>
        <button className="btn btn-ghost btn-xs px-1" onClick={onRemove} title="移除">
          <Trash2 size={10} />
        </button>
      </div>
      {/* 编辑态可视化预览：真正渲染图片 / SVG / 文本，而非只有输入框 */}
      <div className="mb-1 rounded bg-black/[0.03] min-h-[20px] flex items-center justify-center overflow-hidden"
        style={{ pointerEvents: 'none' }}>
        {item.kind === 'image' && item.src ? (
          <img src={item.src} alt={item.alt ?? ''} style={{ maxWidth: '100%', maxHeight: 120, display: 'block', borderRadius: 4 }} draggable={false} />
        ) : item.kind === 'svg' && item.svg ? (
          <div style={{ lineHeight: 0, maxWidth: '100%' }} dangerouslySetInnerHTML={{ __html: item.svg }} />
        ) : item.kind === 'text' ? (
          <span style={{ color: item.color ?? '#222', fontSize: 13, padding: '2px 4px' }}>{item.text}</span>
        ) : (
          <span className="text-ink-text-3 text-[10.5px] py-1">未设置{item.kind === 'image' ? '图片 URL' : item.kind === 'svg' ? ' SVG' : '文本'}</span>
        )}
      </div>
      {item.kind === 'image' && (
        <input className="input input-xs" placeholder="图片 URL / 上传"
          value={item.src || ''} onChange={(e) => onChange({ src: e.target.value })} />
      )}
      {item.kind === 'svg' && (
        <textarea className="input input-xs font-mono" rows={2} placeholder="<svg …>"
          value={item.svg || ''} onChange={(e) => onChange({ svg: e.target.value })} />
      )}
      {item.kind === 'text' && (
        <input className="input input-xs" placeholder="文本"
          value={item.text || ''} onChange={(e) => onChange({ text: e.target.value })} />
      )}
      <div className="flex items-center gap-1 flex-wrap">
        <label className="text-ink-text-3">宽</label>
        <input type="number" className="input input-xs w-12" value={item.width ?? ''}
          onChange={(e) => onChange({ width: e.target.value ? Number(e.target.value) : undefined })} />
        {item.kind !== 'text' && (<>
          <label className="text-ink-text-3">高</label>
          <input type="number" className="input input-xs w-12" value={item.height ?? ''}
            onChange={(e) => onChange({ height: e.target.value ? Number(e.target.value) : undefined })} />
        </>)}
        {abs && (
          <>
            <label className="text-ink-text-3">X</label>
            <input type="number" className="input input-xs w-10" value={item.x ?? 0}
              onChange={(e) => onChange({ x: Number(e.target.value) })} />
            <label className="text-ink-text-3">Y</label>
            <input type="number" className="input input-xs w-10" value={item.y ?? 0}
              onChange={(e) => onChange({ y: Number(e.target.value) })} />
            <label className="text-ink-text-3">角度</label>
            <input type="number" className="input input-xs w-12" value={item.rotate ?? 0}
              onChange={(e) => onChange({ rotate: Number(e.target.value) })} />
            <label className="text-ink-text-3">缩放</label>
            <input type="number" step="0.1" className="input input-xs w-12" value={item.scale ?? 1}
              onChange={(e) => onChange({ scale: Number(e.target.value) })} />
          </>
        )}
        <label className="text-ink-text-3">斜切X</label>
        <input type="number" className="input input-xs w-12" value={item.skewX ?? 0}
          onChange={(e) => onChange({ skewX: Number(e.target.value) || 0 })} />
        <label className="text-ink-text-3">斜切Y</label>
        <input type="number" className="input input-xs w-12" value={item.skewY ?? 0}
          onChange={(e) => onChange({ skewY: Number(e.target.value) || 0 })} />
      </div>
      {/* 画布上手柄：图片/SVG/文本同样支持直接拖动缩放与旋转 */}
      {showHandles && (
        <>
          <span className="no-print" title="拖动缩放"
            onMouseDown={(e) => { e.stopPropagation(); onStartResize?.(e) }}
            style={{ position: 'absolute', right: -6, bottom: -6, width: 12, height: 12, borderRadius: 3, background: '#2C6BED', cursor: 'nwse-resize', boxShadow: '0 0 0 2px #fff', zIndex: 7 }} />
          <span className="no-print" title="拖动旋转"
            onMouseDown={(e) => { e.stopPropagation(); onStartRotate?.(e) }}
            style={{ position: 'absolute', left: '50%', top: -16, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: '#fff', border: '2px solid #2C6BED', cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2C6BED', zIndex: 7 }}>
            <Maximize2 size={9} />
          </span>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 分发                                                                 */
/* ------------------------------------------------------------------ */

export function BlockView(props: { block: Block; tokens: ThemeTokens }) {
  const { block, tokens } = props
  const data = block.data as any
  switch (block.type) {
    case 'paragraph': return <ParagraphView block={block} data={data} tokens={tokens} />
    case 'heading': return <HeadingView block={block} data={data} tokens={tokens} />
    case 'quote': return <QuoteView block={block} data={data} tokens={tokens} />
    case 'list': return <ListView block={block} data={data} tokens={tokens} />
    case 'image': return <ImageView block={block} data={data} tokens={tokens} />
    case 'wechat-eco': return <WechatEcoView block={block} data={data} tokens={tokens} />
    case 'gallery': return <GalleryView block={block} data={data} tokens={tokens} />
    case 'code': return <CodeView block={block} data={data} tokens={tokens} />
    case 'table': return <TableView block={block} data={data} tokens={tokens} />
    case 'divider': return <DividerView block={block} data={data} tokens={tokens} />
    case 'card': return <CardView block={block} data={data} tokens={tokens} />
    case 'callout': return <CalloutView block={block} data={data} tokens={tokens} />
    case 'timeline': return <TimelineView block={block} data={data} tokens={tokens} />
    case 'steps': return <StepsView block={block} data={data} tokens={tokens} />
    case 'accordion': return <AccordionView block={block} data={data} tokens={tokens} />
    case 'button': return <ButtonView block={block} data={data} tokens={tokens} />
    case 'video': return <VideoView block={block} data={data} tokens={tokens} />
    case 'audio': return <AudioView block={block} data={data} tokens={tokens} />
    case 'qrcode': return <QrcodeView block={block} data={data} tokens={tokens} />
    case 'svg': return <SvgView block={block} data={data} tokens={tokens} />
    case 'lottie': return <LottieView block={block} data={data} tokens={tokens} />
    case 'interactive': return <InteractiveView block={block} data={data} tokens={tokens} />
    case 'html': return <HtmlView block={block} data={data} tokens={tokens} />
    case 'columns': return <ColumnsView block={block} data={data} tokens={tokens} />
    case 'frame': return <FrameView block={block} data={data} tokens={tokens} />
    default: return <div className="text-ink-text-3 text-[12px]">未知区块类型：{block.type}</div>
  }
}
