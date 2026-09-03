/**
 * Block IR —— InkForge 的单一事实来源。
 *
 * 设计原则：
 * 1. 所有内容形态（富文本/代码/图片/SVG/Lottie/表格…）都是 Block，共享同一套外壳（id / type / style）。
 * 2. 纯 JSON，可序列化、可版本化、可迁移。schemaVersion 变更时走 migrations。
 * 3. 样式用「结构化字段」而非裸 CSS 字符串，渲染时才能精确内联化成微信能活下来的 inline style。
 *    只有 customCss 是逃生舱，且编译期会走白名单裁剪。
 */

export const SCHEMA_VERSION = 2

/* ------------------------------------------------------------------ */
/* 样式                                                                */
/* ------------------------------------------------------------------ */

export type TextAlign = 'left' | 'center' | 'right' | 'justify'
export type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted'
export type ShadowLevel = 'none' | 'sm' | 'md' | 'lg' | 'xl'

export interface BlockStyle {
  marginTop?: number
  marginBottom?: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
  background?: string
  borderRadius?: number
  borderWidth?: number
  borderColor?: string
  borderStyle?: BorderStyle
  boxShadow?: ShadowLevel
  textAlign?: TextAlign
  /** 优先百分比；固定 px 会在编译时自动补 data-ignore-width */
  width?: string
  opacity?: number
  color?: string
  fontSize?: number
  lineHeight?: number
  letterSpacing?: number
  fontWeight?: number | string
  fontFamily?: string
  /** 逃生舱：编译期走白名单裁剪 */
  customCss?: string
  /** 编译期：是否跳过本块（草稿留档但不导出） */
  hidden?: boolean
}

/* ------------------------------------------------------------------ */
/* SVG 动画 IR（M6）                                                    */
/* ------------------------------------------------------------------ */

/** 缓动：cubic-bezier 四元组，或预设名 */
export type EasingName =
  | 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out'
  | 'power2.out' | 'power2.inOut' | 'back.out' | 'elastic.out' | 'bounce.out'

export interface Easing {
  type: 'preset' | 'bezier'
  name?: EasingName
  bezier?: [number, number, number, number]
}

export type AnimProperty =
  | 'stroke-dashoffset' | 'opacity' | 'fill' | 'stroke'
  | 'translate' | 'scale' | 'rotate'
  | 'motion'   /** 沿路径运动 animateMotion */
  | 'morph'    /** 形变 animate d */
  | 'width' | 'height' | 'rx' | 'ry' | 'r' | 'stroke-width' | 'cx' | 'cy' | 'x' | 'y'

export type TriggerKind = 'auto' | 'click' | 'longpress' | 'hover'

export interface AnimKeyframe {
  /** 0–1 归一化时间 */
  t: number
  /** 数值属性的数值；颜色/路径为字符串 */
  value: string
}

export interface AnimTrack {
  id: string
  /** 目标元素在 SVG 内的稳定引用，形如 `p3>g1>rect` —— 编译时解析为实际节点 */
  target: string
  /** 目标索引（elementIndex 路径数组，导入时生成，比选择器稳） */
  targetPath: number[]
  property: AnimProperty
  keyframes: AnimKeyframe[]
  easing: Easing
  /** 相对整个时间轴的开始时间（秒） */
  begin: number
  dur: number
  repeat: number | 'indefinite'
  /** motion 专用：参考路径的 targetPath */
  pathRef?: number[]
  /** motion 专用 */
  rotateAlong?: boolean
  /** 结束后是否保持 */
  fill?: 'freeze' | 'remove'
}

export interface AnimationIR {
  /** 总时长（秒），用于时间轴 UI */
  duration: number
  loop: boolean
  trigger: TriggerKind
  tracks: AnimTrack[]
}

/* ------------------------------------------------------------------ */
/* 各 Block 的数据体                                                    */
/* ------------------------------------------------------------------ */

