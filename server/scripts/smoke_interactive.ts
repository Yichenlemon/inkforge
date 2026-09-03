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
