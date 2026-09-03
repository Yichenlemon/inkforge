import { makeBlock, emptyBlockStyle, type Block, type BlockType } from '../../shared/types.js'

/** 小工具：构造一个 block */
function b(type: BlockType, data: any, style: any = {}): Block {
  return makeBlock(type, data, { marginTop: 0, marginBottom: 16, ...style })
}

const link = (text: string, href = '#') =>
  `<a href="${href}" style="color:#2C6BED;text-decoration:none">${text}</a>`

/* 封面占位图 */
const cover = (seed: string, w = 900, h = 500) => `https://picsum.photos/seed/${seed}/${w}/${h}`
const avatar = (seed: string) => `https://picsum.photos/seed/${seed}/200/200`

export interface BuiltinTemplate {
  id: string
  name: string
  group: string
  themeId: string
  blocks: Block[]
}

/* ------------------------------------------------------------------ */
/* 1. 干货教程                                                            */
/* ------------------------------------------------------------------ */
function tutorial(): Block[] {
  return [
    b('heading', { html: '3 分钟搞定：从零搭建你的第一篇公众号', level: 1, headingStyle: 'bar' }, { marginBottom: 10 }),
    b('paragraph', { html: '很多新手卡在「第一步」。这篇教程用最直白的方式，带你跑通一条完整的发布链路。' }, { marginBottom: 16 }),
    b('callout', { tone: 'info', title: '你会学到', html: '准备素材 → 排版 → 预览 → 一键导出 → 复制到公众号后台。', variant: 'card' }, { marginBottom: 16 }),
    b('heading', { html: '第一步：准备内容', level: 2, headingStyle: 'underline' }, { marginBottom: 8 }),
    b('paragraph', { html: '先把文字和图片整理好。图片建议宽度不超过 1080px，单张控制在 200KB 内，加载更快。' }),
    b('code', { code: 'npm install -g inkforge-cli\ninkforge init my-blog', lang: 'bash', theme: 'github-light', showLineNumbers: true, title: '终端', scroll: true }, { marginBottom: 16 }),
    b('heading', { html: '第二步：排版与美化', level: 2, headingStyle: 'underline' }, { marginBottom: 8 }),
    b('steps', { items: [
      { title: '套用模板', html: '从模板中心挑一个贴近主题的结构。' },
      { title: '换主题色', html: '在右侧「主题」里改主色，全篇自动统一。' },
      { title: '加动效', html: '选中 SVG，用动效编辑器加描边/运动。' },
    ], variant: 'number' }, { marginBottom: 16 }),
    b('callout', { tone: 'tip', title: '小技巧', html: '复杂 SVG 动画用 SMIL 实现，微信端原生支持，无需任何脚本。', variant: 'bar' }, { marginBottom: 16 }),
    b('divider', { variant: 'gradient', height: 3 }, { marginBottom: 16 }),
    b('paragraph', { html: '准备好后，点击顶部「导出」即可获得公众号安全的 HTML。' }),
  ]
}

/* ------------------------------------------------------------------ */
/* 2. 活动招募                                                            */
/* ------------------------------------------------------------------ */
function event(): Block[] {
  return [
    b('image', { src: cover('event-hero', 900, 460), alt: '活动主视觉', width: '100%', radius: 12, shadow: 'md' }, { marginBottom: 16 }),
    b('heading', { html: '城市读书会 · 第 12 期', level: 1, headingStyle: 'center' }, { marginBottom: 6, textAlign: 'center' }),
    b('paragraph', { html: '一场关于「慢生活」的线下分享，欢迎带上你最近读过的一本书。', textAlign: 'center' }, { marginBottom: 16 }),
    b('card', { title: '活动信息', html: '📅 时间：本周六 14:00–17:00<br/>📍 地点：市中心·共享书房<br/>🎫 费用：免费（限额 30 人）', variant: 'outline' }, { marginBottom: 16 }),
    b('heading', { html: '当天流程', level: 2, headingStyle: 'number' }, { marginBottom: 8 }),
    b('timeline', { items: [
      { time: '14:00', title: '签到 & 自由交流', html: '互相认识，热场破冰。' },
      { time: '14:30', title: '主题分享', html: '邀请两位嘉宾聊「如何建立阅读习惯」。' },
      { time: '16:00', title: '圆桌讨论', html: '围绕一本书展开自由对话。' },
    ], variant: 'line' }, { marginBottom: 16 }),
    b('button', { text: '立即报名', variant: 'solid', size: 'lg', fullWidth: true, href: '#报名链接' }, { marginBottom: 12 }),
    b('qrcode', { content: 'https://example.com/signup', label: '扫码报名', size: 180 }, { marginBottom: 16 }),
  ]
}

