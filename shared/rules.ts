/**
 * 微信公众号正文渲染约束（编译期唯一事实来源）
 *
 * 依据：
 * - 微信公众平台《编辑器插件开发规范》
 * - 社区实测（yeyulingfeng 等）与官方 draft_add 行为
 * - 编辑器内真实真机回归样本
 *
 * 这个文件里的每一条都直接决定编译器的行为，改之前请先跑 tests/rules.spec.ts。
 */

/* ------------------------------------------------------------------ */
/* 1. 标签                                                              */
/* ------------------------------------------------------------------ */

/** 白名单：除此之外一律降级为 <span> 或 <section> */
export const ALLOWED_TAGS = [
  // 结构
  'section', 'div', 'p', 'span', 'br', 'hr',
  // 文本语义
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'sub', 'sup', 'small', 'big',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
  // 列表
  'ul', 'ol', 'li',
  // 表格
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
  // 媒体
  'img', 'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline',
  'polygon', 'text', 'tspan', 'defs', 'linearGradient', 'radialGradient', 'stop',
  'clipPath', 'mask', 'use', 'symbol', 'marker', 'pattern', 'filter',
  'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix', 'feComposite',
  'animate', 'animateTransform', 'animateMotion', 'mpath', 'set',
  'a', 'figure', 'figcaption', 'details', 'summary',
  // 官方组件（占位标签，正文里由平台替换）
  'mp-common-mpaudio', 'mp-common-video', 'mpvoice', 'mp-miniprogram', 'mp-html',
] as const

/** 会被整行删除的标签（出现则整行样式失效） */
export const KILL_LINE_TAGS = ['script', 'style', 'iframe', 'link', 'meta', 'form', 'input', 'button', 'video', 'audio', 'canvas', 'object', 'embed']

/** 标签替换映射：不支持的标签 → 最近的等价白名单标签 */
export const TAG_REPLACEMENTS: Record<string, string> = {
  article: 'section', main: 'section', aside: 'section', header: 'section', footer: 'section',
  nav: 'section', figure_: 'figure',
  dl: 'ul', dt: 'li', dd: 'li',
  abbr: 'span', cite: 'span', q: 'span', mark: 'span', time: 'span', label: 'span',
  picture: 'span', source: 'span', track: 'span', map: 'span', area: 'span',
  progress: 'span', meter: 'span', output: 'span',
  iframe: 'section', video: 'section', audio: 'section', canvas: 'section',
  hr: 'hr',
}

/** 允许的属性白名单（其余一律丢弃） */
export const ALLOWED_ATTRS: Record<string, string[]> = {
  '*': ['style', 'data-*', 'aria-hidden', 'leaf', 'nodeleaf', 'node'],
  img: ['src', 'data-src', 'alt', 'title', 'width', 'height', 'data-w', 'data-ratio', 'data-type', 'data-backw', 'data-backh'],
  a: ['href', 'target', 'rel'],
  table: ['border', 'cellpadding', 'cellspacing', 'width'],
  td: ['colspan', 'rowspan', 'width', 'align', 'valign'],
  th: ['colspan', 'rowspan', 'width', 'align', 'valign'],
  col: ['span', 'width'],
  svg: ['viewBox', 'width', 'height', 'xmlns', 'preserveAspectRatio', 'fill', 'data-*'],
  path: ['d', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'transform', 'fill-rule'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'opacity', 'transform'],
  circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width', 'opacity', 'transform'],
  ellipse: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'opacity', 'transform'],
  line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'stroke-linecap', 'opacity', 'transform'],
  polyline: ['points', 'fill', 'stroke', 'stroke-width', 'opacity', 'transform'],
  polygon: ['points', 'fill', 'stroke', 'stroke-width', 'opacity', 'transform'],
  text: ['x', 'y', 'fill', 'font-size', 'font-weight', 'font-family', 'text-anchor', 'dominant-baseline', 'opacity', 'transform'],
  tspan: ['x', 'y', 'fill', 'font-size', 'font-weight', 'opacity'],
  linearGradient: ['x1', 'y1', 'x2', 'y2', 'gradientUnits', 'gradientTransform'],
  radialGradient: ['cx', 'cy', 'r', 'fx', 'fy', 'gradientUnits', 'gradientTransform'],
  stop: ['offset', 'stop-color', 'stop-opacity'],
  use: ['href', 'xlink:href', 'x', 'y', 'width', 'height', 'transform'],
  clipPath: ['clipPathUnits', 'transform'],
  mask: ['maskUnits', 'x', 'y', 'width', 'height'],
  g: ['transform', 'opacity', 'fill', 'stroke', 'stroke-width'],
  animate: ['attributeName', 'attributeType', 'from', 'to', 'values', 'dur', 'begin', 'end',
    'repeatCount', 'repeatDur', 'fill', 'calcMode', 'keyTimes', 'keySplines', 'additive', 'accumulate', 'restart'],
  animateTransform: ['attributeName', 'attributeType', 'type', 'from', 'to', 'values', 'dur', 'begin', 'end',
    'repeatCount', 'repeatDur', 'fill', 'calcMode', 'keyTimes', 'keySplines', 'additive', 'accumulate', 'restart'],
  animateMotion: ['dur', 'begin', 'end', 'repeatCount', 'repeatDur', 'fill', 'calcMode', 'keyTimes',
    'keySplines', 'path', 'rotate', 'keyPoints', 'origin', 'restart'],
  mpath: ['href', 'xlink:href'],
  set: ['attributeName', 'to', 'begin', 'dur', 'fill'],
  ol: ['start', 'type'],
  li: ['value'],
  details: ['open'],
}

