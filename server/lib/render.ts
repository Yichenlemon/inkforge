import type {
  Block, BlockStyle, ThemeTokens, Diagnostic, TableData, TimelineData, StepsData,
  AccordionData, InteractiveData, GalleryData, ColumnsData, CardData, CalloutData,
  DividerData, ButtonData, QrcodeData, VideoData, AudioData, CodeData, ImageData,
  RichTextData, SvgData, LottieData, HtmlData, ShadowLevel, WechatEcoData, FrameData,
} from '../../shared/types.js'
import { highlightToWechat } from './shiki.js'
import { compileAnimation, stripAnimation, wrapSvgForWechat, ingestSvg } from './svg.js'
import { parseStyle } from './wechatify.js'
import QRCode from 'qrcode'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { OUT_DIR } from '../db.js'

export interface RenderCtx {
  tokens: ThemeTokens
  maxWidth: number
  stripAnimation: boolean
  diagnostics: Diagnostic[]
  headingNumber: Map<number, number>
  /** 渲染嵌套层级（frame children 用），避免奇数递归对象 cross-ctx */
  depth?: number
}

/* ------------------------------------------------------------------ */
/* 样式工具                                                             */
/* ------------------------------------------------------------------ */

const SHADOWS: Record<ShadowLevel, string> = {
  none: '',
  sm: '0 1px 2px rgba(0,0,0,0.06)',
  md: '0 4px 12px rgba(0,0,0,0.08)',
  lg: '0 8px 24px rgba(0,0,0,0.10)',
  xl: '0 16px 40px rgba(0,0,0,0.14)',
}

export function styleOf(style: BlockStyle = {}, extra: Record<string, string | number | undefined> = {}): string {
  const parts: string[] = []
  const px = (n?: number) => (n == null ? undefined : `${n}px`)
  const map: [string, string | number | undefined][] = [
    ['margin-top', px(style.marginTop)],
    ['margin-bottom', px(style.marginBottom)],
    ['margin-left', px(style.paddingLeft)],
    ['padding-top', px(style.paddingTop)],
    ['padding-right', px(style.paddingRight)],
    ['padding-bottom', px(style.paddingBottom)],
    ['padding-left', px(style.paddingLeft)],
    ['background-color', style.background],
    ['border-radius', px(style.borderRadius)],
    ['border-color', style.borderColor],
    ['border-style', style.borderStyle && style.borderStyle !== 'none' ? style.borderStyle : undefined],
    ['border-width', px(style.borderWidth)],
    ['box-shadow', style.boxShadow && style.boxShadow !== 'none' ? SHADOWS[style.boxShadow] : undefined],
    ['text-align', style.textAlign],
    ['width', style.width],
    ['opacity', style.opacity],
    ['color', style.color],
    ['font-size', px(style.fontSize)],
    ['line-height', style.lineHeight],
    ['letter-spacing', px(style.letterSpacing)],
    ['font-weight', style.fontWeight],
    ['font-family', style.fontFamily],
  ]
  const declared = new Set<string>()
  for (const [k, v] of map) {
    if (v === undefined || v === '' || v === 'none' && k === 'text-align') continue
    if (k === 'border-width' && (!style.borderWidth || style.borderWidth === 0)) continue
    if (k === 'border-style' && style.borderStyle === 'none') continue
    parts.push(`${k}:${v}`)
    declared.add(k)
  }
  // extra 只作为「主题默认值」兜底：块级已显式设置的属性（字号/颜色/行高等）优先，
  // 否则主题值会排在后面被 CSS 取最后一次声明，导致用户调整字号无效。
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === '' || v === null) continue
    if (declared.has(k)) continue
    parts.push(`${k}:${v}`)
  }
  // customCss 逃生舱：白名单交给 wechatify 过滤
  if (style.customCss) {
    for (const d of parseStyle(style.customCss)) parts.push(`${d.prop}:${d.value}`)
  }
  return parts.join(';')
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))

/** 富文本内部的行内样式：段落内的连续空格要保住 */
function richText(html: string): string {
  return (html ?? '')
    .replace(/ {2,}/g, (m) => '&nbsp;'.repeat(m.length))
}

/* ------------------------------------------------------------------ */
/* 各 Block 渲染器                                                      */
/* ------------------------------------------------------------------ */

function renderParagraph(d: RichTextData, b: Block, ctx: RenderCtx): string {
  const t = ctx.tokens
  const base = styleOf(b.style, {
    'font-size': px(t.fontSize),
    color: t.colorText,
    'line-height': t.lineHeight,
    'letter-spacing': px(t.letterSpacing),
    'text-align': t.justify ? 'justify' : undefined,
    'text-indent': t.textIndent ? '2em' : undefined,
    'word-break': 'break-word',
  })
  return `<p data-block-id="${b.id}" style="${base}">${richText(d.html)}</p>`
}

const px = (n?: number) => (n == null ? undefined : `${n}px`)

function renderHeading(d: RichTextData, b: Block, ctx: RenderCtx): string {
  const t = ctx.tokens
  const level = Math.min(4, Math.max(1, d.level ?? 2))
  const sizes: Record<number, number> = { 1: 22, 2: 19, 3: 17, 4: 16 }
  const size = sizes[level]
  const variant = d.headingStyle ?? 'plain'
  const text = richText(d.html)

  const common = styleOf(b.style, {
    'font-size': px(size),
    color: t.headingColor,
    'font-weight': 700,
    'line-height': 1.4,
    'letter-spacing': px(t.letterSpacing),
  })

  if (variant === 'bar') {
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, { display: 'flex', 'align-items': 'center', gap: '10px' })}">` +
      `<span style="display:inline-block;width:4px;height:${Math.round(size * 1.1)}px;background-color:${t.colorPrimary};border-radius:2px;flex-shrink:0"></span>` +
      `<span leaf style="${common}">${text}</span></section>`
  }
  if (variant === 'underline') {
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, {})}">` +
      `<span leaf style="${common};border-bottom:3px solid ${t.colorPrimary};padding-bottom:4px;display:inline-block">${text}</span></section>`
  }
  if (variant === 'bracket') {
    return `<h${level} data-block-id="${b.id}" style="${common}">` +
      `<span style="color:${t.colorPrimary}">【</span>${text}<span style="color:${t.colorPrimary}">】</span></h${level}>`
  }
  if (variant === 'number') {
    const n = (ctx.headingNumber.get(1) ?? 0) + 1
    ctx.headingNumber.set(1, n)
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, { display: 'flex', gap: '10px', 'align-items': 'flex-start' })}">` +
      `<span style="display:inline-block;min-width:${size * 1.6}px;height:${size * 1.6}px;line-height:${size * 1.6}px;text-align:center;background-color:${t.colorPrimary};color:#fff;border-radius:4px;font-size:${Math.round(size * 0.7)}px;font-weight:700;flex-shrink:0">${n}</span>` +
      `<span leaf style="${common};flex:1">${text}</span></section>`
  }
  if (variant === 'background') {
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, {})}">` +
      `<span leaf style="${common};background:linear-gradient(to top, ${t.colorPrimary}33 50%, transparent 50%);padding:0 6px">${text}</span></section>`
  }
  return `<h${level} data-block-id="${b.id}" style="${common}">${text}</h${level}>`
}

function renderQuote(d: RichTextData, b: Block, ctx: RenderCtx): string {
  const t = ctx.tokens
  const variant = d.quoteStyle ?? 'bar'
  const inner = richText(d.html)
  // 内层 <span> 的字号会覆盖外层继承值，这里显式带上块级字号，否则调字号无效
  const text = styleOf({}, {
    'font-size': px(b.style?.fontSize ?? t.fontSize),
    color: t.colorMuted,
    'line-height': t.lineHeight,
    'letter-spacing': px(t.letterSpacing),
  })
  if (variant === 'card') {
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, {
      'background-color': t.colorSurface, 'border-radius': px(t.radius), padding: '14px 16px',
    })}"><span leaf style="${text}">${inner}</span></section>`
  }
  if (variant === 'quote-mark') {
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, { 'text-align': 'center' })}">` +
      `<span leaf style="display:block;font-size:36px;line-height:1;color:${t.colorPrimary};opacity:.3">“</span>` +
      `<span leaf style="${text}">${inner}</span></section>`
  }
  if (variant === 'minimal') {
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, {
      padding: '2px 0 2px 12px', color: t.colorMuted, 'font-size': px(t.fontSize - 1),
    })}"><span leaf style="${text}">${inner}</span></section>`
  }
  return `<section data-block-id="${b.id}" style="${styleOf(b.style, {
    'border-left': `3px solid ${t.colorPrimary}`, padding: '4px 0 4px 14px',
  })}"><span leaf style="${text}">${inner}</span></section>`
}

function renderList(d: RichTextData, b: Block, ctx: RenderCtx): string {
  const t = ctx.tokens
  const items = extractListItems(d.html)
  const tag = d.ordered ? 'ol' : 'ul'
  // 同上：列表项内层文本需使用块级字号
  const text = styleOf({}, {
    'font-size': px(b.style?.fontSize ?? t.fontSize), color: t.colorText, 'line-height': t.lineHeight, 'letter-spacing': px(t.letterSpacing),
  })
  const lis = items.map((it, i) => {
    const marker = d.ordered
      ? `<span style="display:inline-block;min-width:1.4em;color:${t.colorPrimary};font-weight:600">${i + 1}.</span>`
      : `<span style="display:inline-block;min-width:1.2em;color:${t.colorPrimary}">•</span>`
    return `<li style="${text};display:flex;gap:6px;margin-bottom:6px;list-style:none">${marker}<span leaf style="flex:1">${richText(it)}</span></li>`
  }).join('')
  return `<${tag} data-block-id="${b.id}" style="${styleOf(b.style, { padding: '0', margin: '0 0 16px 0', 'list-style': 'none' })}">${lis}</${tag}>`
}

function extractListItems(html: string): string[] {
  const dom = html.match(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)
  if (dom?.length) return dom.map((s) => s.replace(/^<li\b[^>]*>/i, '').replace(/<\/li>$/i, ''))
  return html.split(/\n+/).filter(Boolean)
}

function renderImage(d: ImageData, b: Block, ctx: RenderCtx): string {
  const radius = d.radius ?? 0
  const shadow = d.shadow && d.shadow !== 'none' ? SHADOWS[d.shadow] : ''
  const border = d.borderWidth ? `border:${d.borderWidth}px solid ${d.borderColor ?? '#eee'}` : ''
  const transform = [d.flipX ? 'scaleX(-1)' : '', d.rotate ? `rotate(${d.rotate}deg)` : ''].filter(Boolean).join(' ')
  const transformCss = transform ? `transform:${transform};transform-origin:center;` : ''
  const display = d.display ?? 'block'
  const width = d.width || (display === 'block' ? '100%' : '45%')

  const imgStyle = [
    'width:100%', 'display:block',
    radius ? `border-radius:${radius}px` : '',
    shadow ? `box-shadow:${shadow}` : '',
    border, transformCss,
  ].filter(Boolean).join(';')
  const img = `<img src="${esc(d.src)}" alt="${esc(d.alt ?? '')}" ${d.naturalWidth ? `data-w="${d.naturalWidth}"` : ''} width="100%" style="${imgStyle}"/>`

  // 浮动 / 通栏
  if (display === 'float-left' || display === 'float-right') {
    const isR = display === 'float-right'
    const fm = d.floatMargin && d.floatMargin > 0
      ? isR ? `margin-right:${d.floatMargin}px;` : `margin-left:${d.floatMargin}px;`
      : ''
    const wrap = `<section data-block-id="${b.id}" style="${isR ? 'float:right;' : 'float:left;'}width:${width};${isR ? 'margin-left:8px;' : 'margin-right:8px;'}margin-bottom:8px;${fm}${styleOf({ ...b.style, width: undefined })}">${img}</section>`
    if (!d.caption) return wrap
    return wrap + `<div style="width:100%;margin-top:6px;text-align:center;font-size:13px;color:${ctx.tokens.colorMuted};line-height:1.5">${esc(d.caption)}</div>`
  }

  // 通栏
  const wrap = `<section data-block-id="${b.id}" style="${styleOf(b.style, { 'line-height': 0, 'font-size': 0 })}">${img}</section>`
  if (!d.caption) return wrap
  return `<figure data-block-id="${b.id}" style="${styleOf(b.style, { margin: '0' })}">${img}` +
    `<figcaption style="margin-top:8px;text-align:center;font-size:13px;color:${ctx.tokens.colorMuted};line-height:1.6">${esc(d.caption)}</figcaption></figure>`
}