/* ------------------------------------------------------------------ */
/* 3. 产品发布                                                            */
/* ------------------------------------------------------------------ */
function product(): Block[] {
  return [
    b('heading', { html: '全新升级：让效率快人一步', level: 1, headingStyle: 'bar' }, { marginBottom: 10 }),
    b('paragraph', { html: '我们重新设计了核心体验，把「快」写进了每一个细节。' }),
    b('image', { src: cover('product', 900, 500), alt: '产品图', width: '100%', radius: 12, shadow: 'lg' }, { marginBottom: 16 }),
    b('heading', { html: '三大核心升级', level: 2, headingStyle: 'underline' }, { marginBottom: 8 }),
    b('columns', { columns: [
      { html: '<strong>更快</strong><br/>启动速度提升 2 倍。' },
      { html: '<strong>更稳</strong><br/>崩溃率下降 90%。' },
      { html: '<strong>更轻</strong><br/>安装包小了 40%。' },
    ], gap: 12 }, { marginBottom: 16 }),
    b('callout', { tone: 'success', title: '限时福利', html: '首发两周内升级，赠送 3 个月会员。', variant: 'card' }, { marginBottom: 16 }),
    b('button', { text: '立即体验', variant: 'gradient', size: 'lg', fullWidth: true, href: '#下载' }, { marginBottom: 12 }),
  ]
}

/* ------------------------------------------------------------------ */
/* 4. 行业资讯（资讯简报）                                                 */
/* ------------------------------------------------------------------ */
function news(): Block[] {
  return [
    b('heading', { html: '本周行业速览（第 38 期）', level: 1, headingStyle: 'bar' }, { marginBottom: 10 }),
    b('paragraph', { html: '用 5 分钟，掌握本周最值得关注的几件事。' }),
    b('callout', { tone: 'warning', title: '编辑点评', html: '政策风向正在转变，建议相关团队提前评估影响。', variant: 'bar' }, { marginBottom: 16 }),
    b('heading', { html: '一、平台新规出台', level: 2, headingStyle: 'number' }, { marginBottom: 8 }),
    b('paragraph', { html: '新规对内容分发机制做了调整，利好原创与深度内容。' }),
    b('quote', { html: '变化不可怕，可怕的是对变化视而不见。', quoteStyle: 'quote-mark' }, { marginBottom: 16 }),
    b('heading', { html: '二、一项关键技术突破', level: 2, headingStyle: 'number' }, { marginBottom: 8 }),
    b('paragraph', { html: '某团队发布了开源方案，实测可将推理成本降低一半。' }),
    b('divider', { variant: 'symbol', symbol: '◆ ◆ ◆' }, { marginBottom: 16 }),
    b('paragraph', { html: `更多深度解读见${link('完整报告')}。`, textAlign: 'center' }),
  ]
}

/* ------------------------------------------------------------------ */
/* 5. 招聘                                                               */
/* ------------------------------------------------------------------ */
function recruit(): Block[] {
  return [
    b('heading', { html: '我们在找这样的你', level: 1, headingStyle: 'bar' }, { marginBottom: 10 }),
    b('paragraph', { html: '一家专注内容效率的团队，正在扩充产品与设计力量。' }),
    b('card', { title: '关于我们', html: '小而美的远程优先团队，做真正被使用的工具。', variant: 'shadow' }, { marginBottom: 16 }),
    b('heading', { html: '在招岗位', level: 2, headingStyle: 'underline' }, { marginBottom: 8 }),
    b('table', { header: true, zebra: true, borderMode: 'horizontal',
      rows: [
        ['岗位', '方向', '地点'],
        ['高级前端', '编辑器 / 可视化', '远程'],
        ['产品设计师', '交互 / 体验', '远程'],
        ['内容运营', '社区 / 增长', '上海'],
      ], align: ['left', 'left', 'center'] }, { marginBottom: 16 }),
    b('callout', { tone: 'tip', title: '我们提供', html: '有竞争力的薪酬、弹性工作、充足的学习预算。', variant: 'card' }, { marginBottom: 16 }),
    b('button', { text: '投递简历', variant: 'solid', size: 'lg', fullWidth: true, href: '#投递' }, { marginBottom: 12 }),
    b('qrcode', { content: 'https://example.com/jobs', label: '扫码了解详情', size: 180 }, { marginBottom: 16 }),
  ]
}