/** 富文本类：段落 / 标题 / 引用 / 列表，均由 Tiptap 编辑，内容以 HTML 存 */
export interface RichTextData {
  html: string
  /** heading 专用：1–4 */
  level?: 1 | 2 | 3 | 4
  /** list 专用 */
  ordered?: boolean
  /** list 专用：任务列表 */
  task?: boolean
  /** heading 专用：装饰样式 */
  headingStyle?: 'plain' | 'bar' | 'underline' | 'bracket' | 'number' | 'background'
  /** quote 专用 */
  quoteStyle?: 'bar' | 'quote-mark' | 'card' | 'minimal'
}

export interface ImageItem {
  src: string
  alt?: string
  caption?: string
  naturalWidth?: number
  naturalHeight?: number
}

/** 图片布局：通栏 / 左浮动（正文右侧环绕）/ 右浮动（正文左侧环绕） */
export type ImageDisplay = 'block' | 'float-left' | 'float-right'

export interface ImageData extends ImageItem {
  /** 百分比字符串，如 '100%'；浮动模式默认 '45%' */
  width?: string
  radius?: number
  shadow?: ShadowLevel
  /** 圆角/阴影之外，是否加边框 */
  borderWidth?: number
  borderColor?: string
  link?: string
  /** 布局模式 */
  display?: ImageDisplay
  /** 旋转角度（度），导出为 transform: rotate() */
  rotate?: number
  /** 水平翻转 */
  flipX?: boolean
  /** 浮动模式相对正文的额外水平间距（px），用于拖动微调 */
  floatMargin?: number
}

/** 微信生态组件类型：小程序 / 视频号 / 微信小店 */
export type WechatEcoType = 'miniprogram' | 'channels' | 'shop'

export interface WechatEcoData {
  ecoType: WechatEcoType
  /** 小程序 appid */
  appId?: string
  /** 小程序跳转路径 */
  path?: string
  /** 视频号 feedId */
  feedId?: string
  /** 微信小店商品 id */
  productId?: string
  title?: string
  imageUrl?: string
  /** 兜底跳转链接 */
  url?: string
  /** 从公众号文章提取到的原始组件标签，导出时回写为注释供手动粘贴 */
  snippet?: string
}

export interface GalleryData {
  images: ImageItem[]
  layout: 'stack' | 'scroll' | 'grid2' | 'grid3'
  radius?: number
  gap?: number
}

export interface CodeData {
  code: string
  lang: string
  /** shiki 主题 id */
  theme: string
  showLineNumbers?: boolean
  title?: string
  /** 高亮行，如 '1,3-5' */
  highlight?: string
  /** diff 模式：显示 +/- 背景 */
  diff?: boolean
  /** 超过宽度横向滚动（微信端靠 data-ignore-width） */
  scroll?: boolean
  /** 行高 */
  lineHeight?: number
  /** 起始行号 */
  startLine?: number
}

export type BorderMode = 'all' | 'horizontal' | 'outer' | 'none'

export interface TableData {
  /** 第一行为表头时 header=true */
  header: boolean
  rows: string[][]
  zebra: boolean
  borderMode: BorderMode
  /** 每列对齐，长度与列数一致 */
  align?: TextAlign[]
  /** 每列宽度百分比，长度与列数一致 */
  widths?: number[]
  borderColor?: string
  headerBg?: string
  headerColor?: string
  zebraColor?: string
  fontSize?: number
}

export type DividerVariant = 'solid' | 'dashed' | 'dotted' | 'gradient' | 'symbol' | 'space'

export interface DividerData {
  variant: DividerVariant
  color?: string
  /** 百分比 */
  width?: string
  height?: number
  /** symbol 变体用的字符 */
  symbol?: string
}

export interface CardData {
  title?: string
  html: string
  imageUrl?: string
  /** 图片在左还是在右 */
  imagePosition?: 'top' | 'left' | 'right'
  variant?: 'plain' | 'accent' | 'outline' | 'shadow'
  footer?: string
  link?: string
}

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger' | 'tip'

export interface CalloutData {
  tone: CalloutTone
  title?: string
  html: string
  icon?: string
  variant?: 'bar' | 'card' | 'minimal'
}

export interface TimelineItem {
  time?: string
  title?: string
  html?: string
}

