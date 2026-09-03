import { makeBlock, type Block } from '../../shared/types.js'

/** 文档级模板:每个模板都能生成一份可继续编辑的完整骨架。
 *  比"主题色变体"更进一步——给作者一份真正能用的起点。 */
export interface DocTemplate {
  id: string
  name: string
  desc: string
  category: '资讯' | '情感' | '干货' | '活动' | '招聘' | '教程' | '通用'
  themeId: 'clean' | 'tech' | 'warm' | 'news'
  /** 模板卡片封面渐变(仅首页展示用) */
  coverGradient: string
  /** 模板卡片中心的图标名(lucide) */
  icon: string
  /** 生成初始内容 */
  initBlocks: (title: string) => Block[]
}

/** 引导关注组件(收尾通用) */
const follow = (text = '— 长按识别关注我们 —'): Block =>
  makeBlock('callout', {
    icon: 'qrcode', variant: 'soft', textAlign: 'center',
    title: text,
    desc: '每周一更,不错过任何干货',
  }, { marginTop: 16, marginBottom: 8, textAlign: 'center' })

/** 顶部"封面":用 card 做背景 + 大标题 + 副标题 + 作者 */
const hero = (title: string, subtitle: string, kicker: string, author: string, variant: 'accent' | 'outline' | 'shadow' | 'plain' = 'accent'): Block =>
  makeBlock('card', {
    title: kicker,
    html: `<h2 style="margin:0 0 8px;font-size:24px;font-weight:700;line-height:1.3">${escapeHtml(title)}</h2><p style="margin:0;opacity:.85;font-size:14px">${escapeHtml(subtitle)}</p>`,
    imageUrl: '',
    imagePosition: 'top',
    variant,
    footer: `✍ ${escapeHtml(author)}`,
    link: '',
  }, { marginTop: 0, marginBottom: 14, paddingTop: 18, paddingBottom: 18, paddingLeft: 18, paddingRight: 18, borderRadius: 14 })

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c])
}

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    id: 'blank', name: '空白文档', desc: '从零开始,完全自由', category: '通用',
    themeId: 'clean', coverGradient: 'linear-gradient(135deg,#f5f7fa,#c3cfe2)', icon: 'FilePlus2',
    initBlocks: () => [],
  },
  {
    id: 'news-weekly', name: '公众号资讯', desc: '封面 + 引语 + 章节 + 引导关注', category: '资讯',
    themeId: 'news', coverGradient: 'linear-gradient(135deg,#FF9966,#FF5E62)', icon: 'Newspaper',
    initBlocks: (title) => [
      hero(title, '本周值得关注的新鲜事,5 分钟读完', '本周精选', '墨痕编辑部'),
      makeBlock('paragraph', { html: `<p>过去一周,行业里发生了不少有意思的变化。我们替你梳理了最值得关注的 5 件事,挑个安静的时间慢慢看。</p>` }, {}),
      makeBlock('heading', { html: '一、先看大盘', level: 2 }, {}),
      makeBlock('paragraph', { html: '<p>先说结论:本周整体节奏偏稳,但细分领域出现了几个明显的信号……</p>' }, {}),
      makeBlock('heading', { html: '二、值得关注的几件事', level: 2 }, {}),
      makeBlock('list', { html: '<li><b>事件 A</b>:核心变化是……</li><li><b>事件 B</b>:从数据看……</li><li><b>事件 C</b>:值得关注……</li>', ordered: false }, {}),
      makeBlock('quote', { html: '<p>"短期内还看不出明确方向,但长期看……"</p>', cite: '受访者 张三' }, {}),
      makeBlock('heading', { html: '三、给读者的建议', level: 2 }, {}),
      makeBlock('paragraph', { html: '<p>如果你正在……那么本周的这些变化对你来说意味着……</p>' }, {}),
      makeBlock('divider', { variant: 'solid', width: '40%' }, { marginTop: 12, marginBottom: 12 }),
      follow(),
    ],
  },
  {
    id: 'warm-story', name: '情感文艺', desc: '大标题 + 引言 + 散文 + 结尾', category: '情感',
    themeId: 'warm', coverGradient: 'linear-gradient(135deg,#FFB199,#FFDEE9)', icon: 'Feather',
    initBlocks: (title) => [
      makeBlock('heading', { html: title, level: 1 }, { textAlign: 'center', fontSize: 26, marginTop: 4, marginBottom: 8 }),
      makeBlock('paragraph', { html: '<p style="text-align:center;color:#888">夜读 · 第 12 期 · 写给每个还在赶路的你</p>' }, { textAlign: 'center' }),
      makeBlock('divider', { variant: 'dashed' }, { marginTop: 14, marginBottom: 14 }),
      makeBlock('paragraph', { html: '<p>如果你也在某个深夜停下过脚步,这篇送给你。</p>' }, { fontSize: 16 }),
      makeBlock('paragraph', { html: '<p>故事的开头总是相似的。我们从某个不知名的傍晚开始,谁也没有预料到后来会发生那么多事。</p>' }, { fontSize: 15, lineHeight: 2 }),
      makeBlock('paragraph', { html: '<p>后来的事你大概也猜得到。我们摔过几次,哭过几场,也笑过几回,然后各自学会了怎么在一杯冷掉的咖啡里找一点甜。</p>' }, { fontSize: 15, lineHeight: 2 }),
      makeBlock('quote', { html: '<p>"人生没有白走的路,每一步都算数。"</p>', cite: '—— 致每一位读者' }, {}),
      makeBlock('paragraph', { html: '<p>如果你也曾在深夜里抬起头,看过同一片天,那我们就算见过面了。</p>' }, { fontSize: 15, lineHeight: 2 }),
      follow('如果喜欢,点个「在看」或分享给朋友'),
    ],
  },
  {
    id: 'tutorial', name: '干货教程', desc: '目标 + 步骤 + 注意事项 + 小结', category: '干货',
    themeId: 'tech', coverGradient: 'linear-gradient(135deg,#43cea2,#185a9d)', icon: 'GraduationCap',
    initBlocks: (title) => [
      hero(title, '从 0 到 1,手把手带你搞定', '实用干货', '编辑部'),
      makeBlock('callout', { icon: 'lightbulb', variant: 'soft', title: '本篇能解决什么问题?', desc: '读完你将掌握……' }, { marginBottom: 12 }),
      makeBlock('heading', { html: '一、为什么需要这个', level: 2 }, {}),
      makeBlock('paragraph', { html: '<p>在实际工作中,我们经常会遇到……这时候传统做法效率很低,本文介绍的方案可以……</p>' }, {}),
      makeBlock('heading', { html: '二、准备工作', level: 2 }, {}),
      makeBlock('list', { html: '<li>工具 A</li><li>工具 B(可选)</li><li>环境 C</li>', ordered: true }, {}),
      makeBlock('heading', { html: '三、具体步骤', level: 2 }, {}),
      makeBlock('code', { code: '# 伪代码\nstep1: 配置 ...\nstep2: 调用 ...', lang: 'bash' }, {}),
      makeBlock('callout', { icon: 'alert-tri', variant: 'warn', title: '踩坑提醒', desc: '常见错误:不要把 xxx 写成 yyy,会导致……' }, { marginTop: 8, marginBottom: 8 }),
      makeBlock('heading', { html: '四、小结', level: 2 }, {}),
      makeBlock('paragraph', { html: '<p>至此,核心要点都讲完了。下一步可以结合你的实际场景……</p>' }, {}),
      follow(),
    ],
  },
  {
    id: 'promo', name: '活动促销', desc: '封面 + 福利清单 + 倒计时 + 二维码', category: '活动',
    themeId: 'warm', coverGradient: 'linear-gradient(135deg,#f093fb,#f5576c)', icon: 'Gift',
    initBlocks: (title) => [
      makeBlock('heading', { html: title, level: 1 }, { textAlign: 'center', fontSize: 26, marginTop: 4, marginBottom: 6 }),
      makeBlock('paragraph', { html: '<p style="text-align:center"><span style="background:linear-gradient(90deg,#f5576c,#f093fb);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:700">⏰ 限时福利 · 仅 7 天 · 手慢无</span></p>' }, {}),
      makeBlock('heading', { html: '🎁 你将获得', level: 2 }, { textAlign: 'center' }),
      makeBlock('list', {
        html: '<li>🎁 福利 1:价值 999 元的工具包</li><li>🎁 福利 2:7 天 VIP 体验</li><li>🎁 福利 3:专属社群名额</li>',
        ordered: false,
      }, { fontSize: 16 }),
      makeBlock('divider', { variant: 'solid', width: '60%' }, { marginTop: 16, marginBottom: 16 }),
      makeBlock('callout', { icon: 'clock', variant: 'tip', title: '⏰ 截止时间', desc: '本周日 23:59,逾期不候' }, { marginBottom: 12 }),
      makeBlock('paragraph', { html: '<p>👇 长按识别二维码,立即参与</p>' }, { textAlign: 'center', fontSize: 14 }),
      makeBlock('image', { src: 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=https%3A%2F%2Fexample.com', alt: '活动二维码', width: '40%' }, { textAlign: 'center' }),
    ],
  },
  {
    id: 'recruit', name: '招聘公告', desc: '公司介绍 + 岗位列表 + 福利 + 投递方式', category: '招聘',
    themeId: 'clean', coverGradient: 'linear-gradient(135deg,#43cea2,#185a9d)', icon: 'Users',
    initBlocks: (title) => [
      hero(title, '和我们一起,把事情做得不一样', 'Join Us', 'HR Team'),
      makeBlock('paragraph', { html: '<p>我们是一家专注于……的公司,团队氛围开放、节奏轻快。如果你也是这样的人,欢迎加入我们。</p>' }, {}),
      makeBlock('heading', { html: '📍 在招岗位', level: 2 }, {}),
      makeBlock('list', {
        html: '<li><b>岗位 A</b>(全职 / 远程):负责……要求……</li><li><b>岗位 B</b>(实习):面向……</li><li><b>岗位 C</b>(兼职):……</li>',
        ordered: false,
      }, {}),
      makeBlock('heading', { html: '🎁 我们提供', level: 2 }, {}),
      makeBlock('list', { html: '<li>具有竞争力的薪酬</li><li>五险一金</li><li>弹性工作时间</li><li>扁平管理</li><li>……</li>', ordered: false }, {}),
      makeBlock('callout', { icon: 'mail', variant: 'soft', title: '📮 投递方式', desc: '请发送简历至 hr@example.com,标题注明「姓名-岗位」' }, {}),
    ],
  },
  {
    id: 'review', name: '产品测评', desc: '结论先行 + 优缺点 + 对比 + 推荐人群', category: '干货',
    themeId: 'tech', coverGradient: 'linear-gradient(135deg,#6a11cb,#2575fc)', icon: 'Star',
    initBlocks: (title) => [
      hero(title, '用了 30 天之后,我把心里话都告诉你', '深度测评', '编辑部'),
      makeBlock('callout', { icon: 'check', variant: 'tip', title: '✅ 一句话结论', desc: '如果你在乎 X、Y、Z,这可能是目前最值得考虑的选择。' }, { marginBottom: 12 }),
      makeBlock('heading', { html: '优 点', level: 2 }, {}),
      makeBlock('list', { html: '<li>体验 A:……</li><li>体验 B:……</li>', ordered: false }, {}),
      makeBlock('heading', { html: '不 足', level: 2 }, {}),
      makeBlock('list', { html: '<li>问题 1:……</li><li>问题 2:……</li>', ordered: false }, {}),
      makeBlock('heading', { html: '谁适合买?', level: 2 }, {}),
      makeBlock('paragraph', { html: '<p>总的来说,这是一款……的产品,适合以下人群……</p>' }, {}),
      follow(),
    ],
  },
  {
    id: 'tutorial-step', name: 'Step 教程', desc: '目标 + N 个步骤 + 校验 + 小结', category: '教程',
    themeId: 'clean', coverGradient: 'linear-gradient(135deg,#f6d365,#fda085)', icon: 'ListChecks',
    initBlocks: (title) => [
      hero(title, '7 步搞定,跟着做就好', '保姆级教程', '编辑部'),
      makeBlock('heading', { html: 'Step 1 · 准备', level: 3 }, {}),
      makeBlock('paragraph', { html: '<p>先确认环境……</p>' }, {}),
      makeBlock('heading', { html: 'Step 2 · 配置', level: 3 }, {}),
      makeBlock('paragraph', { html: '<p>打开设置……</p>' }, {}),
      makeBlock('heading', { html: 'Step 3 · 执行', level: 3 }, {}),
      makeBlock('code', { code: 'npm run ...', lang: 'bash' }, {}),
      makeBlock('heading', { html: 'Step 4 · 验证', level: 3 }, {}),
      makeBlock('callout', { icon: 'check', variant: 'success', title: '成功标志', desc: '看到 X 说明成功了' }, {}),
      makeBlock('heading', { html: '常见问题', level: 2 }, {}),
      makeBlock('list', { html: '<li>Q:报错 A?</li><li>A:把 xxx 改成 yyy</li>', ordered: false }, {}),
      follow(),
    ],
  },
  {
    id: 'long-form', name: '深度长文', desc: '摘要 + 大纲 + 多章节 + 参考', category: '干货',
    themeId: 'clean', coverGradient: 'linear-gradient(135deg,#232526,#414345)', icon: 'BookOpen',
    initBlocks: (title) => [
      hero(title, '一篇值得收藏的深度文章', '深度长文', '编辑部'),
      makeBlock('paragraph', { html: '<p>摘要:本文将从……的角度,系统讲清楚……读完你将……</p>' }, { fontSize: 15 }),
      makeBlock('callout', { icon: 'list', variant: 'soft', title: '📑 本文大纲', desc: '1. …… / 2. …… / 3. …… / 4. ……' }, {}),
      makeBlock('heading', { html: '一、引子', level: 2 }, {}),
      makeBlock('paragraph', { html: '<p>先从一个问题说起……</p>' }, {}),
      makeBlock('heading', { html: '二、核心论述', level: 2 }, {}),
      makeBlock('paragraph', { html: '<p>这一部分展开讲……</p>' }, {}),
      makeBlock('heading', { html: '三、案例', level: 2 }, {}),
      makeBlock('quote', { html: '<p>"……"</p>', cite: '案例来源' }, {}),
      makeBlock('heading', { html: '四、结论', level: 2 }, {}),
      makeBlock('paragraph', { html: '<p>综合来看,……</p>' }, {}),
      follow(),
    ],
  },
]

export function getTemplate(id: string): DocTemplate | undefined {
  return DOC_TEMPLATES.find((t) => t.id === id)
}