function renderWechatEco(d: WechatEcoData, b: Block, ctx: RenderCtx): string {
  const eco = d.ecoType ?? 'miniprogram'
  const title = d.title || (eco === 'miniprogram' ? '小程序卡片' : eco === 'channels' ? '视频号动态' : '微信小店商品')
  const badge = eco === 'miniprogram' ? '小程序' : eco === 'channels' ? '视频号' : '微信小店'
  const img = d.imageUrl
    ? `<img src="${esc(d.imageUrl)}" style="width:100%;display:block;border-radius:8px" width="100%"/>`
    : `<div style="width:100%;padding:28px 0;text-align:center;background:#f2f3f5;color:#999;font-size:13px;border-radius:8px">${badge}封面</div>`
  const card = `<section data-block-id="${b.id}" style="${styleOf(b.style, { background: '#f6f7f9', border: '1px solid #ececec', borderRadius: '10px', padding: '12px' })}">` +
    (d.imageUrl ? `<div style="margin-bottom:8px">${img}</div>` : '') +
    `<div style="font-size:15px;font-weight:600;color:#222;margin-bottom:4px">${esc(title)}</div>` +
    `<div style="font-size:12px;color:#888">${badge}${d.appId ? ` · ${esc(d.appId)}` : ''} · 点击在微信内打开</div>` +
    `</section>`
  const note = '微信生态组件需在公众号后台关联账号后渲染；下方为可直接粘贴到公众号后台的规范组件代码。'
  return `${card}\n<!-- ${note}\n${buildEcoSnippet(d)}\n-->`
}

/** 生成可直接粘贴到公众号后台的规范微信组件代码 */
export function buildEcoSnippet(d: WechatEcoData): string {
  const eco = d.ecoType ?? 'miniprogram'
  if (eco === 'miniprogram') {
    return `<mp-miniprogram\n  data-miniprogram-appid="${d.appId || 'APPID'}"\n  data-miniprogram-path="${d.path || 'PAGE/PATH'}"\n  data-miniprogram-title="${d.title || '标题'}"\n  data-miniprogram-imageurl="${d.imageUrl || 'COVER_URL'}"\n  data-miniprogram-type="card"></mp-miniprogram>`
  }
  if (eco === 'channels') {
    return `<!-- 视频号：在公众号后台插入「视频号」组件，填入 feedId：${d.feedId || 'FINDER_FEED_ID'} -->`
  }
  return `<!-- 微信小店：在公众号后台插入「微信小店」组件，填入商品 id：${d.productId || 'PRODUCT_ID'} -->`
}

function renderGallery(d: GalleryData, b: Block, ctx: RenderCtx): string {
  const radius = d.radius ?? 6
  const gap = d.gap ?? 8
  const imgHtml = (it: GalleryData['images'][number], w?: string) =>
    `<img src="${esc(it.src)}" alt="${esc(it.alt ?? '')}" ${it.naturalWidth ? `data-w="${it.naturalWidth}"` : ''} width="100%" style="width:100%;display:block;border-radius:${radius}px;${w ? `min-width:${w};` : ''}"/>`

  if (d.layout === 'scroll') {
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, {
      'overflow-x': 'auto', 'white-space': 'nowrap', 'line-height': 0, 'font-size': 0, '-webkit-overflow-scrolling': 'touch',
    })}">` +
      d.images.map((it) => `<span style="display:inline-block;width:76%;margin-right:${gap}px;vertical-align:top">${imgHtml(it)}</span>`).join('') +
      `</section>`
  }
  if (d.layout === 'grid2' || d.layout === 'grid3') {
    const cols = d.layout === 'grid2' ? 2 : 3
    const w = `calc((100% - ${(cols - 1) * gap}px) / ${cols})`
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, {
      display: 'flex', 'flex-wrap': 'wrap', gap: `${gap}px`, 'line-height': 0, 'font-size': 0,
    })}">` +
      d.images.map((it) => `<span style="width:${w};display:block">${imgHtml(it)}</span>`).join('') +
      `</section>`
  }
  return `<section data-block-id="${b.id}" style="${styleOf(b.style, { 'line-height': 0, 'font-size': 0 })}">` +
    d.images.map((it) => `<span style="display:block;margin-bottom:${gap}px">${imgHtml(it)}</span>`).join('') +
    `</section>`
}

async function renderCode(d: CodeData, b: Block, ctx: RenderCtx): Promise<string> {
  const { html } = await highlightToWechat(d.code ?? '', {
    lang: d.lang, theme: d.theme, showLineNumbers: d.showLineNumbers,
    highlight: d.highlight, diff: d.diff, scroll: d.scroll ?? true,
    lineHeight: d.lineHeight, startLine: d.startLine, title: d.title,
    accent: ctx.tokens.colorMuted,
  })
  // 把块级外边距注入到最外层 section
  const outer = styleOf(b.style, {})
  return html.replace('<section style="', `<section data-block-id="${b.id}" style="${outer};`)
}

function renderTable(d: TableData, b: Block, ctx: RenderCtx): string {
  const t = ctx.tokens
  const rows = d.rows ?? []
  const colCount = Math.max(...rows.map((r) => r.length), 1)
  const widths = d.widths?.length === colCount ? d.widths : Array.from({ length: colCount }, () => Math.round(100 / colCount))
  const aligns = d.align ?? []
  const fs = d.fontSize ?? 14
  const borderColor = d.borderColor ?? t.colorBorder

  const cellStyle = (isHeader: boolean, rowIdx: number, colIdx: number) => {
    const parts: string[] = [
      `padding:8px 10px`,
      `font-size:${fs}px`,
      `line-height:1.6`,
      `text-align:${aligns[colIdx] ?? 'left'}`,
      `vertical-align:top`,
      `word-break:break-word`,
    ]
    if (isHeader) {
      parts.push(`background-color:${d.headerBg ?? t.colorSurface}`, `color:${d.headerColor ?? t.headingColor}`, `font-weight:600`)
    } else if (d.zebra && rowIdx % 2 === 1) {
      parts.push(`background-color:${d.zebraColor ?? hexA(t.colorSurface, 0.5)}`)
    }
    if (d.borderMode === 'all') parts.push(`border:1px solid ${borderColor}`)
    else if (d.borderMode === 'horizontal') parts.push(`border-bottom:1px solid ${borderColor}`)
    else if (d.borderMode === 'outer') {
      const edges: string[] = []
      if (rowIdx === 0) edges.push(`border-top:1px solid ${borderColor}`)
      if (rowIdx === rows.length - 1) edges.push(`border-bottom:1px solid ${borderColor}`)
      if (colIdx === 0) edges.push(`border-left:1px solid ${borderColor}`)
      if (colIdx === colCount - 1) edges.push(`border-right:1px solid ${borderColor}`)
      parts.push(...edges)
    }
    return parts.join(';')
  }

  const body = rows.map((row, ri) => {
    const isHeader = d.header && ri === 0
    const cells = Array.from({ length: colCount }, (_, ci) => {
      const tag = isHeader ? 'th' : 'td'
      const content = richText(row[ci] ?? '')
      return `<${tag} style="${cellStyle(isHeader, ri, ci)}">${content}</${tag}>`
    }).join('')
    return `<tr>${cells}</tr>`
  }).join('')

  const colgroup = `<colgroup>${widths.map((w) => `<col style="width:${w}%"/>`).join('')}</colgroup>`

  return `<section data-block-id="${b.id}" style="${styleOf(b.style, { 'overflow-x': 'auto', '-webkit-overflow-scrolling': 'touch' })}">` +
    `<table style="width:100%;border-collapse:collapse;table-layout:fixed">${colgroup}${body}</table></section>`
}

function renderDivider(d: DividerData, b: Block, ctx: RenderCtx): string {
  const t = ctx.tokens
  const color = d.color ?? t.colorBorder
  const w = d.width ?? '100%'
  if (d.variant === 'space') {
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, { height: px(d.height ?? 24) })}"></section>`
  }
  if (d.variant === 'symbol') {
    const sym = d.symbol ?? '• • •'
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, { 'text-align': 'center', color, 'letter-spacing': '4px', 'font-size': '13px' })}">` +
      `<span leaf>${esc(sym)}</span></section>`
  }
  if (d.variant === 'gradient') {
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, {
      height: px(d.height ?? 3), width: w,
      'background-image': `linear-gradient(to right, transparent, ${t.colorPrimary}, transparent)`,
    })}"></section>`
  }
  const style = d.variant === 'dashed' ? 'dashed' : d.variant === 'dotted' ? 'dotted' : 'solid'
  return `<section data-block-id="${b.id}" style="${styleOf(b.style, {
    'border-top': `${d.height ?? 1}px ${style} ${color}`, width: w,
  })}"></section>`
}

function renderCard(d: CardData, b: Block, ctx: RenderCtx): string {
  const t = ctx.tokens
  const variant = d.variant ?? 'plain'
  const box = styleOf(b.style, {
    padding: '16px',
    'border-radius': px(t.radius),
    'background-color': variant === 'plain' ? t.colorSurface : '#fff',
    border: variant === 'outline' ? `1px solid ${t.colorBorder}` : undefined,
    'box-shadow': variant === 'shadow' ? SHADOWS.md : undefined,
    'border-left': variant === 'accent' ? `4px solid ${t.colorPrimary}` : undefined,
  })
  const imgHtml = d.imageUrl
    ? `<img src="${esc(d.imageUrl)}" width="100%" style="width:100%;display:block;border-radius:${px(Math.max(0, t.radius - 2))}"/>`
    : ''
  const titleHtml = d.title
    ? `<span leaf style="display:block;font-size:${Math.round(t.fontSize * 1.05)}px;font-weight:600;color:${t.headingColor};margin-bottom:8px;line-height:1.5">${richText(d.title)}</span>`
    : ''
  const bodyHtml = `<span leaf style="display:block;font-size:${t.fontSize}px;color:${t.colorText};line-height:${t.lineHeight}">${richText(d.html)}</span>`
  const footHtml = d.footer
    ? `<span leaf style="display:block;margin-top:10px;font-size:12px;color:${t.colorMuted}">${richText(d.footer)}</span>`
    : ''

  if (d.imagePosition === 'left' || d.imagePosition === 'right') {
    const imgSpan = `<span style="width:36%;display:block;flex-shrink:0">${imgHtml}</span>`
    const textSpan = `<span style="flex:1;min-width:0">${titleHtml}${bodyHtml}${footHtml}</span>`
    return `<section data-block-id="${b.id}" style="${box};display:flex;gap:12px;align-items:flex-start">` +
      (d.imagePosition === 'left' ? imgSpan + textSpan : textSpan + imgSpan) + `</section>`
  }
  return `<section data-block-id="${b.id}" style="${box}">` +
    (d.imagePosition === 'top' && imgHtml ? `<span style="display:block;margin-bottom:12px">${imgHtml}</span>` : '') +
    titleHtml + bodyHtml + footHtml + `</section>`
}

const CALLOUT_COLORS: Record<string, { bg: string; bar: string; fg: string }> = {
  info: { bg: '#EEF4FF', bar: '#2C6BED', fg: '#1F3A6E' },
  success: { bg: '#EDF7F2', bar: '#1D9E75', fg: '#14543F' },
  warning: { bg: '#FFF7E6', bar: '#E8A33D', fg: '#7A4E10' },
  danger: { bg: '#FDEDED', bar: '#D64545', fg: '#8E1B1B' },
  tip: { bg: '#F4F0FF', bar: '#7C5CFF', fg: '#3D2E8C' },
}