export interface TimelineData {
  items: TimelineItem[]
  variant?: 'dot' | 'line' | 'card'
}

export interface StepItem {
  title?: string
  html?: string
}

export interface StepsData {
  items: StepItem[]
  variant?: 'number' | 'dot' | 'check'
}

export interface AccordionItem {
  title: string
  html: string
}

export interface AccordionData {
  items: AccordionItem[]
  /** 微信无 JS，折叠用 <details> 原生；部分机型需降级为静态展开 */
  fallbackOpen?: boolean
}

export interface ButtonData {
  text: string
  link?: string
  variant?: 'solid' | 'outline' | 'ghost' | 'gradient'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  icon?: string
}

export interface SvgData {
  /** 原始 SVG 源码（已经过去 id / 去 style 处理） */
  svg: string
  /** 是否含动画（编译产物） */
  animated?: boolean
  caption?: string
  /** 体积（字节），由导入时计算 */
  bytes?: number
  /** 动画 IR */
  anim?: AnimationIR
  /** 元素清单（导入时生成，供动画目标选择） */
  elements?: SvgElementRef[]
  viewBox?: string
  width?: number
  height?: number
}

export interface SvgElementRef {
  path: number[]
  tag: string
  label: string
  /** 形如 `p3>g1>rect` */
  ref: string
}

export type LottieExportMode = 'smil' | 'frames' | 'gif' | 'static'

export interface LottieData {
  name: string
  /** 原始 Lottie JSON 存服务端，前端只留 assetId */
  assetId?: string
  /** 转换后的产物：SMIL 的 SVG 源码 / 帧序列 SVG / 静态 SVG / GIF url */
  output?: string
  mode: LottieExportMode
  /** 能力探测报告 */
  report?: LottieReport
  width?: number
  height?: number
  loop?: boolean
  fps?: number
  /** 位图资源（key -> url），导出时替换 */
  assets?: Record<string, string>
  /** GIF 模式产出的图片地址 */
  gifUrl?: string
}

export interface LottieReport {
  features: string[]
  unsupported: string[]
  /** 各级是否可行 */
  capability: { smil: boolean; frames: boolean; gif: boolean }
  suggested: LottieExportMode
  frames: number
  durationMs: number
  width: number
  height: number
  layers: number
  hasImages: boolean
  hasMasks: boolean
  hasExpressions: boolean
  hasText: boolean
  /** 逐层判定明细，用于 UI 展示 */
  notes: { layer: string; ok: boolean; reason?: string }[]
}

export interface VideoData {
  /** 视频号/腾讯视频/外部 mp4 */
  url: string
  poster?: string
  title?: string
  duration?: string
  /** 公众号正文不支持直接播视频，只能放封面 + 跳转，或用官方插入的视频组件 */
  mode: 'poster' | 'official'
  vid?: string
}

export interface AudioData {
  url: string
  title?: string
  artist?: string
  cover?: string
  /** 正文不支持 audio 标签，用 QQ音乐/喜马拉雅官方组件或跳转卡片 */
  mode: 'card' | 'official'
}

export interface QrcodeData {
  /** 编码内容 */
  content: string
  /** 展示文案 */
  label?: string
  caption?: string
  size?: number
  fg?: string
  bg?: string
  /** 中心 logo */
  logoUrl?: string
  preset?: 'follow' | 'group' | 'miniapp' | 'url' | 'custom'
}

export type InteractiveKind =
  | 'slider' | 'click-reveal' | 'scratch' | 'longpress' | 'flip' | 'accordion-click' | 'tab'
  | 'carousel' | 'progress' | 'marquee'
  | 'read-more' | 'like' | 'rating' | 'zoom' | 'typewriter' | 'switch'
  | 'progress-ring' | 'tooltip' | 'hotzone' | 'before-after' | 'faq' | 'confetti'
  | 'loading' | 'soundwave' | 'poll' | 'chat' | 'badge' | 'countdown' | 'marquee-text' | 'reveal-fade'
  | 'counter' | 'rotate' | 'ripple' | 'fireworks' | 'snow' | 'bubble-rise' | 'heart-float'
  | 'star-burst' | 'typing-dots' | 'shake' | 'magnifier' | 'pagination' | 'steps-flow'
  | 'toggle-text' | 'highlight-text' | 'accordion-vert' | 'spoiler' | 'timeline-int' | 'confetti-rain' | 'pulse'

