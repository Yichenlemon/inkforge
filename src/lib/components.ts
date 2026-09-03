import { makeBlock, type Block, type BlockType, type ThemeTokens } from '../../shared/types.js'

export interface ComponentDef {
  id: string
  name: string
  category: string
  tags: string[]
  /** 缩略图用的极简渲染描述（避免为预览再跑一次编译） */
  thumb: 'text' | 'bar' | 'card' | 'grid' | 'quote' | 'divider' | 'list' | 'image' | 'code' | 'badge' | 'timeline' | 'dots'
  /** 插入前需要向用户收集的输入（如生态链接） */
  prompt?: { label: string; placeholder?: string; example?: string }
  create: (t?: ThemeTokens, inputs?: Record<string, string>) => Block[]
}

const B = makeBlock

const text = (html: string, extra: any = {}, style: any = {}) => B('paragraph', { html, ...extra }, style)
const heading = (html: string, level: 1 | 2 | 3 | 4, style = 'plain') =>
  B('heading', { html, level, headingStyle: style })

export const COMPONENT_CATEGORIES = [
  '标题', '正文', '卡片', '列表', '表格', '引用', '分割线', '引导', '交互', '微信生态', '组合',
] as const

export const COMPONENTS: ComponentDef[] = [
  /* ---------------- 标题 ---------------- */
  { id: 'h1-bar', name: '一级标题·竖条', category: '标题', tags: ['h1', '一级', 'bar'], thumb: 'bar',
    create: () => [B('heading', { html: '一级标题', level: 1, headingStyle: 'bar' }, { marginTop: 8, marginBottom: 16 }) ] },
  { id: 'h2-underline', name: '二级标题·下划线', category: '标题', tags: ['h2', '二级'], thumb: 'bar',
    create: () => [B('heading', { html: '二级标题', level: 2, headingStyle: 'underline' }, { marginTop: 20, marginBottom: 12 }) ] },
  { id: 'h2-bracket', name: '二级标题·方括号', category: '标题', tags: ['h2', '括号'], thumb: 'text',
    create: () => [B('heading', { html: '二级标题', level: 2, headingStyle: 'bracket' }, { marginTop: 20, marginBottom: 12 }) ] },
  { id: 'h-number', name: '编号标题', category: '标题', tags: ['编号', '序号'], thumb: 'badge',
    create: () => [B('heading', { html: '这一节的标题', level: 2, headingStyle: 'number' }, { marginTop: 20, marginBottom: 12 }) ] },
  { id: 'h-highlight', name: '荧光笔标题', category: '标题', tags: ['高亮', 'mark'], thumb: 'text',
    create: () => [B('heading', { html: '重点标题', level: 2, headingStyle: 'background' }, { marginTop: 20, marginBottom: 12 }) ] },
  { id: 'title-sub', name: '标题 + 副标题', category: '标题', tags: ['副标题'], thumb: 'text',
    create: () => [
      B('heading', { html: '主标题', level: 2 }, { marginBottom: 4 }),
      B('paragraph', { html: '副标题说明文字' }, { marginTop: 0, marginBottom: 16, color: '#8C8C8C', fontSize: 13 }),
    ] },
  { id: 'section-num', name: '章节序号', category: '标题', tags: ['章节', 'part'], thumb: 'badge',
    create: () => [
      B('paragraph', { html: 'PART 01' }, { marginBottom: 2, fontSize: 12, letterSpacing: 2, color: '#B08A4A', fontWeight: 700 }),
      B('heading', { html: '章节名称', level: 2, headingStyle: 'plain' }, { marginTop: 0, marginBottom: 14 }),
    ] },

  /* ---------------- 正文 ---------------- */
  { id: 'p-plain', name: '正文段落', category: '正文', tags: ['p', '段落'], thumb: 'text',
    create: () => [text('在这里输入正文内容。选中文本后可在右侧调整字号、颜色与间距。')] },
  { id: 'p-indent', name: '首行缩进', category: '正文', tags: ['缩进'], thumb: 'text',
    create: () => [text('这是一段首行缩进的正文。公众号里长文建议保持缩进或段间距中的一种，不要同时用。', {}, {})].map((b) => ({ ...b, style: { ...b.style, customCss: 'text-indent:2em' } })) as Block[] },
  { id: 'p-center', name: '居中短句', category: '正文', tags: ['居中'], thumb: 'text',
    create: () => [text('一句想被记住的话。', {}, { textAlign: 'center', color: '#5F5E5A' })] },
  { id: 'p-caption', name: '图片说明', category: '正文', tags: ['图注', 'caption'], thumb: 'text',
    create: () => [text('图片说明文字', {}, { textAlign: 'center', fontSize: 12, color: '#8C8C8C', marginTop: 0 })] },
  { id: 'p-lead', name: '导语', category: '正文', tags: ['lead', '开篇'], thumb: 'text',
    create: () => [text('一句话说清这篇文章解决什么问题，放在开头能显著提升读完率。', {}, { fontSize: 15, color: '#5F5E5A', paddingLeft: 12, borderLeftWidth: 0, customCss: 'border-left:2px solid #E5E5E0' })] },

  /* ---------------- 卡片 ---------------- */
  { id: 'card-plain', name: '基础卡片', category: '卡片', tags: ['card'], thumb: 'card',
    create: (t) => [B('card', { title: '卡片标题', html: '卡片正文内容，用来承载需要突出的信息。', variant: 'plain' })] },
  { id: 'card-shadow', name: '阴影卡片', category: '卡片', tags: ['card', 'shadow'], thumb: 'card',
    create: () => [B('card', { title: '阴影卡片', html: '带阴影的卡片，适合放重点内容。', variant: 'shadow' })] },
  { id: 'card-outline', name: '描边卡片', category: '卡片', tags: ['card', 'outline'], thumb: 'card',
    create: () => [B('card', { title: '描边卡片', html: '细边框卡片，视觉更轻。', variant: 'outline' })] },
  { id: 'card-accent', name: '左侧强调卡片', category: '卡片', tags: ['card', 'accent'], thumb: 'card',
    create: () => [B('card', { title: '重点提示', html: '左侧色条用于强调。', variant: 'accent' })] },
  { id: 'card-image-left', name: '图文卡片·左图', category: '卡片', tags: ['card', 'image'], thumb: 'image',
    create: () => [B('card', { title: '图文卡片', html: '图片在左，文字在右。', imagePosition: 'left', variant: 'plain' })] },
  { id: 'card-image-top', name: '图文卡片·上图', category: '卡片', tags: ['card', 'image'], thumb: 'image',
    create: () => [B('card', { title: '图文卡片', html: '图片在上，文字在下。', imagePosition: 'top', variant: 'plain' })] },

  /* ---------------- 列表 ---------------- */
  { id: 'list-dot', name: '无序列表', category: '列表', tags: ['ul'], thumb: 'list',
    create: () => [B('list', { html: '<li>列表项一</li><li>列表项二</li><li>列表项三</li>', ordered: false })] },
  { id: 'list-order', name: '有序列表', category: '列表', tags: ['ol'], thumb: 'list',
    create: () => [B('list', { html: '<li>第一步</li><li>第二步</li><li>第三步</li>', ordered: true })] },
  { id: 'list-check', name: '清单列表', category: '列表', tags: ['check', 'todo'], thumb: 'list',
    create: () => [B('list', { html: '<li>已完成的事项</li><li>待办事项</li>' })] },
  { id: 'steps', name: '步骤条', category: '列表', tags: ['step', '步骤'], thumb: 'badge',
    create: () => [B('steps', { items: [{ title: '第一步', html: '说明文字' }, { title: '第二步', html: '说明文字' }, { title: '第三步', html: '说明文字' }], variant: 'number' })] },
  { id: 'timeline', name: '时间轴', category: '列表', tags: ['timeline'], thumb: 'timeline',
    create: () => [B('timeline', { items: [{ time: '2024', title: '起点', html: '从这里开始' }, { time: '2025', title: '发展', html: '逐步成长' }, { time: '2026', title: '现在', html: '持续迭代' }], variant: 'card' })] },
  { id: 'faq', name: '常见问题', category: '列表', tags: ['faq', '折叠'], thumb: 'list',
    create: () => [B('accordion', { items: [{ title: '常见问题一？', html: '这里是答案。' }, { title: '常见问题二？', html: '这里是答案。' }], fallbackOpen: true })] },

  /* ---------------- 表格 ---------------- */
  { id: 'table-basic', name: '基础表格', category: '表格', tags: ['table'], thumb: 'grid',
    create: () => [B('table', { header: true, rows: [['项目', '说明', '备注'], ['项目一', '说明一', '-'], ['项目二', '说明二', '-']], zebra: true, borderMode: 'all' })] },
  { id: 'table-zebra', name: '斑马纹表格', category: '表格', tags: ['table', 'zebra'], thumb: 'grid',
    create: () => [B('table', { header: true, zebra: true, borderMode: 'horizontal', rows: [['功能', '支持'], ['代码块', '✓'], ['动效', '✓']] })] },
  { id: 'table-compare', name: '对比表格', category: '表格', tags: ['compare'], thumb: 'grid',
    create: () => [B('table', { header: true, zebra: false, borderMode: 'all',
      rows: [['对比项', '方案 A', '方案 B'], ['成本', '低', '高'], ['效率', '中', '高'], ['推荐', '', '✓']],
      align: ['left', 'center', 'center'] })] },
  { id: 'table-price', name: '价目表', category: '表格', tags: ['price'], thumb: 'grid',
    create: () => [B('table', { header: true, zebra: true, borderMode: 'horizontal',
      rows: [['版本', '价格', '权益'], ['基础版', '¥99', '核心功能'], ['专业版', '¥299', '全部功能']],
      align: ['left', 'center', 'left'] })] },

  /* ---------------- 引用 ---------------- */
  { id: 'quote-bar', name: '竖线引用', category: '引用', tags: ['quote'], thumb: 'quote',
    create: () => [B('quote', { html: '引用一段有分量的话。', quoteStyle: 'bar' })] },
  { id: 'quote-card', name: '卡片引用', category: '引用', tags: ['quote'], thumb: 'quote',
    create: () => [B('quote', { html: '底色引用的视觉效果更强。', quoteStyle: 'card' })] },
  { id: 'quote-mark', name: '引号引用', category: '引用', tags: ['quote'], thumb: 'quote',
    create: () => [B('quote', { html: '居中带引号的引用。', quoteStyle: 'quote-mark' })] },
  { id: 'callout-info', name: '信息提示', category: '引用', tags: ['callout', 'info'], thumb: 'quote',
    create: () => [B('callout', { tone: 'info', title: '提示', html: '补充说明信息。', variant: 'card' })] },
  { id: 'callout-warn', name: '警告提示', category: '引用', tags: ['callout', 'warning'], thumb: 'quote',
    create: () => [B('callout', { tone: 'warning', title: '注意', html: '这里需要读者留意。', variant: 'card' })] },
  { id: 'callout-success', name: '成功提示', category: '引用', tags: ['callout', 'success'], thumb: 'quote',
    create: () => [B('callout', { tone: 'success', title: '结论', html: '这一步做对了。', variant: 'card' })] },
  { id: 'callout-danger', name: '禁忌提示', category: '引用', tags: ['callout', 'danger'], thumb: 'quote',
    create: () => [B('callout', { tone: 'danger', title: '避坑', html: '常见错误做法。', variant: 'card' })] },

  /* ---------------- 分割线 ---------------- */
  { id: 'div-solid', name: '实线分割', category: '分割线', tags: ['hr'], thumb: 'divider',
    create: () => [B('divider', { variant: 'solid', height: 1 })] },
  { id: 'div-dashed', name: '虚线分割', category: '分割线', tags: ['hr'], thumb: 'divider',
    create: () => [B('divider', { variant: 'dashed', height: 1 })] },
  { id: 'div-gradient', name: '渐变分割', category: '分割线', tags: ['hr', 'gradient'], thumb: 'divider',
    create: () => [B('divider', { variant: 'gradient', height: 3 })] },
  { id: 'div-symbol', name: '符号分割', category: '分割线', tags: ['hr', 'symbol'], thumb: 'divider',
    create: () => [B('divider', { variant: 'symbol', symbol: '• • •' })] },
  { id: 'div-space', name: '空白间隔', category: '分割线', tags: ['space', '间距'], thumb: 'divider',
    create: () => [B('divider', { variant: 'space', height: 28 })] },

  /* ---------------- 引导 ---------------- */
  { id: 'btn-primary', name: '主按钮', category: '引导', tags: ['button', 'cta'], thumb: 'badge',
    create: () => [B('button', { text: '立即了解', variant: 'solid', size: 'md' })] },
  { id: 'btn-outline', name: '描边按钮', category: '引导', tags: ['button'], thumb: 'badge',
    create: () => [B('button', { text: '查看更多', variant: 'outline', size: 'md' })] },
  { id: 'btn-gradient', name: '渐变按钮', category: '引导', tags: ['button', 'gradient'], thumb: 'badge',
    create: () => [B('button', { text: '立即领取', variant: 'gradient', size: 'lg', fullWidth: false })] },
  { id: 'qr-follow', name: '二维码·关注', category: '引导', tags: ['qrcode', '二维码'], thumb: 'image',
    create: () => [B('qrcode', { content: 'https://mp.weixin.qq.com', label: '长按识别二维码', caption: '关注我们，获取更多内容', size: 200, preset: 'follow' })] },
  { id: 'qr-group', name: '二维码·加群', category: '引导', tags: ['qrcode'], thumb: 'image',
    create: () => [B('qrcode', { content: 'https://mp.weixin.qq.com', label: '扫码加入社群', caption: '与同行一起交流', size: 180, preset: 'group' })] },
  { id: 'audio-card', name: '音频卡片', category: '引导', tags: ['audio'], thumb: 'badge',
    create: () => [B('audio', { url: '', title: '音频标题', artist: '主播名', mode: 'card' })] },
  { id: 'video-poster', name: '视频封面', category: '引导', tags: ['video'], thumb: 'image',
    create: () => [B('video', { url: '', title: '视频标题', mode: 'poster' })] },
  { id: 'columns-2', name: '双栏排版', category: '引导', tags: ['columns'], thumb: 'grid',
    create: () => [B('columns', { columns: [{ html: '左栏内容' }, { html: '右栏内容' }], gap: 12 })] },

  /* ---------------- 交互 ---------------- */
  { id: 'ix-slider', name: '横向滑动', category: '交互', tags: ['slider', '滑动'], thumb: 'image',
    create: () => [B('interactive', {
      kind: 'slider',
      panels: [
        { title: '第一屏', html: '向左滑动查看下一屏' },
        { title: '第二屏', html: '继续滑动' },
        { title: '第三屏', html: '最后一屏' },
      ],
      direction: 'horizontal', hint: '← 左右滑动 →',
    })] },
  { id: 'ix-reveal', name: '点击揭晓', category: '交互', tags: ['click', '点击'], thumb: 'badge',
    create: () => [B('interactive', {
      kind: 'click-reveal',
      panels: [{ title: '问题：点击揭晓答案', html: '👆 点一下' }, { html: '答案就在这里' }],
      hint: '点击查看',
    })] },
  { id: 'ix-longpress', name: '长按查看', category: '交互', tags: ['longpress', '长按'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'longpress', panels: [{ html: '长按才能看到的内容' }], hint: '长按揭晓' })] },
  { id: 'ix-flip', name: '点击翻牌', category: '交互', tags: ['flip', '翻牌'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'flip', panels: [{ title: '正面' }, { title: '背面是答案' }], width: 320, height: 200 })] },
  { id: 'ix-tab', name: '点击切换', category: '交互', tags: ['tab', '切换'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'tab', panels: [{ html: '内容一' }, { html: '内容二' }, { html: '内容三' }] })] },
  { id: 'ix-accordion', name: '点击展开', category: '交互', tags: ['accordion'], thumb: 'list',
    create: () => [B('interactive', { kind: 'accordion-click', panels: [{ title: '点击展开', html: '展开后的内容' }, { title: '再点一个', html: '更多内容' }] })] },
  { id: 'ix-carousel', name: '图片轮播', category: '交互', tags: ['carousel', '轮播'], thumb: 'image',
    create: () => [B('interactive', { kind: 'carousel', panels: [
      { imageUrl: '', title: '图片一' }, { imageUrl: '', title: '图片二' }, { imageUrl: '', title: '图片三' },
    ], width: 677, height: 240, hint: '自动轮播' })] },
  { id: 'ix-progress', name: '进度条', category: '交互', tags: ['progress', '进度'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'progress', panels: [{ html: '85%' }], progress: 0.85, width: 677, height: 28 })] },
  { id: 'ix-marquee', name: '图片跑马灯', category: '交互', tags: ['marquee', '滚动'], thumb: 'image',
    create: () => [B('interactive', { kind: 'marquee', panels: [
      { imageUrl: '', title: '图一' }, { imageUrl: '', title: '图二' }, { imageUrl: '', title: '图三' },
    ], height: 120, hint: '横向滚动' })] },
  { id: 'ix-readmore', name: '展开全文', category: '交互', tags: ['read-more', '展开'], thumb: 'list',
    create: () => [B('interactive', { kind: 'read-more', panels: [{ title: '这是收起时显示的摘要…', html: '点击展开后看到的完整内容段落。' }] })] },
  { id: 'ix-like', name: '点赞', category: '交互', tags: ['like', '点赞'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'like', panels: [{ html: '觉得有用就点个赞' }] })] },
  { id: 'ix-rating', name: '星级评分', category: '交互', tags: ['rating', '评分'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'rating', panels: [{ html: '给个好评' }], count: 5, value: 4 })] },
  { id: 'ix-zoom', name: '图片放大', category: '交互', tags: ['zoom', '放大'], thumb: 'image',
    create: () => [B('interactive', { kind: 'zoom', panels: [{ imageUrl: '' }], width: 677, height: 220, hint: '点击放大' })] },
  { id: 'ix-typewriter', name: '打字机', category: '交互', tags: ['typewriter', '打字'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'typewriter', panels: [{ html: '欢迎关注我们的公众号' }], hint: '点击播放打字效果' })] },
  { id: 'ix-switch', name: '开关', category: '交互', tags: ['switch', '开关'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'switch', panels: [{ html: '开启通知' }], onLabel: '开', offLabel: '关' })] },
  { id: 'ix-progress-ring', name: '环形进度', category: '交互', tags: ['progress-ring', '环形'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'progress-ring', panels: [{ html: '70%' }], progress: 0.7, width: 200, height: 200 })] },
  { id: 'ix-tooltip', name: '点击提示', category: '交互', tags: ['tooltip', '提示'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'tooltip', panels: [{ title: '点击查看说明' }, { html: '这里是提示内容' }] })] },
  { id: 'ix-hotzone', name: '图片标注', category: '交互', tags: ['hotzone', '图片'], thumb: 'image',
    create: () => [B('interactive', { kind: 'hotzone', panels: [{ imageUrl: '' }, { html: '这是图片上的标注说明' }], width: 677, height: 220, hint: '👆 点击图片下方查看标注' })] },
  { id: 'ix-before-after', name: '前后对比', category: '交互', tags: ['before-after', '对比'], thumb: 'image',
    create: () => [B('interactive', { kind: 'before-after', panels: [{ imageUrl: '' }, { imageUrl: '' }], width: 677, height: 240, hint: '点击查看对比' })] },
  { id: 'ix-faq', name: '多问答折叠', category: '交互', tags: ['faq', '问答'], thumb: 'list',
    create: () => [B('interactive', { kind: 'faq', panels: [{ title: '常见问题一', html: '答案一' }, { title: '常见问题二', html: '答案二' }] })] },
  { id: 'ix-confetti', name: '点击撒花', category: '交互', tags: ['confetti', '撒花'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'confetti', panels: [{ html: '恭喜' }], width: 300, height: 200, hint: '点击撒花' })] },
  { id: 'ix-loading', name: '加载三点', category: '交互', tags: ['loading', '加载'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'loading', panels: [{ html: '加载中…' }] })] },
  { id: 'ix-soundwave', name: '声波', category: '交互', tags: ['soundwave', '音频'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'soundwave', panels: [{ html: '语音 / 音频' }], width: 677, height: 80 })] },
  { id: 'ix-poll', name: '投票', category: '交互', tags: ['poll', '投票'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'poll', panels: [{ title: '选项 A', html: '65' }, { title: '选项 B', html: '35' }], width: 677 })] },
  { id: 'ix-chat', name: '逐条对话', category: '交互', tags: ['chat', '对话'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'chat', panels: [{ html: '你好！' }, { html: '这是我们新上线的功能～' }, { html: '点击逐条查看' }] })] },
  { id: 'ix-badge', name: '角标弹出', category: '交互', tags: ['badge', '角标'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'badge', panels: [{ html: 'NEW' }], width: 120, height: 120, hint: '点击弹出角标' })] },
  { id: 'ix-countdown', name: '倒计时', category: '交互', tags: ['countdown', '计时'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'countdown', panels: [{ html: '10' }], width: 160, height: 160, hint: '点击开始倒计时' })] },
  { id: 'ix-marquee-text', name: '文字跑马灯', category: '交互', tags: ['marquee-text', '滚动'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'marquee-text', panels: [{ html: '这是一条滚动播报文案，用于公告、促销、提醒等场景。' }], width: 677, height: 40 })] },
  { id: 'ix-reveal-fade', name: '渐显文字', category: '交互', tags: ['reveal-fade', '渐显'], thumb: 'badge',
    create: () => [B('interactive', { kind: 'reveal-fade', panels: [{ html: '点击后渐显的隐藏内容。' }], hint: '点击渐显内容' })] },
  { id: 'gallery-scroll', name: '图片横滑', category: '交互', tags: ['gallery', '图片'], thumb: 'image',
    create: () => [B('gallery', { images: [], layout: 'scroll', radius: 8, gap: 8 })] },
  { id: 'gallery-grid3', name: '九宫格', category: '交互', tags: ['gallery', 'grid'], thumb: 'grid',
    create: () => [B('gallery', { images: [], layout: 'grid3', radius: 6, gap: 6 })] },

  /* ---------------- 组合 ---------------- */
  { id: 'combo-head', name: '文章头部', category: '组合', tags: ['header', '头图'], thumb: 'text',
    create: () => [
      B('paragraph', { html: '栏目名称 · 第 12 期' }, { marginBottom: 6, fontSize: 12, letterSpacing: 2, color: '#B08A4A' }),
      B('heading', { html: '文章主标题写在这里', level: 1, headingStyle: 'plain' }, { marginTop: 0, marginBottom: 8 }),
      B('paragraph', { html: '作者名 · 2026年9月3日 · 阅读 8 分钟' }, { marginTop: 0, marginBottom: 20, fontSize: 12, color: '#8C8C8C' }),
      B('divider', { variant: 'gradient', height: 3 }),
    ] },
  { id: 'combo-body', name: '标准正文段', category: '组合', tags: ['body'], thumb: 'text',
    create: () => [
      B('heading', { html: '小标题', level: 2, headingStyle: 'bar' }, { marginTop: 20, marginBottom: 10 }),
      B('paragraph', { html: '正文段落内容。建议每段控制在 3–5 行，手机上阅读最舒服。' }),
      B('paragraph', { html: '第二个段落。段落之间保持一致的间距。' }),
    ] },
  { id: 'combo-quote-card', name: '观点卡片', category: '组合', tags: ['quote', '观点'], thumb: 'quote',
    create: () => [
      B('callout', { tone: 'tip', title: '核心观点', html: '一句话总结这一段想表达的观点。', variant: 'card' }),
    ] },
  { id: 'combo-footer', name: '文章尾部', category: '组合', tags: ['footer', '尾巴'], thumb: 'text',
    create: () => [
      B('divider', { variant: 'symbol', symbol: '· · ·' }),
      B('paragraph', { html: '如果这篇文章对你有帮助，欢迎点赞、在看、分享。' },
        { textAlign: 'center', fontSize: 13, color: '#8C8C8C' }),
      B('qrcode', { content: 'https://mp.weixin.qq.com', label: '扫码关注', caption: '不错过后续更新', size: 160 }),
    ] },
  { id: 'combo-code', name: '代码块 + 说明', category: '组合', tags: ['code'], thumb: 'code',
    create: () => [
      B('paragraph', { html: '下面这段代码演示了基本用法：' }),
      B('code', { code: 'const result = await compile(doc)\nconsole.log(result.stats)', lang: 'javascript', theme: 'github-light', showLineNumbers: true, title: 'example.js', scroll: true }),
    ] },
  { id: 'combo-steps', name: '教程步骤', category: '组合', tags: ['tutorial', '教程'], thumb: 'badge',
    create: () => [
      B('heading', { html: '操作步骤', level: 2, headingStyle: 'bar' }, { marginTop: 20, marginBottom: 12 }),
      B('steps', { items: [
        { title: '准备工作', html: '确认已安装依赖' },
        { title: '开始操作', html: '按照指引执行' },
        { title: '检查结果', html: '验证输出是否符合预期' },
      ], variant: 'number' }),
      B('callout', { tone: 'warning', title: '注意', html: '操作前建议先备份。', variant: 'bar' }),
    ] },

  /* ---------------- 微信生态（结构化组件，关联与渲染需在公众号后台完成） ---------------- */
  { id: 'wx-eco', name: '微信生态组件', category: '微信生态', tags: ['小程序', '视频号', '小店', '生态', '公众号'], thumb: 'card',
    create: () => [B('wechat-eco', { ecoType: 'miniprogram', title: '小程序卡片' } as any, { marginTop: 4, marginBottom: 16 })] },
]

