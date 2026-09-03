/**
 * 内置手绘风 SVG 素材库。
 *
 * 设计约定：
 * - 全部用 `currentColor` 或 `var(--c)` 占位，支持「一键换色」跟随主题 Token。
 * - viewBox 统一 0 0 64 64，便于混排。
 * - 无 id / 无外链 / 无 script —— 直接满足微信清洗规则（导出时不会再被改）。
 */

export interface Illustration {
  id: string
  name: string
  category: string
  tags: string[]
  svg: string
}

const wrap = (inner: string, vb = '0 0 64 64') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`

export const ILLUSTRATION_CATEGORIES = ['手绘符号', '商务办公', '科技数码', '学习教育', '生活日常', '节日装饰', '动效案例'] as const

export const ILLUSTRATIONS: Illustration[] = [
  /* ---------------- 手绘符号 ---------------- */
  { id: 'arrow-right', name: '右箭头', category: '手绘符号', tags: ['箭头', 'arrow', '指向'],
    svg: wrap('<path d="M8 32h44"/><path d="M38 18l14 14-14 14"/>') },
  { id: 'arrow-curve', name: '曲线箭头', category: '手绘符号', tags: ['箭头', 'curve'],
    svg: wrap('<path d="M10 46c0-18 12-28 26-28 8 0 14 4 14 10"/><path d="M40 18l10 10 10-10"/>') },
  { id: 'check', name: '对勾', category: '手绘符号', tags: ['勾', 'check', '完成'],
    svg: wrap('<path d="M14 34l12 12 24-28"/>') },
  { id: 'cross', name: '叉号', category: '手绘符号', tags: ['叉', 'close', '错误'],
    svg: wrap('<path d="M18 18l28 28"/><path d="M46 18L18 46"/>') },
  { id: 'star', name: '星星', category: '手绘符号', tags: ['星', 'star', '收藏'],
    svg: wrap('<path d="M32 8l7.5 15.5L56 26l-12 11.5L47 54 32 45.5 17 54l3-16.5L8 26l16.5-2.5z"/>') },
  { id: 'heart', name: '爱心', category: '手绘符号', tags: ['心', 'heart', '喜欢'],
    svg: wrap('<path d="M32 54S10 40 10 26c0-7 5.5-12 12-12 4.5 0 8 2.5 10 6 2-3.5 5.5-6 10-6 6.5 0 12 5 12 12 0 14-22 28-22 28z"/>') },
  { id: 'bulb', name: '灯泡', category: '手绘符号', tags: ['灯泡', 'idea', '想法'],
    svg: wrap('<path d="M22 44a12 12 0 117-21c3 3 3 7 1 10-1 2-2 4-2 6v5"/><path d="M24 50h16"/><path d="M26 56h12"/><path d="M32 8v4"/>') },
  { id: 'lightning', name: '闪电', category: '手绘符号', tags: ['闪电', '快', 'energy'],
    svg: wrap('<path d="M36 6L18 36h12l-4 22 20-30H34z"/>') },

  /* ---------------- 商务办公 ---------------- */
  { id: 'briefcase', name: '公文包', category: '商务办公', tags: ['工作', 'bag', '商务'],
    svg: wrap('<rect x="8" y="20" width="48" height="32" rx="4"/><path d="M24 20v-6a4 4 0 014-4h8a4 4 0 014 4v6"/><path d="M8 34h48"/>') },
  { id: 'chart-up', name: '上升图表', category: '商务办公', tags: ['图表', '增长', 'chart'],
    svg: wrap('<path d="M10 52h44"/><path d="M14 44l12-12 10 8 14-18"/><path d="M40 22h10v10"/>') },
  { id: 'chart-bar', name: '柱状图', category: '商务办公', tags: ['图表', 'bar', '数据'],
    svg: wrap('<path d="M10 52h44"/><rect x="16" y="32" width="8" height="16" rx="2"/><rect x="28" y="22" width="8" height="26" rx="2"/><rect x="40" y="38" width="8" height="10" rx="2"/>') },
  { id: 'pie', name: '饼图', category: '商务办公', tags: ['占比', 'pie', '数据'],
    svg: wrap('<circle cx="32" cy="32" r="22"/><path d="M32 32V10a22 22 0 0122 22z"/>') },
  { id: 'target', name: '靶心', category: '商务办公', tags: ['目标', 'target', 'KPI'],
    svg: wrap('<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="13"/><circle cx="32" cy="32" r="4"/>') },
  { id: 'handshake', name: '握手', category: '商务办公', tags: ['合作', 'hand', 'deal'],
    svg: wrap('<path d="M6 28l10-6 10 6 8-6 10 6 8-4"/><path d="M6 36l12 8 12-8 10 8 12-8"/><path d="M34 30l6 6"/>') },
  { id: 'calendar', name: '日历', category: '商务办公', tags: ['日期', 'calendar', '时间'],
    svg: wrap('<rect x="10" y="14" width="44" height="40" rx="4"/><path d="M10 26h44"/><path d="M22 8v10"/><path d="M42 8v10"/><path d="M20 36h6M32 36h6M20 44h6M32 44h6"/>') },
  { id: 'doc', name: '文档', category: '商务办公', tags: ['文件', 'doc', '报告'],
    svg: wrap('<path d="M16 8h20l14 14v34a2 2 0 01-2 2H16a2 2 0 01-2-2V10a2 2 0 012-2z"/><path d="M36 8v14h14"/><path d="M22 34h20M22 42h14"/>') },

  /* ---------------- 科技数码 ---------------- */
  { id: 'rocket', name: '火箭', category: '科技数码', tags: ['火箭', 'rocket', '增长'],
    svg: wrap('<path d="M32 6c8 8 12 18 12 28l-6 10H26l-6-10c0-10 4-20 12-28z"/><circle cx="32" cy="26" r="5"/><path d="M20 44l-6 8 10-2"/><path d="M44 44l6 8-10-2"/><path d="M28 56h8"/>') },
  { id: 'gear', name: '齿轮', category: '科技数码', tags: ['设置', 'gear', '系统'],
    svg: wrap('<circle cx="32" cy="32" r="8"/><path d="M32 6v8M32 50v8M6 32h8M50 32h8M14 14l6 6M44 44l6 6M50 14l-6 6M20 44l-6 6"/>') },
  { id: 'cloud', name: '云', category: '科技数码', tags: ['云', 'cloud', '存储'],
    svg: wrap('<path d="M20 46a10 10 0 010-20 14 14 0 0126 4 8 8 0 012 16z"/>') },
  { id: 'cpu', name: '芯片', category: '科技数码', tags: ['芯片', 'cpu', '算力'],
    svg: wrap('<rect x="18" y="18" width="28" height="28" rx="3"/><rect x="26" y="26" width="12" height="12" rx="1"/><path d="M26 8v10M38 8v10M26 46v10M38 46v10M8 26h10M8 38h10M46 26h10M46 38h10"/>') },
  { id: 'database', name: '数据库', category: '科技数码', tags: ['数据库', 'data', '存储'],
    svg: wrap('<ellipse cx="32" cy="18" rx="20" ry="7"/><path d="M12 18v14c0 4 9 7 20 7s20-3 20-7V18"/><path d="M12 32v14c0 4 9 7 20 7s20-3 20-7V32"/>') },
  { id: 'wifi', name: '信号', category: '科技数码', tags: ['wifi', '信号', '网络'],
    svg: wrap('<path d="M8 24a34 34 0 0148 0"/><path d="M16 32a23 23 0 0132 0"/><path d="M24 40a12 12 0 0116 0"/><circle cx="32" cy="48" r="2.5"/>') },
  { id: 'lock', name: '安全锁', category: '科技数码', tags: ['安全', 'lock', '隐私'],
    svg: wrap('<rect x="14" y="28" width="36" height="26" rx="4"/><path d="M22 28v-6a10 10 0 0120 0v6"/><circle cx="32" cy="40" r="3"/>') },
  { id: 'terminal', name: '终端', category: '科技数码', tags: ['代码', 'terminal', '命令行'],
    svg: wrap('<rect x="8" y="12" width="48" height="34" rx="4"/><path d="M18 26l6 5-6 5"/><path d="M30 36h14"/><path d="M22 50h20"/>') },

  /* ---------------- 学习教育 ---------------- */
  { id: 'book', name: '书本', category: '学习教育', tags: ['书', 'book', '阅读'],
    svg: wrap('<path d="M12 10h16a4 4 0 014 4v38a4 4 0 00-4-4H12z"/><path d="M52 10H36a4 4 0 00-4 4v38a4 4 0 014-4h16z"/>') },
  { id: 'graduation', name: '学士帽', category: '学习教育', tags: ['毕业', '学位', '教育'],
    svg: wrap('<path d="M32 12L8 24l24 12 24-12z"/><path d="M20 30v10c0 4 5.5 7 12 7s12-3 12-7V30"/><path d="M54 24v12"/>') },
  { id: 'pencil', name: '铅笔', category: '学习教育', tags: ['编辑', 'pencil', '写作'],
    svg: wrap('<path d="M44 8l12 12L20 56H8V44z"/><path d="M36 16l12 12"/><path d="M8 44l12 12"/>') },
  { id: 'magnifier', name: '放大镜', category: '学习教育', tags: ['搜索', 'search', '查找'],
    svg: wrap('<circle cx="28" cy="28" r="16"/><path d="M40 40l14 14"/>') },
  { id: 'clock', name: '时钟', category: '学习教育', tags: ['时间', 'clock', '效率'],
    svg: wrap('<circle cx="32" cy="32" r="22"/><path d="M32 18v14l10 6"/>') },
  { id: 'puzzle', name: '拼图', category: '学习教育', tags: ['拼图', 'puzzle', '整合'],
    svg: wrap('<path d="M24 12h10a5 5 0 015 5v3a5 5 0 0010 0v-3h-1"/><path d="M24 12v8a5 5 0 01-10 0v-2"/><path d="M14 18h10v10H14z"/><path d="M24 28h20v20H24z"/>') },

  /* ---------------- 生活日常 ---------------- */
  { id: 'coffee', name: '咖啡', category: '生活日常', tags: ['咖啡', 'coffee', '休息'],
    svg: wrap('<path d="M14 22h30v14a12 12 0 01-12 12h-6a12 12 0 01-12-12z"/><path d="M44 26h4a6 6 0 010 12h-4"/><path d="M20 12v4M28 10v6M36 12v4"/>') },
  { id: 'gift', name: '礼物', category: '生活日常', tags: ['礼物', 'gift', '福利'],
    svg: wrap('<rect x="10" y="24" width="44" height="14" rx="2"/><path d="M14 38v16a2 2 0 002 2h32a2 2 0 002-2V38"/><path d="M32 24v32"/><path d="M32 24S28 12 22 14s1 10 10 10z"/><path d="M32 24s4-12 10-10-1 10-10 10z"/>') },
  { id: 'chat', name: '对话框', category: '生活日常', tags: ['聊天', 'chat', '留言'],
    svg: wrap('<path d="M8 16a4 4 0 014-4h40a4 4 0 014 4v22a4 4 0 01-4 4H28l-12 10V42h-4a4 4 0 01-4-4z"/><path d="M20 26h24M20 34h14"/>') },
  { id: 'bell', name: '铃铛', category: '生活日常', tags: ['通知', 'bell', '提醒'],
    svg: wrap('<path d="M18 40a14 14 0 1128 0c0 6 2 8 2 8H16s2-2 2-8z"/><path d="M26 52a6 6 0 0012 0"/>') },
  { id: 'house', name: '房子', category: '生活日常', tags: ['家', 'home', '首页'],
    svg: wrap('<path d="M10 30L32 10l22 20"/><path d="M16 28v26a2 2 0 002 2h28a2 2 0 002-2V28"/><path d="M28 56V38h8v18"/>') },
  { id: 'camera', name: '相机', category: '生活日常', tags: ['相机', 'photo', '摄影'],
    svg: wrap('<rect x="8" y="18" width="48" height="32" rx="4"/><circle cx="32" cy="34" r="9"/><path d="M24 18l4-6h8l4 6"/>') },

  /* ---------------- 节日装饰 ---------------- */
  { id: 'confetti', name: '彩带', category: '节日装饰', tags: ['庆祝', 'confetti', '彩带'],
    svg: wrap('<path d="M10 10l8 8M54 10l-8 8M32 6v10M12 44l6-2M52 44l-6-2"/><circle cx="20" cy="34" r="3"/><circle cx="44" cy="38" r="3"/><circle cx="32" cy="48" r="3"/>') },
  { id: 'crown', name: '皇冠', category: '节日装饰', tags: ['皇冠', 'crown', '第一'],
    svg: wrap('<path d="M8 44l4-26 10 10L32 8l10 20 10-10 4 26z"/><path d="M8 48h48"/>') },
  { id: 'medal', name: '奖章', category: '节日装饰', tags: ['奖章', 'medal', '荣誉'],
    svg: wrap('<circle cx="32" cy="40" r="14"/><path d="M24 26L18 6h12l-4 20"/><path d="M40 26L46 6H34l4 20"/><path d="M32 34v10M27 39h10"/>') },
  { id: 'firework', name: '烟花', category: '节日装饰', tags: ['烟花', '庆祝', '新年'],
    svg: wrap('<path d="M32 6v14M32 44v14M6 32h14M44 32h14M14 14l10 10M50 50L40 40M50 14L40 24M14 50l10-10"/>') },

  /* ---------------- 动效案例（内联 SMIL，微信端原生支持，无需脚本） ---------------- */
  { id: 'anim-draw', name: '路径描边', category: '动效案例', tags: ['描边', 'draw', '路径'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 95 C 60 30, 180 30, 220 95" stroke-dasharray="420" stroke-dashoffset="420"><animate attributeName="stroke-dashoffset" from="420" to="0" dur="2.2s" repeatCount="indefinite"/></path></svg>` },
  { id: 'anim-motion', name: '沿路径运动', category: '动效案例', tags: ['motion', '运动', 'animateMotion'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" fill="none"><path d="M20 100 C 80 20, 160 20, 220 100" stroke="#E5E5E0" stroke-width="2"/><circle r="9" fill="currentColor"><animateMotion dur="3s" repeatCount="indefinite" rotate="auto" path="M20 100 C 80 20, 160 20, 220 100"/></circle></svg>` },
  { id: 'anim-pulse', name: '呼吸光晕', category: '动效案例', tags: ['脉冲', 'pulse', '呼吸'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="24" fill="currentColor"><animate attributeName="r" values="16;34;16" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.95;0.25;0.95" dur="1.8s" repeatCount="indefinite"/></circle></svg>` },
  { id: 'anim-spin', name: '旋转加载', category: '动效案例', tags: ['旋转', 'loader', 'spinner'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"><circle cx="60" cy="60" r="40" stroke="#E5E5E0" stroke-width="8"/><circle cx="60" cy="60" r="40" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-dasharray="60 220"><animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="1.4s" repeatCount="indefinite"/></circle></svg>` },
  { id: 'anim-stagger', name: '序列渐绘', category: '动效案例', tags: ['序列', 'stagger', '逐行'],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M20 40 H220" stroke-dasharray="200" stroke-dashoffset="200"><animate attributeName="stroke-dashoffset" from="200" to="0" dur="1.6s" begin="0s" repeatCount="indefinite"/></path><path d="M20 70 H220" stroke-dasharray="200" stroke-dashoffset="200"><animate attributeName="stroke-dashoffset" from="200" to="0" dur="1.6s" begin="0.3s" repeatCount="indefinite"/></path><path d="M20 100 H150" stroke-dasharray="130" stroke-dashoffset="130"><animate attributeName="stroke-dashoffset" from="130" to="0" dur="1.6s" begin="0.6s" repeatCount="indefinite"/></path></svg>` },
]

export const ILLUSTRATIONS_BY_CATEGORY = ILLUSTRATION_CATEGORIES.map((c) => ({
  category: c,
  items: ILLUSTRATIONS.filter((x) => x.category === c),
})).filter((g) => g.items.length)

export function searchIllustrations(keyword: string): Illustration[] {
  const k = keyword.trim().toLowerCase()
  if (!k) return ILLUSTRATIONS
  return ILLUSTRATIONS.filter((x) =>
    x.name.toLowerCase().includes(k) ||
    x.category.includes(k) ||
    x.tags.some((t) => t.toLowerCase().includes(k)) ||
    x.id.includes(k))
}

/** 一键换色：把 currentColor 占位替换成具体颜色 */
export function tintIllustration(svg: string, color: string): string {
  return svg.replace('currentColor', color)
}