function renderCallout(d: CalloutData, b: Block, ctx: RenderCtx): string {
  const t = ctx.tokens
  const c = CALLOUT_COLORS[d.tone] ?? CALLOUT_COLORS.info
  const variant = d.variant ?? 'card'
  const icon = d.icon ?? { info: 'ℹ', success: '✓', warning: '!', danger: '✕', tip: '★' }[d.tone] ?? 'ℹ'
  const titleHtml = d.title
    ? `<span leaf style="display:block;font-weight:600;color:${c.fg};margin-bottom:6px;font-size:${t.fontSize}px">${richText(d.title)}</span>`
    : ''
  const bodyHtml = `<span leaf style="display:block;font-size:${t.fontSize}px;line-height:${t.lineHeight};color:${t.colorText}">${richText(d.html)}</span>`

  if (variant === 'minimal') {
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, {})}">` +
      `<span leaf style="display:block;padding-left:10px;border-left:3px solid ${c.bar};color:${c.fg};font-size:${t.fontSize}px;line-height:${t.lineHeight}">${titleHtml}${bodyHtml}</span></section>`
  }
  if (variant === 'bar') {
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, {
      'background-color': c.bg, 'border-left': `4px solid ${c.bar}`, padding: '12px 14px',
    })}">${titleHtml}${bodyHtml}</section>`
  }
  return `<section data-block-id="${b.id}" style="${styleOf(b.style, {
    'background-color': c.bg, 'border-radius': px(t.radius), padding: '14px 16px', display: 'flex', gap: '10px',
  })}">` +
    `<span style="flex-shrink:0;width:20px;height:20px;line-height:20px;text-align:center;border-radius:50%;background-color:${c.bar};color:#fff;font-size:12px;font-weight:700">${esc(icon)}</span>` +
    `<span style="flex:1;min-width:0">${titleHtml}${bodyHtml}</span></section>`
}

function renderTimeline(d: TimelineData, b: Block, ctx: RenderCtx): string {
  const t = ctx.tokens
  const variant = d.variant ?? 'dot'
  const items = (d.items ?? []).map((it, i) => {
    const isLast = i === (d.items?.length ?? 0) - 1
    const line = !isLast
      ? `<span style="position:static;display:block;width:1px;flex:1;min-height:20px;background-color:${t.colorBorder};margin:4px 0"></span>`
      : `<span style="display:block;flex:1;min-height:8px"></span>`
    const content = [
      it.time ? `<span leaf style="display:block;font-size:12px;color:${t.colorMuted};margin-bottom:2px">${richText(it.time)}</span>` : '',
      it.title ? `<span leaf style="display:block;font-weight:600;color:${t.headingColor};font-size:${t.fontSize}px;margin-bottom:4px">${richText(it.title)}</span>` : '',
      it.html ? `<span leaf style="display:block;font-size:${t.fontSize - 1}px;color:${t.colorText};line-height:${t.lineHeight}">${richText(it.html)}</span>` : '',
    ].join('')
    if (variant === 'card') {
      return `<section style="display:flex;gap:10px;margin-bottom:10px">` +
        `<span style="flex-shrink:0;display:flex;flex-direction:column;align-items:center">` +
        `<span style="width:8px;height:8px;border-radius:50%;background-color:${t.colorPrimary};display:block"></span>${line}</span>` +
        `<span style="flex:1;background-color:${t.colorSurface};border-radius:${px(t.radius)};padding:10px 12px">${content}</span></section>`
    }
    return `<section style="display:flex;gap:10px">` +
      `<span style="flex-shrink:0;display:flex;flex-direction:column;align-items:center">` +
      `<span style="width:8px;height:8px;border-radius:50%;background-color:${t.colorPrimary};display:block;margin-top:6px"></span>${line}</span>` +
      `<span style="flex:1;padding-bottom:8px">${content}</span></section>`
  }).join('')
  return `<section data-block-id="${b.id}" style="${styleOf(b.style, {})}">${items}</section>`
}

function renderSteps(d: StepsData, b: Block, ctx: RenderCtx): string {
  const t = ctx.tokens
  const variant = d.variant ?? 'number'
  const items = (d.items ?? []).map((it, i) => {
    const badge = variant === 'check'
      ? `<span style="width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background-color:${t.colorPrimary};color:#fff;font-size:12px;flex-shrink:0">✓</span>`
      : variant === 'dot'
        ? `<span style="width:8px;height:8px;border-radius:50%;background-color:${t.colorPrimary};flex-shrink:0;margin-top:8px"></span>`
        : `<span style="width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background-color:${t.colorPrimary};color:#fff;font-size:12px;font-weight:700;flex-shrink:0">${i + 1}</span>`
    const content = [
      it.title ? `<span leaf style="display:block;font-weight:600;color:${t.headingColor};font-size:${t.fontSize}px;margin-bottom:4px">${richText(it.title)}</span>` : '',
      it.html ? `<span leaf style="display:block;font-size:${t.fontSize - 1}px;color:${t.colorText};line-height:${t.lineHeight}">${richText(it.html)}</span>` : '',
    ].join('')
    return `<section style="display:flex;gap:10px;margin-bottom:12px">${badge}<span style="flex:1">${content}</span></section>`
  }).join('')
  return `<section data-block-id="${b.id}" style="${styleOf(b.style, {})}">${items}</section>`
}

function renderAccordion(d: AccordionData, b: Block, ctx: RenderCtx): string {
  const t = ctx.tokens
  // <details> 在部分机型不可靠 → 默认降级为静态展开
  if (d.fallbackOpen !== false) {
    const items = (d.items ?? []).map((it) =>
      `<section style="margin-bottom:10px;background-color:${t.colorSurface};border-radius:${px(t.radius)};padding:10px 12px">` +
      `<span leaf style="display:block;font-weight:600;color:${t.headingColor};font-size:${t.fontSize}px;margin-bottom:4px">▾ ${richText(it.title)}</span>` +
      `<span leaf style="display:block;font-size:${t.fontSize - 1}px;color:${t.colorText};line-height:${t.lineHeight}">${richText(it.html)}</span></section>`,
    ).join('')
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, {})}">${items}</section>`
  }
  const items = (d.items ?? []).map((it) =>
    `<details style="margin-bottom:8px;background-color:${t.colorSurface};border-radius:${px(t.radius)};padding:8px 12px">` +
    `<summary style="font-weight:600;color:${t.headingColor};font-size:${t.fontSize}px;cursor:pointer">${richText(it.title)}</summary>` +
    `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 1}px;color:${t.colorText};line-height:${t.lineHeight}">${richText(it.html)}</span></details>`,
  ).join('')
  return `<section data-block-id="${b.id}" style="${styleOf(b.style, {})}">${items}</section>`
}

function renderButton(d: ButtonData, b: Block, ctx: RenderCtx): string {
  const t = ctx.tokens
  const size = d.size ?? 'md'
  const pad = { sm: '8px 16px', md: '11px 24px', lg: '14px 34px' }[size]
  const fs = { sm: 13, md: 15, lg: 17 }[size]
  let inner = ''
  if (d.variant === 'outline' || d.variant === 'ghost') {
    inner = `background-color:transparent;color:${t.colorPrimary};border:1px solid ${t.colorPrimary}`
  } else if (d.variant === 'gradient') {
    inner = `background-image:linear-gradient(135deg, ${t.colorPrimary}, ${t.colorAccent});color:#fff`
  } else {
    inner = `background-color:${t.colorPrimary};color:#fff`
  }
  const style = styleOf(b.style, {
    display: d.fullWidth ? 'block' : 'inline-block',
    padding: pad,
    'font-size': px(fs),
    'text-align': 'center',
    'border-radius': px(Math.max(4, t.radius)),
    'text-decoration': 'none',
    'font-weight': 600,
  }) + ';' + inner
  const label = esc(d.text || '按钮')
  const inner2 = d.link
    ? `<a href="${esc(d.link)}" style="display:block;color:inherit;text-decoration:none">${label}</a>`
    : `<span leaf>${label}</span>`
  return `<section data-block-id="${b.id}" style="text-align:center;margin:16px 0">` +
    `<span style="${style}">${inner2}</span></section>`
}

function renderSvg(d: SvgData, b: Block, ctx: RenderCtx): string {
  let svg = d.svg ?? ''
  if (!svg) return ''
  if (d.anim && d.anim.tracks?.length && !ctx.stripAnimation) {
    svg = compileAnimation(svg, d.anim).svg
  } else if (ctx.stripAnimation) {
    svg = stripAnimation(svg)
  }
  return wrapSvgForWechat(svg, { maxWidth: ctx.maxWidth, align: 'center' })
    .replace('<section style="', `<section data-block-id="${b.id}" style="${styleOf(b.style, {})};`)
}

function renderLottie(d: LottieData, b: Block, ctx: RenderCtx): string {
  const outer = styleOf(b.style, { 'line-height': 0, 'font-size': 0, 'text-align': 'center' })
  if (d.mode === 'gif' && d.gifUrl) {
    return `<section data-block-id="${b.id}" style="${outer}">` +
      `<img src="${esc(d.gifUrl)}" width="100%" data-w="${d.width ?? 400}" style="width:100%;display:block"/></section>`
  }
  const svg = d.output ?? ''
  if (!svg) return `<section data-block-id="${b.id}" style="${outer}"></section>`
  return wrapSvgForWechat(svg, { maxWidth: ctx.maxWidth }).replace('<section style="', `<section data-block-id="${b.id}" style="${outer};`)
}

function renderVideo(d: VideoData, b: Block, ctx: RenderCtx): string {
  const t = ctx.tokens
  if (d.mode === 'official' && d.vid) {
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, { 'text-align': 'center' })}">` +
      `<mp-common-video data-vid="${esc(d.vid)}" data-title="${esc(d.title ?? '')}"></mp-common-video></section>`
  }
  const poster = d.poster
    ? `<img src="${esc(d.poster)}" width="100%" data-w="1080" style="width:100%;display:block;border-radius:${px(t.radius)}"/>`
    : `<span leaf style="display:block;height:200px;background-color:${t.colorSurface};border-radius:${px(t.radius)};text-align:center;line-height:200px;color:${t.colorMuted}">视频封面</span>`
  const badge = `<span style="position:static;display:block;margin-top:-120px;margin-bottom:96px;text-align:center">` +
    `<span style="display:inline-block;width:56px;height:56px;line-height:56px;border-radius:50%;background-color:rgba(0,0,0,.5);color:#fff;font-size:22px;text-align:center">▶</span></span>`
  return `<section data-block-id="${b.id}" style="${styleOf(b.style, {})}">${poster}${badge}` +
    (d.title ? `<span leaf style="display:block;margin-top:8px;font-size:14px;color:${t.colorMuted};text-align:center">${esc(d.title)}</span>` : '') +
    `</section>`
}

function renderAudio(d: AudioData, b: Block, ctx: RenderCtx): string {
  const t = ctx.tokens
  if (d.mode === 'official') {
    return `<section data-block-id="${b.id}" style="${styleOf(b.style, {})}">` +
      `<mp-common-mpaudio data-src="${esc(d.url)}" data-title="${esc(d.title ?? '')}"></mp-common-mpaudio></section>`
  }
  const cover = d.cover
    ? `<img src="${esc(d.cover)}" width="64" height="64" style="width:64px;height:64px;border-radius:${px(t.radius)};display:block;flex-shrink:0"/>`
    : `<span style="width:64px;height:64px;border-radius:${px(t.radius)};background-color:${t.colorSurface};display:block;flex-shrink:0;text-align:center;line-height:64px;color:${t.colorMuted}">♪</span>`
  return `<section data-block-id="${b.id}" style="${styleOf(b.style, {
    display: 'flex', gap: '12px', 'align-items': 'center', padding: '12px',
    'background-color': t.colorSurface, 'border-radius': px(t.radius),
  })}">${cover}` +
    `<span style="flex:1;min-width:0">` +
    `<span leaf style="display:block;font-size:${t.fontSize}px;color:${t.headingColor};font-weight:600">${esc(d.title ?? '音频')}</span>` +
    (d.artist ? `<span leaf style="display:block;font-size:12px;color:${t.colorMuted};margin-top:2px">${esc(d.artist)}</span>` : '') +
    `<span leaf style="display:block;font-size:12px;color:${t.colorPrimary};margin-top:6px">▶ 点击播放</span>` +
    `</span></section>`
}