export interface InteractiveData {
  kind: InteractiveKind
  /** 各 kind 的面板内容 */
  panels: { title?: string; html?: string; imageUrl?: string }[]
  hint?: string
  /** 滑动方向 */
  direction?: 'horizontal' | 'vertical'
  width?: number
  height?: number
  /** 进度条目标比例 0~1（progress 专用） */
  progress?: number
  /** 星级数量（rating 专用） */
  count?: number
  /** 默认点亮星数（rating 专用） */
  value?: number
  /** 开关开启文案（switch 专用） */
  onLabel?: string
  /** 开关关闭文案（switch 专用） */
  offLabel?: string
}

export interface HtmlData {
  html: string
  /** 是否跳过白名单清洗（不推荐，导出时仍会被微信过滤） */
  raw?: boolean
}

export interface ColumnsData {
  /** 每栏的 Block 数组（简化：只支持富文本栏） */
  columns: { html: string; width?: number }[]
  gap?: number
}

export type BlockData =
  | RichTextData | ImageData | GalleryData | CodeData | TableData | DividerData
  | CardData | CalloutData | TimelineData | StepsData | AccordionData | ButtonData
  | SvgData | LottieData | VideoData | AudioData | QrcodeData | InteractiveData
  | HtmlData | ColumnsData | WechatEcoData

export type BlockType =
  | 'paragraph' | 'heading' | 'quote' | 'list'
  | 'image' | 'gallery' | 'code' | 'table' | 'divider'
  | 'card' | 'callout' | 'timeline' | 'steps' | 'accordion' | 'button'
  | 'svg' | 'lottie' | 'video' | 'audio' | 'qrcode' | 'interactive'
  | 'html' | 'columns' | 'wechat-eco'

/* ------------------------------------------------------------------ */
/* Block 与文档                                                         */
/* ------------------------------------------------------------------ */

export interface BlockBase {
  id: string
  type: BlockType
  data: any
  style: BlockStyle
  locked?: boolean
  /** 块级备注，不导出 */
  note?: string
}

export type Block = BlockBase

export interface DocMeta {
  /** 发布相关 */
  author?: string
  digest?: string
  cover?: string
  /** 原文链接 */
  sourceUrl?: string
  /** 是否开启原创 */
  needOpenComment?: boolean
  onlyFansCanComment?: boolean
}

export interface Doc {
  id: string
  title: string
  /** 主题 id */
  themeId: string
  /** 版心最大宽度（px），默认 677；用于桌面预览与导出 */
  articleWidth?: number
  /** 主题 token 覆写 */
  tokenOverride?: Partial<ThemeTokens>
  blocks: Block[]
  meta: DocMeta
  createdAt: number
  updatedAt: number
  schemaVersion: number
}

/* ------------------------------------------------------------------ */
/* Design Token / 主题                                                  */
/* ------------------------------------------------------------------ */

export interface ThemeTokens {
  colorPrimary: string
  colorAccent: string
  colorText: string
  colorMuted: string
  colorBg: string
  colorSurface: string
  colorBorder: string
  fontSize: number
  lineHeight: number
  letterSpacing: number
  paragraphGap: number
  radius: number
  headingColor: string
  fontFamily?: string
  /** 正文两端对齐 */
  justify?: boolean
  /** 段落首行缩进 */
  textIndent?: boolean
}

export interface Theme {
  id: string
  name: string
  group: string
  tokens: ThemeTokens
}

/* ------------------------------------------------------------------ */
/* 诊断                                                                */
/* ------------------------------------------------------------------ */

export type DiagnosticLevel = 'error' | 'warning' | 'info'

export interface Diagnostic {
  level: DiagnosticLevel
  /** 规则 id，便于忽略与定位 */
  rule: string
  message: string
  /** 关联的 block id */
  blockId?: string
  /** 可自动修复的，给出修复动作 */
  fix?: FixAction
}