/* ------------------------------------------------------------------ */
/* 2. CSS 属性                                                          */
/* ------------------------------------------------------------------ */

/** 完全可用 */
export const CSS_ALLOWED = [
  'color', 'background', 'background-color', 'background-image', 'background-size',
  'background-position', 'background-repeat', 'background-clip', '-webkit-background-clip',
  'background-origin', '-webkit-background-origin',
  'font-size', 'font-weight', 'font-style', 'font-family', 'line-height',
  'letter-spacing', 'word-spacing', 'text-align', 'text-decoration', 'text-decoration-color',
  'text-decoration-line', 'text-indent', 'text-shadow', 'text-overflow', 'white-space',
  'word-break', 'word-wrap', 'overflow-wrap', 'writing-mode', 'vertical-align',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-width', 'border-style', 'border-color', 'border-radius',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'display', 'opacity', 'box-shadow', 'box-sizing', 'float', 'clear',
  'list-style', 'list-style-type', 'list-style-position',
  'border-collapse', 'border-spacing', 'table-layout', 'empty-cells',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'fill-opacity', 'stroke-opacity',
  'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-self', 'flex-basis', 'flex-grow', 'flex-shrink',
  'gap', 'row-gap', 'column-gap', 'order',
  'transform', 'transform-origin', 'mix-blend-mode', 'filter',
  '-webkit-text-fill-color', '-webkit-box-decoration-break', 'caret-color',
  'direction', 'unicode-bidi', 'cursor', 'user-select', '-webkit-user-select',
  'visibility', 'overflow', 'overflow-x', 'overflow-y', 'z-index', 'box-decoration-break',
]

/**
 * 有条件可用：值是特定写法才保留，否则整条删除。
 * 值为正则，匹配则保留。
 */