async function renderQrcode(d: QrcodeData, b: Block, ctx: RenderCtx): Promise<string> {
  const t = ctx.tokens
  const size = d.size ?? 220
  const content = d.content || 'https://'
  const hash = crypto.createHash('md5').update(`${content}|${size}|${d.fg ?? '#000'}|${d.bg ?? '#fff'}`).digest('hex').slice(0, 12)
  const name = `qr-${hash}.png`
  const file = path.join(OUT_DIR, name)
  if (!fs.existsSync(file)) {
    const buf = await QRCode.toBuffer(content, {
      width: size * 2, margin: 1, errorCorrectionLevel: 'M',
      color: { dark: d.fg ?? '#000000ff', light: d.bg ?? '#ffffffff' },
    })
    fs.writeFileSync(file, buf)
  }
  const url = `/out/${name}`
  return `<section data-block-id="${b.id}" style="${styleOf(b.style, { 'text-align': 'center' })}">` +
    `<img src="${url}" width="${size}" height="${size}" data-w="${size}" style="width:${size}px;max-width:100%;height:auto;display:inline-block"/>` +
    (d.label ? `<span leaf style="display:block;margin-top:8px;font-weight:600;color:${t.headingColor};font-size:${t.fontSize}px">${esc(d.label)}</span>` : '') +
    (d.caption ? `<span leaf style="display:block;margin-top:4px;font-size:12px;color:${t.colorMuted}">${esc(d.caption)}</span>` : '') +
    `</section>`
}

