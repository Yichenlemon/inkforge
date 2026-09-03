import type {
  Block, BlockStyle, ThemeTokens, Diagnostic, TableData, TimelineData, StepsData,
  AccordionData, InteractiveData, GalleryData, ColumnsData, CardData, CalloutData,
  DividerData, ButtonData, QrcodeData, VideoData, AudioData, CodeData, ImageData,
  RichTextData, SvgData, LottieData, HtmlData, ShadowLevel, WechatEcoData,
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
    default: return ''
  }
}

function hexA(hex: string, _a: number): string {
  return hex
}

export { stripAnimation, ingestSvg }