export type FixAction =
  | 'strip-ids' | 'percent-width' | 'nbsp-spaces' | 'flatten-nesting'
  | 'remove-animation' | 'inline-styles' | 'strip-position' | 'strip-class'
  | 'fix-begin' | 'downgrade-lottie' | 'table-widths' | 'compress-image'

/* ------------------------------------------------------------------ */
/* 素材 / 片段 / 模板                                                    */
/* ------------------------------------------------------------------ */

export interface AssetRecord {
  id: string
  kind: 'image' | 'svg' | 'lottie' | 'gif' | 'other'
  name: string
  url: string
  mime: string
  bytes: number
  width?: number
  height?: number
  createdAt: number
  tags?: string[]
  /** 手绘插画库专用 */
  category?: string
  /** 授权信息 */
  license?: string
}

export interface Snippet {
  id: string
  name: string
  /** 支持 {{变量}} */
  html: string
  variables?: string[]
  createdAt: number
}

export interface DocTemplate {
  id: string
  name: string
  group: string
  themeId: string
  blocks: Block[]
  createdAt: number
}

export interface WechatAccount {
  id: string
  name: string
  appId: string
  appSecret: string
  createdAt: number
}

/* ------------------------------------------------------------------ */
/* 工厂函数                                                             */
/* ------------------------------------------------------------------ */

export function createId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export const emptyBlockStyle = (): BlockStyle => ({ marginTop: 0, marginBottom: 16 })

export function makeBlock<T extends BlockType>(type: T, data: any, style: BlockStyle = {}): Block {
  return { id: createId(), type, data, style: { ...emptyBlockStyle(), ...style } }
}

export function emptyDoc(themeId = 'clean'): Doc {
  const now = Date.now()
  return {
    id: createId(),
    title: '未命名文章',
    themeId,
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    meta: {},
    blocks: [
      makeBlock('heading', { html: '在这里输入标题', level: 1, headingStyle: 'plain' } as RichTextData, { marginBottom: 20 }),
      makeBlock('paragraph', { html: '开始写正文。选中任意内容后，右侧面板可以调整样式。' } as RichTextData, { marginBottom: 16 }),
    ],
  }
}