export const CSS_CONDITIONAL: Record<string, RegExp> = {
  // position 整行会被删，只有 static/relative 在某些版本保留 → 保守起见全部降级
  position: /^(static)$/,
  // transform 部分安卓机型丢 translate 百分比，只允许 px / 纯函数
  transform: /^(none|(matrix|matrix3d|translate|translateX|translateY|translateZ|translate3d|rotate|rotateX|rotateY|rotateZ|rotate3d|scale|scaleX|scaleY|scaleZ|scale3d|skew|skewX|skewY|perspective)\([^%]*\)\s*)+$/,
  'transform-origin': /^[\d.]+(px|%)?(\s+[\d.]+(px|%)?)?$/,
  width: /^(\d+(\.\d+)?(px|%|vw|em|rem|auto)|auto|fit-content|max-content|min-content)$/,
  height: /^(\d+(\.\d+)?(px|%|vw|vh|em|rem|auto)|auto)$/,
  'max-width': /^(\d+(\.\d+)?(px|%|vw|em|rem)|none|100%)$/,
  'min-width': /^(0|\d+(\.\d+)?(px|%|vw|em|rem)|auto)$/,
  'max-height': /^(0|\d+(\.\d+)?(px|%|vw|vh|em|rem)|none)$/,
  'min-height': /^(0|\d+(\.\d+)?(px|%|vw|vh|em|rem)|auto)$/,
  display: /^(block|inline|inline-block|flex|inline-flex|table|table-cell|table-row|list-item|none|grid)$/,
  opacity: /^(0|1|0?\.\d+)$/,
  'white-space': /^(normal|nowrap|pre|pre-wrap|pre-line|break-spaces)$/,
  'text-overflow': /^(clip|ellipsis)$/,
  'background-image': /^(none|url\(|-webkit-|(linear|radial)-gradient\()/,
  filter: /^(none|(blur|brightness|contrast|grayscale|saturate|sepia|opacity|drop-shadow|hue-rotate|invert)\()/,
  'box-shadow': /^(none|inset|0|[\d.-])/,
  'mix-blend-mode': /^(normal|multiply|screen|overlay|darken|lighten|color-dodge|color-burn|hard-light|soft-light|difference|exclusion|hue|saturation|color|luminosity)$/,
  float: /^(none|left|right)$/,
  'vertical-align': /^(baseline|sub|super|top|text-top|middle|bottom|text-bottom|[\d.]+(px|%))$/,
  'flex-wrap': /^(nowrap|wrap|wrap-reverse)$/,
  '-webkit-overflow-scrolling': /^(touch|auto)$/,
  'word-break': /^(normal|break-all|keep-all|break-word)$/,
}

/** 明确不可用，出现即删（且给诊断） */
export const CSS_FORBIDDEN = [
  'position:fixed', 'position:absolute', 'position:sticky',
  'animation', 'animation-name', 'animation-duration', 'animation-timing-function',
  'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode',
  'transition', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
  '@keyframes', '@media', '@supports', '@font-face', '@import',
  'will-change', 'contain', 'backdrop-filter', 'clip-path', 'mask', 'mask-image',
  'resize', 'outline-offset', 'scroll-behavior', 'scroll-snap-type',
  'grid-template-columns', 'grid-template-rows', 'grid-area', 'grid-column', 'grid-row',
  'columns', 'column-count', 'column-gap(legacy)', 'orphans', 'widows',
  'counter-reset', 'counter-increment', 'content', 'quotes',
  'zoom', 'appearance', '-webkit-appearance', 'pointer-events', 'touch-action',
]

/** 简写属性需要展开时用到的映射（避免用了简写导致部分端丢失） */
export const SHORTHAND_EXPAND: Record<string, string[]> = {
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  border: ['border-width', 'border-style', 'border-color'],
  'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  background: ['background-color', 'background-image', 'background-repeat', 'background-position'],
  font: ['font-size', 'font-weight', 'font-style', 'font-family'],
  flex: ['flex-grow', 'flex-shrink', 'flex-basis'],
  gap: ['row-gap', 'column-gap'],
}

/* ------------------------------------------------------------------ */
/* 3. 结构规则                                                          */
/* ------------------------------------------------------------------ */

export const STRUCTURE_RULES = {
  /** 同标签同样式单子节点连续嵌套超过该层数会被自动精简 */
  maxSameStyleNesting: 10,
  /** 叶子节点（只含文本）应为 span */
  leafTag: 'span',
  /** 无语义容器应为 section */
  containerTag: 'section',
  /** 图片必须携带 data-w 以便各端稳定计算宽度 */
  imgNeedsDataW: true,
  /** 单个 <section> 建议最大体积（超出影响渲染） */
  maxSectionBytes: 1024 * 200,
  /** 正文总 HTML 体积软上限 */
  softMaxBytes: 1024 * 500,
  /** SVG 内联数量软上限 */
  softMaxInlineSvg: 30,
} as const

/* ------------------------------------------------------------------ */
/* 4. 内容适配                                                          */
/* ------------------------------------------------------------------ */

export const CONTENT_RULES = {
  /** GIF 帧数上限 */
  gifMaxFrames: 300,
  /** GIF 体积上限（字节） */
  gifMaxBytes: 10 * 1024 * 1024,
  /** 图片单张建议上限 */
  imgMaxBytes: 10 * 1024 * 1024,
  /** 封面比例 2.35:1 / 1:1 */
  coverRatios: [2.35, 1] as number[],
  /** 标题字数上限 */
  titleMaxChars: 64,
  /** 摘要字数上限 */
  digestMaxChars: 120,
  /** 作者字数上限 */
  authorMaxChars: 8,
} as const

/* ------------------------------------------------------------------ */
/* 5. SMIL 规则                                                         */
/* ------------------------------------------------------------------ */

export const SMIL_RULES = {
  /**
   * 官方规范：begin 只写 touchstart 时 PC 端不触发，必须同时写 click。
   * 因此所有交互触发统一写成 `touchstart; click`。
   */
  pointerBegin: 'touchstart; click',
  /** id 属性会被全量删除，禁止用 `xx.begin` 做同步，统一改为绝对时间偏移 */
  forbidIdSync: true,
  /** iOS 对 transform-origin 支持不稳定，需要降级为 translate 补偿 */
  iosTransformOriginUnstable: true,
  /** 安卓长按需「循环动画元素」作触发媒介才能随松随停 */
  androidLongPressNeedsLoopProxy: true,
  /** repeatCount 最大值（防卡） */
  maxRepeat: 999,
  /** 单条 animate 最小 dur（秒），低于此值部分机型不触发 */
  minDur: 0.05,
} as const

/* ------------------------------------------------------------------ */
/* 6. 工具                                                              */
/* ------------------------------------------------------------------ */

export function isTagAllowed(tag: string): boolean {
  return (ALLOWED_TAGS as readonly string[]).includes(tag.toLowerCase())
}

/** SVG/SMIL 里大小写敏感的属性 —— HTML 解析器会统一小写，必须还原 */
export const CASE_SENSITIVE_ATTRS: Record<string, string> = {
  attributename: 'attributeName', attributetype: 'attributeType',
  repeatcount: 'repeatCount', repeatdur: 'repeatDur',
  keytimes: 'keyTimes', keysplines: 'keySplines', calcmode: 'calcMode',
  keypoints: 'keyPoints', viewbox: 'viewBox', preserveaspectratio: 'preserveAspectRatio',
  gradientunits: 'gradientUnits', gradienttransform: 'gradientTransform',
  clippathunits: 'clipPathUnits', maskunits: 'maskUnits',
  strokewidth: 'stroke-width', strokedasharray: 'stroke-dasharray',
  strokedashoffset: 'stroke-dashoffset', strokelinecap: 'stroke-linecap',
  strokelinejoin: 'stroke-linejoin', fillopacity: 'fill-opacity',
  strokeopacity: 'stroke-opacity', fillrule: 'fill-rule',
  dominantbaseline: 'dominant-baseline', textanchor: 'text-anchor',
  fontsize: 'font-size', fontweight: 'font-weight', fontfamily: 'font-family',
  stopcolor: 'stop-color', stopopacity: 'stop-opacity',
}

export function isAttrAllowed(tag: string, attr: string): boolean {
  const a = CASE_SENSITIVE_ATTRS[attr.toLowerCase()] ?? attr.toLowerCase()
  if (a === 'id' || a === 'class') return false
  if (a.startsWith('data-') || a === 'style' || a === 'aria-hidden') return true
  const check = (list?: string[]) => (list ?? []).some((x) => x.toLowerCase() === a.toLowerCase())
  return check(ALLOWED_ATTRS[tag.toLowerCase()]) || check(ALLOWED_ATTRS['*'])
}

/** CSS 声明级判定：返回 { keep, reason } */
export function checkCssDeclaration(prop: string, value: string): { keep: boolean; reason?: string } {
  const p = prop.trim().toLowerCase()
  const v = value.trim()
  if (p.startsWith('@')) return { keep: false, reason: `@规则不支持：${p}` }
  if (p.startsWith('--')) return { keep: false, reason: `CSS 变量不支持：${p}` }

  const decl = `${p}:${v}`
  for (const f of CSS_FORBIDDEN) {
    const fp = f.split(':')[0]
    if (p === fp) {
      if (f.includes(':') && !v.toLowerCase().includes(f.split(':')[1])) continue
      return { keep: false, reason: `${p} 在公众号内不可用` }
    }
  }
  const cond = CSS_CONDITIONAL[p]
  if (cond && !cond.test(v)) return { keep: false, reason: `${p} 的取值「${v}」在部分机型会失效` }
  if (!(CSS_ALLOWED as string[]).includes(p) && !cond) {
    return { keep: false, reason: `不支持的 CSS 属性：${p}` }
  }
  return { keep: true }
}