function renderInteractive(d: InteractiveData, b: Block, ctx: RenderCtx, blockId: string): string {
  const t = ctx.tokens
  const panels = d.panels ?? []
  const width = d.width ?? ctx.maxWidth
  const height = d.height ?? 320

  switch (d.kind) {
    /** 滑动：原生 overflow-x + flex，无 JS */
    case 'slider': {
      const items = panels.map((p) =>
        `<span style="display:inline-block;width:80%;margin-right:8px;vertical-align:top;background-color:${t.colorSurface};border-radius:${px(t.radius)};overflow:hidden">` +
        (p.imageUrl ? `<img src="${esc(p.imageUrl)}" width="100%" style="width:100%;display:block"/>` : '') +
        (p.title ? `<span leaf style="display:block;padding:10px 12px;font-weight:600;color:${t.headingColor};font-size:${t.fontSize}px">${richText(p.title)}</span>` : '') +
        (p.html ? `<span leaf style="display:block;padding:0 12px 12px;font-size:${t.fontSize - 1}px;color:${t.colorText};line-height:${t.lineHeight}">${richText(p.html)}</span>` : '') +
        `</span>`).join('')
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'overflow-x': 'auto', 'white-space': 'nowrap', 'line-height': 0, 'font-size': 0, '-webkit-overflow-scrolling': 'touch',
      })}">${items}</section>`
    }

    /** 点击揭晓：SMIL set，begin="touchstart; click" —— 官方强制双写 */
    case 'click-reveal': {
      const q = panels[0], a = panels[1]
      const dur = '0.4s'
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        padding: '16px', 'background-color': t.colorSurface, 'border-radius': px(t.radius), 'text-align': 'center',
      })}">` +
        `<span leaf style="display:block;font-weight:600;font-size:${t.fontSize}px;color:${t.headingColor};margin-bottom:10px">${richText(q?.title ?? '点击揭晓')}</span>` +
        `<span style="display:block;position:static">` +
        `<span leaf style="display:block;font-size:${t.fontSize - 1}px;color:${t.colorMuted}">${richText(q?.html ?? '（点击查看）')}</span>` +
        `<span leaf style="display:block;margin-top:10px;opacity:0;font-size:${t.fontSize}px;color:${t.colorPrimary};font-weight:600">` +
        `<set attributeName="opacity" to="1" begin="touchstart; click" dur="${dur}" fill="freeze"/>${richText(a?.html ?? '')}</span>` +
        `</span></section>`
    }

    /** 长按：begin=touchstart / end=touchend —— 安卓端需循环媒介，已按规范补 */
    case 'longpress': {
      const a = panels[0]
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        padding: '16px', 'background-color': t.colorSurface, 'border-radius': px(t.radius), 'text-align': 'center',
      })}">` +
        `<span leaf style="display:block;font-size:${t.fontSize - 1}px;color:${t.colorMuted};margin-bottom:8px">${esc(d.hint ?? '长按此处')}</span>` +
        `<span leaf style="display:block;opacity:0;font-size:${t.fontSize}px;color:${t.colorPrimary};font-weight:600">` +
        `<set attributeName="opacity" to="1" begin="touchstart; click" end="touchend; mouseup" dur="3s" fill="freeze"/>` +
        `${richText(a?.html ?? '')}</span></section>`
    }

    /** 翻牌：点击后 rotateY 展开 */
    case 'flip': {
      const front = panels[0], back = panels[1]
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, { 'text-align': 'center', 'line-height': 0, 'font-size': 0 })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="display:block">` +
        `<g><animateTransform attributeName="transform" type="rotate" from="0 ${width / 2} ${height / 2}" to="180 ${width / 2} ${height / 2}" dur="0.6s" begin="touchstart; click" fill="freeze" additive="sum"/>` +
        `<rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="12" fill="${t.colorSurface}"/>` +
        `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="18" fill="${t.colorText}">${esc((front?.title ?? '正面').slice(0, 20))}</text>` +
        `</g>` +
        `<g opacity="0" transform="rotate(180 ${width / 2} ${height / 2})">` +
        `<set attributeName="opacity" to="1" begin="0.3s; touchstart+0.3s" dur="0.01s" fill="freeze"/>` +
        `<rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="12" fill="${t.colorPrimary}"/>` +
        `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="18" fill="#ffffff">${esc((back?.title ?? '背面').slice(0, 20))}</text>` +
        `</g></svg></section>`
    }

    /** 点击切换：各面板按时间片轮流显示，首次点击后启动 */
    case 'tab': {
      const n = Math.max(1, panels.length)
      const cycle = Math.max(2, n * 2)
      const items = panels.map((p, i) =>
        `<span leaf style="display:block;opacity:0;font-size:${t.fontSize}px;line-height:${t.lineHeight}">` +
        `<animate attributeName="opacity" values="1;0" keyTimes="0;${(1 / n).toFixed(3)}" calcMode="discrete" begin="${(i * (cycle / n)).toFixed(2)}s" dur="${cycle}s" repeatCount="indefinite"/>` +
        `${richText(p.html ?? p.title ?? '')}</span>`).join('')
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        padding: '14px', 'background-color': t.colorSurface, 'border-radius': px(t.radius),
      })}">${items}</section>`
    }

    /** 点击展开：每项独立触发 */
    case 'accordion-click': {
      const items = panels.map((p, i) =>
        `<section style="margin-bottom:8px;background-color:${t.colorSurface};border-radius:${px(t.radius)};padding:10px 12px">` +
        `<span leaf style="display:block;font-weight:600;color:${t.headingColor};font-size:${t.fontSize}px">▸ ${richText(p.title ?? '')}</span>` +
        `<span leaf style="display:block;opacity:0;max-height:0;font-size:${t.fontSize - 1}px;color:${t.colorText};line-height:${t.lineHeight}">` +
        `<set attributeName="opacity" to="1" begin="touchstart; click" dur="0.3s" fill="freeze"/>${richText(p.html ?? '')}</span></section>`).join('')
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {})}">${items}</section>`
    }

    /** 刮刮卡：无 JS 无法真实刮开 → 降级并给出诊断 */
    case 'scratch': {
      ctx.diagnostics.push({
        level: 'error', rule: 'interactive-unsupported',
        message: '刮刮卡依赖 JS 手势，公众号正文无法支持，已降级为静态展示',
        blockId, fix: 'remove-animation',
      })
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        padding: '16px', 'background-color': t.colorSurface, 'border-radius': px(t.radius), 'text-align': 'center',
      })}">` +
        (panels[0]?.imageUrl ? `<img src="${esc(panels[0].imageUrl)}" width="100%" style="width:100%;display:block;border-radius:${px(t.radius)}"/>` : '') +
        `<span leaf style="display:block;margin-top:8px;font-size:${t.fontSize}px;color:${t.colorText}">${richText(panels[1]?.html ?? panels[0]?.title ?? '')}</span></section>`
    }

    /** 轮播图：SVG 多图离散透明度自动切换（无 JS） */
    case 'carousel': {
      const n = Math.max(1, panels.length)
      const W = d.width ?? ctx.maxWidth
      const H = d.height ?? 240
      const cycle = Math.max(2, n * 2)
      const imgs = panels.map((p, i) => {
        const src = p.imageUrl ? esc(p.imageUrl) : ''
        return `<image href="${src}" xlink:href="${src}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" opacity="${i === 0 ? 1 : 0}">` +
          `<animate attributeName="opacity" values="1;0" keyTimes="0;${(1 / n).toFixed(3)}" calcMode="discrete" begin="${(i * (cycle / n)).toFixed(2)}s" dur="${cycle}s" repeatCount="indefinite"/></image>`
      }).join('')
      const dots = panels.map((_, i) =>
        `<circle cx="${W / 2 + (i - (n - 1) / 2) * 14}" cy="${H - 12}" r="4" fill="${i === 0 ? t.colorPrimary : '#ffffff'}" opacity="0.85"/>`).join('')
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, { 'text-align': 'center' })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;border-radius:${px(t.radius)}">${imgs}${dots}</svg></section>`
    }

    /** 进度条：点击后 SMIL 填充到目标比例（无 JS） */
    case 'progress': {
      const pct = Math.max(0, Math.min(1, d.progress ?? 0.85))
      const W = d.width ?? ctx.maxWidth
      const H = d.height ?? 28
      const label = panels[0]?.html ?? `${Math.round(pct * 100)}%`
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, { 'text-align': 'center' })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">` +
        `<rect x="0" y="0" width="${W}" height="${H}" rx="${H / 2}" fill="${t.colorSurface}"/>` +
        `<rect x="0" y="0" width="0" height="${H}" rx="${H / 2}" fill="${t.colorPrimary}">` +
        `<animate attributeName="width" from="0" to="${(W * pct).toFixed(1)}" begin="touchstart; click" dur="1s" fill="freeze"/></rect>` +
        `<text x="${W / 2}" y="${H / 2}" dy="0.35em" text-anchor="middle" font-size="${Math.max(12, H - 10)}" fill="#ffffff" font-weight="600">${esc(label.slice(0, 12))}</text>` +
        `</svg></section>`
    }

    /** 跑马灯：SVG 图片条横向无限滚动（无 JS） */
    case 'marquee': {
      const n = Math.max(1, panels.filter((p) => p.imageUrl).length)
      const H = d.height ?? 120
      const imgW = Math.max(80, Math.round((d.width ?? ctx.maxWidth) / 2))
      const totalW = n * imgW
      const imgs = panels.filter((p) => p.imageUrl).map((p, i) => {
        const src = esc(p.imageUrl!)
        return `<image href="${src}" xlink:href="${src}" x="${i * imgW}" y="0" width="${imgW}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`
      }).join('')
      const dur = Math.max(4, n * 3)
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, { 'text-align': 'center', overflow: 'hidden' })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${H}" width="100%" height="${H}" style="display:block">` +
        `<g><animateTransform attributeName="transform" type="translate" from="0 0" to="${-(totalW - imgW).toFixed(0)} 0" dur="${dur}s" repeatCount="indefinite"/>${imgs}</g></svg></section>`
    }

    /** 展开全文：原生 <details> 折叠，微信支持 */
    case 'read-more': {
      const summary = panels[0]?.html ?? panels[0]?.title ?? '点击阅读全文'
      const full = panels[1]?.html ?? panels[1]?.title ?? ''
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'background-color': t.colorSurface, 'border-radius': px(t.radius), padding: '14px',
      })}">` +
        `<details><summary style="cursor:pointer;font-weight:600;color:${t.headingColor};font-size:${t.fontSize}px">${richText(summary)}</summary>` +
        `<span leaf style="display:block;margin-top:10px;font-size:${t.fontSize - 1}px;color:${t.colorText};line-height:${t.lineHeight}">${richText(full)}</span>` +
        `</details></section>`
    }

    /** 点赞：心形点击后 SMIL 填充变主色（无 JS，展示型） */
    case 'like': {
      const cap = panels[0]?.html ?? '点赞'
      const heart = 'M12 21s-7.5-4.6-10-9.2C.7 9 2 5 5.5 5c2 0 3.2 1.1 4.5 2.4C11.3 6.1 12.5 5 14.5 5 18 5 19.3 9 17 11.8 14.5 16.4 12 21 12 21z'
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', padding: '16px', 'background-color': t.colorSurface, 'border-radius': px(t.radius),
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="60" height="60" style="display:inline-block;cursor:pointer">` +
        `<path d="${heart}" fill="${t.colorMuted}">` +
        `<animate attributeName="fill" to="${t.colorPrimary}" begin="touchstart; click" dur="0.2s" fill="freeze"/></path></svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 1}px;color:${t.colorMuted}">${richText(cap)}</span></section>`
    }

    /** 星级评分：默认点亮 value 颗，点击后亮星重播填充动画（展示型） */
    case 'rating': {
      const count = Math.max(1, Math.min(10, d.count ?? 5))
      const val = Math.max(0, Math.min(count, d.value ?? count))
      const W = 30, gap = 6
      const totalW = count * (W + gap)
      const stars = Array.from({ length: count }, (_, i) => {
        const lit = i < val
        return `<text x="${i * (W + gap) + W / 2}" y="${W * 0.82}" text-anchor="middle" font-size="${W}" fill="${lit ? t.colorPrimary : t.colorMuted}">★` +
          (lit ? `<animate attributeName="fill" to="${t.colorPrimary}" begin="touchstart; click" dur="0.15s" fill="freeze"/>` : '') +
          `</text>`
      }).join('')
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, { 'text-align': 'center', padding: '14px' })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${W}" width="100%" height="${W}" style="display:block;max-width:${totalW}px;margin:0 auto">${stars}</svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 1}px;color:${t.colorMuted}">${richText(panels[0]?.html ?? `${val}/${count}`)}</span></section>`
    }

    /** 图片放大：点击后 SMIL 轻微放大反馈（无 JS） */
    case 'zoom': {
      const src = panels[0]?.imageUrl ? esc(panels[0].imageUrl) : ''
      const W = d.width ?? ctx.maxWidth, H = d.height ?? 220
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, { 'text-align': 'center', overflow: 'hidden' })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;border-radius:${px(t.radius)};cursor:pointer">` +
        `<image href="${src}" xlink:href="${src}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">` +
        `<animateTransform attributeName="transform" type="scale" values="1;1.25;1" begin="touchstart; click" dur="0.6s" fill="freeze" additive="sum"/></image></svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 1}px;color:${t.colorMuted}">${richText(d.hint ?? '点击放大')}</span></section>`
    }

    /** 打字机：点击后逐字显现（SVG tspan + SMIL set，无 JS） */
    case 'typewriter': {
      const raw = (panels[0]?.html ?? panels[0]?.title ?? '').replace(/<[^>]+>/g, '')
      const chars = Array.from(raw).slice(0, 48)
      const spans = chars.map((ch, i) =>
        `<tspan opacity="0">${esc(ch)}<set attributeName="opacity" to="1" begin="touchstart+${(i * 0.06).toFixed(2)}s; click+${(i * 0.06).toFixed(2)}s" dur="0.01s" fill="freeze"/></tspan>`).join('')
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        padding: '16px', 'background-color': t.colorSurface, 'border-radius': px(t.radius),
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 40" width="100%" height="40" style="display:block">` +
        `<text x="0" y="26" font-size="18" fill="${t.colorText}">${spans}</text></svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 1}px;color:${t.colorMuted}">${richText(d.hint ?? '点击播放打字效果')}</span></section>`
    }

    /** 开关：点击后轨道变主色 + 滑块右移（展示型，无 JS） */
    case 'switch': {
      const onL = d.onLabel ?? '开', offL = d.offLabel ?? '关'
      const W = 64, H = 32
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, { 'text-align': 'center', padding: '14px' })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:inline-block;cursor:pointer;vertical-align:middle">` +
        `<rect x="0" y="0" width="${W}" height="${H}" rx="${H / 2}" fill="${t.colorSurface}">` +
        `<animate attributeName="fill" to="${t.colorPrimary}" begin="touchstart; click" dur="0.2s" fill="freeze"/></rect>` +
        `<circle cx="${H / 2}" cy="${H / 2}" r="${H / 2 - 4}" fill="#ffffff">` +
        `<animate attributeName="cx" to="${W - H / 2}" begin="touchstart; click" dur="0.2s" fill="freeze"/></circle></svg>` +
        `<span leaf style="display:inline-block;margin-left:8px;vertical-align:middle;font-size:${t.fontSize - 1}px;color:${t.colorText}">${esc(onL + ' / ' + offL)}</span></section>`
    }

    /** 环形进度：点击后 SMIL 描边 dashoffset 填充到目标比例（无 JS） */
    case 'progress-ring': {
      const pct = Math.max(0, Math.min(1, d.progress ?? 0.7))
      const W = d.width ?? 200, H = d.height ?? 200
      const cx = W / 2, cy = H / 2, r = Math.max(10, Math.min(W, H) / 2 - 12)
      const circ = 2 * Math.PI * r
      const off = (circ * (1 - pct)).toFixed(1)
      const label = panels[0]?.html ?? `${Math.round(pct * 100)}%`
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, { 'text-align': 'center' })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;max-width:${W}px;margin:0 auto">` +
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.colorSurface}" stroke-width="12"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.colorPrimary}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${circ.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})">` +
        `<animate attributeName="stroke-dashoffset" from="${circ.toFixed(1)}" to="${off}" begin="touchstart; click" dur="1s" fill="freeze"/></circle>` +
        `<text x="${cx}" y="${cy}" dy="0.35em" text-anchor="middle" font-size="${Math.max(14, r * 0.5)}" fill="${t.colorText}" font-weight="600">${esc(label.slice(0, 12))}</text>` +
        `</svg></section>`
    }

    /** 点击提示：虚线胶囊触发，点击后下方气泡渐显（无 JS） */
    case 'tooltip': {
      const trig = panels[0]?.title ?? panels[0]?.html ?? '点击查看说明'
      const tip = panels[1]?.html ?? panels[1]?.title ?? '这里是提示内容'
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', padding: '14px', 'background-color': t.colorSurface, 'border-radius': px(t.radius),
      })}">` +
        `<span leaf style="display:inline-block;padding:6px 14px;border:1px dashed ${t.colorPrimary};border-radius:999px;color:${t.colorPrimary};font-size:${t.fontSize - 1}px;cursor:pointer">${richText(trig)}</span>` +
        `<span leaf style="display:block;margin-top:10px;opacity:0;font-size:${t.fontSize - 1}px;color:${t.colorText};line-height:${t.lineHeight};background-color:${t.colorSurface};border-radius:8px;padding:10px 12px;text-align:left">` +
        `<set attributeName="opacity" to="1" begin="touchstart; click" dur="0.2s" fill="freeze"/>${richText(tip)}</span></section>`
    }

    /** 图片标注：图片下方点击渐显标注说明（无 JS） */
    case 'hotzone': {
      const src = panels[0]?.imageUrl ? esc(panels[0].imageUrl) : ''
      const W = d.width ?? ctx.maxWidth, H = d.height ?? 220
      const tip = panels[1]?.html ?? panels[1]?.title ?? '这是图片上的标注说明'
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, { 'text-align': 'center' })}">` +
        (src ? `<img src="${src}" width="100%" style="width:100%;display:block;border-radius:${px(t.radius)}"/>` : '') +
        `<span leaf style="display:block;margin-top:8px;opacity:0;font-size:${t.fontSize - 1}px;color:${t.colorText};line-height:${t.lineHeight};background-color:${t.colorSurface};border-radius:8px;padding:8px 12px;text-align:left">` +
        `<set attributeName="opacity" to="1" begin="touchstart; click" dur="0.2s" fill="freeze"/>${richText(tip)}</span>` +
        `<span leaf style="display:block;margin-top:4px;font-size:${t.fontSize - 2}px;color:${t.colorMuted}">${richText(d.hint ?? '👆 点击图片下方查看标注')}</span></section>`
    }

    /** 前后对比：SVG 叠图，点击揭晓「处理后」覆盖「处理前」（无 JS，无需定位） */
    case 'before-after': {
      const before = panels[0]?.imageUrl ? esc(panels[0].imageUrl) : ''
      const after = panels[1]?.imageUrl ? esc(panels[1].imageUrl) : ''
      const W = d.width ?? ctx.maxWidth, H = d.height ?? 240
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, { 'text-align': 'center' })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;border-radius:${px(t.radius)};cursor:pointer">` +
        (before ? `<image href="${before}" xlink:href="${before}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>` : '') +
        (after ? `<image href="${after}" xlink:href="${after}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" opacity="0"><set attributeName="opacity" to="1" begin="touchstart; click" dur="0.3s" fill="freeze"/></image>` : '') +
        `<text x="8" y="${H - 10}" font-size="13" fill="#ffffff" font-weight="600">${esc(d.hint ?? '点击查看对比')}</text>` +
        `</svg></section>`
    }

    /** 多问答折叠：原生 <details> 多个 Q&A，微信支持（无 JS） */
    case 'faq': {
      const items = panels.map((p) =>
        `<details style="margin-bottom:8px;background-color:${t.colorSurface};border-radius:${px(t.radius)};padding:10px 12px">` +
        `<summary style="cursor:pointer;font-weight:600;color:${t.headingColor};font-size:${t.fontSize}px">${richText(p.title ?? '问题')}</summary>` +
        `<span leaf style="display:block;margin-top:8px;font-size:${t.fontSize - 1}px;color:${t.colorText};line-height:${t.lineHeight}">${richText(p.html ?? '')}</span></details>`).join('')
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {})}">${items}</section>`
    }

    /** 点击撒花：SVG 粒子向外飞散 + 淡出（无 JS） */
    case 'confetti': {
      const cap = panels[0]?.html ?? '恭喜'
      const W = d.width ?? 300, H = d.height ?? 200
      const colors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF9F45']
      const N = 12
      let parts = ''
      for (let i = 0; i < N; i++) {
        const ang = (Math.PI * 2 * i) / N
        const dx = (Math.cos(ang) * W * 0.4).toFixed(0)
        const dy = (Math.sin(ang) * H * 0.4).toFixed(0)
        const c = colors[i % colors.length]
        parts += `<rect x="${W / 2 - 4}" y="${H / 2 - 4}" width="8" height="8" rx="2" fill="${c}" opacity="0">` +
          `<animateTransform attributeName="transform" type="translate" from="0 0" to="${dx} ${dy}" begin="touchstart; click" dur="0.9s" fill="freeze"/>` +
          `<animate attributeName="opacity" values="1;1;0" keyTimes="0;0.6;1" begin="touchstart; click" dur="0.9s" fill="freeze"/>` +
          `</rect>`
      }
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', 'background-color': t.colorSurface, 'border-radius': px(t.radius), padding: '14px',
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">${parts}` +
        `<text x="${W / 2}" y="${H / 2}" dy="0.35em" text-anchor="middle" font-size="20" fill="${t.colorPrimary}" font-weight="700">${esc(cap.slice(0, 12))}</text></svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 1}px;color:${t.colorMuted}">${richText(d.hint ?? '点击撒花')}</span></section>`
    }

    /** 加载中三点：SMIL 自动循环呼吸（无 JS，自动播放） */
    case 'loading': {
      const cap = panels[0]?.html ?? '加载中…'
      const W = 120, H = 40
      const dots = [0, 1, 2].map((i) =>
        `<circle cx="${W / 2 + (i - 1) * 22}" cy="${H / 2}" r="6" fill="${t.colorPrimary}">` +
        `<animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" begin="${(i * 0.2).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', 'background-color': t.colorSurface, 'border-radius': px(t.radius), padding: '14px',
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="120" height="${H}" style="display:inline-block">${dots}</svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 1}px;color:${t.colorMuted}">${richText(cap)}</span></section>`
    }

    /** 声波：SMIL 柱条循环起伏（无 JS，自动播放） */
    case 'soundwave': {
      const cap = panels[0]?.html ?? '语音 / 音频'
      const W = d.width ?? ctx.maxWidth, H = d.height ?? 80
      const bars = 16
      const bw = W / (bars * 1.6)
      let rects = ''
      for (let i = 0; i < bars; i++) {
        const x = i * (bw * 1.6)
        const h0 = 8 + (i % 4) * 6
        rects += `<rect x="${x.toFixed(1)}" y="${(H / 2 - h0 / 2).toFixed(1)}" width="${bw.toFixed(1)}" height="${h0}" rx="${(bw / 2).toFixed(1)}" fill="${t.colorPrimary}">` +
          `<animate attributeName="height" values="${h0};${H - 10};${h0}" dur="1s" begin="${(i * 0.06).toFixed(2)}s" repeatCount="indefinite"/>` +
          `<animate attributeName="y" values="${(H / 2 - h0 / 2).toFixed(1)};5;${(H / 2 - h0 / 2).toFixed(1)}" dur="1s" begin="${(i * 0.06).toFixed(2)}s" repeatCount="indefinite"/></rect>`
      }
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', 'background-color': t.colorSurface, 'border-radius': px(t.radius), padding: '10px',
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">${rects}</svg>` +
        `<span leaf style="display:block;margin-top:4px;font-size:${t.fontSize - 1}px;color:${t.colorMuted}">${richText(cap)}</span></section>`
    }

    /** 投票：SVG 柱状条，点击选项条填充到对应得票比例（无 JS） */
    case 'poll': {
      const opts = panels.length ? panels : [{ title: '选项 A' }, { title: '选项 B' }]
      const W = d.width ?? ctx.maxWidth
      const labelH = 18, rowH = 22, gap = 10
      const Hh = opts.length * (labelH + rowH + gap)
      const bars = opts.map((p, i) => {
        const label = p.title ?? `选项 ${i + 1}`
        const share = Math.max(0, Math.min(100, Number(p.html) || 0))
        const y0 = i * (labelH + rowH + gap)
        return `<text x="0" y="${y0 + labelH}" dy="0.35em" font-size="13" fill="${t.colorText}">${esc(label.slice(0, 12))}</text>` +
          `<rect x="0" y="${y0 + labelH + 2}" width="${W}" height="${rowH}" rx="${rowH / 2}" fill="${t.colorSurface}"/>` +
          `<rect x="0" y="${y0 + labelH + 2}" width="0" height="${rowH}" rx="${rowH / 2}" fill="${t.colorPrimary}">` +
          `<animate attributeName="width" from="0" to="${(W * share / 100).toFixed(0)}" begin="touchstart; click" dur="0.6s" fill="freeze"/></rect>`
      }).join('')
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        padding: '14px', 'background-color': t.colorSurface, 'border-radius': px(t.radius),
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" width="100%" height="${Hh}" style="display:block">${bars}</svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 2}px;color:${t.colorMuted}">${richText(d.hint ?? '点击选项查看得票')}</span></section>`
    }

    /** 逐条对话：点击后气泡按时间差依次渐显（无 JS，单点触发时间轴） */
    case 'chat': {
      const bubbles = panels.length ? panels : [{ html: '你好！' }, { html: '这是我们新上线的功能～' }, { html: '点击逐条查看' }]
      const lines = bubbles.map((p, i) =>
        `<span leaf style="display:block;max-width:80%;margin:6px 0;padding:8px 12px;border-radius:12px;font-size:${t.fontSize - 1}px;line-height:${t.lineHeight};opacity:0;${i % 2 === 0 ? `background-color:${t.colorSurface};` : `background-color:${t.colorPrimary};color:#ffffff;margin-left:auto`}">` +
        `<set attributeName="opacity" to="1" begin="touchstart+${(i * 0.8).toFixed(1)}s; click+${(i * 0.8).toFixed(1)}s" dur="0.2s" fill="freeze"/>${richText(p.html ?? p.title ?? '')}</span>`).join('')
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        padding: '14px', 'background-color': t.colorSurface, 'border-radius': px(t.radius),
      })}">${lines}` +
        `<span leaf style="display:block;text-align:center;font-size:${t.fontSize - 2}px;color:${t.colorMuted};margin-top:6px">${richText(d.hint ?? '点击逐条显示对话')}</span></section>`
    }

    /** 角标弹出：点击后星形徽标缩放下弹（无 JS） */
    case 'badge': {
      const label = panels[0]?.html ?? panels[0]?.title ?? 'NEW'
      const W = d.width ?? 120, H = d.height ?? 120
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, { 'text-align': 'center', padding: '14px' })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:inline-block;cursor:pointer">` +
        `<g transform="translate(${W / 2} ${H / 2})">` +
        `<path d="M0,-44 L12,-14 L44,-14 L18,8 L28,40 L0,20 L-28,40 L-18,8 L-44,-14 L-12,-14 Z" fill="${t.colorPrimary}">` +
        `<animateTransform attributeName="transform" type="scale" values="0;1.2;1" begin="touchstart; click" dur="0.5s" fill="freeze" additive="sum"/></path>` +
        `<text x="0" y="6" text-anchor="middle" font-size="16" fill="#ffffff" font-weight="700">${esc(label.slice(0, 8))}</text></g></svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 1}px;color:${t.colorMuted}">${richText(d.hint ?? '点击弹出角标')}</span></section>`
    }

    /** 倒计时：点击后环形描边在 N 秒内逐渐清空（无 JS） */
    case 'countdown': {
      const secs = Math.max(3, Math.min(60, Number(panels[0]?.html) || 10))
      const W = d.width ?? 160, H = d.height ?? 160
      const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 12
      const circ = 2 * Math.PI * r
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, { 'text-align': 'center', padding: '14px' })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:inline-block;cursor:pointer">` +
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.colorSurface}" stroke-width="10"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.colorPrimary}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="0" transform="rotate(-90 ${cx} ${cy})">` +
        `<animate attributeName="stroke-dashoffset" from="0" to="${circ.toFixed(1)}" begin="touchstart; click" dur="${secs}s" fill="freeze"/></circle>` +
        `<text x="${cx}" y="${cy}" dy="0.35em" text-anchor="middle" font-size="${Math.max(16, r * 0.5)}" fill="${t.colorText}" font-weight="700">${secs}s</text></svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 1}px;color:${t.colorMuted}">${richText(d.hint ?? '点击开始倒计时')}</span></section>`
    }

    /** 文字跑马灯：SVG 文本横向无限滚动（无 JS，自动播放） */
    case 'marquee-text': {
      const text = (panels[0]?.html ?? panels[0]?.title ?? '这是一条滚动播报文案，用于公告、促销、提醒等场景。').replace(/<[^>]+>/g, '')
      const H = d.height ?? 40
      const W = d.width ?? ctx.maxWidth
      const chars = Array.from(text).slice(0, 60).join('')
      const textW = Math.max(W, chars.length * 16)
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', overflow: 'hidden', 'background-color': t.colorSurface, 'border-radius': px(t.radius),
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">` +
        `<text font-size="${t.fontSize}" fill="${t.colorText}" y="${H / 2}" dy="0.35em"><tspan><animateTransform attributeName="transform" type="translate" from="${W} 0" to="${-textW} 0" dur="8s" repeatCount="indefinite"/></tspan>${esc(chars)}</text>` +
        `</svg></section>`
    }

    /** 渐显文字：点击后整段文字淡入（无 JS） */
    case 'reveal-fade': {
      const full = panels[0]?.html ?? panels[0]?.title ?? '点击后渐显的隐藏内容。'
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        padding: '14px', 'background-color': t.colorSurface, 'border-radius': px(t.radius),
      })}">` +
        `<span leaf style="display:block;opacity:0;font-size:${t.fontSize}px;line-height:${t.lineHeight};color:${t.colorText}">` +
        `<set attributeName="opacity" to="1" begin="touchstart; click" dur="0.6s" fill="freeze"/>${richText(full)}</span>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 2}px;color:${t.colorMuted}">${richText(d.hint ?? '点击渐显内容')}</span></section>`
    }

    /** 数字滚动：点击后进度条填充，末位显示目标数值（无 JS） */
    case 'counter': {
      const final = Math.max(0, Math.min(9999, Number(panels[0]?.html) || Number(d.value) || 100))
      const label = panels[1]?.html ?? ''
      const W = d.width ?? 220, H = d.height ?? 120
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', 'background-color': t.colorSurface, 'border-radius': px(t.radius), padding: '14px',
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">` +
        `<rect x="0" y="${H - 16}" width="0" height="10" rx="5" fill="${t.colorPrimary}"><animate attributeName="width" from="0" to="${W}" begin="touchstart; click" dur="1s" fill="freeze"/></rect>` +
        `<text x="${W / 2}" y="${H / 2 - 8}" dy="0.35em" text-anchor="middle" font-size="34" fill="${t.colorPrimary}" font-weight="800" opacity="0">${esc(String(final))}` +
        `<set attributeName="opacity" to="1" begin="touchstart+0.9s; click+0.9s" dur="0.2s" fill="freeze"/></text>` +
        `</svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 1}px;color:${t.colorMuted}">${richText(label)}</span></section>`
    }

    /** 图片旋转：点击后 SMIL 旋转 90°（无 JS） */
    case 'rotate': {
      const src = panels[0]?.imageUrl ? esc(panels[0].imageUrl) : ''
      const W = d.width ?? ctx.maxWidth, H = d.height ?? 220
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, { 'text-align': 'center', overflow: 'hidden' })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;border-radius:${px(t.radius)};cursor:pointer">` +
        (src
          ? `<image href="${src}" xlink:href="${src}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"><animateTransform attributeName="transform" type="rotate" from="0 ${W / 2} ${H / 2}" to="90 ${W / 2} ${H / 2}" begin="touchstart; click" dur="0.5s" fill="freeze" additive="sum"/></image>`
          : `<rect x="0" y="0" width="${W}" height="${H}" fill="${t.colorSurface}"/>`) +
        `<text x="${W / 2}" y="${H - 12}" font-size="13" fill="#ffffff" font-weight="600">${esc(d.hint ?? '点击旋转')}</text></svg></section>`
    }

    /** 水波纹：点击后中心圆环扩散淡出（无 JS） */
    case 'ripple': {
      const W = d.width ?? 200, H = d.height ?? 200
      const cap = (panels[0]?.html ?? '点击').slice(0, 10)
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', 'background-color': t.colorSurface, 'border-radius': px(t.radius), padding: '14px',
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:inline-block;cursor:pointer">` +
        `<circle cx="${W / 2}" cy="${H / 2}" r="0" fill="none" stroke="${t.colorPrimary}" stroke-width="4" opacity="0">` +
        `<animate attributeName="r" from="0" to="${(Math.min(W, H) / 2).toFixed(0)}" begin="touchstart; click" dur="0.8s" fill="freeze"/>` +
        `<animate attributeName="opacity" values="0.9;0" dur="0.8s" begin="touchstart; click" fill="freeze"/></circle>` +
        `<text x="${W / 2}" y="${H / 2}" dy="0.35em" text-anchor="middle" font-size="16" fill="${t.colorText}">${esc(cap)}</text></svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 1}px;color:${t.colorMuted}">${richText(d.hint ?? '点击产生水波纹')}</span></section>`
    }

    /** 烟花：点击后多色粒子向外飞散（无 JS） */
    case 'fireworks': {
      const cap = panels[0]?.html ?? '绽放'
      const W = d.width ?? 240, H = d.height ?? 200
      const colors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF9F45', '#C780FA']
      const N = 14
      let parts = ''
      for (let i = 0; i < N; i++) {
        const ang = (Math.PI * 2 * i) / N
        const dx = (Math.cos(ang) * W * 0.42).toFixed(0)
        const dy = (Math.sin(ang) * H * 0.42).toFixed(0)
        const c = colors[i % colors.length]
        parts += `<circle cx="${W / 2}" cy="${H / 2}" r="3" fill="${c}" opacity="0">` +
          `<animateTransform attributeName="transform" type="translate" from="0 0" to="${dx} ${dy}" begin="touchstart; click" dur="1s" fill="freeze"/>` +
          `<animate attributeName="opacity" values="1;1;0" keyTimes="0;0.7;1" begin="touchstart; click" dur="1s" fill="freeze"/></circle>`
      }
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', 'background-color': t.colorSurface, 'border-radius': px(t.radius), padding: '14px',
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">${parts}` +
        `<text x="${W / 2}" y="${H / 2}" dy="0.35em" text-anchor="middle" font-size="18" fill="${t.colorPrimary}" font-weight="700">${esc(cap.slice(0, 10))}</text></svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 1}px;color:${t.colorMuted}">${richText(d.hint ?? '点击放烟花')}</span></section>`
    }

    /** 飘雪：SMIL 自动循环下落（无 JS，自动播放） */
    case 'snow': {
      const W = d.width ?? ctx.maxWidth, H = d.height ?? 160
      let flakes = ''
      for (let i = 0; i < 14; i++) {
        const x = Math.round((i * 53) % W)
        const dur = (3 + (i % 4)).toFixed(1)
        const begin = ((i * 0.4) % 3).toFixed(1)
        const r = 2 + (i % 3)
        flakes += `<text x="${x}" y="0" font-size="${r * 3}" fill="#bcd4ff" opacity="0.9">` +
          `<animateTransform attributeName="transform" type="translate" from="0 -10" to="0 ${H}" begin="${begin}s" dur="${dur}s" repeatCount="indefinite"/>❄</text>`
      }
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', 'background-color': '#0e1726', 'border-radius': px(t.radius), overflow: 'hidden',
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">${flakes}</svg></section>`
    }

    /** 气泡上升：SMIL 自动循环上浮（无 JS，自动播放） */
    case 'bubble-rise': {
      const W = d.width ?? ctx.maxWidth, H = d.height ?? 160
      let bub = ''
      for (let i = 0; i < 12; i++) {
        const x = Math.round((i * 61) % W)
        const dur = (2.5 + (i % 3)).toFixed(1)
        const begin = ((i * 0.5) % 2.5).toFixed(1)
        const r = 3 + (i % 4)
        bub += `<circle cx="${x}" cy="${H}" r="${r}" fill="#ffffff" opacity="0.5">` +
          `<animateTransform attributeName="transform" type="translate" from="0 0" to="0 ${-H}" begin="${begin}s" dur="${dur}s" repeatCount="indefinite"/>` +
          `<animate attributeName="opacity" values="0;0.6;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></circle>`
      }
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', 'background-color': '#1b6ca8', 'border-radius': px(t.radius), overflow: 'hidden',
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">${bub}</svg></section>`
    }

    /** 飘心：点击后多个心形自下而上飘动（无 JS） */
    case 'heart-float': {
      const W = d.width ?? 200, H = d.height ?? 200
      const heart = 'M12 21s-7.5-4.6-10-9.2C.7 9 2 5 5.5 5c2 0 3.2 1.1 4.5 2.4C11.3 6.1 12.5 5 14.5 5 18 5 19.3 9 17 11.8 14.5 16.4 12 21 12 21z'
      let hearts = ''
      for (let i = 0; i < 6; i++) {
        const x = 40 + (i * 28) % 120
        const begin = (i * 0.25).toFixed(2)
        hearts += `<path d="${heart}" fill="${t.colorPrimary}" opacity="0" transform="translate(${x} ${H - 20}) scale(0.8)">` +
          `<animateTransform attributeName="transform" type="translate" from="${x} ${H - 20}" to="${x} 10" begin="touchstart+${begin}s; click+${begin}s" dur="1.6s" fill="freeze"/>` +
          `<animate attributeName="opacity" values="0;1;0" keyTimes="0;0.2;1" begin="touchstart+${begin}s; click+${begin}s" dur="1.6s" fill="freeze"/></path>`
      }
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', 'background-color': t.colorSurface, 'border-radius': px(t.radius), padding: '14px',
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:inline-block;cursor:pointer">${hearts}</svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 1}px;color:${t.colorMuted}">${richText(d.hint ?? '点击飘心')}</span></section>`
    }

    /** 星光：点击后放射线从中心射出（无 JS） */
    case 'star-burst': {
      const W = d.width ?? 200, H = d.height ?? 200
      const cx = W / 2, cy = H / 2
      let rays = ''
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12
        const x2 = (cx + Math.cos(a) * Math.min(W, H) * 0.42).toFixed(1)
        const y2 = (cy + Math.sin(a) * Math.min(W, H) * 0.42).toFixed(1)
        rays += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="${t.colorPrimary}" stroke-width="3" stroke-linecap="round" opacity="0">` +
          `<animate attributeName="x2" to="${x2}" begin="touchstart; click" dur="0.5s" fill="freeze"/>` +
          `<animate attributeName="y2" to="${y2}" begin="touchstart; click" dur="0.5s" fill="freeze"/>` +
          `<animate attributeName="opacity" values="1;0" keyTimes="0;1" begin="touchstart; click" dur="0.7s" fill="freeze"/></line>`
      }
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', 'background-color': t.colorSurface, 'border-radius': px(t.radius), padding: '14px',
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:inline-block;cursor:pointer">${rays}` +
        `<circle cx="${cx}" cy="${cy}" r="6" fill="${t.colorPrimary}"/></svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 1}px;color:${t.colorMuted}">${richText(d.hint ?? '点击星光')}</span></section>`
    }

    /** 输入中：SMIL 三点循环呼吸（无 JS，自动播放） */
    case 'typing-dots': {
      const cap = panels[0]?.html ?? '对方正在输入…'
      const W = 140, H = 40
      const dots = [0, 1, 2].map((i) =>
        `<circle cx="${W / 2 + (i - 1) * 22}" cy="${H / 2}" r="6" fill="${t.colorPrimary}">` +
        `<animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" begin="${(i * 0.2).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', 'background-color': t.colorSurface, 'border-radius': px(t.radius), padding: '14px',
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="140" height="${H}" style="display:inline-block">${dots}</svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 1}px;color:${t.colorMuted}">${richText(cap)}</span></section>`
    }

    /** 抖动：点击后盒子左右抖动提醒（无 JS） */
    case 'shake': {
      const inner = (panels[0]?.html ?? panels[0]?.title ?? '点击抖动提醒').replace(/<[^>]+>/g, '')
      const W = d.width ?? ctx.maxWidth, H = d.height ?? 80
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', 'background-color': t.colorSurface, 'border-radius': px(t.radius), padding: '14px',
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">` +
        `<g><animateTransform attributeName="transform" type="translate" values="0 0; -8 0; 8 0; -6 0; 6 0; 0 0" dur="0.5s" begin="touchstart; click" fill="freeze" additive="sum"/>` +
        `<rect x="${W / 2 - 90}" y="${H / 2 - 20}" width="180" height="40" rx="10" fill="${t.colorPrimary}"/>` +
        `<text x="${W / 2}" y="${H / 2}" dy="0.35em" text-anchor="middle" font-size="16" fill="#ffffff" font-weight="700">${esc(inner.slice(0, 12))}</text></g></svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 2}px;color:${t.colorMuted}">${richText(d.hint ?? '点击抖动')}</span></section>`
    }

    /** 放大镜：点击后中心圆形区域显示放大版图片（无 JS） */
    case 'magnifier': {
      const src = panels[0]?.imageUrl ? esc(panels[0].imageUrl) : ''
      const W = d.width ?? ctx.maxWidth, H = d.height ?? 240
      const lensR = (Math.min(W, H) * 0.28).toFixed(0)
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, { 'text-align': 'center' })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;border-radius:${px(t.radius)};cursor:pointer">` +
        (src
          ? `<image href="${src}" xlink:href="${src}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`
          : `<rect x="0" y="0" width="${W}" height="${H}" fill="${t.colorSurface}"/>`) +
        (src
          ? `<clipPath id="lens-${blockId}"><circle cx="${W / 2}" cy="${H / 2}" r="${lensR}"/></clipPath>` +
            `<g clip-path="url(#lens-${blockId})" opacity="0"><image href="${src}" xlink:href="${src}" x="${-W * 0.5}" y="${-H * 0.5}" width="${W * 2}" height="${H * 2}" preserveAspectRatio="xMidYMid slice"/><animate attributeName="opacity" to="1" begin="touchstart; click" dur="0.2s" fill="freeze"/></g>`
          : '') +
        `<circle cx="${W / 2}" cy="${H / 2}" r="${lensR}" fill="none" stroke="#ffffff" stroke-width="3" opacity="0"><set attributeName="opacity" to="1" begin="touchstart; click" dur="0.01s" fill="freeze"/></circle>` +
        `<text x="${W / 2}" y="${H - 12}" font-size="13" fill="#ffffff" font-weight="600">${esc(d.hint ?? '点击放大查看')}</text></svg></section>`
    }

    /** 分页：点击后各页按时间片轮流切换（无 JS，展示型） */
    case 'pagination': {
      const pages = panels.length ? panels : [{ html: '第 1 页内容' }, { html: '第 2 页内容' }, { html: '第 3 页内容' }]
      const n = Math.max(1, pages.length)
      const cycle = Math.max(2, n * 2)
      const W = d.width ?? ctx.maxWidth
      const items = pages.map((p, i) =>
        `<span leaf style="display:block;opacity:0;font-size:${t.fontSize - 1}px;line-height:${t.lineHeight};color:${t.colorText}">` +
        `<animate attributeName="opacity" values="1;0" keyTimes="0;${(1 / n).toFixed(3)}" calcMode="discrete" begin="${(i * (cycle / n)).toFixed(2)}s" dur="${cycle}s" repeatCount="indefinite"/>${richText(p.html ?? p.title ?? '')}</span>`).join('')
      const dots = pages.map((_, i) =>
        `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 3px;background-color:${i === 0 ? t.colorPrimary : t.colorMuted};opacity:0.8"></span>`).join('')
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', 'background-color': t.colorSurface, 'border-radius': px(t.radius), padding: '14px',
      })}">${items}<span style="display:block;margin-top:8px">${dots}</span>` +
        `<span leaf style="display:block;margin-top:4px;font-size:${t.fontSize - 2}px;color:${t.colorMuted}">${richText(d.hint ?? '点击切换下一页')}</span></section>`
    }

    /** 步骤条：点击后逐个点亮步骤节点（无 JS） */
    case 'steps-flow': {
      const steps = panels.length ? panels : [{ title: '第一步' }, { title: '第二步' }, { title: '第三步' }]
      const n = Math.max(1, steps.length)
      const W = d.width ?? ctx.maxWidth
      const rowH = 36
      const Hh = n * rowH + 10
      let rows = ''
      for (let i = 0; i < n; i++) {
        const y0 = i * rowH + 10
        rows += `<circle cx="16" cy="${y0 + 14}" r="11" fill="${t.colorSurface}" stroke="${t.colorPrimary}" stroke-width="2">` +
          `<animate attributeName="fill" to="${t.colorPrimary}" begin="touchstart+${(i * 0.4).toFixed(1)}s; click+${(i * 0.4).toFixed(1)}s" dur="0.2s" fill="freeze"/></circle>` +
          `<text x="16" y="${y0 + 19}" text-anchor="middle" font-size="12" fill="${t.colorText}" font-weight="700">${i + 1}</text>` +
          `<text x="40" y="${y0 + 19}" dy="0.35em" font-size="14" fill="${t.colorText}">${esc((steps[i].title ?? `步骤${i + 1}`).slice(0, 16))}</text>` +
          (i < n - 1 ? `<line x1="16" y1="${y0 + 25}" x2="16" y2="${y0 + rowH + 10}" stroke="${t.colorPrimary}" stroke-width="2" opacity="0.4"/>` : '')
      }
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'background-color': t.colorSurface, 'border-radius': px(t.radius), padding: '12px',
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" width="100%" height="${Hh}" style="display:block">${rows}</svg>` +
        `<span leaf style="display:block;text-align:center;font-size:${t.fontSize - 2}px;color:${t.colorMuted}">${richText(d.hint ?? '点击逐步点亮')}</span></section>`
    }

    /** 文字切换：点击从第一段切换显示第二段（无 JS） */
    case 'toggle-text': {
      const a = panels[0]?.html ?? panels[0]?.title ?? '第一段内容'
      const btxt = panels[1]?.html ?? panels[1]?.title ?? '第二段内容'
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        padding: '14px', 'background-color': t.colorSurface, 'border-radius': px(t.radius),
      })}">` +
        `<span leaf style="display:block;opacity:1;font-size:${t.fontSize - 1}px;line-height:${t.lineHeight};color:${t.colorText}"><set attributeName="opacity" to="0" begin="touchstart; click" dur="0.01s" fill="freeze"/>${richText(a)}</span>` +
        `<span leaf style="display:block;opacity:0;font-size:${t.fontSize - 1}px;line-height:${t.lineHeight};color:${t.colorText}"><set attributeName="opacity" to="1" begin="touchstart; click" dur="0.01s" fill="freeze"/>${richText(btxt)}</span>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 2}px;color:${t.colorMuted}">${richText(d.hint ?? '点击切换文字')}</span></section>`
    }

    /** 划词高亮：点击后整段文字下方黄色高亮渐显（无 JS） */
    case 'highlight-text': {
      const full = panels[0]?.html ?? panels[0]?.title ?? '点击高亮这段文字的重点内容。'
      const W = d.width ?? ctx.maxWidth, H = 80
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        padding: '14px', 'background-color': t.colorSurface, 'border-radius': px(t.radius),
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">` +
        `<rect x="0" y="6" width="${W}" height="${H - 12}" rx="6" fill="#FFF3A0" opacity="0"><set attributeName="opacity" to="0.6" begin="touchstart; click" dur="0.3s" fill="freeze"/></rect>` +
        `<text x="10" y="30" font-size="16" fill="${t.colorText}">${esc(full.slice(0, 80))}</text></svg>` +
        `<span leaf style="display:block;margin-top:6px;font-size:${t.fontSize - 2}px;color:${t.colorMuted}">${richText(d.hint ?? '点击高亮')}</span></section>`
    }

    /** 折叠面板：原生 <details> 单块折叠，微信支持（无 JS） */
    case 'accordion-vert': {
      const title = panels[0]?.title ?? panels[0]?.html ?? '展开查看更多'
      const body = panels[1]?.html ?? panels[1]?.title ?? ''
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {})}">` +
        `<details style="background-color:${t.colorSurface};border-radius:${px(t.radius)};padding:10px 12px">` +
        `<summary style="cursor:pointer;font-weight:600;color:${t.headingColor};font-size:${t.fontSize}px">${richText(title)}</summary>` +
        `<span leaf style="display:block;margin-top:8px;font-size:${t.fontSize - 1}px;color:${t.colorText};line-height:${t.lineHeight}">${richText(body)}</span></details></section>`
    }

    /** 剧透遮罩：点击后遮罩淡出揭晓内容（无 JS） */
    case 'spoiler': {
      const cover = panels[0]?.html ?? panels[0]?.title ?? '剧透预警，点击查看'
      const secret = panels[1]?.html ?? panels[1]?.title ?? ''
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', 'background-color': '#2b2b2b', 'border-radius': px(t.radius), padding: '16px',
      })}">` +
        `<span leaf style="display:block;color:#bbbbbb;font-size:${t.fontSize - 1}px"><set attributeName="opacity" to="0" begin="touchstart; click" dur="0.2s" fill="freeze"/>${richText(cover)}</span>` +
        `<span leaf style="display:block;opacity:0;margin-top:8px;font-size:${t.fontSize}px;color:#ffffff;line-height:${t.lineHeight}"><set attributeName="opacity" to="1" begin="touchstart; click" dur="0.2s" fill="freeze"/>${richText(secret)}</span></section>`
    }

    /** 时间轴：原生 <details> 时间点列表，微信支持（无 JS） */
    case 'timeline-int': {
      const items = panels.length ? panels : [{ title: '2020', html: '起点' }, { title: '2023', html: '成长' }, { title: '2026', html: '突破' }]
      const rows = items.map((p) =>
        `<details style="margin-bottom:8px;background-color:${t.colorSurface};border-radius:${px(t.radius)};padding:10px 12px;border-left:3px solid ${t.colorPrimary}">` +
        `<summary style="cursor:pointer;font-weight:600;color:${t.headingColor};font-size:${t.fontSize}px">${richText(p.title ?? '')}</summary>` +
        `<span leaf style="display:block;margin-top:8px;font-size:${t.fontSize - 1}px;color:${t.colorText};line-height:${t.lineHeight}">${richText(p.html ?? '')}</span></details>`).join('')
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {})}">${rows}</section>`
    }

    /** 彩带雨：SMIL 自动循环飘落（无 JS，自动播放） */
    case 'confetti-rain': {
      const W = d.width ?? ctx.maxWidth, H = d.height ?? 160
      const colors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF9F45']
      let conf = ''
      for (let i = 0; i < 16; i++) {
        const x = Math.round((i * 73) % W)
        const dur = (2 + (i % 4)).toFixed(1)
        const begin = ((i * 0.35) % 2).toFixed(2)
        const c = colors[i % colors.length]
        const w = 6 + (i % 4)
        conf += `<rect x="${x}" y="${-10}" width="${w}" height="${(w * 1.6).toFixed(0)}" rx="2" fill="${c}" opacity="0.9">` +
          `<animateTransform attributeName="transform" type="translate" from="0 -10" to="0 ${H}" begin="${begin}s" dur="${dur}s" repeatCount="indefinite"/></rect>`
      }
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', 'background-color': t.colorSurface, 'border-radius': px(t.radius), overflow: 'hidden',
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">${conf}</svg></section>`
    }

    /** 呼吸边框：SMIL 边框循环明暗（无 JS，自动播放） */
    case 'pulse': {
      const W = d.width ?? ctx.maxWidth, H = d.height ?? 120
      const inner = (panels[0]?.html ?? panels[0]?.title ?? '重点提示').slice(0, 16)
      return `<section data-block-id="${blockId}" style="${styleOf(b.style, {
        'text-align': 'center', 'border-radius': px(t.radius), padding: '14px',
      })}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">` +
        `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="14" fill="none" stroke="${t.colorPrimary}" stroke-width="3" opacity="0.5">` +
        `<animate attributeName="opacity" values="0.2;1;0.2" dur="1.6s" repeatCount="indefinite"/>` +
        `<animate attributeName="stroke-width" values="2;5;2" dur="1.6s" repeatCount="indefinite"/></rect>` +
        `<text x="${W / 2}" y="${H / 2}" dy="0.35em" text-anchor="middle" font-size="18" fill="${t.colorText}" font-weight="600">${esc(inner)}</text></svg></section>`
    }

    default:
      return ''
  }
}