/** 首次打开的示例文档：覆盖主流区块类型，便于直接验证整条编译管线 */
export function seedDoc(): Doc {
  const now = Date.now()
  return {
    id: 'seed-demo',
    title: 'InkForge 能力示例',
    themeId: 'tech',
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    meta: { author: 'InkForge', digest: '一份展示编辑器核心能力的示例文章。' },
    blocks: [
      makeBlock('heading', { html: 'InkForge 超级可视化编辑器', level: 1, headingStyle: 'bar' } as RichTextData, { marginBottom: 10 }),
      makeBlock('paragraph', { html: '这是一篇<strong>示例文章</strong>，覆盖标题、正文、引用、代码块、表格、卡片与 SVG 等主流区块，点击右上角「预览 / 源码」即可看到编译后的公众号 HTML。' } as RichTextData, { marginBottom: 16 }),
      makeBlock('callout', { tone: 'info', title: '提示', html: '右侧选中任意区块可调整样式；顶部按钮可导出、排版质检、导入 Lottie。', variant: 'card' }, { marginBottom: 16 }),
      makeBlock('quote', { html: '好的工具不替你思考，但让你想得更清楚。', quoteStyle: 'bar' }, { marginBottom: 16 }),
      makeBlock('list', { html: '<li>富文本排版与中文优化</li><li>Shiki 语法高亮代码块</li><li>SVG 静态与 SMIL 路径动画</li><li>Lottie 三级降级导出</li>', ordered: true }, { marginBottom: 16 }),
      makeBlock('code', {
        code: 'function greet(name: string) {\n  // 微信无全局样式表，高亮靠内联 style\n  if (!name) return "hi"\n  return `hello ${name}`\n}',
        lang: 'typescript', theme: 'github-light', showLineNumbers: true, title: 'demo.ts', scroll: true,
      } as CodeData, { marginBottom: 16 }),
      makeBlock('table', {
        header: true,
        rows: [['能力', '秀米', '135', 'InkForge'], ['SVG 动效', '部分', '无', '完整'], ['代码高亮', '无', '弱', 'Shiki 内联'], ['合规编译', '手动', '手动', '自动校验']],
        zebra: true, borderMode: 'all', align: ['left', 'center', 'center', 'center'],
      } as TableData, { marginBottom: 16 }),
      makeBlock('steps', { items: [{ title: '第一步', html: '导入或撰写内容' }, { title: '第二步', html: '调整样式与动效' }, { title: '第三步', html: '一键合规导出' }], variant: 'number' }, { marginBottom: 16 }),
      makeBlock('timeline', { items: [{ time: '上午', title: '立项', html: '确定产品定位' }, { time: '下午', title: '开发', html: '搭建编译管道' }], variant: 'card' }, { marginBottom: 16 }),
      makeBlock('columns', { columns: [{ html: '<strong>左栏</strong>：说明要点一' }, { html: '<strong>右栏</strong>：说明要点二' }], gap: 12 }, { marginBottom: 16 }),
      makeBlock('card', { title: '卡片标题', html: '卡片可用于强调关键内容，支持多种变体。', variant: 'shadow' }, { marginBottom: 16 }),
      makeBlock('divider', { variant: 'gradient', height: 3 }, { marginBottom: 16 }),
      makeBlock('button', { text: '立即体验', variant: 'solid', size: 'md', href: 'https://github.com' }, { marginBottom: 16 }),
      makeBlock('svg', {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect x="10" y="10" width="180" height="80" rx="8" fill="#2C6BED"/><text x="100" y="56" text-anchor="middle" fill="#fff" font-size="20">InkForge</text></svg>',
        animated: true,
        anim: { duration: 2, loop: true, trigger: 'auto', tracks: [{ id: 't1', targetPath: [0], property: 'translate', begin: 0, dur: 2, repeat: 'indefinite', easing: { type: 'preset', name: 'power2.out' }, keyframes: [{ t: 0, value: '0 0' }, { t: 0.5, value: '20 0' }, { t: 1, value: '0 0' }] }] },
      } as SvgData, { marginBottom: 16 }),
      makeBlock('interactive', { kind: 'click-reveal', panels: [{ title: '问题', html: '点击「查看答案」' }, { html: '这是答案，展开后可见。' }] } as InteractiveData, { marginBottom: 16 }),
      makeBlock('qrcode', { content: 'https://github.com', label: '扫码访问', size: 180 } as QrcodeData, { marginBottom: 16 }),
      makeBlock('accordion', { items: [{ title: '折叠项一', html: '内容一，可收起节省空间。' }, { title: '折叠项二', html: '内容二。' }], fallbackOpen: true } as AccordionData, { marginBottom: 16 }),
      makeBlock('paragraph', { html: '示例结束。删除这些区块，或从左侧组件库拖入新内容即可开始创作。' } as RichTextData, { marginBottom: 16 }),
    ],
  }
}

/* ------------------------------------------------------------------ */
/* 版本迁移                                                             */
/* ------------------------------------------------------------------ */

type Migration = (doc: any) => any

const migrations: Record<number, Migration> = {
  // 1 -> 2：补 meta 字段、tokenOverride
  1: (doc) => ({ ...doc, meta: doc.meta ?? {}, tokenOverride: doc.tokenOverride ?? {}, schemaVersion: 2 }),
}

export function migrateDoc(input: any): Doc {
  let doc = { ...input }
  let v = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 1
  while (v < SCHEMA_VERSION && migrations[v]) {
    doc = migrations[v](doc)
    v = doc.schemaVersion ?? v + 1
  }
  doc.schemaVersion = SCHEMA_VERSION
  doc.meta = doc.meta ?? {}
  if (!Array.isArray(doc.blocks)) doc.blocks = []
  for (const b of doc.blocks) {
    if (!b.style) b.style = emptyBlockStyle()
    if (!b.id) b.id = createId()
  }
  return doc as Doc
}