export const COMPONENTS_BY_CATEGORY = COMPONENT_CATEGORIES.map((c) => ({
  category: c,
  items: COMPONENTS.filter((x) => x.category === c),
})).filter((g) => g.items.length)

export function findComponent(id: string): ComponentDef | undefined {
  return COMPONENTS.find((c) => c.id === id)
}

/** 搜索：支持中文名 + 标签 + 拼音首字母 */
export function searchComponents(keyword: string): ComponentDef[] {
  const k = keyword.trim().toLowerCase()
  if (!k) return COMPONENTS
  return COMPONENTS.filter((c) =>
    c.name.toLowerCase().includes(k) ||
    c.category.includes(k) ||
    c.tags.some((t) => t.toLowerCase().includes(k)) ||
    c.id.includes(k))
}

export const BLOCK_TYPE_LABEL: Record<BlockType, string> = {
  paragraph: '正文', heading: '标题', quote: '引用', list: '列表',
  image: '图片', gallery: '图组', code: '代码', table: '表格', divider: '分割线',
  card: '卡片', callout: '提示', timeline: '时间轴', steps: '步骤', accordion: '折叠', button: '按钮',
  svg: 'SVG', lottie: 'Lottie', video: '视频', audio: '音频', qrcode: '二维码',
  interactive: '交互', html: '自定义 HTML', columns: '分栏', 'wechat-eco': '微信生态',
}