function renderColumns(d: ColumnsData, b: Block, ctx: RenderCtx): string {
  const t = ctx.tokens
  const gap = d.gap ?? 12
  const cols = (d.columns ?? []).map((c) =>
    `<span style="flex:1;min-width:0;font-size:${t.fontSize}px;color:${t.colorText};line-height:${t.lineHeight}">${richText(c.html)}</span>`).join('')
  return `<section data-block-id="${b.id}" style="${styleOf(b.style, { display: 'flex', gap: `${gap}px` })}">${cols}</section>`
}

function renderHtml(d: HtmlData, b: Block): string {
  return `<section data-block-id="${b.id}" style="${styleOf(b.style, {})}">${d.html ?? ''}</section>`
}

/* ------------------------------------------------------------------ */
/* Frame（元素框）：导出到微信用 section + 内联块，嵌套 children 递归   */
/* ------------------------------------------------------------------ */

async function renderFrame(d: FrameData, b: Block, ctx: RenderCtx): Promise<string> {
  const layout = d.layout ?? 'vertical'
  const gap = d.gap ?? 12
  const align = d.align ?? 'center'
  const radius = d.borderRadius ?? 8
  const bw = d.borderWidth ?? 0
  const pad = d.padding ?? 8
  const bg = d.background ?? 'transparent'
  const border = d.borderColor ?? 'transparent'
  const borderStyle = (d as any).borderStyle ?? (bw ? 'solid' : 'none')
  const widthVal = d.width === 'auto' || d.width == null ? '100%' : `${Math.max(40, d.width)}px`
  const heightVal = d.height === 'auto' || d.height == null ? 'auto' : `${Math.max(40, d.height)}px`
  const blockId = b.id

  // 容器样式：horizontal → flex row，vertical → 块级堆叠，absolute → 保持 relative + 子项 absolute
  const containerStyle: Record<string, string> = {
    width: widthVal,
    height: heightVal,
    'box-sizing': 'border-box',
    padding: `${pad}px`,
    'background-color': bg,
    'border-radius': `${radius}px`,
    'border-width': `${bw}px`,
    'border-style': bw ? borderStyle : 'none',
    'border-color': border,
    margin: '0 auto', // 居中
    position: 'relative',
    overflow: 'hidden',
  }
  if (layout === 'horizontal') {
    containerStyle.display = 'flex'
    containerStyle['flex-wrap'] = 'wrap'
    containerStyle['justify-content'] = align === 'between' ? 'space-between' : align
    containerStyle['align-items'] = 'center'
    containerStyle.gap = `${gap}px`
  } else if (layout === 'vertical') {
    containerStyle.display = 'block'
    containerStyle['text-align'] = align === 'between' ? 'justify' : align
  } else {
    // absolute: 容器相对定位，子项 absolute
    containerStyle.display = 'block'
  }

  const inner: string[] = []

  // 1) inline 子元素（图片/SVG/文本）
  if (Array.isArray(d.inline)) {
    for (const it of d.inline) {
      if (it.kind === 'image') {
        const w = it.width ? `${it.width}px` : 'auto'
        inner.push(`<img src="${esc(it.src || '')}" alt="${esc(it.alt || '')}" style="display:inline-block;width:${w};max-width:100%;${layout === 'absolute' ? `position:absolute;left:${it.x ?? 0}px;top:${it.y ?? 0}px;transform:rotate(${it.rotate ?? 0}deg) scale(${it.scale ?? 1});` : ''}">`)
      } else if (it.kind === 'svg') {
        const svgInline = (it.svg || '').replace(/<\?xml[^>]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/g, '')
        inner.push(`<span style="display:inline-block;line-height:0;${layout === 'absolute' ? `position:absolute;left:${it.x ?? 0}px;top:${it.y ?? 0}px;transform:rotate(${it.rotate ?? 0}deg) scale(${it.scale ?? 1});` : ''}">${svgInline}</span>`)
      } else if (it.kind === 'text') {
        inner.push(`<span style="display:inline-block;${layout === 'absolute' ? `position:absolute;left:${it.x ?? 0}px;top:${it.y ?? 0}px;transform:rotate(${it.rotate ?? 0}deg) scale(${it.scale ?? 1});` : ''}">${esc(it.text || '')}</span>`)
      }
    }
  }

  // 2) 子区块（递归 render）
  if (Array.isArray(d.children)) {
    for (const ch of d.children) {
      const segCtx = { ...ctx, depth: (ctx.depth ?? 0) + 1 }
      inner.push(await renderBlock(ch, segCtx))
    }
  }

  // absolute 模式下整体旋转/缩放
  const outerTransform = layout === 'absolute'
    ? `transform:rotate(${d.rotate ?? 0}deg) scale(${d.scale ?? 1});transform-origin:center;`
    : ''

  return `<section data-block-id="${blockId}" style="${styleOf(b.style, containerStyle)}${outerTransform}">${inner.join('')}</section>`
}