/* ------------------------------------------------------------------ */
/* 6. 节日祝福                                                            */
/* ------------------------------------------------------------------ */
function festival(): Block[] {
  return [
    b('divider', { variant: 'space', height: 28 }, { marginBottom: 8 }),
    b('heading', { html: '新年快乐 🎉', level: 1, headingStyle: 'center' }, { marginBottom: 8, textAlign: 'center' }),
    b('paragraph', { html: '愿你所求皆如愿，所行皆坦途。新的一年，继续热爱，继续向前。', textAlign: 'center' }, { marginBottom: 16 }),
    b('divider', { variant: 'gradient', height: 3 }, { marginBottom: 16 }),
    b('paragraph', { html: '—— 来自 InkForge 团队', textAlign: 'center' }),
  ]
}

/* ------------------------------------------------------------------ */
/* 7. 对比测评                                                            */
/* ------------------------------------------------------------------ */
function comparison(): Block[] {
  return [
    b('heading', { html: 'A 与 B，到底选哪个？', level: 1, headingStyle: 'bar' }, { marginBottom: 10 }),
    b('paragraph', { html: '很多人在两款工具间纠结。我们从三个维度做了横向对比。' }),
    b('table', { header: true, zebra: true, borderMode: 'all',
      rows: [
        ['维度', 'A', 'B'],
        ['上手成本', '低', '中'],
        ['功能深度', '中', '高'],
        ['价格', '免费', '订阅'],
      ], align: ['left', 'center', 'center'] }, { marginBottom: 16 }),
    b('callout', { tone: 'success', title: '推荐 A 的理由', html: '如果你更看重开箱即用和性价比。', variant: 'card' }, { marginBottom: 12 }),
    b('callout', { tone: 'info', title: '推荐 B 的理由', html: '如果你需要深度定制与团队协作。', variant: 'card' }, { marginBottom: 16 }),
    b('paragraph', { html: '结论：轻量需求选 A，专业需求选 B。没有绝对好坏，只有合不合适。' }),
  ]
}

/* ------------------------------------------------------------------ */
/* 8. 个人名片                                                            */
/* ------------------------------------------------------------------ */
function card(): Block[] {
  return [
    b('divider', { variant: 'space', height: 16 }, { marginBottom: 8 }),
    b('image', { src: avatar('me'), alt: '头像', width: '96px', radius: 48, shadow: 'md' }, { marginBottom: 12, textAlign: 'center' }),
    b('heading', { html: '李明 · 产品设计师', level: 2, headingStyle: 'center' }, { marginBottom: 6, textAlign: 'center' }),
    b('paragraph', { html: '专注工具类产品与可视化表达。相信好的设计是「看不见的设计」。', textAlign: 'center' }, { marginBottom: 16 }),
    b('list', { html: '<li>📮 邮箱：hi@example.com</li><li>🌐 主页：example.com</li><li>💬 微信：liming_design</li>', ordered: false }, { marginBottom: 16 }),
    b('qrcode', { content: 'https://example.com/wechat', label: '加我微信', size: 160 }, { marginBottom: 16 }),
  ]
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  { id: 'tpl-tutorial', name: '干货教程', group: '图文', themeId: 'clean', blocks: tutorial() },
  { id: 'tpl-event', name: '活动招募', group: '活动', themeId: 'warm', blocks: event() },
  { id: 'tpl-product', name: '产品发布', group: '营销', themeId: 'tech', blocks: product() },
  { id: 'tpl-news', name: '行业资讯', group: '资讯', themeId: 'news', blocks: news() },
  { id: 'tpl-recruit', name: '招聘启事', group: '招聘', themeId: 'clean', blocks: recruit() },
  { id: 'tpl-festival', name: '节日祝福', group: '节日', themeId: 'warm', blocks: festival() },
  { id: 'tpl-comparison', name: '对比测评', group: '评测', themeId: 'tech', blocks: comparison() },
  { id: 'tpl-card', name: '个人名片', group: '个人', themeId: 'clean', blocks: card() },
]
