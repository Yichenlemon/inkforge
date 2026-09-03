/**
 * 交互组件合规冒烟测试
 * 通过真实 compile -> wechatify 管线渲染每种 interactive kind，
 * 断言除 scratch（已知降级）外零 error 级诊断，证明产物可过微信清洗。
 * 运行：npx tsx server/scripts/smoke_interactive.ts
 */
import { makeBlock } from '../../shared/types.js'
import { compileDoc } from '../lib/compile.js'
import type { Block } from '../../shared/types.js'

const IMG = (n: number) => `https://example.com/img${n}.png`

const blocks: Block[] = [
  makeBlock('interactive', { kind: 'slider', panels: [{ title: '一', html: 'a' }, { title: '二', html: 'b' }], hint: '滑动' }),
  makeBlock('interactive', { kind: 'click-reveal', panels: [{ title: '问题', html: '点我' }, { html: '答案' }] }),
  makeBlock('interactive', { kind: 'longpress', panels: [{ html: '长按内容' }], hint: '长按' }),
  makeBlock('interactive', { kind: 'flip', panels: [{ title: '正面' }, { title: '背面' }], width: 320, height: 200 }),
  makeBlock('interactive', { kind: 'tab', panels: [{ html: '一' }, { html: '二' }, { html: '三' }] }),
  makeBlock('interactive', { kind: 'accordion-click', panels: [{ title: '展开', html: '内容' }, { title: '再点', html: '更多' }] }),
  makeBlock('interactive', { kind: 'carousel', panels: [{ imageUrl: IMG(1) }, { imageUrl: IMG(2) }, { imageUrl: IMG(3) }], width: 677, height: 240 }),
  makeBlock('interactive', { kind: 'progress', panels: [{ html: '85%' }], progress: 0.85, width: 677, height: 28 }),
  makeBlock('interactive', { kind: 'marquee', panels: [{ imageUrl: IMG(1) }, { imageUrl: IMG(2) }, { imageUrl: IMG(3) }], height: 120 }),
  makeBlock('interactive', { kind: 'scratch', panels: [{ imageUrl: IMG(1) }, { html: '刮开' }] }), // 已知降级
  makeBlock('interactive', { kind: 'read-more', panels: [{ title: '摘要', html: '完整内容段落' }] }),
  makeBlock('interactive', { kind: 'like', panels: [{ html: '点赞' }] }),
  makeBlock('interactive', { kind: 'rating', panels: [{ html: '评分' }], count: 5, value: 4 }),
  makeBlock('interactive', { kind: 'zoom', panels: [{ imageUrl: IMG(1) }], width: 677, height: 220 }),
  makeBlock('interactive', { kind: 'typewriter', panels: [{ html: '欢迎关注我们的公众号' }] }),
  makeBlock('interactive', { kind: 'switch', panels: [{ html: '通知' }], onLabel: '开', offLabel: '关' }),
  makeBlock('interactive', { kind: 'progress-ring', panels: [{ html: '70%' }], progress: 0.7, width: 200, height: 200 }),
  makeBlock('interactive', { kind: 'tooltip', panels: [{ title: '说明' }, { html: '提示内容' }] }),
  makeBlock('interactive', { kind: 'hotzone', panels: [{ imageUrl: IMG(1) }, { html: '标注说明' }], width: 677, height: 220 }),
  makeBlock('interactive', { kind: 'before-after', panels: [{ imageUrl: IMG(1) }, { imageUrl: IMG(2) }], width: 677, height: 240 }),
  makeBlock('interactive', { kind: 'faq', panels: [{ title: 'Q1', html: 'A1' }, { title: 'Q2', html: 'A2' }] }),
  makeBlock('interactive', { kind: 'confetti', panels: [{ html: '恭喜' }], width: 300, height: 200 }),
  makeBlock('interactive', { kind: 'loading', panels: [{ html: '加载中' }] }),
  makeBlock('interactive', { kind: 'soundwave', panels: [{ html: '音频' }], width: 677, height: 80 }),
  makeBlock('interactive', { kind: 'poll', panels: [{ title: 'A', html: '65' }, { title: 'B', html: '35' }], width: 677 }),
  makeBlock('interactive', { kind: 'chat', panels: [{ html: '你好' }, { html: '新功能' }, { html: '逐条查看' }] }),
  makeBlock('interactive', { kind: 'badge', panels: [{ html: 'NEW' }], width: 120, height: 120 }),
  makeBlock('interactive', { kind: 'countdown', panels: [{ html: '10' }], width: 160, height: 160 }),
  makeBlock('interactive', { kind: 'marquee-text', panels: [{ html: '这是一条滚动播报文案' }] }),
  makeBlock('interactive', { kind: 'reveal-fade', panels: [{ html: '渐显的内容' }] }),
]

const doc = { themeId: 'clean', title: 'smoke', blocks, meta: {} } as any

const res = await compileDoc(doc, { stripAnimation: false })
const errors = res.diagnostics.filter((d) => d.level === 'error')
const realErrors = errors.filter((d) => !(d.rule === 'interactive-unsupported')) // scratch 预期降级

console.log('总诊断数:', res.diagnostics.length,
  '| error:', errors.length, '| warning:', res.diagnostics.filter((d) => d.level === 'warning').length,
  '| info:', res.diagnostics.filter((d) => d.level === 'info').length)
console.log('非预期 error（应为 0）:', realErrors.length)
if (realErrors.length) {
  console.log(JSON.stringify(realErrors, null, 2))
  process.exit(1)
}
console.log('OK: 所有交互组件（除刮刮卡降级）均通过微信清洗合规校验')
process.exit(0)