/* ------------------------------------------------------------------ */
/* 入口                                                                 */
/* ------------------------------------------------------------------ */

export async function renderBlock(b: Block, ctx: RenderCtx): Promise<string> {
  if (b.style.hidden) return ''
  const d = b.data
  switch (b.type) {
    case 'paragraph': return renderParagraph(d, b, ctx)
    case 'heading': return renderHeading(d, b, ctx)
    case 'quote': return renderQuote(d, b, ctx)
    case 'list': return renderList(d, b, ctx)
    case 'image': return renderImage(d, b, ctx)
    case 'gallery': return renderGallery(d, b, ctx)
    case 'code': return renderCode(d, b, ctx)
    case 'table': return renderTable(d, b, ctx)
    case 'divider': return renderDivider(d, b, ctx)
    case 'card': return renderCard(d, b, ctx)
    case 'callout': return renderCallout(d, b, ctx)
    case 'timeline': return renderTimeline(d, b, ctx)
    case 'steps': return renderSteps(d, b, ctx)
    case 'accordion': return renderAccordion(d, b, ctx)
    case 'button': return renderButton(d, b, ctx)
    case 'svg': return renderSvg(d, b, ctx)
    case 'lottie': return renderLottie(d, b, ctx)
    case 'video': return renderVideo(d, b, ctx)
    case 'audio': return renderAudio(d, b, ctx)
    case 'qrcode': return renderQrcode(d, b, ctx)
    case 'interactive': return renderInteractive(d, b, ctx, b.id)
    case 'columns': return renderColumns(d, b, ctx)
    case 'html': return renderHtml(d, b)
    case 'wechat-eco': return renderWechatEco(d as WechatEcoData, b, ctx)
    case 'frame': return await renderFrame(d as FrameData, b, ctx)
    default: return ''
  }
}

function hexA(hex: string, _a: number): string {
  return hex
}

export { stripAnimation, ingestSvg }
